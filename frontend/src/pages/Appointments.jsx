import { useEffect, useState, useCallback, useMemo } from "react";
import api from "@/lib/api";
import { Plus, Calendar as CalendarIcon, Clock, LayoutGrid, ChevronLeft, ChevronRight, CalendarDays, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { WeekGrid } from "@/components/appointments/WeekGrid";
import { NewAppointmentModal } from "@/components/appointments/NewAppointmentModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { usePager, sortCustomers } from "@/components/crm/CrmBits";
import { PageHeader, SearchBox, FilterBtn, ExportBtn, GoldBtn, SegmentTabs, TableCard, Th, EmptyState, ProTip, GHOST_BTN, downloadCsv } from "@/components/shell/PageShell";
import { AppointmentsKpis } from "@/components/appointments/AppointmentsKpis";
import { AppointmentRow } from "@/components/appointments/AppointmentRow";
import { MonthGrid } from "@/components/appointments/MonthGrid";

const STATUSES = ["scheduled", "confirmed", "completed", "cancelled"];

function startOfWeek(iso) {
  const d = new Date(iso + "T00:00:00");
  const day = d.getDay(); // 0 Sun..6 Sat
  const diff = day === 0 ? -6 : 1 - day; // Monday-start
  d.setDate(d.getDate() + diff);
  return d;
}

export default function Appointments() {
  const { tenant, user } = useAuth();
  const isManager = user?.role === "manager";
  const [waDirect, setWaDirect] = useState(!!tenant?.wa_direct_send);
  const [confirmAsk, setConfirmAsk] = useState(null);
  useEffect(() => { setWaDirect(!!tenant?.wa_direct_send); }, [tenant?.wa_direct_send]);
  const canDirectWA = !isManager || waDirect;

  async function toggleWaDirect() {
    try {
      const next = !waDirect;
      await api.put("/settings/wa-direct", { enabled: next });
      setWaDirect(next);
      toast.success(next
        ? "🟢 Managers & staff can now send WhatsApp confirmations directly"
        : "🔒 Staff WhatsApp sends now need your approval again");
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't update setting"); }
  }
  const [list, setList] = useState([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [view, setView] = useState("list"); // list | week
  const [weekData, setWeekData] = useState([]); // 7 arrays
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [services, setServices] = useState([]);
  const [form, setForm] = useState({ customer_id: "", staff_id: "", service_ids: [], scheduled_at: "", notes: "" });

  const [q, setQ] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [statusF, setStatusF] = useState("all");
  const [staffF, setStaffF] = useState("all");
  const [sort, setSort] = useState({ key: "scheduled_at", dir: "asc" });
  const [sel, setSel] = useState(new Set());

  const load = useCallback(async () => {
    const url = view === "upcoming" ? "/appointments?upcoming=true" : view === "month" ? `/appointments?date=${date.slice(0, 7)}` : `/appointments?date=${date}`;
    const { data } = await api.get(url);
    setList(data);
  }, [date, view]);

  const loadWeek = useCallback(async () => {
    const monday = startOfWeek(date);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday); d.setDate(monday.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
    const results = await Promise.all(days.map(d => api.get(`/appointments?date=${d}`).then(r => ({ date: d, items: r.data }))));
    setWeekData(results);
  }, [date]);

  useEffect(() => {
    if (view === "week") loadWeek();
    else load();
  }, [view, load, loadWeek]);

  useEffect(() => {
    api.get("/customers").then(r => setCustomers(r.data));
    api.get("/staff").then(r => setStaff(r.data.filter(s => !s.away)));
    api.get("/services").then(r => setServices(r.data));
  }, []);

  function startNew() {
    const t = new Date(); t.setHours(t.getHours() + 1, 0, 0, 0);
    const iso = t.toISOString().slice(0, 16);
    setForm({ customer_id: "", staff_id: "", service_ids: [], scheduled_at: iso, notes: "" });
    setOpen(true);
  }

  async function save(e) {
    e.preventDefault();
    if (!form.customer_id || !form.staff_id || form.service_ids.length === 0) {
      toast.error("Select customer, staff and at least one service"); return;
    }
    const sel = customers.find(c => c.id === form.customer_id);
    const hasPhone = (sel?.phone || "").replace(/\D/g, "").length >= 10;
    if (sel && !hasPhone) {
      const digits = (form.guest_phone || "").replace(/\D/g, "");
      if (digits.length < 10) { toast.error("Please enter the guest's 10-digit phone number — it's needed for the WhatsApp confirmation"); return; }
      try {
        await api.put(`/customers/${sel.id}/phone`, { phone: form.guest_phone.trim() });
        setCustomers(cs => cs.map(c => c.id === sel.id ? { ...c, phone: form.guest_phone.trim() } : c));
      } catch (err) { toast.error(err.response?.data?.detail || "Couldn't save the phone number"); return; }
    }
    try {
      const { guest_phone, ...payload } = form;
      await api.post("/appointments", { ...payload, scheduled_at: new Date(form.scheduled_at).toISOString() });
      toast.success("Appointment booked"); setOpen(false); load();
    } catch (err) { toast.error("Booking failed"); }
  }

  // Freshly booked (not yet approved) appointments pinned on top, newest first
  const phoneOf = useCallback((a) => a.customer_phone || customers.find(c => c.id === a.customer_id)?.phone || "", [customers]);
  const displayList = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = list.filter(a =>
      (statusF === "all" || a.status === statusF) && (staffF === "all" || a.staff_id === staffF) &&
      (!needle || `${a.customer_name} ${phoneOf(a)} ${(a.service_names || []).join(" ")} ${a.staff_name || ""}`.toLowerCase().includes(needle)));
    if (sort.key !== "scheduled_at" || sort.dir !== "asc") return sortCustomers(filtered, sort);
    const pending = filtered.filter(a => a.status === "scheduled").sort((x, y) => (y.created_at || "").localeCompare(x.created_at || ""));
    return [...pending, ...filtered.filter(a => a.status !== "scheduled")];
  }, [list, q, statusF, staffF, sort, phoneOf]);
  const { paged: apptPage, pager: apptPager, resetPage: resetApptPage } = usePager(displayList, "bookings");
  useEffect(() => { resetApptPage(); setSel(new Set()); }, [date, view, q, statusF, staffF]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleSel = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOnPage = apptPage.length > 0 && apptPage.every(a => sel.has(a.id));
  const exportCsv = () => {
    const rows = (sel.size ? displayList.filter(a => sel.has(a.id)) : displayList).map(a => ({
      date: a.scheduled_at.slice(0, 10), time: new Date(a.scheduled_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      customer: a.customer_name, phone: phoneOf(a), services: (a.service_names || []).join(" | "), stylist: a.staff_name || "", total: a.total || 0, status: a.status }));
    if (!rows.length) { toast.info("Nothing to export"); return; }
    downloadCsv(rows, `appointments-${view === "list" ? date : view}.csv`);
  };
  const copyBookingLink = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/book/${tenant?.slug}`); toast.success("Booking link copied ✦"); } catch { toast.error("Couldn't copy"); }
  };
  const shiftMonth = (n) => { const d = new Date(date + "T00:00:00"); d.setDate(1); d.setMonth(d.getMonth() + n); setDate(d.toISOString().slice(0, 10)); };
  const niceDate = new Date(date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  async function setStatus(id, status) {
    try {
      const { data } = await api.put(`/appointments/${id}/status`, { status });
      if (status === "confirmed") {
        if (data.wa_request_created) {
          toast.success("Booking confirmed ✦ WhatsApp message sent to admin for approval");
        } else {
          toast.success("Booking confirmed ✦ Opening WhatsApp to notify the customer…");
          if (data.whatsapp_url) window.open(data.whatsapp_url, "_blank");
        }
      } else if (status === "completed") {
        toast.success(data.crm_updated ? "Service completed — customer added to CRM ✦" : "Marked completed");
      } else {
        toast.success("Status updated");
      }
      load();
    } catch { toast.error("Couldn't update status"); }
  }
  async function remove(id) {
    setConfirmAsk({
      title: "Cancel appointment?", message: "The guest's booking will be removed.", confirmLabel: "Yes, cancel it", danger: true,
      action: async () => {
        try { await api.delete(`/appointments/${id}`); toast.success("Deleted"); load(); }
        catch (e) { toast.error(e.response?.data?.detail || "Delete failed"); }
      },
    });
  }

  function toggleService(sid) {
    setForm(f => ({ ...f, service_ids: f.service_ids.includes(sid) ? f.service_ids.filter(x => x !== sid) : [...f.service_ids, sid] }));
  }

  async function requestWA(a, phone, message, kind) {
    try {
      await api.post("/whatsapp-requests", { client_name: a.customer_name, client_phone: phone, message, kind });
      toast.success("Sent to admin for approval ✦ The message goes out once approved");
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (e.response?.status === 409) { toast.info(detail); return; }
      toast.error(detail || "Couldn't send approval request");
    }
  }

  // Indian numbers need the 91 country code or WhatsApp opens the contact picker instead of the chat.
  const waPhone = (p) => {
    let d = String(p || "").replace(/\D/g, "");
    if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
    if (d.length === 10) d = `91${d}`;
    return d;
  };

  function sendReminder(a) {
    const cust = customers.find(c => c.id === a.customer_id);
    const phone = waPhone(a.customer_phone || cust?.phone);
    const dt = new Date(a.scheduled_at);
    const dateStr = dt.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    const timeStr = dt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
    const services = (a.services || []).map(s => s.name).join(", ") || "your visit";
    const raw =
      `✦ *${(tenant?.name || "MIRACURL").toUpperCase()}* ✦\n\n` +
      `Hi ${a.customer_name.split(" ")[0]}! Your appointment is *confirmed* ✅\n\n` +
      `• Service: *${services}*\n` +
      `• Date: ${dateStr}\n` +
      `• Time: *${timeStr}*\n` +
      (a.staff_name ? `• Stylist: ${a.staff_name}\n` : "") +
      (a.total ? `• Amount: ₹${a.total}\n` : "") +
      `\nWe look forward to pampering you ✨\n` +
      `Need to change the time? Just reply to this message ✦`;
    if (!canDirectWA) { requestWA(a, phone, raw, "reminder"); return; }
    if (!phone) { toast.error("No phone number saved for this guest — add it in CRM first"); return; }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(raw)}`, "_blank", "noopener,noreferrer");
  }

  function sendReviewLink(a) {
    const cust = customers.find(c => c.id === a.customer_id);
    const phone = waPhone(a.customer_phone || cust?.phone);
    const link = `${window.location.origin}/review/${a.id}`;
    const raw = `Hi ${a.customer_name.split(" ")[0]} ✦ Thank you for visiting Miracurl today!\n\nWe'd love your feedback — it takes 10 seconds:\n${link}\n\nGive us 4★ or 5★ and we'll add ₹50 credit to your account ✦`;
    if (!canDirectWA) { requestWA(a, phone, raw, "review"); return; }
    if (!phone) { toast.error("No phone number saved for this guest — add it in CRM first"); return; }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(raw)}`, "_blank", "noopener,noreferrer");
  }

  function shiftWeek(deltaDays) {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + deltaDays);
    setDate(d.toISOString().slice(0, 10));
  }

  const weekRange = useMemo(() => {
    if (!weekData.length) return "";
    const first = new Date(weekData[0].date + "T00:00:00");
    const last = new Date(weekData[6].date + "T00:00:00");
    const fmt = (d) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    return `${fmt(first)} – ${fmt(last)}`;
  }, [weekData]);

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800 space-y-6" data-testid="appointments-page">
      <PageHeader title="Appointments" subtitle="Schedule, track and complete bookings with ease."
        right={<>
          <SearchBox value={q} onChange={setQ} placeholder="Search customer, phone or service…" testid="appt-search" className="w-[300px] max-w-full" />
          <FilterBtn data-testid="appt-filters-btn" active={showFilters || statusF !== "all" || staffF !== "all"} onClick={() => setShowFilters(v => !v)}>Filters</FilterBtn>
          <ExportBtn data-testid="appt-export-btn" onClick={exportCsv}>Export{sel.size ? ` (${sel.size})` : ""}</ExportBtn>
        </>}>
        <SegmentTabs testPrefix="appt-view" value={view} onChange={setView} items={[
          { key: "list", label: "Day", icon: CalendarIcon }, { key: "upcoming", label: "Upcoming", icon: Clock },
          { key: "week", label: "Week", icon: LayoutGrid }, { key: "month", label: "Month", icon: CalendarDays }]} />
        {view !== "upcoming" && (
          <label className="relative">
            <CalendarIcon className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input type="date" data-testid="appt-date-filter" value={date} onChange={e => setDate(e.target.value)}
              className="pl-11 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-800 shadow-sm focus:outline-none focus:border-[#b8893a]/60" />
          </label>
        )}
        <select data-testid="appt-staff-filter" value={staffF} onChange={e => setStaffF(e.target.value)}
          className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-700 shadow-sm focus:outline-none focus:border-[#b8893a]/60">
          <option value="all">All Stylists</option>
          {staff.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
        </select>
        {user?.role === "admin" && (
          <button data-testid="wa-direct-toggle" onClick={toggleWaDirect}
            title="When ON, managers & staff can send WhatsApp confirmations directly. When OFF, they need your approval."
            className={`${GHOST_BTN} ${waDirect ? "border-emerald-300 text-emerald-700 bg-emerald-50/60" : ""}`}>
            {waDirect ? "🟢 Staff WhatsApp: Direct" : "🔒 Staff WhatsApp: Approval"}
          </button>
        )}
        <GoldBtn data-testid="add-appointment-btn" onClick={startNew} icon={Plus}>New Booking</GoldBtn>
      </PageHeader>

      {showFilters && (
        <div className="flex items-center gap-2 flex-wrap" data-testid="appt-status-filters">
          <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold mr-1">Status</span>
          {["all", ...STATUSES].map(st => (
            <button key={st} data-testid={`appt-status-${st}`} onClick={() => setStatusF(st)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border capitalize transition ${statusF === st ? "bg-gradient-to-r from-[#b8893a] to-[#8f6a2a] text-white border-transparent" : "bg-white border-slate-200 text-slate-600 hover:border-[#b8893a]/40"}`}>{st}</button>
          ))}
        </div>
      )}

      {view !== "week" && <AppointmentsKpis list={displayList} customers={customers} date={date} view={view} />}

      {(view === "list" || view === "upcoming") && (
        <TableCard>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr>
                  <th className="px-5 py-4 w-10 bg-slate-50/60"><input type="checkbox" checked={allOnPage} onChange={() => setSel(allOnPage ? new Set() : new Set(apptPage.map(a => a.id)))} className="accent-[#b8893a] w-4 h-4" data-testid="appt-select-all" /></th>
                  <Th sortKey="scheduled_at" sort={sort} setSort={setSort}>Time</Th>
                  <Th sortKey="customer_name" sort={sort} setSort={setSort}>Customer</Th>
                  <Th>Services</Th>
                  <Th sortKey="staff_name" sort={sort} setSort={setSort}>Stylist</Th>
                  <Th sortKey="total" sort={sort} setSort={setSort}>Total</Th>
                  <Th sortKey="status" sort={sort} setSort={setSort}>Status</Th>
                  <Th right>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {apptPage.map(a => (
                  <AppointmentRow key={a.id} a={a} view={view} phone={phoneOf(a)} canDirectWA={canDirectWA} selected={sel.has(a.id)} onSelect={() => toggleSel(a.id)}
                    onStatus={(st) => setStatus(a.id, st)} onRemind={() => sendReminder(a)} onReview={() => sendReviewLink(a)} onDelete={() => remove(a.id)}
                    onCard={() => window.open(`${process.env.REACT_APP_BACKEND_URL}/api/appointments/${a.id}/confirmation-card.png`, "_blank", "noopener,noreferrer")} />
                ))}
              </tbody>
            </table>
          </div>
          {displayList.length === 0 && (
            <EmptyState image="/assets/empty/calendar.png" testid="appt-empty"
              title={list.length ? "No bookings match your filters" : view === "upcoming" ? "No upcoming bookings" : `No appointments on ${niceDate}`}
              sub={list.length ? "Try clearing the search or status filter." : "Looks like your day is open! Start accepting bookings and make it amazing."}>
              <GoldBtn data-testid="empty-new-booking-btn" onClick={startNew} icon={Plus}>New Booking</GoldBtn>
              {view !== "upcoming" && <button data-testid="see-upcoming-btn" onClick={() => setView("upcoming")} className={GHOST_BTN}><CalendarIcon className="w-4 h-4" /> View Upcoming</button>}
            </EmptyState>
          )}
          {displayList.length > 0 && apptPager}
          <ProTip testid="appt-pro-tip" text="Share your booking link on Instagram, WhatsApp and Google to get more appointments."
            action={<button data-testid="copy-booking-link-btn" onClick={copyBookingLink} className={GHOST_BTN}><Link2 className="w-4 h-4" /> Copy Booking Link</button>} />
        </TableCard>
      )}

      {view === "week" && (
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2">
            <button data-testid="appt-week-prev" onClick={() => shiftWeek(-7)} className="w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center justify-center"><ChevronLeft className="w-4 h-4" /></button>
            <span className="font-playfair text-xl text-slate-800 px-3">{weekRange}</span>
            <button data-testid="appt-week-next" onClick={() => shiftWeek(7)} className="w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center justify-center"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <WeekGrid weekData={weekData} onOpenDay={(d) => { setDate(d); setView("list"); }} />
        </div>
      )}

      {view === "month" && <MonthGrid month={date.slice(0, 7)} items={displayList} onShift={shiftMonth} onOpenDay={(d) => { setDate(d); setView("list"); }} />}

      {open && (
        <NewAppointmentModal
          form={form} setForm={setForm}
          customers={customers} staff={staff} services={services}
          toggleService={toggleService} onSubmit={save} onClose={() => setOpen(false)}
        />
      )}
      {confirmAsk && (
        <ConfirmDialog open key={confirmAsk.title} title={confirmAsk.title} message={confirmAsk.message}
          confirmLabel={confirmAsk.confirmLabel} danger={confirmAsk.danger}
          onConfirm={() => { setConfirmAsk(null); confirmAsk.action(); }} onClose={() => setConfirmAsk(null)} />
      )}
    </div>
  );
}
