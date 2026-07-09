import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Activity, RefreshCw } from "lucide-react";

const Card = ({ label, value, hint, testid }) => (
  <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm" data-testid={testid}>
    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold">{label}</div>
    <div className="text-2xl font-bold text-slate-800 mt-1.5">{value}</div>
    {hint && <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>}
  </div>
);

export const PlatformLoadPanel = () => {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setBusy(true);
    api.get("/super/platform-load").then(r => setData(r.data)).finally(() => setBusy(false));
  };
  useEffect(load, []);

  if (!data) return <div className="text-slate-500 p-4">Loading platform metrics…</div>;
  const t = data.tenants, d = data.today;

  return (
    <div className="space-y-6" data-testid="platform-load-panel">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-playfair text-3xl flex items-center gap-2"><Activity className="w-6 h-6 text-emerald-500" /> Platform Load</h1>
          <p className="text-slate-500 text-sm mt-1">Live usage across all tenants — watch these as you onboard more salons.</p>
        </div>
        <button onClick={load} disabled={busy} data-testid="platform-load-refresh"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-600 hover:bg-slate-50">
          <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-600 mb-2">Tenants</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card label="Total salons" value={t.total} testid="pl-tenants-total" />
          <Card label="Active" value={t.active || 0} testid="pl-tenants-active" />
          <Card label="Trial" value={t.trial || 0} testid="pl-tenants-trial" />
          <Card label="Suspended" value={t.suspended || 0} testid="pl-tenants-suspended" />
          <Card label="Cancelled" value={t.cancelled || 0} testid="pl-tenants-cancelled" />
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-600 mb-2">Today's activity</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card label="AI calls" value={d.ai_calls} hint="chats + posts + reels" testid="pl-ai-calls" />
          <Card label="Auto-pilot posts" value={d.autopilot_posts} testid="pl-autopilot-posts" />
          <Card label="Win-back emails" value={d.winback_emails} testid="pl-emails" />
          <Card label="Promo videos" value={d.promo_videos} testid="pl-promos" />
          <Card label="New invoices" value={d.new_invoices} testid="pl-invoices" />
          <Card label="New bookings" value={d.new_appointments} testid="pl-appointments" />
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-600 mb-2">Resources</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card label="SMS points balance" value={data.sms.points_balance_all_tenants} hint="all tenants combined" testid="pl-sms-balance" />
          <Card label="SMS credit events today" value={data.sms.credit_events_today} testid="pl-sms-today" />
          <Card label="Uploaded files" value={data.storage.uploads} hint={`${data.storage.total_mb} MB in storage`} testid="pl-storage" />
          <Card label="Database" value={`${data.db.documents.toLocaleString()} docs`} hint={`${data.db.collections} collections`} testid="pl-db" />
        </div>
      </div>

      <p className="text-[11px] text-slate-400">
        Capacity notes: the API scales past 100+ tenants as-is. The numbers to watch are AI calls (LLM budget),
        emails (Resend plan) and SMS points — these are billing limits, not technical ones.
      </p>
    </div>
  );
};
