import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import api from "@/lib/api";
import { Plus, X, Edit3, Trash2, Clock, Flame, Sparkles, Download, Upload, Globe, Search, Image as ImageIcon, Loader2, Scissors, Hand, Paintbrush, Flower2, Tag, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import ImageUploader from "@/components/ImageUploader";
import { catImage } from "@/lib/categoryImages";

// Must match the booking page category tabs (BookPublic.steps.jsx CATEGORY_ORDER)
const CATS = ["Skin", "Manicure", "Pedicure", "Men Hair", "Women Hair", "Makeup", "Nails"];
const NEW_CAT = "__new__";
const FALLBACK_IMG = "https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=400";

const catIcon = (c) => {
  const t = (c || "").toLowerCase();
  if (t.includes("hair")) return Scissors;
  if (t.includes("nail") || t.includes("manicure") || t.includes("pedicure") || t.includes("mehendi")) return Hand;
  if (t.includes("makeup") || t.includes("make up")) return Paintbrush;
  if (t.includes("spa") || t.includes("massage") || t.includes("skin") || t.includes("facial")) return Flower2;
  return Tag;
};

export default function Services() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", category: "Skin", price: "", duration_min: "", description: "", image_url: "", trending: false, active: true, bookable_online: true });
  const [newCat, setNewCat] = useState(false);
  const [activeCat, setActiveCat] = useState("All");
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [loading, setLoading] = useState(true);
  const searchRef = useRef(null);
  const [catImages, setCatImages] = useState({});
  const [catModal, setCatModal] = useState(null);
  const [catUrl, setCatUrl] = useState("");
  const [genImg, setGenImg] = useState(false);
  const csvRef = useRef(null);

  async function saveCatImage() {
    try {
      await api.put(`/service-categories/${encodeURIComponent(catModal)}`, { image_url: catUrl });
      setCatImages(m => ({ ...m, [catModal]: catUrl }));
      toast.success(catUrl ? "Category banner updated ✦" : "Back to the default banner");
      setCatModal(null);
    } catch { toast.error("Couldn't save — try again"); }
  }

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

  const load = useCallback(async () => {
    try { const { data } = await api.get("/services"); setList(data); } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    load();
    api.get("/service-categories").then(r => setCatImages(r.data || {})).catch(() => {});
  }, [load]);

  // Real-time search with 250ms debounce
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput), 250);
    return () => clearTimeout(t);
  }, [qInput]);

  // ⌘K / Ctrl+K focuses the search bar
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function startNew() { setEditing(null); setNewCat(false); setForm({ name: "", category: activeCat !== "All" ? activeCat : "Skin", price: "", duration_min: "", description: "", image_url: "", trending: false, active: true }); setOpen(true); }
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

  const byCategory = useMemo(() => list.reduce((acc, s) => { (acc[s.category] = acc[s.category] || []).push(s); return acc; }, {}), [list]);
  const catOptions = [...CATS, ...Object.keys(byCategory).filter(c => !CATS.includes(c)).sort()];
  // Dynamic categories: every category found on services PLUS ones created via banners — always in sync, no refresh needed
  const allCats = useMemo(() => {
    const set = new Set([...Object.keys(byCategory), ...Object.keys(catImages || {})]);
    return [...set].filter(Boolean).sort((a, b) => (byCategory[b]?.length || 0) - (byCategory[a]?.length || 0));
  }, [byCategory, catImages]);

  const filtered = useMemo(() => {
    const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const isSubseq = (needle, hay) => {
      let i = 0;
      for (const ch of hay) { if (ch === needle[i]) i += 1; if (i === needle.length) return true; }
      return needle.length === 0;
    };
    const needle = norm(q);
    return list.filter(s => {
      if (activeCat !== "All" && s.category !== activeCat) return false;
      if (!needle) return true;
      const hay = norm(`${s.name} ${s.category} ${s.description || ""}`);
      return hay.includes(needle) || (needle.length >= 3 && isSubseq(needle, norm(`${s.category} ${s.name}`)));
    });
  }, [list, activeCat, q]);
  const filteredByCat = useMemo(() => filtered.reduce((acc, s) => { (acc[s.category] = acc[s.category] || []).push(s); return acc; }, {}), [filtered]);

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
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
          <button
            data-testid="generate-missing-images-btn"
            onClick={async () => {
              try {
                const { data } = await api.post("/services/generate-missing-images");
                if (!data.queued) { toast.info("Every service already has a photo ✦"); return; }
                toast.success(`✨ Mira is painting ${data.queued} service photos${data.remaining ? ` (${data.remaining} more next run)` : ""} — they'll appear within a couple of minutes`);
                setTimeout(load, 100000);
              } catch { toast.error("Couldn't start Mira's photo studio — try again"); }
            }}
            className="btn-slate flex items-center gap-2"
            title="Mira paints an on-brand photo for every service that has none, based on its category"
          >
            <Sparkles className="w-4 h-4 text-amber-500" /> Mira Photos
          </button>
          <button data-testid="add-service-btn" onClick={startNew} className="btn-blue flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Service
          </button>
        </div>
      </div>

      {/* Sticky filter bar — premium search + animated category chips */}
      <div className="sticky top-16 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-white/85 backdrop-blur-md border-b border-slate-100 space-y-3">
        <div className="relative max-w-xl">
          <Search className="w-4 h-4 text-rose-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input ref={searchRef} data-testid="services-search-input" value={qInput}
            onChange={e => setQInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Escape") { setQInput(""); setQ(""); } }}
            placeholder="Search services, categories, descriptions…"
            className="w-full pl-11 pr-20 py-3 text-sm rounded-2xl border border-slate-200/80 bg-white text-slate-900 placeholder:text-slate-400 caret-rose-500 shadow-sm shadow-slate-200/60 focus:outline-none focus:border-rose-300 focus:ring-4 focus:ring-rose-100 transition-all duration-200" />
          {qInput ? (
            <button data-testid="services-search-clear" onClick={() => { setQInput(""); setQ(""); searchRef.current?.focus(); }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 flex items-center justify-center transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <kbd className="absolute right-3.5 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-0.5 text-[10px] font-medium text-slate-400 border border-slate-200 rounded-md px-1.5 py-0.5 bg-slate-50">⌘K</kbd>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="services-cat-chips">
          {loading ? (
            [...Array(6)].map((_, i) => (
              <div key={i} className="shrink-0 h-9 w-24 rounded-full bg-slate-100 animate-pulse" style={{ animationDelay: `${i * 120}ms` }} />
            ))
          ) : (
            <>
              <button data-testid="services-cat-chip-All" onClick={() => setActiveCat("All")}
                className={`snap-start shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold border transition-all duration-200 ${activeCat === "All"
                  ? "bg-gradient-to-r from-slate-800 to-slate-700 text-white border-transparent shadow-md shadow-slate-300 scale-[1.03]"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:-translate-y-0.5 hover:shadow-md"}`}>
                <LayoutGrid className="w-3.5 h-3.5" /> All
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeCat === "All" ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"}`}>{list.length}</span>
              </button>
              {allCats.map(c => {
                const I = catIcon(c);
                const n = byCategory[c]?.length || 0;
                const active = activeCat === c;
                return (
                  <button key={c} data-testid={`services-cat-chip-${c}`} onClick={() => setActiveCat(c)}
                    className={`snap-start shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold border transition-all duration-200 ${active
                      ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white border-transparent shadow-md shadow-rose-200 scale-[1.03]"
                      : "bg-white text-slate-600 border-slate-200 hover:border-rose-300 hover:text-rose-600 hover:-translate-y-0.5 hover:shadow-md"}`}>
                    <I className={`w-3.5 h-3.5 ${active ? "text-white" : "text-rose-400"}`} /> {c}
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${active ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"}`}>{n}</span>
                  </button>
                );
              })}
              {allCats.length === 0 && (
                <span className="text-xs text-slate-400 py-2" data-testid="services-cats-empty">No categories yet — add your first service and its category appears here instantly ✦</span>
              )}
            </>
          )}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="card-light p-10 text-center text-slate-400 text-sm" data-testid="services-empty-state">
          {q ? <>No services match “{q}”.</> : <>No services here yet — tap <b>Add Service</b> to create one.</>}
        </div>
      )}

      {Object.keys(filteredByCat).map(cat => (
        <div key={cat} className="card-light p-0 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50/70 border-b border-slate-100">
            <img src={catImage(cat, catImages)} alt="" className="w-16 h-9 rounded-lg object-cover border border-slate-200" />
            <h3 className="font-playfair text-lg text-sky-700">{cat}</h3>
            <span className="text-[11px] text-slate-400">{filteredByCat[cat].length} services</span>
            <button data-testid={`set-cat-image-${cat}`} onClick={() => { setCatModal(cat); setCatUrl(catImages[cat] || ""); }}
              title="One banner image for this whole category — shown on your booking page"
              className="ml-auto flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-sky-600 px-2.5 py-1.5 rounded-lg hover:bg-sky-50 transition">
              <ImageIcon className="w-3.5 h-3.5" /> Banner
            </button>
          </div>
          <div className="divide-y divide-slate-50">
            {filteredByCat[cat].map(s => (
              <div key={s.id} data-testid={`service-card-${s.id}`}
                className="flex items-center gap-3 px-3 sm:px-4 py-2.5 hover:bg-sky-50/40 transition group">
                <img src={s.image_url || FALLBACK_IMG} alt=""
                  className="w-11 h-11 rounded-xl object-cover shrink-0 border border-slate-100" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold truncate">{s.name}</span>
                    {s.trending && <Flame className="w-3.5 h-3.5 text-orange-500 shrink-0" title="Trending" />}
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                    <span className="font-semibold text-sky-600 text-xs">₹{s.price}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{s.duration_min}m</span>
                    {s.description && <span className="truncate hidden sm:inline">· {s.description}</span>}
                  </div>
                </div>
                <button data-testid={`toggle-online-${s.id}`} onClick={() => toggleOnline(s)}
                  title={s.bookable_online !== false ? "Bookable online — tap to hide" : "Hidden from online booking — tap to show"}
                  className={`shrink-0 flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-full border transition ${s.bookable_online !== false ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
                  <Globe className="w-3 h-3" />
                  <span className="hidden sm:inline">{s.bookable_online !== false ? "Online" : "Hidden"}</span>
                  <span className={`relative inline-flex h-3.5 w-6 rounded-full transition ${s.bookable_online !== false ? "bg-emerald-500" : "bg-slate-300"}`}>
                    <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${s.bookable_online !== false ? "left-3" : "left-0.5"}`} />
                  </span>
                </button>
                <button data-testid={`edit-service-${s.id}`} onClick={() => startEdit(s)}
                  className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50" title="Edit"><Edit3 className="w-4 h-4" /></button>
                <button data-testid={`delete-service-${s.id}`} onClick={() => remove(s.id)}
                  className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50" title="Delete"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {catModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setCatModal(null)}>
          <div className="card-light w-full max-w-md mx-4" onClick={e => e.stopPropagation()} data-testid="cat-image-modal">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-playfair text-xl">{catModal} — category banner</h3>
              <button onClick={() => setCatModal(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-slate-500 mb-3">One elegant banner for the whole category — shown on your public booking page. No need to upload a photo for every service ✦</p>
            <img src={catUrl || catImage(catModal, {})} alt="" className="w-full h-32 rounded-xl object-cover border border-slate-200 mb-3" />
            <ImageUploader kind="category" value={catUrl} onChange={setCatUrl} fallback={catImage(catModal, {})} />
            <div className="flex gap-3 pt-4">
              {catUrl && (
                <button type="button" data-testid="cat-image-use-default" onClick={() => setCatUrl("")} className="btn-slate flex-1">Use default</button>
              )}
              <button type="button" data-testid="cat-image-save" onClick={saveCatImage} className="btn-blue flex-1">Save banner</button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="card-light w-full max-w-lg mx-4 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
                  fallback={FALLBACK_IMG}
                />
                {editing && (
                  <button type="button" data-testid="generate-service-image-btn" disabled={genImg}
                    onClick={async () => {
                      setGenImg(true);
                      try {
                        const { data } = await api.post(`/services/${editing.id}/generate-image`, {}, { timeout: 180000 });
                        setForm(f => ({ ...f, image_url: data.image_url }));
                        toast.success("✨ Mira painted a fresh photo for this service");
                        load();
                      } catch (err) { toast.error(err.response?.data?.detail || "Generation failed — try again"); }
                      finally { setGenImg(false); }
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-600 font-semibold hover:text-amber-700 disabled:opacity-50">
                    {genImg ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Mira is painting… (~30s)</> : <>✨ Let Mira paint this (based on category)</>}
                  </button>
                )}
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
