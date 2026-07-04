import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Building2, Plus, LogOut, X, Crown, ExternalLink, Pause, Play, Trash2, Upload, Receipt, Gift, Trophy, Bell, Send, TrendingUp, Download, IndianRupee, Sparkles } from "lucide-react";
import { toast } from "sonner";
import ImportCustomersModal from "./ImportCustomersModal";
import BillingPanel from "./BillingPanel";
import { SuperProfileCard, HealthBadge, AiInsightsPanel, RenewalNudge } from "@/components/SuperAdminExtras";

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
    location: "", phone: "", salon_email: "", owner_phone: "", plan: "starter",
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

  const [createdCreds, setCreatedCreds] = useState(null);

  function startNew() {
    setForm({ slug: "", name: "", owner_email: "", owner_name: "", location: "", phone: "", salon_email: "", owner_phone: "", plan: "starter" });
    setOpen(true);
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      // Strip empty owner_password so Pydantic Optional[str] accepts it as None
      // and the server generates a memorable temp password automatically.
      const { owner_password: _unused, ...payload } = form;
      const { data } = await api.post("/super-admin/tenants", payload);
      toast.success(`Tenant '${form.slug}' created`);
      setOpen(false);
      if (data?.temp_password) {
        setCreatedCreds({
          email: data.owner_email,
          temp_password: data.temp_password,
          tenant_name: data.tenant?.name,
          tenant_phone: form.phone,
        });
      }
      load();
    } catch (err) {
      // Pydantic returns detail as an array of error objects — render safely.
      const raw = err.response?.data?.detail;
      let msg = "Couldn't create tenant";
      if (Array.isArray(raw)) {
        msg = raw.map((x) => `${(x.loc || []).slice(-1)}: ${x.msg}`).join(" · ");
      } else if (typeof raw === "string") {
        msg = raw;
      }
      toast.error(msg);
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
        {/* Super-admin profile */}
        <SuperProfileCard />

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
          <button
            data-testid="super-tab-leaderboard"
            onClick={() => setTab("leaderboard")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${tab === "leaderboard" ? "border-sky-500 text-sky-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          ><Trophy className="w-4 h-4" /> Top Referrers</button>
          <button
            data-testid="super-tab-revenue"
            onClick={() => setTab("revenue")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${tab === "revenue" ? "border-sky-500 text-sky-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          ><TrendingUp className="w-4 h-4" /> Revenue</button>
          <button
            data-testid="super-tab-ai"
            onClick={() => setTab("ai")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${tab === "ai" ? "border-sky-500 text-sky-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          ><Sparkles className="w-4 h-4" /> AI Insights</button>
        </div>

        {tab === "billing" ? (
          <BillingPanel tenants={tenants} />
        ) : tab === "leaderboard" ? (
          <LeaderboardPanel />
        ) : tab === "revenue" ? (
          <RevenuePanel />
        ) : tab === "ai" ? (
          <AiInsightsPanel />
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
            <thead><tr><th>Salon</th><th>Slug</th><th>Owner</th><th>Plan</th><th>Status</th><th>Health</th><th>Booking Link</th><th></th></tr></thead>
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
                  <td><HealthBadge t={t} /><RenewalNudge t={t} /></td>
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
              {tenants.length === 0 && <tr><td colSpan="8" className="text-center text-slate-500 py-12">No tenants yet. Add your first salon!</td></tr>}
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
                  <select className="text-slate-800 input-light" value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })}>
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label-light block mb-1">Owner Email (personal) *</label>
                <input data-testid="tenant-owner-email-input" type="email" required className="input-light" value={form.owner_email} onChange={e => setForm({ ...form, owner_email: e.target.value })} placeholder="owner@gmail.com" />
                <p className="text-[10px] text-slate-400 mt-0.5">Used for login. Login details are sent to this AND the salon email.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-light block mb-1">Salon Email</label>
                  <input data-testid="tenant-salon-email-input" type="email" className="input-light" value={form.salon_email} onChange={e => setForm({ ...form, salon_email: e.target.value })} placeholder="hello@salon.com" />
                </div>
                <div>
                  <label className="label-light block mb-1">Owner Personal Phone</label>
                  <input data-testid="tenant-owner-phone-input" className="input-light" value={form.owner_phone} onChange={e => setForm({ ...form, owner_phone: e.target.value })} placeholder="+91 98…" />
                  <p className="text-[10px] text-slate-400 mt-0.5">WhatsApp renewal reminders go here.</p>
                </div>
              </div>
              <div className="rounded-lg bg-sky-50 border border-sky-200 px-3 py-2 text-[11px] text-sky-800">
                ℹ️ A secure one-time password will be generated automatically and shown to you after creation. Share it with the owner — they&apos;ll be forced to change it on first login.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-light block mb-1">Location</label>
                  <input className="input-light" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
                </div>
                <div>
                  <label className="label-light block mb-1">Salon Phone</label>
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

      {createdCreds && (
        <TempPasswordShareModal
          creds={createdCreds}
          onClose={() => setCreatedCreds(null)}
        />
      )}
    </div>
  );
}

/**
 * One-time modal shown to super-admin immediately after tenant creation.
 * Displays the generated temp password + one-click Copy + prefilled WhatsApp
 * share message. Password is displayed exactly ONCE — closing the modal
 * discards it. If lost, the owner uses /forgot-password like anyone else.
 */
function TempPasswordShareModal({ creds, onClose }) {
  const [copied, setCopied] = useState(false);
  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";
  const message = [
    `Hi ${creds.tenant_name || "there"} ✦ Welcome to Miracurl!`,
    "",
    `Your salon account is ready. Here are your one-time login details:`,
    "",
    `🔗 Login URL: ${loginUrl}`,
    `📧 Email: ${creds.email}`,
    `🔑 Temp password: ${creds.temp_password}`,
    "",
    "You'll be asked to set your own password right after your first login.",
    "",
    "Any questions? Just reply to this message.",
    "— Miracurl team",
  ].join("\n");

  function copy(text) {
    try {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn("clipboard failed:", e);
    }
  }

  const waPhone = (creds.tenant_phone || "").replace(/\D/g, "");
  const waUrl = waPhone
    ? `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()} data-testid="temp-password-share-modal">
        <div className="text-center mb-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-2xl mb-3">✓</div>
          <h3 className="text-xl font-semibold text-slate-900">Tenant created</h3>
          <p className="text-sm text-slate-500 mt-1">Send these one-time credentials to <b>{creds.email}</b></p>
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Email</label>
              <button onClick={() => copy(creds.email)} className="text-[11px] text-sky-600 hover:text-sky-700">Copy</button>
            </div>
            <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 font-mono text-sm text-slate-800 break-all" data-testid="temp-creds-email">{creds.email}</div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">One-time password</label>
              <button onClick={() => copy(creds.temp_password)} className="text-[11px] text-sky-600 hover:text-sky-700" data-testid="temp-creds-copy-btn">
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 font-mono text-base font-semibold text-amber-900 break-all" data-testid="temp-creds-password">{creds.temp_password}</div>
            <p className="text-[10px] text-slate-400 mt-1">This password is shown only once. The owner will be forced to change it on first login.</p>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600"
            data-testid="temp-creds-whatsapp-btn"
          >
            💬 Send via WhatsApp
          </a>
          <button
            onClick={() => copy(message)}
            className="w-full py-2.5 rounded-lg bg-slate-100 text-slate-700 font-semibold text-sm hover:bg-slate-200"
            data-testid="temp-creds-copy-msg-btn"
          >
            Copy full welcome message
          </button>
          <button
            onClick={onClose}
            className="w-full py-2 rounded-lg text-slate-500 text-sm hover:bg-slate-50"
            data-testid="temp-creds-close-btn"
          >
            Done — I&apos;ve shared the credentials
          </button>
        </div>
      </div>
    </div>
  );
}

function LeaderboardPanel() {
  const [data, setData] = useState({ items: [], reward_per_signup: 1000 });
  const [loading, setLoading] = useState(true);
  const [renewals, setRenewals] = useState({ items: [], count: 0 });
  useEffect(() => {
    api.get("/super-admin/affiliates/leaderboard")
      .then(r => setData(r.data))
      .catch(e => toast.error(e.response?.data?.detail || "Couldn't load leaderboard"))
      .finally(() => setLoading(false));
    api.get("/super-admin/renewals/queue?window_days=10")
      .then(r => setRenewals(r.data)).catch(() => {});
  }, []);
  const items = data.items || [];
  const medal = (i) => i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;

  const markReminded = async (tid) => {
    try {
      await api.post(`/super-admin/renewals/${tid}/mark-reminded`);
      setRenewals(prev => ({
        ...prev,
        items: prev.items.map(r => r.id === tid ? { ...r, reminder_count: (r.reminder_count || 0) + 1, last_reminder_at: new Date().toISOString() } : r),
      }));
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't update"); }
  };

  const remindWA = (r) => {
    const num = (r.whatsapp_number || r.phone || "").replace(/\D/g, "");
    if (!num) { toast.error(`No WhatsApp/phone for ${r.name}`); return; }
    const days = r.days_remaining;
    const line = days < 0
      ? `expired *${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago*`
      : days === 0 ? "*ends today*" : `ends in *${days} day${days === 1 ? "" : "s"}*`;
    const text = `Hi ${r.name} ✦ Just a friendly reminder from Miracurl — your ${r.source} ${line} (${r.end_date}). Renew directly inside your dashboard → Settings → Subscription → Pay via Razorpay (UPI/card). Reply here if you need help. — Team Miracurl`;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    markReminded(r.id);
  };

  return (
    <div className="space-y-6" data-testid="leaderboard-panel">
      {/* ─── Renewal queue ─── */}
      <div>
        <h2 className="font-playfair text-2xl flex items-center gap-3">
          <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
            <Bell className="w-4 h-4" />
          </span>
          Renewals due
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Tenants whose plan / trial ends in the next 10 days. Tap WhatsApp to send a personalised renewal nudge.
        </p>
      </div>
      {renewals.items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center text-sm text-slate-500" data-testid="renewals-empty">
          🎉 Nobody expiring in the next {renewals.window_days || 10} days.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Salon</th>
                <th className="px-4 py-3 text-left font-medium">Plan / Source</th>
                <th className="px-4 py-3 text-right font-medium">Ends</th>
                <th className="px-4 py-3 text-right font-medium">Reminded</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {renewals.items.map(r => {
                const overdue = r.days_remaining < 0;
                const urgent = r.days_remaining <= 3;
                const chip = overdue
                  ? "bg-rose-100 text-rose-700"
                  : urgent ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700";
                return (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/50" data-testid={`renewal-row-${r.slug}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{r.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{r.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {r.plan || "—"}
                      <div className="text-[11px] text-slate-400 uppercase tracking-wider">{r.source}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-xs text-slate-600">{r.end_date}</div>
                      <div className={`inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${chip}`}>
                        {overdue ? `${Math.abs(r.days_remaining)}d overdue` : r.days_remaining === 0 ? "today" : `${r.days_remaining}d left`}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500">
                      {r.reminder_count > 0 ? `${r.reminder_count}× · ${new Date(r.last_reminder_at).toLocaleDateString("en-IN")}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => remindWA(r)}
                        data-testid={`renewal-wa-${r.slug}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold"
                      >
                        <Send className="w-3.5 h-3.5" /> WhatsApp
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Top Referrers ─── */}
      <div className="pt-4">
        <h1 className="font-playfair text-3xl flex items-center gap-3">
          <Trophy className="w-7 h-7 text-amber-500" /> Top Referrers
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Salons earning the most via the Refer-a-Salon program. Each verified signup credits ₹{Number(data.reward_per_signup).toLocaleString("en-IN")} to the referrer&apos;s renewal balance.
        </p>
      </div>
      {loading ? (
        <div className="text-slate-500 text-sm">Loading…</div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center" data-testid="leaderboard-empty">
          <Gift className="w-10 h-10 text-rose-400 mx-auto mb-3" />
          <div className="text-slate-700 font-medium">No referrals yet</div>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Once your salons share their <span className="font-mono">?ref=</span> links and bring in new tenants, they&apos;ll appear here ranked by total credits earned.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Rank</th>
                <th className="px-4 py-3 text-left font-medium">Salon</th>
                <th className="px-4 py-3 text-right font-medium">Referrals</th>
                <th className="px-4 py-3 text-right font-medium">Credit Earned</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r, i) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/50" data-testid={`leaderboard-row-${r.slug}`}>
                  <td className="px-4 py-3 text-2xl">{medal(i)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{r.name}</div>
                    <div className="text-xs text-slate-500 font-mono">{r.slug} · {r.owner_email}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">{r.referral_count}</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-600">
                    ₹{Number(r.affiliate_credits || 0).toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


function RevenuePanel() {
  const [rev, setRev] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get("/super-admin/subscriptions/revenue")
      .then(r => setRev(r.data))
      .catch(e => toast.error(e.response?.data?.detail || "Couldn't load revenue"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-slate-500 text-sm">Loading revenue metrics…</div>;
  if (!rev) return null;

  const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  const trendMax = Math.max(1, ...rev.trend_30d.map(d => d.amount));

  const downloadCsv = async () => {
    try {
      const r = await api.get("/super-admin/subscriptions/export.csv", { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `miracurl-revenue-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error("Couldn't download CSV"); }
  };

  return (
    <div className="space-y-6" data-testid="revenue-panel">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-playfair text-3xl flex items-center gap-3">
            <TrendingUp className="w-7 h-7 text-emerald-500" /> Revenue
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Real-time SaaS metrics — recurring revenue, churn and top-earning salons.
          </p>
        </div>
        <button
          onClick={downloadCsv}
          data-testid="revenue-export-btn"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700"
        >
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Big-number cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="MRR" value={fmt(rev.mrr)} note="Monthly recurring" accent="emerald" data-testid="stat-mrr" />
        <StatCard label="ARR" value={fmt(rev.arr)} note="Annual run-rate" accent="sky" data-testid="stat-arr" />
        <StatCard label="This month" value={fmt(rev.this_month)} note="Collected" accent="violet" data-testid="stat-month" />
        <StatCard label="All-time" value={fmt(rev.all_time)} note="Since day 1" accent="amber" data-testid="stat-alltime" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Active subs" value={rev.active_subscriptions} note="Paying tenants" accent="slate" />
        <StatCard label="Churned 30d" value={rev.cancelled_30d} note={`${rev.churn_pct}% rate`} accent="rose" />
        <StatCard label="Avg lifetime" value={rev.avg_lifetime_days ? `${rev.avg_lifetime_days} d` : "—"} note="Cancelled subs" accent="indigo" />
        <StatCard label="Today" value={fmt(rev.today)} note="Cash in" accent="emerald" />
      </div>

      {/* 30-day trend bar chart */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">Last 30 days · daily revenue</h3>
        <div className="flex items-end gap-1 h-40" data-testid="revenue-trend-chart">
          {rev.trend_30d.map(d => {
            const h = trendMax > 0 ? Math.max(2, (d.amount / trendMax) * 100) : 2;
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center group relative">
                <div
                  className={`w-full rounded-t transition ${d.amount > 0 ? "bg-gradient-to-t from-emerald-500 to-emerald-300" : "bg-slate-100"}`}
                  style={{ height: `${h}%` }}
                  title={`${d.date}: ${fmt(d.amount)}`}
                />
                <div className="opacity-0 group-hover:opacity-100 absolute -top-8 text-[10px] text-slate-700 bg-white shadow px-1.5 py-0.5 rounded whitespace-nowrap">
                  {d.date.slice(5)} · {fmt(d.amount)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Plan distribution + Top tenants */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Active plan mix</h3>
          {rev.plan_distribution.length === 0 ? (
            <div className="text-xs text-slate-500 py-6 text-center">No active paid subscriptions yet.</div>
          ) : rev.plan_distribution.map(p => (
            <div key={p.plan} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
              <div className="text-sm text-slate-700">{p.label}</div>
              <div className="text-sm font-semibold text-slate-900">{p.count}</div>
            </div>
          ))}
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Top 5 tenants (all-time)</h3>
          {rev.top_tenants.length === 0 ? (
            <div className="text-xs text-slate-500 py-6 text-center">Nobody paid yet.</div>
          ) : rev.top_tenants.map((t, i) => (
            <div key={t.tenant_id} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0" data-testid={`top-tenant-${t.slug}`}>
              <div>
                <div className="text-sm text-slate-800 flex items-center gap-2">
                  <span className="text-slate-400 text-xs w-5">#{i + 1}</span> {t.name}
                </div>
                <div className="text-[11px] text-slate-500 font-mono ml-7">{t.slug}</div>
              </div>
              <div className="text-sm font-semibold text-emerald-600 font-mono">{fmt(t.total_paid)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, note, accent = "slate", ...rest }) {
  const styles = {
    emerald: "border-emerald-100 bg-emerald-50/40",
    sky: "border-sky-100 bg-sky-50/40",
    violet: "border-violet-100 bg-violet-50/40",
    amber: "border-amber-100 bg-amber-50/40",
    slate: "border-slate-100 bg-slate-50/40",
    rose: "border-rose-100 bg-rose-50/40",
    indigo: "border-indigo-100 bg-indigo-50/40",
  };
  return (
    <div className={`bg-white border rounded-2xl p-4 shadow-sm ${styles[accent] || styles.slate}`} {...rest}>
      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className="text-2xl font-bold text-slate-900 mt-1">{value}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{note}</div>
    </div>
  );
}

