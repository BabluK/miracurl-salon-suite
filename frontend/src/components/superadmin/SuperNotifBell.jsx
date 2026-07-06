import { useState } from "react";
import { Bell, Sparkles, Pause, Play, RotateCcw } from "lucide-react";

export function StatusActionButton({ t, setStatus, reactivateTenant }) {
  if (t.status === "active" || t.status === "trial") {
    return <button data-testid={`suspend-tenant-${t.id}`} onClick={() => setStatus(t, "suspended")} title="Suspend" className="p-1.5 text-amber-400 hover:bg-amber-500/10 rounded"><Pause className="w-3.5 h-3.5" /></button>;
  }
  if (t.status === "suspended") {
    return <button data-testid={`activate-tenant-${t.id}`} onClick={() => setStatus(t, "active")} title="Re-activate" className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded"><Play className="w-3.5 h-3.5" /></button>;
  }
  if (t.status === "cancelled") {
    return <button data-testid={`reactivate-tenant-${t.id}`} onClick={() => reactivateTenant(t)} title="Re-onboard: restore salon + new credentials + welcome email" className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded"><RotateCcw className="w-3.5 h-3.5" /></button>;
  }
  return null;
}

export function SuperNotifBell({ tenants, hqUnread, onGoInbox }) {
  const [open, setOpen] = useState(false);
  const alerts = [];
  const now = new Date();
  for (const t of tenants) {
    if (!["active", "trial"].includes(t.status)) continue;
    const endRaw = t.subscription_end_date || t.trial_ends_at || t.trial_end_date;
    if (!endRaw) continue;
    const days = Math.ceil((new Date(String(endRaw).slice(0, 10)) - now) / 86400000);
    if (days <= 7) {
      const kind = t.status === "trial" ? "trial" : "subscription";
      let tone = "sky";
      if (days < 0) tone = "red";
      else if (days <= 3) tone = "amber";
      const text = days < 0
        ? `${t.name} — ${kind} EXPIRED ${-days}d ago`
        : `${t.name} — ${kind} ends in ${days}d`;
      alerts.push({ id: t.id, tone, text });
    }
  }
  const total = alerts.length + (hqUnread || 0);
  return (
    <div className="relative">
      <button data-testid="super-notif-bell" onClick={() => setOpen(o => !o)}
        className="relative p-2.5 rounded-full bg-white/10 border border-white/15 text-white/80 hover:bg-white/20 transition">
        <Bell className="w-4 h-4" />
        {total > 0 && (
          <>
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{total}</span>
            <span className="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full bg-red-500 animate-ping opacity-40" />
          </>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50" data-testid="super-notif-dropdown">
          <div className="px-4 py-3 bg-gradient-to-r from-indigo-950 to-violet-950 text-white text-sm font-medium flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" /> HQ Alerts
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
            {hqUnread > 0 && (
              <button onClick={() => { setOpen(false); onGoInbox(); }} className="w-full text-left px-4 py-3 text-xs hover:bg-slate-50 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-violet-500 shrink-0" />
                <span><b>{hqUnread}</b> unread message(s) from salon owners — open inbox</span>
              </button>
            )}
            {alerts.map(a => (
              <div key={a.id} className="px-4 py-3 text-xs flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${{ red: "bg-red-500", amber: "bg-amber-500", sky: "bg-sky-500" }[a.tone]}`} />
                <span className="text-slate-600">{a.text}</span>
              </div>
            ))}
            {total === 0 && <div className="px-4 py-8 text-center text-xs text-slate-400">All clear — no alerts ✦</div>}
          </div>
        </div>
      )}
    </div>
  );
}
