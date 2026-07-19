import { useEffect, useState } from "react";
import api from "@/lib/api";
import { CreditCard, RefreshCw, Loader2 } from "lucide-react";

const STATUS_STYLE = {
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
};

export function StripePaymentsPanel() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setBusy(true);
    api.get("/super-admin/stripe-payments")
      .then(r => setData(r.data))
      .catch(() => setData({ rows: [], summary: {} }))
      .finally(() => setBusy(false));
  };
  useEffect(load, []);

  if (!data) return null;
  const s = data.summary || {};
  return (
    <div className="card-light p-0 overflow-hidden" data-testid="stripe-payments-panel">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-violet-600" />
          <h3 className="font-playfair text-xl">Stripe Payments (International)</h3>
        </div>
        <button onClick={load} disabled={busy} data-testid="stripe-payments-refresh"
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 bg-violet-50/40 border-b border-slate-100 text-sm">
        <Mini label="Subscriptions collected" value={`$${(s.total_paid_usd || 0).toLocaleString("en-US")}`} accent="text-violet-700" />
        <Mini label="Deposits collected" value={`$${(s.deposits_paid_usd || 0).toLocaleString("en-US")}`} />
        <Mini label="Paid" value={s.paid_count || 0} accent="text-emerald-600" />
        <Mini label="Pending / abandoned" value={s.pending_count || 0} accent="text-amber-600" />
      </div>
      <div className="overflow-x-auto">
        <table className="luxe-table-light">
          <thead>
            <tr><th>Date</th><th>Salon</th><th>What</th><th className="text-right">Amount</th><th>Status</th><th>Via</th></tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr><td colSpan="6" className="text-center py-8 text-slate-500">No Stripe transactions yet — they'll appear here the moment an international salon starts a checkout.</td></tr>
            ) : data.rows.map(r => (
              <tr key={r.session_id} data-testid={`stripe-txn-${r.session_id}`}>
                <td className="text-xs text-slate-500 whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td>
                <td className="text-slate-800 font-medium">{r.tenant_name}<div className="text-[10px] text-slate-400">{r.tenant_slug}</div></td>
                <td className="text-xs text-slate-600">{r.kind === "booking_deposit" ? "Booking deposit" : r.plan_label}</td>
                <td className="text-right font-semibold text-slate-800">{r.currency === "USD" ? "$" : ""}{Number(r.amount || 0).toLocaleString("en-US")}<span className="text-[10px] text-slate-400 ml-1">{r.currency !== "USD" ? r.currency : ""}</span></td>
                <td><span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wider ${STATUS_STYLE[r.payment_status] || "bg-slate-50 text-slate-500 border-slate-200"}`}>{r.payment_status}</span></td>
                <td className="text-[10px] text-slate-500 uppercase tracking-wider">{r.via === "renewal_email" ? "✉️ Renewal email" : "Settings"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Mini({ label, value, accent = "text-slate-800" }) {
  return (
    <div>
      <div className="label-light text-[10px]">{label}</div>
      <div className={`text-lg font-semibold mt-0.5 ${accent}`}>{value}</div>
    </div>
  );
}
