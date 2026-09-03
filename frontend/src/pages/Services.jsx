import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import api, { thumbUrl } from "@/lib/api";
import { Plus, X, Edit3, Trash2, Clock, Flame, Sparkles, Download, Upload, Globe, Search, Image as ImageIcon, Loader2, Scissors, Hand, Paintbrush, Flower2, Tag, LayoutGrid, GripVertical, ArrowUpDown, Camera } from "lucide-react";
import { toast } from "sonner";
import { askConfirm } from "@/components/ConfirmDialog";
import ImageUploader from "@/components/ImageUploader";
import { catImage } from "@/lib/categoryImages";
import { useAuth } from "@/context/AuthContext";

// Categories are fully dynamic — pulled from the salon's own services + created banners
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
  const { tenant } = useAuth();
  const isResto = tenant?.business_type === "restaurant";
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", category: "Skin", price: "", duration_min: "", description: "", image_url: "", trending: false, active: true, bookable_online: true, gender: "unisex" });
  const [newCat, setNewCat] = useState(false);
  const [activeCat, setActiveCat] = useState("All");
  const [activeGender, setActiveGender] = useState("All");
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [loading, setLoading] = useState(true);
  const searchRef = useRef(null);
  const [catImages, setCatImages] = useState({});
  const [catModal, setCatModal] = useState(null);
  const [catUrl, setCatUrl] = useState("");
  const [catRename, setCatRename] = useState("");
  const [genImg, setGenImg] = useState(false);
  const csvRef = useRef(null);
  const [catOrder, setCatOrder] = useState([]);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [orderDraft, setOrderDraft] = useState([]);
  const dragIdx = useRef(null);

  function openReorder() { setOrderDraft(allCats); setReorderOpen(true); }

  function moveDraft(from, to) {
    if (to < 0 || to >= orderDraft.length || from === to) return;
    setOrderDraft(d => { const arr = [...d]; const [x] = arr.splice(from, 1); arr.splice(to, 0, x); return arr; });
  }

  async function saveOrder() {
    try {
      await api.put("/service-categories/order", { order: orderDraft });
      setCatOrder(orderDraft);
      setReorderOpen(false);
      toast.success("Category order saved — your booking page follows it too ✦");
    } catch { toast.error("Couldn't save the order — try again"); }
  }

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
    api.get("/service-categories/order").then(r => setCatOrder(r.data.order || [])).catch(() => {});
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

  function startNew() {
    const defCat = activeCat !== "All" ? activeCat : (allCats[0] || "");
    setEditing(null); setNewCat(!defCat);
    setForm({ name: "", category: defCat, price: "", duration_min: "", description: "", image_url: "", trending: false, active: true, bookable_online: true, gender: "unisex" });
    setOpen(true);
  }
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
    askConfirm({
      title: "Delete service?", message: "It disappears from the catalog and booking page.", confirmLabel: "Yes, delete", danger: true,
      action: async () => {
        try { await api.delete(`/services/${id}`); toast.success("Deleted"); load(); }
        catch (e) { toast.error(e.response?.data?.detail || "Delete failed"); }
      },
    });
  }

  const GENDER_META = {
    male: { label: "Men", icon: "👨", cls: "bg-sky-50 border-sky-200 text-sky-700" },
    female: { label: "Women", icon: "👩", cls: "bg-rose-50 border-rose-200 text-rose-600" },
    unisex: { label: "Unisex", icon: "⚥", cls: "bg-slate-50 border-slate-200 text-slate-500" },
  };
  const VEG_META = {
    "veg": { icon: "🟢", label: "Veg", cls: "bg-emerald-50 border-emerald-200 text-emerald-700" },
    "non-veg": { icon: "🔴", label: "Non-veg", cls: "bg-rose-50 border-rose-200 text-rose-600" },
    "egg": { icon: "🟡", label: "Egg", cls: "bg-amber-50 border-amber-200 text-amber-700" },
  };
  async function cycleVeg(s) {
    const order = [null, "veg", "non-veg", "egg"];
    const next = order[(order.indexOf(s.veg || null) + 1) % 4];
    try {
      await api.put(`/services/${s.id}`, { ...s, veg: next });
      toast.success(`${s.name} → ${next ? VEG_META[next].label : "no diet tag"}`);
      load();
    } catch { toast.error("Couldn't update"); }
  }
  async function cycleSpice(s) {
    const next = ((Number(s.spice) || 0) + 1) % 4;
    try {
      await api.put(`/services/${s.id}`, { ...s, spice: next });
      toast.success(`${s.name} → ${next ? "🌶️".repeat(next) : "not spicy"}`);
      load();
    } catch { toast.error("Couldn't update"); }
  }

  async function cycleGender(s) {
    const order = ["unisex", "male", "female"];
    const next = order[(order.indexOf(s.gender || "unisex") + 1) % 3];
    try {
      await api.put(`/services/${s.id}`, { ...s, gender: next });
      toast.success(`${s.name} → ${GENDER_META[next].icon} ${GENDER_META[next].label}`);
      load();
    } catch { toast.error("Couldn't update"); }
  }

  async function toggleActive(s) {
    const next = s.active === false;
    try {
      await api.put(`/services/${s.id}`, { ...s, active: next });
      setList(l => l.map(x => x.id === s.id ? { ...x, active: next } : x));
      toast.success(next ? `${s.name} enabled ✦` : `${s.name} disabled — hidden from booking until you enable it`);
    } catch { toast.error("Couldn't update — try again"); }
  }

  const IST_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  async function toggleSoldOut(s) {
    const today = IST_TODAY();
    const next = s.sold_out_date === today ? null : today;
    try {
      await api.put(`/services/${s.id}`, { ...s, sold_out_date: next });
      toast.success(next ? `${s.name} marked SOLD OUT for today — diners can't order it` : `${s.name} is back on the menu ✦`);
      load();
    } catch { toast.error("Couldn't update"); }
  }

  const photoRef = useRef(null);
  const photoSvcRef = useRef(null);
  const [photoBusy, setPhotoBusy] = useState("");
  const [descBusy, setDescBusy] = useState(false);
  const [imgBatch, setImgBatch] = useState(null);
  const [paintCat, setPaintCat] = useState("");
  const [weight, setWeight] = useState(null);
  const batchTimer = useRef(null);
  const loadWeight = useCallback(() => { api.get("/services/image-weight").then(r => setWeight(r.data)).catch(() => {}); }, []);
  useEffect(() => { loadWeight(); }, [loadWeight]);
  const pollBatch = useCallback(async function poll() {
    try {
      const { data } = await api.get("/services/image-batch-status");
      if (data.status === "running") {
        setImgBatch(data);
        load();
        api.get("/service-categories").then(r => setCatImages(r.data || {})).catch(() => {});
        batchTimer.current = setTimeout(poll, 8000);
      } else {
        setImgBatch(prev => {
          if (prev) {
            if (data.kind === "shrink") toast.success(`⚡ Done — ${data.done} photos shrunk, ${((data.saved_bytes || 0) / 1048576).toFixed(1)} MB saved. Same links, much faster pages.`);
            else toast.success(`🎨 Mira finished — ${data.done} ${data.kind === "banners" ? "category banners" : "photos"} painted${data.failed ? ` (${data.failed} failed)` : ""}`);
            setWeight(null); setTimeout(() => api.get("/services/image-weight").then(r => setWeight(r.data)).catch(() => {}), 500);
            load();
            api.get("/service-categories").then(r => setCatImages(r.data || {})).catch(() => {});
          }
          return null;
        });
      }
    } catch { /* ignore */ }
  }, [load]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { pollBatch(); return () => clearTimeout(batchTimer.current); }, [pollBatch]);
  function pickPhoto(s) { photoSvcRef.current = s; photoRef.current?.click(); }
  async function quickPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const s = photoSvcRef.current;
    if (!file || !s) return;
    setPhotoBusy(s.id);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/uploads/image?kind=service", fd, { headers: { "Content-Type": "multipart/form-data" } });
      await api.put(`/services/${s.id}`, { ...s, image_url: data.url });
      toast.success(`📸 Photo added to ${s.name} — it shows on the QR menu now`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed — try a smaller photo");
    } finally { setPhotoBusy(""); }
  }

  async function renameCategory() {
    const next = (catRename || "").trim();
    if (!next || next === catModal) { toast.error("Enter a different category name"); return; }
    try {
      const { data } = await api.post("/service-categories/rename", { old: catModal, new: next });
      toast.success(`Category renamed to "${next}" — ${data.services_moved} services moved ✦`);
      setCatModal(null);
      setCatRename("");
      if (activeCat === catModal) setActiveCat(next);
      load();
      api.get("/service-categories").then(r => setCatImages(r.data || {})).catch(() => {});
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't rename — try again"); }
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
  // Dynamic categories: every category found on services PLUS ones created via banners — always in sync, no refresh needed
  const allCats = useMemo(() => {
    const set = new Set([...Object.keys(byCategory), ...Object.keys(catImages || {})]);
    const pos = (c) => { const i = catOrder.indexOf(c); return i === -1 ? 999 : i; };
    return [...set].filter(Boolean).sort((a, b) => pos(a) - pos(b) || (byCategory[b]?.length || 0) - (byCategory[a]?.length || 0));
  }, [byCategory, catImages, catOrder]);
  // Modal dropdown shows ONLY the salon's own categories (created/added) — no hardcoded list
  const catOptions = allCats;

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
      if (activeGender !== "All" && (s.gender || "unisex") !== activeGender) return false;
      if (!needle) return true;
      const hay = norm(`${s.name} ${s.category} ${s.description || ""}`);
      return hay.includes(needle) || (needle.length >= 3 && isSubseq(needle, norm(`${s.category} ${s.name}`)));
    });
  }, [list, activeCat, activeGender, q]);
  const filteredByCat = useMemo(() => filtered.reduce((acc, s) => { (acc[s.category] = acc[s.category] || []).push(s); return acc; }, {}), [filtered]);

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-playfair text-3xl">{isResto ? "Menu" : "Service Menu"}</h1>
          <p className="text-slate-500 text-sm mt-1">{isResto ? "Curate what your restaurant serves your guests." : "Curate what your salon offers your guests."}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleImportCsv} data-testid="import-csv-input" />
          <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={quickPhoto} data-testid="quick-photo-input" />
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
                toast.success(isResto
                  ? `🍗 ${data.added} starters added${data.skipped ? ` (${data.skipped} already on your menu)` : ""} — tap Mira Photos & Mira Descriptions next!`
                  : `${data.added} services imported${data.updated ? ` · ${data.updated} updated` : ""}`);
                load();
              } catch { toast.error("Import failed"); }
            }}
            className="btn-slate flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" /> {isResto ? "Import Starters Menu 🍗" : "Import Makeup & Nails menu"}
          </button>
          {weight?.heavy > 0 && !imgBatch && (
            <button data-testid="shrink-images-btn" onClick={async () => {
                try {
                  const { data } = await api.post("/services/shrink-images");
                  if (!data.queued) { toast.info("All photos are already light ✦"); setWeight({ heavy: 0 }); return; }
                  setImgBatch({ done: 0, total: data.queued, status: "running", kind: "shrink" });
                  toast.success(`⚡ Shrinking ${data.queued} heavy photos (${weight.mb} MB) — same links, ~95% lighter`);
                  setTimeout(pollBatch, 4000);
                } catch (err) { toast.error(err.response?.data?.detail || "Couldn't start shrinking"); }
              }}
              title={`${weight.heavy} photos weigh ${weight.mb} MB — compress them in place so menus load instantly`}
              className="btn-slate flex items-center gap-2 !border-amber-300 !text-amber-800 !bg-amber-50">
              ⚡ Shrink {weight.heavy} heavy photos
            </button>
          )}
          {imgBatch?.kind === "shrink" && (
            <span data-testid="shrink-progress" className="text-xs text-amber-700 inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Shrinking {imgBatch.done}/{imgBatch.total}…</span>
          )}
          <select data-testid="paint-category-select" value={paintCat || (activeCat !== "All" ? activeCat : "")} onChange={e => setPaintCat(e.target.value)}
            title="Choose one category to paint — much faster than the whole menu"
            className="btn-slate !px-3 text-sm max-w-[200px] disabled:opacity-60" disabled={!!imgBatch}>
            <option value="">🎨 Paint: all categories</option>
            {allCats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            data-testid="generate-missing-images-btn"
            disabled={!!imgBatch}
            onClick={async () => {
              const cat = paintCat || (activeCat !== "All" ? activeCat : "");
              try {
                const { data } = await api.post(`/services/generate-missing-images${cat ? `?category=${encodeURIComponent(cat)}` : ""}`);
                if (!data.queued) { toast.info(cat ? `Every ${cat} ${isResto ? "dish" : "service"} already has a photo ✦` : (isResto ? "Every dish already has a photo ✦" : "Every service already has a photo ✦")); return; }
                toast.success(`🎨 Mira is painting ${data.queued} ${cat ? `${cat} ` : ""}${isResto ? "dish" : "service"} photos (5 at a time) — they appear as they finish`);
                setImgBatch({ done: 0, total: data.queued, status: "running", kind: "photos" });
                setTimeout(pollBatch, 5000);
              } catch (err) { toast.error(err.response?.data?.detail || "Couldn't start Mira's photo studio — try again"); }
            }}
            className="btn-slate flex items-center gap-2 disabled:opacity-60"
            title="Mira paints a photo for every item without one (8 at a time, ~35 s each). Only the photo is added — names, prices and categories are never touched. Pick a category on the left to keep it quick"
          >
            {imgBatch?.kind !== "banners" && imgBatch ? <Loader2 className="w-4 h-4 animate-spin text-amber-500" /> : <Sparkles className="w-4 h-4 text-amber-500" />}
            {imgBatch && imgBatch.kind !== "banners" ? `Painting ${imgBatch.done}/${imgBatch.total} · ≈${Math.max(1, Math.ceil((imgBatch.total - imgBatch.done) / 8 * 0.6))} min left` : "Mira Photos"}
          </button>
          <button
            data-testid="generate-all-banners-btn"
            disabled={!!imgBatch}
            onClick={async () => {
              const cat = paintCat || (activeCat !== "All" ? activeCat : "");
              try {
                const { data } = await api.post(`/services/generate-all-banners${cat ? `?category=${encodeURIComponent(cat)}` : ""}`);
                if (!data.queued) { toast.info("Every category already has a banner ✦"); return; }
                toast.success(cat ? `🖼️ Mira is painting the ${cat} banner — ready in about a minute` : `🖼️ Mira is painting ${data.queued} category banners (5 at a time) — they appear as they finish`);
                setImgBatch({ done: 0, total: data.queued, status: "running", kind: "banners" });
                setTimeout(pollBatch, 5000);
              } catch (err) { toast.error(err.response?.data?.detail || "Couldn't start Mira's banner studio — try again"); }
            }}
            className="btn-slate flex items-center gap-2 disabled:opacity-60"
            title="Mira paints a banner for the picked category (or every category that has none)"
          >
            {imgBatch?.kind === "banners" ? <Loader2 className="w-4 h-4 animate-spin text-amber-500" /> : <Sparkles className="w-4 h-4 text-sky-500" />}
            {imgBatch?.kind === "banners" ? `Banners ${imgBatch.done}/${imgBatch.total} · ≈${Math.max(1, Math.ceil((imgBatch.total - imgBatch.done) / 8 * 0.6))} min left` : "Mira Banners"}
          </button>
          {isResto && (
            <button
              data-testid="generate-descriptions-btn"
              disabled={descBusy}
              onClick={async () => {
                setDescBusy(true);
                try {
                  const { data } = await api.post("/services/generate-descriptions");
                  if (!data.updated) { toast.info("Every dish already has a description ✦"); return; }
                  toast.success(`✨ Mira wrote ${data.updated} tasty descriptions${data.remaining ? ` (${data.remaining} more next run)` : ""}`);
                  load();
                } catch (err) {
                  toast.error(err.response?.data?.detail || "Mira couldn't write right now — try again");
                } finally { setDescBusy(false); }
              }}
              className="btn-slate flex items-center gap-2 disabled:opacity-50"
              title="Mira writes a mouth-watering one-line description for every dish that has none"
            >
              {descBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-rose-500" />} Mira Descriptions
            </button>
          )}
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
        {!isResto && (
        <div className="flex items-center gap-2 flex-wrap" data-testid="services-gender-chips">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">For</span>
          {[["All", "✨ All"], ["male", "👨 Men"], ["female", "👩 Women"], ["unisex", "⚥ Unisex"]].map(([k, l]) => (
            <button key={k} data-testid={`services-gender-chip-${k}`} onClick={() => setActiveGender(k)}
              className={`inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200 ${activeGender === k
                ? "bg-slate-900 text-amber-200 border-slate-900 shadow-md scale-[1.03]"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}>
              {l}
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeGender === k ? "bg-white/20 text-amber-100" : "bg-slate-100 text-slate-500"}`}>
                {k === "All" ? list.length : list.filter(s => (s.gender || "unisex") === k).length}
              </span>
            </button>
          ))}
          <span className="text-[10px] text-slate-400 hidden md:inline">Tap the 👨/👩/⚥ chip on any service to re-categorize it</span>
        </div>
        )}
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
              {allCats.length > 1 && (
                <button data-testid="services-cat-reorder-btn" onClick={openReorder} title="Drag categories into your preferred order — the booking page follows it"
                  className="snap-start shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold border border-dashed border-slate-300 bg-white text-slate-500 hover:border-sky-400 hover:text-sky-600 transition-all duration-200">
                  <ArrowUpDown className="w-3.5 h-3.5" /> Reorder
                </button>
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

      {[...Object.keys(filteredByCat)].sort((a, b) => allCats.indexOf(a) - allCats.indexOf(b)).map(cat => (
        <div key={cat} className="card-light p-0 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50/70 border-b border-slate-100">
            {isResto && !catImages[cat] ? (
              <div className="w-16 h-9 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center text-base">🍽️</div>
            ) : (
              <img src={isResto ? catImages[cat] : catImage(cat, catImages)} alt="" className="w-16 h-9 rounded-lg object-cover border border-slate-200" />
            )}
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
                className={`flex items-center gap-3 px-3 sm:px-4 py-2.5 hover:bg-sky-50/40 transition group ${s.active === false ? "opacity-55" : ""}`}>
                {!s.image_url && isResto ? (
                  <button onClick={() => pickPhoto(s)} data-testid={`quick-photo-${s.id}`} title="Snap or upload a photo of this dish"
                    className="w-11 h-11 rounded-xl shrink-0 border border-dashed border-sky-300 bg-sky-50 flex items-center justify-center text-sky-500 hover:bg-sky-100 transition">
                    {photoBusy === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                  </button>
                ) : isResto ? (
                  <button onClick={() => pickPhoto(s)} data-testid={`quick-photo-${s.id}`} title="Replace this dish photo" className="relative shrink-0 group/photo">
                    <img src={thumbUrl(s.image_url, 160)} alt="" className="w-11 h-11 rounded-xl object-cover border border-slate-100" loading="lazy" />
                    <span className="absolute inset-0 rounded-xl bg-slate-900/50 hidden group-hover/photo:flex items-center justify-center">
                      {photoBusy === s.id ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Camera className="w-4 h-4 text-white" />}
                    </span>
                  </button>
                ) : (
                  <img src={thumbUrl(s.image_url, 160) || FALLBACK_IMG} alt=""
                    className="w-11 h-11 rounded-xl object-cover shrink-0 border border-slate-100" loading="lazy" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold truncate">{s.name}</span>
                    {s.trending && <Flame className="w-3.5 h-3.5 text-orange-500 shrink-0" title="Trending" />}
                    {s.active === false && <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide bg-slate-100 text-slate-500 border border-slate-200 rounded-full px-1.5 py-0.5">Disabled</span>}
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                    <span className="font-semibold text-sky-600 text-xs">₹{s.price}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{s.duration_min}m</span>
                    {s.description && <span className="truncate hidden sm:inline">· {s.description}</span>}
                  </div>
                </div>
                {tenant?.business_type === "restaurant" && (<>
                  <button data-testid={`toggle-veg-${s.id}`} onClick={() => cycleVeg(s)}
                    title="Diet tag — tap to cycle: none → Veg → Non-veg → Egg"
                    className={`shrink-0 flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-full border transition ${s.veg ? VEG_META[s.veg].cls : "bg-slate-50 border-slate-200 text-slate-400"}`}>
                    {s.veg ? VEG_META[s.veg].icon : "◌"}<span className="hidden sm:inline">{s.veg ? VEG_META[s.veg].label : "Diet"}</span>
                  </button>
                  <button data-testid={`toggle-spice-${s.id}`} onClick={() => cycleSpice(s)}
                    title="Spice level — tap to cycle 0-3 chilis"
                    className={`shrink-0 text-[11px] px-2.5 py-1.5 rounded-full border transition ${Number(s.spice) > 0 ? "bg-orange-50 border-orange-200 text-orange-600" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
                    {Number(s.spice) > 0 ? "🌶️".repeat(Number(s.spice)) : "🌶️?"}
                  </button>
                  <button data-testid={`toggle-soldout-${s.id}`} onClick={() => toggleSoldOut(s)}
                    title={s.sold_out_date === IST_TODAY() ? "SOLD OUT today — tap to put it back on the menu" : "Tap to mark sold out for today (diners can't order it; auto-resets tomorrow)"}
                    className={`shrink-0 text-[11px] px-2.5 py-1.5 rounded-full border font-bold transition ${s.sold_out_date === IST_TODAY() ? "bg-rose-50 border-rose-300 text-rose-600" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
                    {s.sold_out_date === IST_TODAY() ? "Sold out" : "In stock"}
                  </button>
                </>)}
                {!isResto && (
                <button data-testid={`toggle-gender-${s.id}`} onClick={() => cycleGender(s)}
                  title="Who is this service for? Tap to cycle: Unisex → Men → Women"
                  className={`shrink-0 flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-full border transition ${GENDER_META[s.gender || "unisex"].cls}`}>
                  {GENDER_META[s.gender || "unisex"].icon}
                  <span className="hidden sm:inline">{GENDER_META[s.gender || "unisex"].label}</span>
                </button>
                )}
                <button data-testid={`toggle-active-${s.id}`} onClick={() => toggleActive(s)}
                  title={s.active === false ? "Disabled — tap to enable" : "Active — tap to disable (hides everywhere until re-enabled)"}
                  className={`shrink-0 flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-full border transition ${s.active !== false ? "bg-sky-50 border-sky-200 text-sky-700" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
                  <span className="hidden sm:inline">{s.active !== false ? "Active" : "Off"}</span>
                  <span className={`relative inline-flex h-3.5 w-6 rounded-full transition ${s.active !== false ? "bg-sky-500" : "bg-slate-300"}`}>
                    <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${s.active !== false ? "left-3" : "left-0.5"}`} />
                  </span>
                </button>
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

      {reorderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setReorderOpen(false)}>
          <div className="card-light w-full max-w-sm mx-4 max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid="cat-reorder-modal">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-playfair text-xl">Reorder categories</h3>
              <button onClick={() => setReorderOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-slate-500 mb-4">Drag (or use the arrows) to set the order — the chips here and the tabs on your public booking page follow it ✦</p>
            <div className="space-y-1.5">
              {orderDraft.map((c, i) => (
                <div key={c} draggable data-testid={`cat-reorder-row-${c}`}
                  onDragStart={() => { dragIdx.current = i; }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => { moveDraft(dragIdx.current, i); dragIdx.current = null; }}
                  className="flex items-center gap-2.5 border border-slate-200 rounded-xl px-3 py-2.5 bg-white cursor-grab active:cursor-grabbing hover:border-sky-300 transition-colors">
                  <GripVertical className="w-4 h-4 text-slate-300" />
                  <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                  <span className="text-sm font-semibold text-slate-700 flex-1 truncate">{c}</span>
                  <span className="text-[10px] text-slate-400">{byCategory[c]?.length || 0}</span>
                  <button type="button" data-testid={`cat-reorder-up-${c}`} onClick={() => moveDraft(i, i - 1)} disabled={i === 0}
                    className="text-slate-400 hover:text-sky-600 disabled:opacity-20 px-0.5">↑</button>
                  <button type="button" data-testid={`cat-reorder-down-${c}`} onClick={() => moveDraft(i, i + 1)} disabled={i === orderDraft.length - 1}
                    className="text-slate-400 hover:text-sky-600 disabled:opacity-20 px-0.5">↓</button>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setReorderOpen(false)} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-500 hover:bg-slate-50">Cancel</button>
              <button onClick={saveOrder} data-testid="cat-reorder-save" className="flex-1 btn-blue justify-center">Save order</button>
            </div>
          </div>
        </div>
      )}

      {catModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setCatModal(null)}>
          <div className="card-light w-full max-w-md mx-4" onClick={e => e.stopPropagation()} data-testid="cat-image-modal">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-playfair text-xl">{catModal} — category banner</h3>
              <button onClick={() => setCatModal(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-slate-500 mb-3">One elegant banner for the whole category — shown on your public booking page. No need to upload a photo for every service ✦</p>
            <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
              <label className="label-light block mb-1.5">Rename this category (all its services move with it)</label>
              <div className="flex gap-2">
                <input data-testid="cat-rename-input" className="input-light flex-1" placeholder={catModal}
                  value={catRename} onChange={e => setCatRename(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && renameCategory()} />
                <button type="button" data-testid="cat-rename-save" onClick={renameCategory}
                  disabled={!catRename.trim() || catRename.trim() === catModal}
                  className="btn-slate px-4 disabled:opacity-40">Rename</button>
              </div>
            </div>
            {catUrl || !isResto ? (
              <img src={catUrl || catImage(catModal, {})} alt="" className="w-full h-32 rounded-xl object-cover border border-slate-200 mb-3" />
            ) : (
              <div className="w-full h-32 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-3xl mb-3">🍽️</div>
            )}
            <ImageUploader kind="category" value={catUrl} onChange={setCatUrl} fallback={isResto ? "" : catImage(catModal, {})} />
            <button type="button" data-testid="cat-banner-generate-btn" disabled={genImg}
              onClick={async () => {
                setGenImg(true);
                try {
                  const { data } = await api.post("/services/generate-banner-preview", { category: catModal });
                  let done = false;
                  for (let i = 0; i < 60; i++) {
                    await new Promise(r => setTimeout(r, 3000));
                    const { data: j } = await api.get(`/services/image-jobs/${data.job_id}`);
                    if (j.status === "done") { setCatUrl(j.image_url); toast.success("✨ Mira painted your banner — hit Save banner"); done = true; break; }
                    if (j.status === "failed") { toast.error(j.error || "Generation failed — try again"); done = true; break; }
                  }
                  if (!done) toast.error("Still painting… try again in a minute");
                } catch (err) { toast.error(err.response?.data?.detail || "Generation failed — try again"); }
                finally { setGenImg(false); }
              }}
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-600 font-semibold hover:text-amber-700 disabled:opacity-50">
              {genImg ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Mira is painting… (~30s)</> : <>✨ Generate with Mira</>}
            </button>
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
                      <button type="button" data-testid="service-new-category-cancel" onClick={() => { setNewCat(false); setForm({ ...form, category: catOptions[0] || "" }); }} className="text-slate-400 hover:text-slate-600 px-1" title="Back to list"><X className="w-4 h-4" /></button>
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
              {!isResto && (
              <div>
                <label className="label-light block mb-1">Who is it for?</label>
                <div className="grid grid-cols-3 gap-2" data-testid="service-gender-picker">
                  {[["male", "👨 Men"], ["female", "👩 Women"], ["unisex", "⚥ Unisex"]].map(([k, l]) => (
                    <button key={k} type="button" data-testid={`service-gender-${k}`}
                      onClick={() => setForm({ ...form, gender: k })}
                      className={`rounded-xl border-2 py-2 text-xs font-semibold transition ${(form.gender || "unisex") === k
                        ? "border-sky-500 bg-sky-50 text-sky-700"
                        : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              )}
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
                  fallback={isResto ? "" : FALLBACK_IMG}
                />
                {editing || !form.image_url ? (
                  <button type="button" data-testid="generate-service-image-btn" disabled={genImg}
                    onClick={async () => {
                      if (!editing && !form.name.trim()) { toast.error("Enter the service name first — Mira paints from it"); return; }
                      setGenImg(true);
                      try {
                        const { data } = editing
                          ? await api.post(`/services/${editing.id}/generate-image`, {})
                          : await api.post("/services/generate-image-preview", { name: form.name.trim(), category: form.category.trim() || "Beauty" });
                        let done = false;
                        for (let i = 0; i < 60; i++) {
                          await new Promise(r => setTimeout(r, 3000));
                          const { data: j } = await api.get(`/services/image-jobs/${data.job_id}`);
                          if (j.status === "done") {
                            setForm(f => ({ ...f, image_url: j.image_url }));
                            toast.success(editing ? "✨ Mira painted a fresh photo for this service" : "✨ Mira painted it — saves with the service");
                            if (editing) load();
                            done = true;
                            break;
                          }
                          if (j.status === "failed") { toast.error(j.error || "Generation failed — try again"); done = true; break; }
                        }
                        if (!done) toast.error("Still painting… check the service again in a minute");
                      } catch (err) { toast.error(err.response?.data?.detail || "Generation failed — try again"); }
                      finally { setGenImg(false); }
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-600 font-semibold hover:text-amber-700 disabled:opacity-50">
                    {genImg ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Mira is painting… (~30s)</> : <>✨ Let Mira paint this (based on category)</>}
                  </button>
                ) : null}
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
