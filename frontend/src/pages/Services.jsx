import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { Plus, X, Edit3, Trash2, Clock, IndianRupee, Flame, Sparkles, Download, Upload, Globe } from "lucide-react";
import { toast } from "sonner";
import ImageUploader from "@/components/ImageUploader";

// Must match the booking page category tabs (BookPublic.steps.jsx CATEGORY_ORDER)
const CATS = ["Skin", "Manicure", "Pedicure", "Men Hair", "Women Hair", "Makeup", "Nails"];
const NEW_CAT = "__new__";

export default function Services() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", category: "Skin", price: "", duration_min: "", description: "", image_url: "", trending: false, active: true, bookable_online: true });
  const [newCat, setNewCat] = useState(false);
  const csvRef = useRef(null);

  async function exportCsv() {
    try {
      const res = await api.get("/services/export", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "services.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("services.csv downloaded — opens in Excel / Google Sheets");
    } catch { toast.error("Export failed"); }
  }

  async function handleImportCsv(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    try {
      const { data } = await api.post("/services/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`Imported: ${data.added} added · ${data.updated} updated${data.skipped ? ` · ${data.skipped} skipped` : ""}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Import failed");
    } finally {
      e.target.value = "";
    }
  }

  const load = useCallback(async () => { const { data } = await api.get("/services"); setList(data); }, []);
  useEffect(() => { load(); }, [load]);

  function startNew() { setEditing(null); setNewCat(false); setForm({ name: "", category: "Skin", price: "", duration_min: "", description: "", image_url: "", trending: false, active: true }); setOpen(true); }
  function startEdit(s) { setEditing(s); setNewCat(false); setForm({ ...s, price: s.price, duration_min: s.duration_min }); setOpen(true); }

  async function save(e) {
    e.preventDefault();
    if (!form.category.trim()) { toast.error("Enter a category name"); return; }
    try {
      const payload = { ...form, category: form.category.trim(), price: parseFloat(form.price), duration_min: parseInt(form.duration_min) };
      if (editing) { await api.put(`/services/${editing.id}`, payload); toast.success("Service updated"); }
      else { await api.post("/services", payload); toast.success("Service added"); }
      setOpen(false); load();
    } catch { toast.error("Save failed"); }
  }
  async function remove(id) {
    if (!window.confirm("Delete this service?")) return;
    try { await api.delete(`/services/${id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Delete failed"); }
  }

  async function toggleOnline(s) {
    const next = s.bookable_online === false;
    try {
      await api.put(`/services/${s.id}`, { ...s, bookable_online: next });
      setList(l => l.map(x => x.id === s.id ? { ...x, bookable_online: next } : x));
      toast.success(next ? `${s.name} is now bookable online ✦` : `${s.name} hidden from online booking`);
    } catch { toast.error("Couldn't update — try again"); }
  }

  const byCategory = list.reduce((acc, s) => { (acc[s.category] = acc[s.category] || []).push(s); return acc; }, {});
  const catOptions = [...CATS, ...Object.keys(byCategory).filter(c => !CATS.includes(c)).sort()];

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-playfair text-3xl">Service Menu</h1>
          <p className="text-slate-500 text-sm mt-1">Curate what your salon offers your guests.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleImportCsv} data-testid="import-csv-input" />
          <button data-testid="import-csv-btn" onClick={() => csvRef.current?.click()} className="btn-slate flex items-center gap-2" title="Bulk add/update services from a CSV file">
            <Upload className="w-4 h-4" /> Import CSV
          </button>
          <button data-testid="export-csv-btn" onClick={exportCsv} className="btn-slate flex items-center gap-2" title="Download all services as CSV (Excel compatible)">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button
            data-testid="import-preset-btn"
            onClick={async () => {
              try {
                const { data } = await api.post("/services/import-preset");
                toast.success(`${data.added} services imported${data.updated ? ` · ${data.updated} updated` : ""}`);
                load();
              } catch { toast.error("Import failed"); }
            }}
            className="btn-slate flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" /> Import Makeup & Nails menu
          </button>
          <button data-testid="add-service-btn" onClick={startNew} className="btn-blue flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Service
          </button>
        </div>
      </div>

      {Object.keys(byCategory).map(cat => (
        <div key={cat}>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="font-playfair text-xl text-sky-600">{cat}</h3>
            <div className="h-px bg-slate-100 flex-1" />
            <span className="text-xs text-slate-400">{byCategory[cat].length} services</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {byCategory[cat].map(s => (
              <div key={s.id} data-testid={`service-card-${s.id}`} className="card-light p-0 overflow-hidden group hover:border-sky-300 transition-all">
                <div className="h-32 relative">
                  <img src={s.image_url || "https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=400"} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-white to-transparent" />
                  {s.trending && (
                    <span className="absolute top-2 left-2 bg-sky-500 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded flex items-center gap-1">
                      <Flame className="w-3 h-3" /> Trending
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <h4 className="font-playfair text-lg">{s.name}</h4>
                  {s.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{s.description}</p>}
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="flex items-center gap-1 text-sky-600 font-semibold"><IndianRupee className="w-3 h-3" />{s.price}</span>
                      <span className="flex items-center gap-1 text-slate-500 text-xs"><Clock className="w-3 h-3" />{s.duration_min}m</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button data-testid={`edit-service-${s.id}`} onClick={() => startEdit(s)} className="p-1.5 hover:bg-slate-50 rounded text-slate-500 hover:text-sky-600"><Edit3 className="w-3.5 h-3.5" /></button>
                      <button data-testid={`delete-service-${s.id}`} onClick={() => remove(s.id)} className="p-1.5 hover:bg-red-500/10 rounded text-slate-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <button data-testid={`toggle-online-${s.id}`} onClick={() => toggleOnline(s)}
                    className={`mt-3 w-full flex items-center justify-between text-xs px-3 py-1.5 rounded-lg border transition ${s.bookable_online !== false ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
                    <span className="flex items-center gap-1.5"><Globe className="w-3 h-3" /> Online booking</span>
                    <span className={`relative inline-flex h-4 w-7 rounded-full transition ${s.bookable_online !== false ? "bg-emerald-500" : "bg-slate-300"}`}>
                      <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${s.bookable_online !== false ? "left-3.5" : "left-0.5"}`} />
                    </span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="card-light w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-playfair text-2xl">{editing ? "Edit Service" : "New Service"}</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div><label className="label-light block mb-1">Name *</label><input data-testid="service-name-input" required className="input-light" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="label-light block mb-1">Category</label>
                  {newCat ? (
                    <div className="flex gap-1">
                      <input data-testid="service-new-category-input" autoFocus className="input-light" placeholder="e.g. Spa" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
                      <button type="button" data-testid="service-new-category-cancel" onClick={() => { setNewCat(false); setForm({ ...form, category: "Skin" }); }} className="text-slate-400 hover:text-slate-600 px-1" title="Back to list"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <select data-testid="service-category-select" className="input-light" value={form.category}
                      onChange={e => {
                        if (e.target.value === NEW_CAT) { setNewCat(true); setForm({ ...form, category: "" }); }
                        else setForm({ ...form, category: e.target.value });
                      }}>
                      {catOptions.map(c => <option key={c}>{c}</option>)}
                      <option value={NEW_CAT}>＋ Add new category…</option>
                    </select>
                  )}
                </div>
                <div><label className="label-light block mb-1">Price ₹</label><input type="number" required className="input-light" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></div>
                <div><label className="label-light block mb-1">Duration (min)</label><input type="number" required className="input-light" value={form.duration_min} onChange={e => setForm({ ...form, duration_min: e.target.value })} /></div>
              </div>
              <div>
                <label className="label-light block mb-1">Service image</label>
                <ImageUploader
                  kind="service"
                  value={form.image_url}
                  onChange={(url) => setForm({ ...form, image_url: url })}
                  onUploaded={async (url) => {
                    if (!editing) { toast.success("Image attached — it saves with the service ✦"); return; }
                    try {
                      await api.put(`/services/${editing.id}`, { ...form, image_url: url, price: parseFloat(form.price), duration_min: parseInt(form.duration_min) });
                      toast.success("Image uploaded & saved ✦");
                      load();
                    } catch { toast.error("Auto-save failed — press Save Service"); }
                  }}
                  fallback="https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=400"
                />
              </div>
              <div><label className="label-light block mb-1">Description</label><textarea rows="2" className="input-light" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.trending} onChange={e => setForm({ ...form, trending: e.target.checked })} />
                Mark as Trending
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" data-testid="service-bookable-online-checkbox" checked={form.bookable_online !== false} onChange={e => setForm({ ...form, bookable_online: e.target.checked })} />
                Bookable online (show on public booking page)
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="btn-slate flex-1">Cancel</button>
                <button data-testid="save-service-btn" type="submit" className="btn-blue flex-1">{editing ? "Update" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
