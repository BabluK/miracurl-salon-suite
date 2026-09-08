import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bell, BellOff, Sparkles, Pause, Play, RotateCcw, Clock, CreditCard, Inbox } from "lucide-react";

export function StatusActionButton({ t, setStatus, reactivateTenant }) {
  if (t.status === "active" || t.status === "trial") {
    return <button data-testid={`suspend-tenant-${t.id}`} onClick={() => setStatus(t, "suspended")} title="Suspend this tenant's access" className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-amber-600 hover:bg-amber-50 text-[9.5px] font-semibold leading-none"><Pause className="w-3.5 h-3.5" />Suspend</button>;
  }
  if (t.status === "suspended") {
    return <button data-testid={`activate-tenant-${t.id}`} onClick={() => setStatus(t, "active")} title="Re-activate access" className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-emerald-600 hover:bg-emerald-50 text-[9.5px] font-semibold leading-none"><Play className="w-3.5 h-3.5" />Activate</button>;
  }
  if (t.status === "cancelled") {
    return <button data-testid={`reactivate-tenant-${t.id}`} onClick={() => reactivateTenant(t)} title="Re-onboard: restore salon + new credentials + welcome email" className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-emerald-600 hover:bg-emerald-50 text-[9.5px] font-semibold leading-none"><RotateCcw className="w-3.5 h-3.5" />Re-onboard</button>;
  }
  return null;
}

const TONE = {
  red:   { dot: "bg-red-500",    pill: "bg-red-50 text-red-700 border-red-200",       icon: "bg-red-50 text-red-600" },
  amber: { dot: "bg-amber-500",  pill: "bg-amber-50 text-amber-700 border-amber-200", icon: "bg-amber-50 text-amber-600" },
  sky:   { dot: "bg-sky-500",    pill: "bg-sky-50 text-sky-700 border-sky-200",       icon: "bg-sky-50 text-sky-600" },
};

const SEEN_KEY = "hq_alerts_seen_v1";
const readSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); } catch { return {}; } };

