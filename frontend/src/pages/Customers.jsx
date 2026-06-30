import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Plus, X, Search, Edit3, Trash2, Phone, Mail, Award } from "lucide-react";
import { toast } from "sonner";

export default function Customers() {
  const [list, setList] = useState([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", gender: "Female", address: "", notes: "" });

  const load = useCallback(async () => {
    const { data } = await api.get(`/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    setList(data);
  }, [q]);
  useEffect(() => { load(); }, [load]);

  function startNew() { setEditing(null); setForm({ name: "", phone: "", email: "", gender: "Female", address: "", notes: "" }); setOpen(true); }
  function startEdit(c) { setEditing(c); setForm({ name: c.name, phone: c.phone, email: c.email || "", gender: c.gender || "Other", address: c.address || "", notes: c.notes || "" }); setOpen(true); }

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
    await api.delete(`/customers/${id}`);
    toast.success("Deleted");
    load();
  }

  return (
    <div className="bg-slate-50 -mx-6 -my-6 px-6 py-6 min-h-[calc(100vh-4rem)] text-slate-800 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-playfair text-3xl">Customer Relationships</h1>
          <p className="text-slate-500 text-sm mt-1">Manage your salon&apos;s clientele and loyalty.</p>
        </div>
        <button data-testid="add-customer-btn" onClick={startNew} className="btn-blue flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Customer
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input data-testid="customer-search" className="input-light pl-10" placeholder="Search by name or phone..." value={q} onChange={e => setQ(e.target.value)} />
      </div>

      <div className="card-light p-0 overflow-hidden">
        <table className="luxe-table-light">
          <thead>
            <tr>
              <th>Customer</th><th>Contact</th><th>Gender</th><th>Visits</th><th>Spent</th><th>Loyalty</th><th></th>
            </tr>
          </thead>
          <tbody>
            {list.map(c => (
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
                  <div className="flex items-center gap-2 justify-end">
                    <button data-testid={`edit-customer-${c.id}`} onClick={() => startEdit(c)} className="p-2 hover:bg-slate-50 rounded text-slate-500 hover:text-sky-600 transition"><Edit3 className="w-4 h-4" /></button>
                    <button data-testid={`delete-customer-${c.id}`} onClick={() => remove(c.id)} className="p-2 hover:bg-red-500/10 rounded text-slate-500 hover:text-red-400 transition"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan="7" className="text-center text-slate-500 py-12">No customers yet. Add your first one!</td></tr>
            )}
          </tbody>
        </table>
      </div>

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
