import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Building2, Plus, LogOut, X, Crown, ExternalLink, Pause, Play, Trash2, Upload, Receipt } from "lucide-react";
import { toast } from "sonner";
import ImportCustomersModal from "./ImportCustomersModal";
import BillingPanel from "./BillingPanel";

const PLAN_BADGE = {
  starter: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  pro: "bg-sky-50 text-sky-600 border-sky-300",
  enterprise: "bg-blush/10 text-blush border-blush/30",
};
const STATUS_BADGE = {
  trial: "bg-amber-500/10 text-amber-400",
  active: "bg-emerald-500/10 text-emerald-400",
  suspended: "bg-red-500/10 text-red-400",
  cancelled: "bg-slate-50 text-slate-400",
};

export default function SuperAdmin() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [overview, setOverview] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [open, setOpen] = useState(false);
  const [importFor, setImportFor] = useState(null); // tenant being imported into
  const [tab, setTab] = useState("tenants"); // tenants | billing
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    slug: "", name: "", owner_email: "", owner_name: "", owner_password: "",
    location: "", phone: "", plan: "starter",
  });

  const load = useCallback(async () => {
    const [o, t] = await Promise.all([
      api.get("/super-admin/overview"),
      api.get("/super-admin/tenants"),
    ]);
    setOverview(o.data);
    setTenants(t.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  function startNew() {
    setForm({ slug: "", name: "", owner_email: "", owner_name: "", owner_password: "", location: "", phone: "", plan: "starter" });
    setOpen(true);
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/super-admin/tenants", form);
      toast.success(`Tenant '${form.slug}' created with owner ${form.owner_email}`);
      setOpen(false); load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't create tenant");
    } finally { setBusy(false); }
  }

  async function setStatus(t, status) {
    try {
      await api.put(`/super-admin/tenants/${t.id}`, { status });
      toast.success(`${t.name} → ${status}`);
      load();
    } catch (err) { toast.error("Update failed"); }
  }

  async function deleteTenant(t) {
    if (!window.confirm(`Cancel subscription for ${t.name}? Their account will be disabled.`)) return;
    try { await api.delete(`/super-admin/tenants/${t.id}`); toast.success("Tenant cancelled"); load(); }
    catch (err) { toast.error("Delete failed"); }
  }

  function publicBookingUrl(slug) {
    return `${window.location.origin}/book/${slug}`;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800" data-testid="super-admin-page">
      {/* Header */}
      <header className="border-b border-slate-100 bg-slate-50/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-blue-500 flex items-center justify-center ">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-playfair text-xl">Miracurl HQ</div>
              <div className="text-[10px] tracking-[0.25em] uppercase text-sky-600">Super-Admin Console</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 hidden sm:inline">{user?.email}</span>
            <button data-testid="super-logout-btn" onClick={async () => { await logout(); nav("/login"); }} className="btn-slate flex items-center gap-2 text-xs">
              <LogOut className="w-3 h-3" /> Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-6 pb-24">
        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200">
          <button
            data-testid="super-tab-tenants"
            onClick={() => setTab("tenants")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${tab === "tenants" ? "border-sky-500 text-sky-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >Tenants</button>
          <button
            data-testid="super-tab-billing"
            onClick={() => setTab("billing")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${tab === "billing" ? "border-sky-500 text-sky-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          ><Receipt className="w-4 h-4" /> Billing & Subscriptions</button>
        </div>

        {tab === "billing" ? (
          <BillingPanel tenants={tenants} />
        ) : (
          <>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-playfair text-3xl">Tenants</h1>
            <p className="text-slate-500 text-sm mt-1">Manage every salon on the Miracurl platform.</p>
          </div>
          <button data-testid="super-new-tenant-btn" onClick={startNew} className="btn-blue flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Tenant
          </button>
        </div>

        {/* KPIs */}
        {overview && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="card-light" data-testid="kpi-total-tenants">
              <div className="label-light">Total Tenants</div>
              <div className="flex items-end justify-between mt-2">
                <div className="font-playfair text-4xl text-sky-600">{overview.total_tenants}</div>
                <Building2 className="w-8 h-8 text-sky-600 opacity-30" />
              </div>
            </div>
            {Object.entries(overview.by_status).map(([k, v]) => (
              <div key={k} className="card-light">
                <div className="label-light capitalize">{k}</div>
                <div className="font-playfair text-4xl mt-2">{v}</div>
                <div className={`text-[10px] uppercase tracking-wider mt-2 px-2 py-1 rounded inline-block ${STATUS_BADGE[k] || ''}`}>{k}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tenant list */}
        <div className="card-light p-0 overflow-hidden">
          <table className="luxe-table-light">
            <thead><tr><th>Salon</th><th>Slug</th><th>Owner</th><th>Plan</th><th>Status</th><th>Booking Link</th><th></th></tr></thead>
            <tbody>
              {tenants.map(t => (
                <tr key={t.id} data-testid={`tenant-row-${t.id}`}>
                  <td>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-[10px] text-slate-400">{t.location || "—"}</div>
                  </td>
                  <td className="font-mono text-xs text-sky-600">{t.slug}</td>
                  <td className="text-xs">{t.owner_email}</td>
                  <td>
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${PLAN_BADGE[t.plan] || ''}`}>{t.plan}</span>
                  </td>
                  <td>
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${STATUS_BADGE[t.status] || ''}`}>{t.status}</span>
                  </td>
                  <td>
                    <a href={publicBookingUrl(t.slug)} target="_blank" rel="noreferrer" className="text-xs text-sky-600 hover:underline flex items-center gap-1" data-testid={`booking-link-${t.id}`}>
                      <ExternalLink className="w-3 h-3" /> /book/{t.slug}
                    </a>
                  </td>
                  <td>
                    <div className="flex items-center gap-1 justify-end">
                      <button data-testid={`import-customers-${t.id}`} onClick={() => setImportFor(t)} title="Import customers" className="p-1.5 text-sky-600 hover:bg-sky-50 rounded"><Upload className="w-3.5 h-3.5" /></button>
                      {t.status === "active" || t.status === "trial" ? (
                        <button data-testid={`suspend-tenant-${t.id}`} onClick={() => setStatus(t, "suspended")} title="Suspend" className="p-1.5 text-amber-400 hover:bg-amber-500/10 rounded"><Pause className="w-3.5 h-3.5" /></button>
                      ) : t.status === "suspended" ? (
                        <button data-testid={`activate-tenant-${t.id}`} onClick={() => setStatus(t, "active")} title="Re-activate" className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded"><Play className="w-3.5 h-3.5" /></button>
                      ) : null}
                      <button data-testid={`delete-tenant-${t.id}`} onClick={() => deleteTenant(t)} title="Cancel subscription" className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/5 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && <tr><td colSpan="7" className="text-center text-slate-500 py-12">No tenants yet. Add your first salon!</td></tr>}
            </tbody>
          </table>
        </div>
          </>
        )}
      </main>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="card-light w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-playfair text-2xl">Onboard a New Salon</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div>
                <label className="label-light block mb-1">Slug *</label>
                <input data-testid="tenant-slug-input" required pattern="[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?" className="input-light font-mono lowercase" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase() })} placeholder="elegance-koramangala" />
                <p className="text-[10px] text-slate-400 mt-1">Will appear in their booking URL: /book/<span className="text-sky-600">{form.slug || "your-slug"}</span></p>
              </div>
              <div>
                <label className="label-light block mb-1">Salon Name *</label>
                <input data-testid="tenant-name-input" required className="input-light" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Elegance Beauty Lounge" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-light block mb-1">Owner Name *</label>
                  <input data-testid="tenant-owner-name-input" required className="input-light" value={form.owner_name} onChange={e => setForm({ ...form, owner_name: e.target.value })} />
                </div>
                <div>
                  <label className="label-light block mb-1">Plan</label>
                  <select className="input-light" value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })}>
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label-light block mb-1">Owner Email *</label>
                <input data-testid="tenant-owner-email-input" type="email" required className="input-light" value={form.owner_email} onChange={e => setForm({ ...form, owner_email: e.target.value })} placeholder="owner@salon.com" />
              </div>
              <div>
                <label className="label-light block mb-1">Owner Password * (≥8 chars)</label>
                <input data-testid="tenant-owner-password-input" type="text" required minLength={8} className="input-light font-mono" value={form.owner_password} onChange={e => setForm({ ...form, owner_password: e.target.value })} placeholder="ShareThisWithThem123" />
                <p className="text-[10px] text-slate-400 mt-1">Share this securely with the salon owner so they can log in.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-light block mb-1">Location</label>
                  <input className="input-light" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
                </div>
                <div>
                  <label className="label-light block mb-1">Phone</label>
                  <input className="input-light" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="btn-slate flex-1">Cancel</button>
                <button data-testid="tenant-save-btn" type="submit" disabled={busy} className="btn-blue flex-1">{busy ? "Creating..." : "Onboard Salon"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {importFor && (
        <ImportCustomersModal
          tenant={importFor}
          onClose={() => setImportFor(null)}
          onDone={load}
        />
      )}
    </div>
  );
}
