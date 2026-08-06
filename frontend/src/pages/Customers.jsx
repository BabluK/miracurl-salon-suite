import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { Plus, X, Search, Edit3, Trash2, Phone, Mail, Award, Download, Upload, Wallet } from "lucide-react";
import { toast } from "sonner";
import { WalletDialog } from "@/components/WalletDialog";

export default function Customers() {
  const [list, setList] = useState([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [walletFor, setWalletFor] = useState(null);
  const [dateFilter, setDateFilter] = useState("all"); // all | today | yesterday | week
  const [form, setForm] = useState({ name: "", phone: "", email: "", gender: "Female", dob: "", anniversary: "", address: "", notes: "" });

  const load = useCallback(async () => {
    const { data } = await api.get(`/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    setList(data);
  }, [q]);
  useEffect(() => { load(); }, [load]);
  const csvRef = useRef(null);

  const istDay = (iso, offsetDays = 0) => {
    const d = iso ? new Date(iso) : new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  };
  const today = istDay(null), yesterday = istDay(null, -1), weekAgo = istDay(null, -6);
  const counts = {
    today: list.filter(c => c.created_at && istDay(c.created_at) === today).length,
    yesterday: list.filter(c => c.created_at && istDay(c.created_at) === yesterday).length,
    week: list.filter(c => c.created_at && istDay(c.created_at) >= weekAgo).length,
  };
  const visible = list.filter(c => {
    if (dateFilter === "all") return true;
    const d = c.created_at ? istDay(c.created_at) : "";
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

  async function handleImportCsv(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    try {
      const { data } = await api.post("/customers/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`Imported: ${data.added} added · ${data.updated} updated${data.skipped ? ` · ${data.skipped} skipped` : ""}`);
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Import failed"); }
    finally { e.target.value = ""; }
  }

  function startNew() { setEditing(null); setForm({ name: "", phone: "", email: "", gender: "Female", dob: "", anniversary: "", address: "", notes: "" }); setOpen(true); }
  function startEdit(c) { setEditing(c); setForm({ name: c.name, phone: c.phone, email: c.email || "", gender: c.gender || "Other", dob: c.dob || "", anniversary: c.anniversary || "", address: c.address || "", notes: c.notes || "" }); setOpen(true); }

  async function save(e) {
    e.preventDefault();
    try {
      if (editing) { await api.put(`/customers/${editing.id}`, form); toast.success("Customer updated"); }
      else { await api.post("/customers", form); toast.success("Customer added"); }
      setOpen(false); load();
    } catch (err) { toast.error("Save failed"); }
  }

  async function remove(id) {
    if (!window.confirm("Delete this customer?")) return;
    try {
      await api.delete(`/customers/${id}`);
      toast.success("Deleted");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Delete failed");
    }
  }

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-playfair text-3xl">Customer Relationships</h1>
          <p className="text-slate-500 text-sm mt-1">Manage your salon&apos;s clientele and loyalty.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleImportCsv} data-testid="import-customers-csv-input" />
          <button data-testid="import-customers-csv-btn" onClick={() => csvRef.current?.click()} className="btn-slate flex items-center gap-2" title="Bulk add/update customers from CSV (great for migrating old data)">
            <Upload className="w-4 h-4" /> Import CSV
          </button>
          <button data-testid="export-customers-csv-btn" onClick={exportCsv} className="btn-slate flex items-center gap-2" title="Download all customers as CSV">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button data-testid="add-customer-btn" onClick={startNew} className="btn-blue flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Customer
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-md flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input data-testid="customer-search" className="input-light pl-10" placeholder="Search by name or phone..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="flex gap-2" data-testid="crm-date-filters">
          {[["all", "✨ All"], ["today", `📅 Today (${counts.today})`], ["yesterday", `Yesterday (${counts.yesterday})`], ["week", `Last 7 days (${counts.week})`]].map(([k, l]) => (
            <button key={k} data-testid={`crm-filter-${k}`} onClick={() => setDateFilter(k)}
              className={`px-3.5 py-2 rounded-full text-xs font-semibold border transition ${dateFilter === k
                ? "bg-slate-900 text-amber-200 border-slate-900 shadow"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="card-light p-0 overflow-x-auto">
        <table className="luxe-table-light min-w-[820px]">
          <thead>
            <tr>
              <th>Customer</th><th>Contact</th><th>Added</th><th>Gender</th><th>Visits</th><th>Spent</th><th>Loyalty</th><th>Wallet</th><th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map(c => (
              <tr key={c.id} data-testid={`customer-row-${c.id}`}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-500 to-blue-500 flex items-center justify-center text-white font-semibold">{c.name.charAt(0)}</div>
                    <div>
                      <div className="font-medium">{c.name}</div>
                      {c.notes && <div className="text-xs text-slate-400 line-clamp-1">{c.notes}</div>}
                    </div>
                  </div>
                </td>
                <td>
                  <div className="flex items-center gap-2 text-sm"><Phone className="w-3 h-3 text-sky-600" /> {c.phone}</div>
                  {c.email && <div className="flex items-center gap-2 text-xs text-slate-500 mt-1"><Mail className="w-3 h-3" /> {c.email}</div>}
                </td>
                <td className="text-sm">{c.gender}</td>
                <td className="text-sm">{c.visits}</td>
                <td className="text-sm">₹{(c.total_spent || 0).toLocaleString("en-IN")}</td>
                <td>
                  <span className="inline-flex items-center gap-1 text-xs bg-sky-50 text-sky-600 px-2 py-1 rounded">
                    <Award className="w-3 h-3" /> {c.loyalty_points}
                  </span>
                </td>
                <td>
                  <button data-testid={`wallet-customer-${c.id}`} onClick={() => setWalletFor(c)}
                    className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded-lg hover:bg-emerald-100">
                    <Wallet className="w-3 h-3" /> ₹{(c.wallet_balance || 0).toLocaleString("en-IN")}
                  </button>
                </td>
                <td>
                  <div className="flex items-center gap-2 justify-end">
                    <button data-testid={`edit-customer-${c.id}`} onClick={() => startEdit(c)} className="p-2 hover:bg-slate-50 rounded text-slate-500 hover:text-sky-600 transition"><Edit3 className="w-4 h-4" /></button>
                    <button data-testid={`delete-customer-${c.id}`} onClick={() => remove(c.id)} className="p-2 hover:bg-red-500/10 rounded text-slate-500 hover:text-red-400 transition"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan="9" className="text-center text-slate-500 py-12">{list.length ? "No customers in this date range." : "No customers yet. Add your first one!"}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {walletFor && <WalletDialog customer={walletFor} onClose={() => setWalletFor(null)} onChanged={load} />}

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
                <div><label className="label-light block mb-1">Phone *</label><input data-testid="customer-phone-input" required className="input-light" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
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
