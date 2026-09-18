import { MessageSquare, MessageCircle, Plus } from "lucide-react";

// Live SMS / WhatsApp balances on each tenant card with one-tap grant from HQ stock.
const Pill = ({ icon: I, label, value, testid, onView, onGrant, grantTestid, ownNumber }) => {
  const tone = ownNumber ? "text-sky-700" : value <= 0 ? "text-rose-600" : value < 20 ? "text-amber-600" : "text-emerald-700";
  return (
    <div className={`flex items-center gap-1.5 border rounded-lg px-2 py-1 ${value <= 0 && !ownNumber ? "border-rose-200 bg-rose-50/60" : "border-slate-100"}`} title={`${label} credits`}>
      <I className="w-3 h-3 text-slate-400" />
      <span className="text-[9px] uppercase tracking-wider text-slate-400">{label}</span>
      <button data-testid={testid} onClick={onView} title={`View ${label} delivery log`} className={`text-xs font-bold hover:underline ${tone}`}>{ownNumber ? "own" : value}</button>
      <button data-testid={grantTestid} onClick={onGrant} title={`Grant ${label} credits from HQ stock`}
        className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition"><Plus className="w-2.5 h-2.5" /> Grant</button>
    </div>
  );
};

export function TenantCreditPills({ t, onGrant, onViewLog }) {
  return (
    <div className="flex items-center gap-1.5" data-testid={`credit-pills-${t.id}`}>
      <Pill icon={MessageSquare} label="SMS" value={t.sms_points || 0} testid={`sms-balance-${t.id}`} grantTestid={`sms-points-${t.id}`}
        onView={() => onViewLog(t, "sms")} onGrant={() => onGrant(t, "sms")} />
      <Pill icon={MessageCircle} label="WA" value={t.wa_points || 0} testid={`wa-balance-${t.id}`} grantTestid={`wa-points-${t.id}`}
        ownNumber={t.own_whatsapp?.status === "connected"} onView={() => onViewLog(t, "whatsapp")} onGrant={() => onGrant(t, "whatsapp")} />
    </div>
  );
}
