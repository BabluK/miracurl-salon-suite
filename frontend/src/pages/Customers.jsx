import { useEffect, useState, useCallback } from "react";
import { ImportCustomersModal } from "@/components/customers/ImportCustomersModal";
import api from "@/lib/api";
import { Plus, X, Search, Edit3, Trash2, Mail, Award, Download, Upload, Wallet, History, GitMerge, RefreshCw, Users, Star, IndianRupee, Heart, MessageCircle, CalendarDays, Clock3, ArrowUpDown, Crown } from "lucide-react";
import { CrmStat, CrmPager, sortCustomers } from "@/components/crm/CrmBits";
import { toast } from "sonner";
import { askConfirm } from "@/components/ConfirmDialog";
import { WalletDialog } from "@/components/WalletDialog";
import { CustomerHistoryModal } from "@/components/crm/CustomerHistoryModal";
import { MergeDuplicatesModal } from "@/components/crm/MergeDuplicatesModal";
import { COUNTRY_CODES, phoneDisplay } from "@/lib/countryCodes";
import { ReachOutMenu } from "@/components/customers/ReachOutMenu";
import { RecentInvoices } from "@/components/crm/RecentInvoices";

export default function Customers() {
  const [list, setList] = useState([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [walletFor, setWalletFor] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState("all"); // all | today | yesterday | week
  const [sort, setSort] = useState({ key: "created_at", dir: "desc" });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [form, setForm] = useState({ name: "", phone: "", country_code: "+91", email: "", gender: "Female", dob: "", anniversary: "", address: "", notes: "", instagram: "", facebook: "", telegram: "" });

  const load = useCallback(async () => {
    const { data } = await api.get(`/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    setList(data);
  }, [q]);
  useEffect(() => { load(); }, [load]);
  
  const istDay = (iso, offsetDays = 0) => {
    const d = iso ? new Date(iso) : new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  };
  const today = istDay(null), yesterday = istDay(null, -1), weekAgo = istDay(null, -6);
  // A customer counts for a day if they were ADDED that day OR VISITED (were billed) that day
  const activityDay = (c) => {
    const days = [c.created_at, c.last_visited].filter(Boolean).map(x => istDay(x));
    return days.sort().pop() || "";
  };
  const counts = {
    today: list.filter(c => activityDay(c) === today).length,
    yesterday: list.filter(c => activityDay(c) === yesterday).length,
    week: list.filter(c => activityDay(c) >= weekAgo).length,
  };
  const visible = list.filter(c => {
    if (dateFilter === "all") return true;
    const d = activityDay(c);
    if (dateFilter === "today") return d === today;
    if (dateFilter === "yesterday") return d === yesterday;
    return d >= weekAgo;
  });
  const addedLabel = (iso) => {
    if (!iso) return "—";
    const d = istDay(iso);
    const time = new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
    if (d === today) return `Today · ${time}`;
    if (d === yesterday) return `Yesterday · ${time}`;
    return new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
  };

  async function resyncStats() {
    try {
      const { data } = await api.post("/customers/resync-stats");
      toast.success(data.corrected ? `Spend & visits recalculated — ${data.corrected} guest${data.corrected === 1 ? "" : "s"} corrected` : "All guests already match their bills ✓");
      load();
    } catch (err) { toast.error(String(err.response?.data?.detail || "Recalculation failed")); }
  }

  async function exportCsv() {
    try {
      const res = await api.get("/customers/export", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = "customers.csv"; a.click();
      URL.revokeObjectURL(url);
      toast.success("customers.csv downloaded — opens in Excel / Google Sheets");
    } catch { toast.error("Export failed"); }
  }

  function startNew() { setEditing(null); setForm({ name: "", phone: "", country_code: "+91", email: "", gender: "Female", dob: "", anniversary: "", address: "", notes: "", instagram: "", facebook: "", telegram: "" }); setOpen(true); }
  function startEdit(c) { setEditing(c); setForm({ name: c.name, phone: c.phone, country_code: c.country_code || "+91", email: c.email || "", gender: c.gender || "Other", dob: c.dob || "", anniversary: c.anniversary || "", address: c.address || "", notes: c.notes || "", instagram: c.instagram || "", facebook: c.facebook || "", telegram: c.telegram || "" }); setOpen(true); }

  async function save(e) {
    e.preventDefault();
    try {
      if (editing) { await api.put(`/customers/${editing.id}`, form); toast.success("Customer updated"); }
      else { await api.post("/customers", form); toast.success("Customer added"); }
      setOpen(false); load();
    } catch (err) {
      const d = err.response?.data?.detail;
      if (err.response?.status === 409 && d?.code === "PHONE_EXISTS") {
        toast.error(`This number already belongs to ${d.customer?.name} (${d.customer?.phone}) — one number, one guest`);
      } else {
        toast.error(typeof d === "string" ? d : "Save failed");
      }
    }
  }

  async function remove(id) {
    askConfirm({
      title: "Delete customer?", message: "Their visit history stays on past bills, but the CRM entry is removed.", confirmLabel: "Yes, delete", danger: true,
      action: async () => {
        try {
          await api.delete(`/customers/${id}`);
          toast.success("Deleted");
          load();
        } catch (e) {
          toast.error(e.response?.data?.detail || "Delete failed");
        }
      },
    });
  }

  const sorted = sortCustomers(visible, sort);
  const paged = sorted.slice((page - 1) * perPage, page * perPage);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const stats = {
    total: list.length,
    loyal: list.filter(c => (c.visits || 0) > 3).length,
    revenue: Math.round(list.reduce((a, c) => a + (c.total_spent || 0), 0)),
    avg: list.length ? Math.round(list.reduce((a, c) => a + (c.total_spent || 0), 0) / list.length) : 0,
    newMonth: list.filter(c => new Date(c.created_at) >= monthStart).length,
  };

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-5">
          <div>
            <h1 className="font-playfair text-3xl sm:text-4xl text-slate-900">Customer Relationships</h1>
            <p className="text-slate-500 text-sm mt-1">Manage your salon&apos;s clientele and loyalty.</p>
          </div>
          <div className="hidden md:block font-playfair italic text-[#9b3a4e] text-lg leading-tight rotate-[-6deg] mt-1 select-none">Happy Clients<br /><span className="ml-6">Beautiful Journeys ♡</span></div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {[["import-customers-btn", () => setImportOpen(true), Upload, "Import CSV", "Bring guests in from a CSV / Excel export"],
            ["merge-duplicates-btn", () => setMergeOpen(true), GitMerge, "Merge duplicates", "Find & merge guests saved twice with the same number"],
            ["resync-stats-btn", resyncStats, RefreshCw, "Recalculate spend", "Recalculate every guest's Spent & Visits from actual bills"],
            ["export-customers-csv-btn", exportCsv, Download, "Export CSV", "Download all customers as CSV (Name, Number, Email, Gender…)"]].map(([id, fn, Icon, label, title]) => (
            <button key={id} data-testid={id} onClick={fn} title={title} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-700 hover:border-[#9b3a4e]/40 hover:text-[#7f2d3f] shadow-sm transition-colors">
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
          <button data-testid="add-customer-btn" onClick={startNew} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#7f2d3f] to-[#a83d54] text-white text-sm font-semibold shadow-[0_10px_24px_-10px_rgba(155,58,78,.7)] hover:brightness-110 transition-[filter]">
            <Users className="w-4 h-4" /> Add Customer
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="crm-stats">
        <CrmStat icon={Users} tone="rose" label="Total Customers" value={stats.total} delta={stats.newMonth ? `+${stats.newMonth}` : null} sub="new this month" />
        <CrmStat icon={Star} tone="amber" label="Loyal Customers" value={stats.loyal} delta={stats.total ? `${Math.round((stats.loyal / stats.total) * 100)}%` : null} sub="> 3 visits" />
        <CrmStat icon={IndianRupee} tone="emerald" label="Lifetime Revenue" value={`₹${stats.revenue.toLocaleString("en-IN")}`} sub="across all guests" />
        <CrmStat icon={Heart} tone="pink" label="Avg. Spend per Customer" value={`₹${stats.avg.toLocaleString("en-IN")}`} sub="per guest" />
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input data-testid="customer-search" className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm !bg-white !text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#9b3a4e]/30" placeholder="Search by name, phone or email…" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} />
        </div>
        <div className="flex gap-2 flex-wrap" data-testid="crm-date-filters">
          {[["all", "All", Plus], ["today", `Today (${counts.today})`, CalendarDays], ["yesterday", `Yesterday (${counts.yesterday})`, CalendarDays], ["week", `Last 7 days (${counts.week})`, Clock3]].map(([k, l, Icon]) => (
            <button key={k} data-testid={`crm-filter-${k}`} onClick={() => { setDateFilter(k); setPage(1); }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors ${dateFilter === k
                ? "bg-gradient-to-r from-[#7f2d3f] to-[#a83d54] text-white border-transparent shadow"
                : "bg-white text-slate-600 border-slate-200 hover:border-[#9b3a4e]/40"}`}>
              <Icon className={`w-3.5 h-3.5 ${dateFilter === k ? "text-white" : "text-[#9b3a4e]"}`} /> {l}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.2em] text-slate-500 border-b border-slate-100">
              {[["name", "Customer"], ["phone", "Contact"], ["created_at", "Added"], ["gender", "Gender"], ["visits", "Visits"], ["total_spent", "Spent"], ["loyalty_points", "Loyalty"], ["wallet_balance", "Wallet"]].map(([k, l]) => (
                <th key={k} className="text-left font-semibold px-4 py-3.5 whitespace-nowrap">
                  <button onClick={() => setSort(sv => ({ key: k, dir: sv.key === k && sv.dir === "asc" ? "desc" : "asc" }))} data-testid={`crm-sort-${k}`} className={`inline-flex items-center gap-1 hover:text-[#7f2d3f] ${sort.key === k ? "text-[#7f2d3f]" : ""}`}>
                    {l} <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </button>
                </th>
              ))}
              <th className="text-right font-semibold px-4 py-3.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.map(c => {
              const isNew = Date.now() - new Date(c.created_at).getTime() < 7 * 86400000;
              const isVip = (c.total_spent || 0) >= 5000 || (c.visits || 0) >= 8;
              const pd = phoneDisplay(c);
              return (
                <tr key={c.id} data-testid={`customer-row-${c.id}`} className="border-b border-slate-50 hover:bg-[#fdf6f7] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#eef2ff] text-[#4f5fd8] flex items-center justify-center font-semibold">{(c.name || "?").charAt(0).toUpperCase()}</div>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800 flex items-center gap-2">{c.name}
                          {isVip && <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200"><Crown className="w-3 h-3" /> VIP</span>}
                          {!isVip && isNew && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">New</span>}
                        </div>
                        {c.notes && <div className="text-xs text-slate-400 line-clamp-1">{c.notes}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 whitespace-nowrap"><MessageCircle className="w-4 h-4 text-emerald-500" /> {pd.code} {pd.number} <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-500">{pd.iso}</span></div>
                    {c.email && <div className="flex items-center gap-2 text-xs text-slate-500 mt-1"><Mail className="w-3 h-3" /> {c.email}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{addedLabel(c.created_at)}</td>
                  <td className="px-4 py-3 text-slate-700">{c.gender}</td>
                  <td className="px-4 py-3 text-slate-700">{c.visits}</td>
                  <td className="px-4 py-3 text-slate-800 font-medium">₹{(c.total_spent || 0).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-xs bg-sky-50 text-sky-600 px-2 py-1 rounded-lg"><Award className="w-3 h-3" /> {c.loyalty_points}</span></td>
                  <td className="px-4 py-3">
                    <button data-testid={`wallet-customer-${c.id}`} onClick={() => setWalletFor(c)} className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded-lg hover:bg-emerald-100">
                      <Wallet className="w-3 h-3" /> ₹{(c.wallet_balance || 0).toLocaleString("en-IN")}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <ReachOutMenu customer={c} onAddHandles={startEdit} />
                      <button data-testid={`history-customer-${c.id}`} onClick={() => setHistoryFor(c)} title="Visit history" className="p-2 hover:bg-slate-50 rounded text-slate-500 hover:text-violet-600 transition-colors"><History className="w-4 h-4" /></button>
                      <button data-testid={`edit-customer-${c.id}`} onClick={() => startEdit(c)} className="p-2 hover:bg-slate-50 rounded text-slate-500 hover:text-[#7f2d3f] transition-colors"><Edit3 className="w-4 h-4" /></button>
                      <button data-testid={`delete-customer-${c.id}`} onClick={() => remove(c.id)} className="p-2 hover:bg-red-500/10 rounded text-slate-500 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {paged.length === 0 && (
              <tr><td colSpan="9" className="text-center text-slate-500 py-12">{list.length ? "No customers in this date range." : "No customers yet. Add your first one!"}</td></tr>
            )}
          </tbody>
        </table>
        <CrmPager total={visible.length} page={page} perPage={perPage} setPage={setPage} setPerPage={setPerPage} noun="customers" />
      </div>

      <RecentInvoices />

      {walletFor && <WalletDialog customer={walletFor} onClose={() => setWalletFor(null)} onChanged={load} />}
      {historyFor && <CustomerHistoryModal customer={historyFor} onClose={() => setHistoryFor(null)} />}
      {mergeOpen && <MergeDuplicatesModal onClose={() => setMergeOpen(false)} onMerged={load} />}
      {importOpen && <ImportCustomersModal onClose={() => setImportOpen(false)} onDone={load} />}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="card-light w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-playfair text-2xl">{editing ? "Edit Customer" : "New Customer"}</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div><label className="label-light block mb-1">Name *</label><input data-testid="customer-name-input" required className="input-light" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label-light block mb-1">Phone *</label>
                  <div className="flex items-stretch rounded-lg border border-slate-200 overflow-hidden">
                    <select data-testid="customer-country-code" value={form.country_code || "+91"} onChange={e => setForm({ ...form, country_code: e.target.value })}
                      className="pl-2 pr-1 py-2 bg-white border-r border-slate-200 text-sm text-slate-700 font-semibold focus:outline-none cursor-pointer">
                      {COUNTRY_CODES.map(cc => <option key={cc.iso} value={cc.code}>{cc.flag} {cc.iso} {cc.code}</option>)}
                    </select>
                    <input data-testid="customer-phone-input" required className="flex-1 px-3 py-2 bg-white text-sm text-slate-800 focus:outline-none" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} inputMode="tel" />
                  </div>
                </div>
                <div><label className="label-light block mb-1">Email</label><input type="email" className="input-light" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label-light block mb-1">Gender</label>
                  <select className="input-light" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
                    <option>Female</option><option>Male</option><option>Other</option>
                  </select>
                </div>
                <div><label className="label-light block mb-1">Address</label><input className="input-light" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label-light block mb-1">🎂 Birthday</label>
                  <input data-testid="customer-dob-input" type="date" className="input-light" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} />
                  <p className="text-[10px] text-slate-400 mt-1">POS reminds you to give a birthday discount</p>
                </div>
                <div><label className="label-light block mb-1">💞 Anniversary</label>
                  <input data-testid="customer-anniversary-input" type="date" className="input-light" value={form.anniversary} onChange={e => setForm({ ...form, anniversary: e.target.value })} />
                  <p className="text-[10px] text-slate-400 mt-1">POS reminds you on their anniversary week</p>
                </div>
              </div>
              <div>
                <label className="label-light block mb-1">Social handles <span className="normal-case tracking-normal text-slate-400">(for one-tap DMs)</span></label>
                <div className="grid grid-cols-3 gap-2">
                  <input data-testid="customer-instagram-input" className="input-light" placeholder="@instagram" value={form.instagram} onChange={e => setForm({ ...form, instagram: e.target.value })} />
                  <input data-testid="customer-facebook-input" className="input-light" placeholder="facebook user" value={form.facebook} onChange={e => setForm({ ...form, facebook: e.target.value })} />
                  <input data-testid="customer-telegram-input" className="input-light" placeholder="@telegram" value={form.telegram} onChange={e => setForm({ ...form, telegram: e.target.value })} />
                </div>
              </div>
              <div><label className="label-light block mb-1">Notes</label><textarea rows="3" className="input-light" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="btn-slate flex-1">Cancel</button>
                <button data-testid="save-customer-btn" type="submit" className="btn-blue flex-1">{editing ? "Update" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
