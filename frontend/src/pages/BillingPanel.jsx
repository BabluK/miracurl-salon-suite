// Super-Admin → SaaS Billing tab.
// Lets the super-admin sell 6-month / 12-month plans to salon tenants,
// record Paytm payments manually, see revenue stats, and cancel subscriptions.
import { useCallback, useEffect, useMemo, useState } from "react";
import { IndianRupee, TrendingUp, Calendar, X, Plus, Ban, CheckCircle2, Receipt, AlertTriangle } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { toast } from "sonner";
import api from "@/lib/api";

const CHART_TOOLTIP_STYLE = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, color: "#0f172a" };
const CHART_TOOLTIP_LABEL_STYLE = { color: "#0284c7" };
const LINE_DOT = { fill: "#0ea5e9", r: 3 };
const STATUS_PILL = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200",
  expired: "bg-amber-100 text-amber-700 border-amber-200",
};

export default function BillingPanel({ tenants }) {
  const [plans, setPlans] = useState([]);
  const [subs, setSubs] = useState([]);
  const [rev, setRev] = useState(null);
  const [openNew, setOpenNew] = useState(false);

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      api.get("/super-admin/plans"),
      api.get("/super-admin/subscriptions"),
      api.get("/super-admin/subscriptions/revenue"),
    ]);
    setPlans(a.data); setSubs(b.data); setRev(c.data);
  }, []);

  useEffect(() => { load().catch(e => toast.error(e?.message || "Couldn't load billing")); }, [load]);

  async function cancel(sub) {
    if (!window.confirm(`Cancel ${sub.tenant?.name || "this salon"}'s subscription?`)) return;
    try {
      await api.post(`/super-admin/subscriptions/${sub.id}/cancel`, { reason: "Cancelled by super-admin" });
      toast.success("Subscription cancelled");
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Cancel failed");
    }
  }

  if (!rev) return <div className="text-slate-500 p-4">Loading billing…</div>;

  return (
    <div className="space-y-6" data-testid="billing-panel">
      {/* Revenue KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <RevenueKpi label="Today" value={rev.today} icon={IndianRupee} color="emerald" testid="rev-today" />
        <RevenueKpi label="This Month" value={rev.this_month} icon={Calendar} color="sky" testid="rev-month" />
        <RevenueKpi label="All-Time" value={rev.all_time} icon={TrendingUp} color="amber" testid="rev-all-time" />
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm" data-testid="rev-active-count">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500 font-medium">Active Subs</div>
              <div className="text-3xl font-semibold text-slate-800 mt-2">{rev.active_subscriptions}</div>
              <div className="text-xs text-slate-500 mt-1">salons currently paying</div>
            </div>
            <div className="w-11 h-11 rounded-xl bg-rose-100 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-rose-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Trend chart */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500 font-medium">SaaS Revenue · Last 30 Days</div>
            <div className="text-xl font-semibold text-slate-800 mt-1">Daily Subscription Income</div>
          </div>
          <button
            data-testid="open-new-subscription-btn"
            onClick={() => setOpenNew(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-sky-500 to-blue-500 text-white text-sm font-semibold hover:from-sky-600 hover:to-blue-600 shadow-sm"
          >
            <Plus className="w-4 h-4" /> New Subscription
          </button>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rev.trend_30d}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickFormatter={d => d.slice(5)} />
              <YAxis stroke="#94a3b8" fontSize={10} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
              <Line type="monotone" dataKey="amount" stroke="#0ea5e9" strokeWidth={2} dot={LINE_DOT} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Subscriptions table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">All Subscriptions</h3>
          <span className="text-xs text-slate-500">{subs.length} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="luxe-table-light">
            <thead>
              <tr>
                <th>Salon</th><th>Plan</th><th>Price</th><th>Start</th><th>End</th><th>Status</th><th>Payment Ref</th><th></th>
              </tr>
            </thead>
            <tbody>
              {subs.length === 0 ? (
                <tr><td colSpan="8" className="text-center text-slate-400 py-8 text-sm">No subscriptions yet — click &ldquo;New Subscription&rdquo; to start selling 🎉</td></tr>
              ) : subs.map(s => (
                <tr key={s.id} data-testid={`sub-row-${s.id}`}>
                  <td>
                    <div className="font-medium text-slate-800">{s.tenant?.name || "—"}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{s.tenant?.slug}</div>
                  </td>
                  <td>{s.plan_label}</td>
                  <td className="text-slate-700">₹{s.price.toLocaleString("en-IN")}</td>
                  <td className="text-xs">{s.start_date}</td>
                  <td className="text-xs">{s.end_date}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-semibold border ${STATUS_PILL[s.status] || STATUS_PILL.cancelled}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="font-mono text-[11px] text-slate-500">{s.payment_ref || "—"}</td>
                  <td className="text-right">
                    {s.status === "active" && (
                      <button
                        data-testid={`cancel-sub-${s.id}`}
                        onClick={() => cancel(s)}
                        className="text-red-500 hover:text-red-700 p-1.5"
                        title="Cancel"
                      ><Ban className="w-4 h-4" /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {openNew && (
        <NewSubscriptionModal
          tenants={tenants}
          plans={plans}
          onClose={() => setOpenNew(false)}
          onCreated={async () => { setOpenNew(false); await load(); toast.success("Subscription created"); }}
        />
      )}
    </div>
  );
}

function RevenueKpi({ label, value, icon: Icon, color, testid }) {
  const COLORS = {
    emerald: { tile: "bg-emerald-100", icon: "text-emerald-600" },
    sky: { tile: "bg-sky-100", icon: "text-sky-600" },
    amber: { tile: "bg-amber-100", icon: "text-amber-600" },
  };
  const c = COLORS[color] || COLORS.sky;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm" data-testid={testid}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500 font-medium">{label}</div>
          <div className="text-3xl font-semibold text-slate-800 mt-2">₹{value.toLocaleString("en-IN")}</div>
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${c.tile}`}>
          <Icon className={`w-5 h-5 ${c.icon}`} />
        </div>
      </div>
    </div>
  );
}

function NewSubscriptionModal({ tenants, plans, onClose, onCreated }) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [tenantId, setTenantId] = useState(tenants[0]?.id || "");
  const [plan, setPlan] = useState("half_year");
  const [paymentRef, setPaymentRef] = useState("");
  const [paidAt, setPaidAt] = useState(today);
  const [startDate, setStartDate] = useState(today);
  const [busy, setBusy] = useState(false);

  const selectedPlan = plans.find(p => p.key === plan);

  async function save(e) {
    e.preventDefault();
    if (!tenantId) { toast.error("Select a salon"); return; }
    if (!paymentRef.trim()) { toast.error("Enter the Paytm transaction reference"); return; }
    setBusy(true);
    try {
      await api.post("/super-admin/subscriptions", {
        tenant_id: tenantId, plan, payment_ref: paymentRef.trim(),
        paid_at: paidAt, start_date: startDate,
      });
      onCreated();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't create subscription");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
      <form onSubmit={save} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()} data-testid="new-subscription-modal">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-sky-500" /> New Subscription
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700" data-testid="new-sub-close"><X className="w-5 h-5" /></button>
        </div>

        <div>
          <label className="text-xs text-slate-500 font-medium">Salon *</label>
          <select data-testid="new-sub-tenant" value={tenantId} onChange={e => setTenantId(e.target.value)} required className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200">
            <option value="">— Choose salon —</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs text-slate-500 font-medium">Plan *</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {plans.map(p => (
              <button
                key={p.key}
                type="button"
                data-testid={`new-sub-plan-${p.key}`}
                onClick={() => setPlan(p.key)}
                className={`p-3 rounded-lg border text-left transition ${
                  plan === p.key
                    ? "bg-sky-50 border-sky-400 ring-2 ring-sky-200"
                    : "bg-white border-slate-200 hover:border-sky-200"
                }`}
              >
                <div className="text-xs uppercase tracking-wider text-slate-500">{p.label}</div>
                <div className="text-lg font-semibold text-slate-800 mt-1">₹{p.price.toLocaleString("en-IN")}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{p.duration_days} days</div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-slate-500 font-medium">Start Date *</label>
            <input data-testid="new-sub-start-date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200" />
          </div>
          <div>
            <label className="text-xs text-slate-500 font-medium">Paid On *</label>
            <input data-testid="new-sub-paid-at" type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} required className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200" />
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-500 font-medium">Paytm / UPI Transaction Reference *</label>
          <input
            data-testid="new-sub-payment-ref"
            value={paymentRef}
            onChange={e => setPaymentRef(e.target.value)}
            required
            placeholder="e.g. PAYTM-7XHK29-2026 or UPI ref ID"
            className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
          />
          <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            Paste the txn ID from the salon owner&apos;s Paytm receipt — keeps an audit trail.
          </p>
        </div>

        <div className="bg-sky-50 border border-sky-100 rounded-lg p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Amount to record</span>
            <span className="font-bold text-sky-700 text-lg">₹{(selectedPlan?.price || 0).toLocaleString("en-IN")}</span>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
          <button
            type="submit"
            data-testid="new-sub-save-btn"
            disabled={busy}
            className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-sky-500 to-blue-500 text-white text-sm font-semibold disabled:opacity-60"
          >{busy ? "Saving…" : "Record Subscription"}</button>
        </div>
      </form>
    </div>
  );
}