export function SuperNotifBell({ tenants, hqUnread, onGoInbox, onGoTenant }) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(readSeen);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const alerts = [];
  const now = new Date();
  for (const t of tenants) {
    if (!["active", "trial"].includes(t.status)) continue;
    const endRaw = t.subscription_end_date || t.trial_ends_at || t.trial_end_date;
    if (!endRaw) continue;
    const days = Math.ceil((new Date(String(endRaw).slice(0, 10)) - now) / 86400000);
    if (days > 7) continue;
    const kind = t.status === "trial" ? "Trial" : "Subscription";
    const tone = days < 0 ? "red" : days <= 3 ? "amber" : "sky";
    const pill = days < 0 ? "Expired" : days === 0 ? "Today" : `${days}d left`;
    alerts.push({
      id: t.id, key: `${t.id}:${pill}`, tone, name: t.name, kind, pill,
      meta: days < 0 ? `${kind} expired ${-days}d ago` : days === 0 ? `${kind} ends today` : `${kind} ends in ${days} day${days === 1 ? "" : "s"}`,
      icon: t.status === "trial" ? Clock : CreditCard,
    });
  }
  alerts.sort((a, b) => ({ red: 0, amber: 1, sky: 2 }[a.tone] - { red: 0, amber: 1, sky: 2 }[b.tone]));
  const inboxKey = hqUnread > 0 ? `inbox:${hqUnread}` : null;
  const keys = [...alerts.map(a => a.key), ...(inboxKey ? [inboxKey] : [])];
  const isSnoozed = (k) => typeof seen[k] === "string" && seen[k].startsWith("snooze:") && new Date(seen[k].slice(7)) > now;
  const hidden = (k) => seen[k] === "dismissed" || isSnoozed(k);
  // "dismissed"/snoozed rows are hidden; "seen" rows stay listed but don't count on the badge
  const visibleAlerts = alerts.filter(a => !hidden(a.key));
  const inboxVisible = inboxKey && !hidden(inboxKey);
  const snoozedCount = alerts.filter(a => isSnoozed(a.key)).length;
  const unseen = keys.filter(k => !seen[k] || (seen[k].startsWith("snooze:") && !isSnoozed(k))).length;
  const total = visibleAlerts.length + (inboxVisible ? 1 : 0);

  const persist = (next) => { setSeen(next); try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch { /* private mode */ } };
  const markSeen = () => {
    const next = { ...seen };
    let changed = false;
    keys.forEach(k => { if (!next[k] || (next[k].startsWith("snooze:") && !isSnoozed(k))) { next[k] = "seen"; changed = true; } });
    if (changed) persist(next);
  };
  const snooze = (e, a) => {
    e.stopPropagation();
    const until = new Date(now.getTime() + 3 * 86400000);
    persist({ ...seen, [a.key]: `snooze:${until.toISOString()}` });
    toast.success(`${a.name} snoozed until ${until.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} — it'll wake earlier if the status changes`);
  };
  const wakeSnoozed = () => {
    const next = { ...seen };
    alerts.forEach(a => { if (isSnoozed(a.key)) next[a.key] = "seen"; });
    persist(next);
  };
  const clearAll = () => {
    const next = { ...seen };
    keys.forEach(k => { next[k] = "dismissed"; });
    persist(next);
    setOpen(false);
  };
  const toggle = () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen) markSeen();
  };

  return (
    <div className="relative" ref={ref}>
      <button data-testid="super-notif-bell" onClick={toggle} aria-label="HQ alerts"
        className="relative p-2.5 rounded-full bg-white/10 border border-white/15 text-white/80 hover:bg-white/20 transition">
        <Bell className="w-4 h-4" />
        {unseen > 0 && (
          <>
            <span data-testid="super-notif-badge" className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{unseen}</span>
            <span className="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full bg-red-500 animate-ping opacity-40" />
          </>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[22rem] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50" data-testid="super-notif-dropdown">
          <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" /> HQ Alerts
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/60">{total} {total === 1 ? "item" : "items"}</span>
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {inboxVisible && (
              <button data-testid="super-notif-inbox" onClick={() => { setOpen(false); onGoInbox(); }}
                className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                <span className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0"><Inbox className="w-4 h-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800">HQ Inbox</span>
                  <span className="block text-xs text-slate-500">{hqUnread} unread message{hqUnread === 1 ? "" : "s"} from owners</span>
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-violet-50 text-violet-700 border-violet-200 shrink-0">{hqUnread} new</span>
              </button>
            )}
            {visibleAlerts.map(a => (
              <div key={a.id} data-testid={`super-notif-alert-${a.id}`} role="button" tabIndex={0}
                onClick={() => { setOpen(false); onGoTenant?.(a.id); }}
                onKeyDown={(e) => { if (e.key === "Enter") { setOpen(false); onGoTenant?.(a.id); } }}
                className="group w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors cursor-pointer">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${TONE[a.tone].icon}`}><a.icon className="w-4 h-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800 truncate">{a.name}</span>
                  <span className="block text-xs text-slate-500">{a.meta}</span>
                </span>
                <button data-testid={`super-notif-snooze-${a.id}`} onClick={(e) => snooze(e, a)} title="Snooze for 3 days"
                  className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-full border border-slate-200 text-[10px] font-semibold text-slate-500 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition-all">
                  <BellOff className="w-3 h-3" /> 3d
                </button>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${TONE[a.tone].pill}`}>{a.pill}</span>
              </div>
            ))}
            {total === 0 && (
              <div className="px-4 py-10 text-center">
                <span className="mx-auto w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center"><Sparkles className="w-4 h-4" /></span>
                <p className="mt-3 text-xs font-medium text-slate-600">All clear</p>
                <p className="text-[11px] text-slate-400">{snoozedCount ? `${snoozedCount} alert${snoozedCount === 1 ? "" : "s"} snoozed` : "No expiring trials or unread messages"}</p>
              </div>
            )}
          </div>
          {(total > 0 || snoozedCount > 0) && (
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 text-[10px] text-slate-400">
              <span className="truncate">{total > 0 ? "Hover a row to snooze · click to open" : "Snoozed alerts wake in 3 days or when their status changes"}</span>
              <span className="flex items-center gap-3 shrink-0">
                {snoozedCount > 0 && (
                  <button data-testid="super-notif-wake-snoozed" onClick={wakeSnoozed} className="font-semibold text-indigo-500 hover:text-indigo-700 transition-colors">
                    Show {snoozedCount} snoozed
                  </button>
                )}
                {total > 0 && <button data-testid="super-notif-clear-all" onClick={clearAll} className="font-semibold text-slate-500 hover:text-red-600 transition-colors">Clear all</button>}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
