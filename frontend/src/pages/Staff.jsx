import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Plus, X, Edit3, Trash2, Phone, Mail, Percent } from "lucide-react";
import { toast } from "sonner";
import ImageUploader from "@/components/ImageUploader";

export default function Staff() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", role: "Stylist", phone: "", email: "", specialties: "", commission_pct: 10, image_url: "", active: true });

  const load = useCallback(async () => { const { data } = await api.get("/staff"); setList(data); }, []);
  useEffect(() => { load(); }, [load]);

  function startNew() { setEditing(null); setForm({ name: "", role: "Stylist", phone: "", email: "", specialties: "", commission_pct: 10, image_url: "", active: true }); setOpen(true); }
  function startEdit(s) { setEditing(s); setForm({ ...s, specialties: (s.specialties || []).join(", ") }); setOpen(true); }

  async function save(e) {
    e.preventDefault();
    try {
      const payload = { ...form, specialties: form.specialties.split(",").map(x => x.trim()).filter(Boolean), commission_pct: parseFloat(form.commission_pct) };
      if (editing) { await api.put(`/staff/${editing.id}`, payload); toast.success("Staff updated"); }
      else { await api.post("/staff", payload); toast.success("Staff added"); }
      setOpen(false); load();
    } catch { toast.error("Save failed"); }
  }
  async function remove(id) { if (!window.confirm("Delete?")) return; await api.delete(`/staff/${id}`); toast.success("Deleted"); load(); }

  return (
    <div className="bg-slate-50 -mx-6 -my-6 px-6 py-6 min-h-[calc(100vh-4rem)] text-slate-800 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-playfair text-3xl">Team Management</h1>
          <p className="text-slate-500 text-sm mt-1">Your stylists, therapists and the talents that make your salon shine.</p>
        </div>
        <button data-testid="add-staff-btn" onClick={startNew} className="btn-blue flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Staff
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {list.map(s => (
          <div key={s.id} data-testid={`staff-card-${s.id}`} className="card-light text-center group hover:border-sky-300 transition-all">
            <div className="relative inline-block">
              <img src={s.image_url || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300"} alt={s.name} className="w-24 h-24 rounded-full object-cover mx-auto border-2 border-sky-400 group-hover:border-sky-400 transition" />
              <span className={`absolute bottom-1 right-1 w-3 h-3 rounded-full border-2 border-bg-surface ${s.active ? 'bg-emerald-400' : 'bg-gray-500'}`} />
            </div>
            <h4 className="font-playfair text-xl mt-3">{s.name}</h4>
            <p className="text-xs uppercase tracking-[0.2em] text-sky-600 mt-1">{s.role}</p>
            <div className="flex flex-wrap gap-1 justify-center mt-3">
              {(s.specialties || []).map(sp => (
                <span key={sp} className="text-[10px] bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">{sp}</span>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-1 text-xs text-slate-500">
              <div className="flex items-center gap-2 justify-center"><Phone className="w-3 h-3" /> {s.phone}</div>
              {s.email && <div className="flex items-center gap-2 justify-center"><Mail className="w-3 h-3" /> {s.email}</div>}
              <div className="flex items-center gap-2 justify-center text-sky-600"><Percent className="w-3 h-3" /> {s.commission_pct}% commission</div>
            </div>
            <div className="flex items-center gap-2 justify-center mt-4">
              <button data-testid={`edit-staff-${s.id}`} onClick={() => startEdit(s)} className="btn-slate flex items-center gap-1 text-xs py-1.5 px-3"><Edit3 className="w-3 h-3" /> Edit</button>
              <button data-testid={`delete-staff-${s.id}`} onClick={() => remove(s.id)} className="p-1.5 text-slate-500 hover:text-red-400 transition"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="card-light w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-playfair text-2xl">{editing ? "Edit Staff" : "New Staff"}</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div><label className="label-light block mb-1">Name *</label><input data-testid="staff-name-input" required className="input-light" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label-light block mb-1">Role</label><input required className="input-light" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="Senior Stylist" /></div>
                <div><label className="label-light block mb-1">Phone *</label><input data-testid="staff-phone-input" required className="input-light" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              </div>
              <div><label className="label-light block mb-1">Email</label><input type="email" className="input-light" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div><label className="label-light block mb-1">Specialties (comma separated)</label><input className="input-light" value={form.specialties} onChange={e => setForm({ ...form, specialties: e.target.value })} placeholder="Hair, Color, Makeup" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label-light block mb-1">Commission %</label><input type="number" className="input-light" value={form.commission_pct} onChange={e => setForm({ ...form, commission_pct: e.target.value })} /></div>
                <div>{/* spacer to keep grid alignment */}</div>
              </div>
              <div>
                <label className="label-light block mb-1">Staff photo</label>
                <ImageUploader
                  kind="staff"
                  circular
                  value={form.image_url}
                  onChange={(url) => setForm({ ...form, image_url: url })}
                  fallback="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="btn-slate flex-1">Cancel</button>
                <button data-testid="save-staff-btn" type="submit" className="btn-blue flex-1">{editing ? "Update" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
