import { useEffect, useState, useCallback, useMemo } from "react";
import api from "@/lib/api";
import { Plus, X, Calendar as CalendarIcon, Check, XCircle, Clock, List as ListIcon, LayoutGrid, ChevronLeft, ChevronRight, MessageSquare, BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

const STATUS_COLOR = {
  scheduled: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  no_show: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const STATUS_DOT = {
  scheduled: "bg-blue-400",
  completed: "bg-emerald-400",
  cancelled: "bg-red-400",
  no_show: "bg-amber-400",
};

function startOfWeek(iso) {
  const d = new Date(iso + "T00:00:00");
  const day = d.getDay(); // 0 Sun..6 Sat
  const diff = day === 0 ? -6 : 1 - day; // Monday-start
  d.setDate(d.getDate() + diff);
  return d;
}

export default function Appointments() {
  const { tenant } = useAuth();
  const [list, setList] = useState([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [view, setView] = useState("list"); // list | week
  const [weekData, setWeekData] = useState([]); // 7 arrays
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [services, setServices] = useState([]);
  const [form, setForm] = useState({ customer_id: "", staff_id: "", service_ids: [], scheduled_at: "", notes: "" });

  const load = useCallback(async () => {
    const url = view === "upcoming" ? "/appointments?upcoming=true" : `/appointments?date=${date}`;
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
    api.get("/staff").then(r => setStaff(r.data));
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
    try {
      await api.post("/appointments", { ...form, scheduled_at: new Date(form.scheduled_at).toISOString() });
      toast.success("Appointment booked"); setOpen(false); load();
    } catch (err) { toast.error("Booking failed"); }
  }

  // Freshly booked (not yet approved) appointments pinned on top, newest first
  const displayList = useMemo(() => {
    const pending = list.filter(a => a.status === "scheduled").sort((x, y) => (y.created_at || "").localeCompare(x.created_at || ""));
    const rest = list.filter(a => a.status !== "scheduled");
    return [...pending, ...rest];
  }, [list]);

  async function setStatus(id, status) {
    try {
      const { data } = await api.put(`/appointments/${id}/status`, { status });
      if (status === "confirmed") {
        toast.success("Booking confirmed ✦ Opening WhatsApp to notify the customer…");
        if (data.whatsapp_url) window.open(data.whatsapp_url, "_blank");
      } else if (status === "completed") {
        toast.success(data.crm_updated ? "Service completed — customer added to CRM ✦" : "Marked completed");
      } else {
        toast.success("Status updated");
      }
      load();
    } catch { toast.error("Couldn't update status"); }
  }
  async function remove(id) {
    if (!window.confirm("Cancel this appointment?")) return;
    await api.delete(`/appointments/${id}`); toast.success("Deleted"); load();
  }

  function toggleService(sid) {
    setForm(f => ({ ...f, service_ids: f.service_ids.includes(sid) ? f.service_ids.filter(x => x !== sid) : [...f.service_ids, sid] }));
  }

  function sendReminder(a) {
    const cust = customers.find(c => c.id === a.customer_id);
    const phone = cust?.phone?.replace(/\D/g, "") || "";
    const when = new Date(a.scheduled_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
    const services = (a.services || []).map(s => s.name).join(", ") || "your appointment";
    const msg = encodeURIComponent(
      `Hi ${a.customer_name.split(" ")[0]} ✦ A friendly reminder from Miracurl!\n\n💇 ${services}\n🗓 ${when}${a.staff_name ? `\n🧑‍🎨 Stylist: ${a.staff_name}` : ""}${a.total ? `\n💰 ₹${a.total}` : ""}\n\nSee you soon! Reply here if you need to reschedule 😊`
    );
    const url = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function sendReviewLink(a) {
    const cust = customers.find(c => c.id === a.customer_id);
    const phone = cust?.phone?.replace(/\D/g, "") || "";
    const link = `${window.location.origin}/review/${a.id}`;
    const msg = `Hi ${a.customer_name.split(" ")[0]} ✦ Thank you for visiting Miracurl today!%0A%0AWe'd love your feedback — it takes 10 seconds:%0A${link}%0A%0AGive us 4★ or 5★ and we'll add ₹50 credit to your account ✦`;
    const url = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(url, "_blank", "noopener,noreferrer");
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
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-playfair text-3xl">Appointments</h1>
          <p className="text-slate-500 text-sm mt-1">Schedule, track and complete bookings.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* View toggle */}
          <div className="flex gap-1 bg-slate-50 rounded-lg p-1 border border-slate-100">
            <button data-testid="appt-view-list" onClick={() => setView("list")} className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1.5 transition ${view === "list" ? "bg-sky-500 text-white font-semibold" : "text-slate-500 hover:text-white"}`}>
              <ListIcon className="w-3.5 h-3.5" /> Day
            </button>
            <button data-testid="appt-view-upcoming" onClick={() => setView("upcoming")} className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1.5 transition ${view === "upcoming" ? "bg-sky-500 text-white font-semibold" : "text-slate-500 hover:text-white"}`}>
              <Clock className="w-3.5 h-3.5" /> Upcoming
            </button>
            <button data-testid="appt-view-week" onClick={() => setView("week")} className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1.5 transition ${view === "week" ? "bg-sky-500 text-white font-semibold" : "text-slate-500 hover:text-white"}`}>
              <LayoutGrid className="w-3.5 h-3.5" /> Week
            </button>
          </div>
          {view === "list" && (
            <div className="relative">
              <CalendarIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input type="date" data-testid="appt-date-filter" className="input-light pl-10" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          )}
          {view === "week" && (
            <div className="flex items-center gap-1">
              <button data-testid="appt-week-prev" onClick={() => shiftWeek(-7)} className="p-2 rounded-md hover:bg-slate-50 border border-slate-200"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-sm text-slate-500 px-3 font-mono">{weekRange}</span>
              <button data-testid="appt-week-next" onClick={() => shiftWeek(7)} className="p-2 rounded-md hover:bg-slate-50 border border-slate-200"><ChevronRight className="w-4 h-4" /></button>
            </div>
          )}
          <button data-testid="add-appointment-btn" onClick={startNew} className="btn-blue flex items-center gap-2"><Plus className="w-4 h-4" /> New Booking</button>
        </div>
      </div>

      {view !== "week" && (
        <div className="card-light p-0 overflow-x-auto">
          <table className="luxe-table-light min-w-[760px]">
            <thead><tr><th>Time</th><th>Customer</th><th>Services</th><th>Stylist</th><th>Total</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {displayList.map(a => (
                <tr key={a.id} data-testid={`appt-row-${a.id}`} className={a.status === "scheduled" ? "appt-attention" : ""}>
                  <td>
                    {view === "upcoming" && <div className="text-xs font-medium text-slate-600">{new Date(a.scheduled_at).toLocaleDateString([], { day: "numeric", month: "short" })}</div>}
                    <div className="font-mono text-sky-600">{new Date(a.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    <div className="text-[10px] text-slate-400">{a.duration_min} min</div>
                  </td>
                  <td className="font-medium">{a.customer_name}</td>
                  <td className="text-sm text-slate-500">{a.service_names.join(", ")}</td>
                  <td className="text-sm">{a.staff_name}</td>
                  <td className="text-sky-600 font-medium">₹{a.total}</td>
                  <td>
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${STATUS_COLOR[a.status]}`}>{a.status.replace('_', ' ')}</span>
                  </td>
                  <td>
                    <div className="flex items-center gap-1 justify-end">
                      {(a.status === "scheduled" || a.status === "confirmed") && (
                        <button data-testid={`remind-appt-${a.id}`} onClick={() => sendReminder(a)} className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded" title="Send WhatsApp confirmation / reminder">
                          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        </button>
                      )}
                      {a.status === "scheduled" && (
                        <>
                          {a.status === "scheduled" && (
                            <button data-testid={`confirm-appt-${a.id}`} onClick={() => setStatus(a.id, "confirmed")} className="p-1.5 text-sky-500 hover:bg-sky-500/10 rounded" title="Confirm & notify customer on WhatsApp"><BadgeCheck className="w-4 h-4" /></button>
                          )}
                          <button data-testid={`complete-appt-${a.id}`} onClick={() => setStatus(a.id, "completed")} className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded" title="Mark completed"><Check className="w-4 h-4" /></button>
                          <button data-testid={`cancel-appt-${a.id}`} onClick={() => setStatus(a.id, "cancelled")} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded" title="Cancel"><XCircle className="w-4 h-4" /></button>
                        </>
                      )}
                      {a.status === "completed" && (
                        <button data-testid={`send-review-${a.id}`} onClick={() => sendReviewLink(a)} className="p-1.5 text-sky-600 hover:bg-sky-50 rounded" title="Send review link via WhatsApp"><MessageSquare className="w-4 h-4" /></button>
                      )}
                      <button onClick={() => remove(a.id)} data-testid={`delete-appt-${a.id}`} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/5 rounded text-xs">×</button>
                    </div>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center text-slate-500 py-12">
                    <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    {view === "upcoming" ? "No upcoming bookings" : <>No appointments on {date} — bookings may be on another date.{" "}
                      <button data-testid="see-upcoming-btn" onClick={() => setView("upcoming")} className="text-sky-600 underline underline-offset-2 font-medium">See all upcoming</button></>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {view === "week" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3" data-testid="appt-week-grid">
          {weekData.map(day => {
            const d = new Date(day.date + "T00:00:00");
            const isToday = day.date === new Date().toISOString().slice(0, 10);
            return (
              <div key={day.date} data-testid={`week-col-${day.date}`} className={`card-light p-0 overflow-hidden min-h-[280px] ${isToday ? "border-sky-400 ring-1 ring-sky-200" : ""}`}>
                <div className={`px-3 py-2 border-b border-slate-100 ${isToday ? "bg-sky-50" : "bg-slate-50/40"}`}>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                  <div className={`font-playfair text-2xl ${isToday ? "text-sky-600" : ""}`}>{d.getDate()}</div>
                  <div className="text-[10px] text-slate-400">{day.items.length} bookings</div>
                </div>
                <div className="p-2 space-y-2">
                  {day.items.length === 0 ? (
                    <div className="text-[10px] text-slate-400 text-center py-4">—</div>
                  ) : day.items.map(a => (
                    <button
                      key={a.id}
                      data-testid={`week-appt-${a.id}`}
                      onClick={() => { setDate(day.date); setView("list"); }}
                      className="w-full text-left bg-slate-50/50 hover:bg-slate-50 border border-slate-100 hover:border-sky-300 rounded-md p-2 transition-all"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[a.status]}`} />
                        <span className="text-[10px] font-mono text-sky-600">{new Date(a.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="text-xs font-medium mt-1 line-clamp-1">{a.customer_name}</div>
                      <div className="text-[10px] text-slate-500 line-clamp-1">{a.service_names.join(", ")}</div>
                      <div className="text-[10px] text-slate-400 mt-1">with {a.staff_name}</div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="card-light w-full max-w-xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-playfair text-2xl">New Appointment</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-light block mb-1">Customer *</label>
                  <select data-testid="appt-customer-select" required className="input-light" value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}>
                    <option value="">-- select --</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-light block mb-1">Staff *</label>
                  <select data-testid="appt-staff-select" required className="input-light" value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })}>
                    <option value="">-- select --</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.name} • {s.role}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label-light block mb-1">Date & Time *</label>
                <input type="datetime-local" data-testid="appt-datetime-input" required className="input-light" value={form.scheduled_at} onChange={e => setForm({ ...form, scheduled_at: e.target.value })} />
              </div>
              <div>
                <label className="label-light block mb-1">Services * ({form.service_ids.length} selected)</label>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-md p-2 space-y-1">
                  {services.map(s => (
                    <label key={s.id} className="flex items-center justify-between px-3 py-2 rounded hover:bg-slate-50 cursor-pointer text-sm">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={form.service_ids.includes(s.id)} onChange={() => toggleService(s.id)} />
                        <span>{s.name}</span>
                        <span className="text-[10px] text-slate-400">{s.category}</span>
                      </div>
                      <span className="text-sky-600">₹{s.price} · {s.duration_min}m</span>
                    </label>
                  ))}
                </div>
              </div>
              <div><label className="label-light block mb-1">Notes</label><textarea rows="2" className="input-light" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="btn-slate flex-1">Cancel</button>
                <button data-testid="save-appt-btn" type="submit" className="btn-blue flex-1">Book Appointment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
