import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Handshake, Star, Eye, EyeOff, Plus, Trash2, Save, Lock, LockOpen } from "lucide-react";

const inputCls = "px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200";

function Rating({ rating, count }) {
  if (rating == null) return <span className="text-[11px] text-slate-400">No reviews yet</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-semibold">
      <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {rating} <span className="text-slate-400 font-normal">({count})</span>
    </span>
  );
}

export function PartnersPanel() {
  const [data, setData] = useState({ tenants: [], manual: [] });
  const [blurbs, setBlurbs] = useState({});
  const [form, setForm] = useState({ name: "", logo_url: "", city: "", blurb: "", rating: "" });

  const load = () => api.get("/super-admin/partners").then(r => {
    setData(r.data);
    setBlurbs(Object.fromEntries(r.data.tenants.map(t => [t.id, t.blurb || ""])));
  }).catch(() => {});
  useEffect(() => { load(); }, []);

  async function updateTenant(t, patch) {
    try {
      await api.put(`/super-admin/partners/tenant/${t.id}`, patch);
      toast.success(`${t.name} updated`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Update failed"); }
  }

  async function addManual(e) {
    e.preventDefault();
    try {
      await api.post("/super-admin/partners/manual", {
        ...form, rating: form.rating === "" ? null : Number(form.rating),
      });
      toast.success("Partner added");
      setForm({ name: "", logo_url: "", city: "", blurb: "", rating: "" });
      load();
    } catch (e2) { toast.error(e2.response?.data?.detail || "Couldn't add partner"); }
  }

  async function removeManual(p) {
    try { await api.delete(`/super-admin/partners/manual/${p.id}`); load(); }
    catch (e) { toast.error("Delete failed"); }
  }

  return (
    <div className="space-y-6" data-testid="partners-panel">
      <div className="card-light">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <Handshake className="w-4 h-4 text-emerald-600" /> Onboarded salons — auto-listed on your public profile
        </h3>
        <p className="text-xs text-slate-400 mt-1">Active & trial salons appear in "Trusted Partners" on the landing page and /partners, with their live customer rating. Hide, feature, or add a note per salon.</p>
        <div className="mt-4 space-y-2">
          {data.tenants.map(t => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5" data-testid={`partner-tenant-${t.id}`}>
              <div className="flex-1 min-w-[180px]">
                <div className="text-sm font-medium text-slate-800">{t.name}</div>
                <div className="text-[11px] text-slate-400">{t.city || "—"} · since {t.since}</div>
                {t.owner_review?.rating && (
                  <div className="text-[11px] text-emerald-700 mt-0.5" data-testid={`owner-review-inline-${t.id}`}>
                    Owner rated Miracurl {t.owner_review.rating}★{t.owner_review.text ? ` — "${t.owner_review.text.slice(0, 80)}${t.owner_review.text.length > 80 ? "…" : ""}"` : ""}
                  </div>
                )}
              </div>
              <Rating rating={t.rating} count={t.reviews_count} />
              <div className="flex flex-col">
                <label className="text-[10px] text-slate-400 mb-0.5 ml-1">Public note (shown on partner card)</label>
                <input data-testid={`partner-blurb-${t.id}`} value={blurbs[t.id] ?? ""} maxLength={400}
                  onChange={e => setBlurbs(b => ({ ...b, [t.id]: e.target.value }))}
                  placeholder="e.g. Flagship partner since 2024…" className={`${inputCls} w-56`} />
              </div>
              <button data-testid={`partner-blurb-save-${t.id}`} onClick={() => updateTenant(t, { blurb: blurbs[t.id] || "" })}
                title="Save note" className="p-1.5 text-sky-600 hover:bg-sky-50 rounded"><Save className="w-4 h-4" /></button>
              {t.owner_review?.rating && (
                <button data-testid={`partner-review-unlock-${t.id}`}
                  onClick={() => updateTenant(t, { allow_review_edit: !t.review_editable })}
                  title={t.review_editable ? "Review editing is ENABLED — click to lock again" : "Review locked (one-time). Click to let the owner edit their review"}
                  className={`p-1.5 rounded ${t.review_editable ? "text-emerald-600 bg-emerald-50" : "text-slate-300 hover:text-emerald-600 hover:bg-emerald-50"}`}>
                  {t.review_editable ? <LockOpen className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                </button>
              )}
              <button data-testid={`partner-feature-${t.id}`} onClick={() => updateTenant(t, { featured: !t.featured })}
                title={t.featured ? "Un-feature" : "Feature at top"}
                className={`p-1.5 rounded ${t.featured ? "text-amber-500 bg-amber-50" : "text-slate-300 hover:text-amber-500 hover:bg-amber-50"}`}>
                <Star className={`w-4 h-4 ${t.featured ? "fill-amber-400" : ""}`} />
              </button>
              <button data-testid={`partner-visible-${t.id}`} onClick={() => updateTenant(t, { visible: !t.visible })}
                title={t.visible ? "Hide from public" : "Show publicly"}
                className={`p-1.5 rounded ${t.visible ? "text-emerald-600 hover:bg-emerald-50" : "text-slate-300 hover:bg-slate-100"}`}>
                {t.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </div>
          ))}
          {data.tenants.length === 0 && <p className="text-xs text-slate-400">No active salons yet.</p>}
        </div>
      </div>

      <div className="card-light">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <Plus className="w-4 h-4 text-violet-600" /> Manual partners — suppliers, brands, collaborators
        </h3>
        <form onSubmit={addManual} className="grid grid-cols-1 sm:grid-cols-5 gap-2 mt-4">
          <div className="flex flex-col">
            <label className="text-[10px] text-slate-400 mb-0.5 ml-1">Partner name *</label>
            <input data-testid="manual-partner-name" required minLength={2} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. L'Oréal Professionnel" className={inputCls} />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] text-slate-400 mb-0.5 ml-1">City</label>
            <input data-testid="manual-partner-city" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="e.g. Bengaluru" className={inputCls} />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] text-slate-400 mb-0.5 ml-1">Logo image URL</label>
            <input data-testid="manual-partner-logo" value={form.logo_url} onChange={e => setForm({ ...form, logo_url: e.target.value })} placeholder="https://…/logo.png" className={inputCls} />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] text-slate-400 mb-0.5 ml-1">Rating (0–5)</label>
            <input data-testid="manual-partner-rating" type="number" min="0" max="5" step="0.1" value={form.rating} onChange={e => setForm({ ...form, rating: e.target.value })} placeholder="e.g. 4.5" className={inputCls} />
          </div>
          <div className="flex flex-col justify-end">
            <button data-testid="manual-partner-add" className="px-4 py-2 rounded-lg bg-violet-500 hover:bg-violet-600 text-white text-sm font-semibold">Add</button>
          </div>
          <div className="flex flex-col sm:col-span-5">
            <label className="text-[10px] text-slate-400 mb-0.5 ml-1">Short review / note (shown publicly on the partner card)</label>
            <input data-testid="manual-partner-blurb" value={form.blurb} onChange={e => setForm({ ...form, blurb: e.target.value })} maxLength={400} placeholder="e.g. Our trusted colour & haircare supplier" className={inputCls} />
          </div>
        </form>
        <div className="mt-4 space-y-2">
          {data.manual.map(p => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5" data-testid={`manual-partner-${p.id}`}>
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-800">{p.name} <span className="text-[11px] text-slate-400">{p.city}</span></div>
                {p.blurb && <div className="text-[11px] text-slate-500 mt-0.5">{p.blurb}</div>}
              </div>
              <Rating rating={p.rating} count={p.reviews_count || 0} />
              <button data-testid={`manual-partner-del-${p.id}`} onClick={() => removeManual(p)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
