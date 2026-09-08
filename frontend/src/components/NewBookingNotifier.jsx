import { useEffect, useRef, useState, useCallback } from "react";
import log from "@/lib/log";
import api from "@/lib/api";
import { toast } from "sonner";
import { Bell, CalendarPlus, Gift, Crown, X, CheckCheck } from "lucide-react";

const KIND = {
  booking:    { Icon: CalendarPlus, cls: "bg-gold/10 border-gold/30 text-gold", to: "/appointments" },
  gift:       { Icon: Gift, cls: "bg-fuchsia-500/10 border-fuchsia-400/40 text-fuchsia-400", to: "/plans" },
  membership: { Icon: Crown, cls: "bg-amber-500/10 border-amber-400/40 text-amber-400", to: "/plans" },
  notice:     { Icon: Bell, cls: "bg-sky-500/10 border-sky-400/40 text-sky-300", to: "/settings" },
};

function notifText(it) {
  if (it.kind === "notice") return { title: it.title, sub: it.sub || "", meta: "" };
  if (it.kind === "gift") {
    return {
      title: `Gift card sold — ₹${Number(it.amount || 0).toLocaleString("en-IN")}`,
      sub: `${it.buyer_name || "Someone"} → ${it.recipient_name || "a loved one"} · ${it.occasion || ""}`,
      meta: "",
    };
  }
  if (it.kind === "membership") {
    return {
      title: `New ${(it.tier || "").toUpperCase()} member — ${it.customer_name || ""}`,
      sub: `${it.name || "Membership"} · ₹${Number(it.amount || 0).toLocaleString("en-IN")} · ${it.member_id || ""}`,
      meta: "",
    };
  }
  return {
    title: `New booking — ${it.customer_name}`,
    sub: `${(it.service_names || []).join(", ") || "Service"} · with ${it.staff_name}`,
    meta: `📅 ${new Date(it.scheduled_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`,
  };
}

const LAST_SEEN_KEY = "miracurl_notif_last_seen";
const ITEMS_KEY = "miracurl_notif_items";
const POLL_MS = 20_000;

// Storage keys are scoped per tenant — switching between a salon and a
// restaurant in the same browser must never leak the other tenant's
// notifications (prod bug: restaurant pending-bill shown on salon dashboard).
function tenantKey(base) {
  try { return `${base}:${localStorage.getItem("miracurl_tenant") || "default"}`; } catch { return base; }
}
// One-time purge of the legacy unscoped keys (may hold another tenant's items).
try { localStorage.removeItem(LAST_SEEN_KEY); localStorage.removeItem(ITEMS_KEY); } catch { /* noop */ }

function readLastSeen() {
  try { return localStorage.getItem(tenantKey(LAST_SEEN_KEY)) || new Date().toISOString(); }
  catch { return new Date().toISOString(); }
}
function writeLastSeen(iso) {
  try { localStorage.setItem(tenantKey(LAST_SEEN_KEY), iso); } catch { /* noop */ }
}
function readItems() {
  try { return JSON.parse(localStorage.getItem(tenantKey(ITEMS_KEY)) || "[]"); } catch { return []; }
}
function writeItems(items) {
  try { localStorage.setItem(tenantKey(ITEMS_KEY), JSON.stringify(items.slice(0, 30))); } catch { /* noop */ }
}

function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [{ freq: 880, start: 0.00, dur: 0.18 }, { freq: 1174.66, start: 0.14, dur: 0.28 }].forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.35, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    });
    setTimeout(() => ctx.close?.(), 600);
  } catch (e) { log.warn("[NewBookingNotifier] chime failed:", e); }
}

function goToBilling(id) {
  window.history.pushState({}, "", `/pos?appointment=${id}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// Module-level guards shared across ALL notifier instances: prevents the double
// "New booking" toast when two polls race or the layout remounts.
const _notifiedIds = new Set();
let _pollLock = false;

function showOsNotification(b) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const when = new Date(b.scheduled_at).toLocaleString("en-IN", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
    const services = (b.service_names || []).join(", ") || "Service";
    const n = new Notification("New booking ✦ Miracurl", {
      body: `${b.customer_name} • ${services}\nWith ${b.staff_name} at ${when}`,
      icon: "/icon-192.png", badge: "/icon-192.png",
      tag: `booking-${b.id}`, renotify: false,
    });
    n.onclick = () => {
      window.focus();
      goToBilling(b.id);
      n.close();
    };
  } catch (e) { log.warn("[NewBookingNotifier] OS notification failed:", e); }
}

function relTime(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Polls for new bookings; keeps a persistent list (one row per booking with time).
 * Reading (clicking) a notification removes it from the list automatically.
 */
export function useNewBookingNotifier({ enabled }) {
  const [items, setItems] = useState(readItems);
  const [permission, setPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const lastSeenRef = useRef(readLastSeen());
  const firstRunRef = useRef(true);
  const itemsRef = useRef(items);

  useEffect(() => { writeItems(items); itemsRef.current = items; }, [items]);

  const poll = useCallback(async () => {
    if (document.visibilityState !== "visible" || _pollLock) return;
    _pollLock = true;
    try {
      let { data } = await api.get("/notifications/new-bookings", { params: { since: lastSeenRef.current } });
      lastSeenRef.current = data.server_time || new Date().toISOString();
      writeLastSeen(lastSeenRef.current);
      const firstRun = firstRunRef.current;
      if (firstRun) {
        // First poll: don't replay old bookings, but DO load open notices & pending to-dos quietly.
        firstRunRef.current = false;
        data = { ...data, bookings: [], gift_cards: [], memberships: [], count: (data.notices || []).length + (data.pending || []).length };
      }
      if (data.count > 0) {
        const now = new Date().toISOString();
        let fresh = [
          ...(data.bookings || []).map(b => ({ ...b, kind: "booking", received_at: b.created_at || now })),
          ...(data.gift_cards || []).map(g => ({ ...g, kind: "gift", received_at: g.issued_at || now })),
          ...(data.memberships || []).map(m => ({ ...m, kind: "membership", received_at: m.purchased_at || now })),
          ...(data.notices || []).map(n => ({ ...n, kind: "notice", silent: firstRun, received_at: n.created_at || now })),
          ...(data.pending || []).map(n => ({ ...n, kind: "notice", silent: true, received_at: n.created_at || now })),
        ];
        fresh = fresh.filter(f => !_notifiedIds.has(f.id));
        fresh.forEach(f => _notifiedIds.add(f.id));
        if (!fresh.length) return;
        setItems(prev => {
          const seen = new Set(prev.map(i => i.id));
          return [...fresh.filter(f => !seen.has(f.id)), ...prev].slice(0, 30);
        });
        if (fresh.some(f => !f.silent)) playChime();
        // One quiet toast — the bell lists them one by one (no toast spam)
        if (fresh.filter(f => !f.silent).length === 1) {
          const one = fresh.find(f => !f.silent);
          if (one.kind === "gift") {
            toast.success(`Gift card sold ✦ ₹${Number(one.amount || 0).toLocaleString("en-IN")}`, {
              description: `${one.buyer_name || "Someone"} → ${one.recipient_name || "a loved one"}`, duration: 6000,
            });
          } else if (one.kind === "notice") {
            toast(one.title, { description: one.sub, duration: 8000 });
          } else if (one.kind === "membership") {
            toast.success(`New ${(one.tier || "").toUpperCase()} member ✦ ${one.customer_name}`, {
              description: `${one.name || "Membership"} · ₹${Number(one.amount || 0).toLocaleString("en-IN")}`, duration: 6000,
            });
          } else {
            toast.success(`New booking ✦ ${one.customer_name}`, {
              description: `${(one.service_names || []).join(", ") || "Service"} with ${one.staff_name}`, duration: 10000,
              action: { label: "Bill now →", onClick: () => goToBilling(one.id) },
            });
          }
        } else if (fresh.some(f => !f.silent)) {
          const loud = fresh.filter(f => !f.silent);
          const nb = loud.filter(f => f.kind === "booking").length;
          const names = loud.filter(f => f.kind === "booking").map(b => b.customer_name).filter(Boolean);
          toast.success(nb === loud.length ? `${nb} new bookings ✦` : `${loud.length} new notifications ✦`, {
            description: names.length
              ? `${names.slice(0, 3).join(" · ")}${names.length > 3 ? ` +${names.length - 3} more` : ""} — tap the bell to bill each one`
              : "Tap the bell to view them one by one",
            duration: 9000,
          });
        }
        for (const b of fresh.filter(f => f.kind === "booking")) showOsNotification(b);
      }
      // A booking stays in the bell until its bill is raised — then it clears itself
      const bookingIds = itemsRef.current.filter(i => i.kind === "booking").map(i => i.id);
      if (bookingIds.length) {
        try {
          const { data: bs } = await api.get("/appointments/billing-status", { params: { ids: bookingIds.join(",") } });
          const billed = new Set(bs.billed || []);
          if (billed.size) setItems(prev => prev.filter(i => i.kind !== "booking" || !billed.has(i.id)));
        } catch { /* next poll retries */ }
      }
    } catch (e) {
      log.debug("[NewBookingNotifier] poll error:", e?.response?.status);
    } finally {
      _pollLock = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    poll();
    const iv = setInterval(poll, POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", onVis); };
  }, [enabled, poll]);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) { toast.error("This browser doesn't support desktop notifications"); return; }
    if (Notification.permission === "granted") { toast.info("Notifications already enabled"); return; }
    if (Notification.permission === "denied") {
      toast.error("Notifications blocked. Enable them in your browser settings for this site.");
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") {
        toast.success("Notifications enabled — you'll hear a chime for new bookings ✦");
        try {
          const n = new Notification("Miracurl notifications on ✦", {
            body: "You'll get a chime and pop-up for every new booking.", icon: "/icon-192.png",
          });
          setTimeout(() => n.close(), 4000);
        } catch { /* noop */ }
        playChime();
      }
    } catch (e) { log.warn("[NewBookingNotifier] permission request failed:", e); }
  }, []);

  const serverDismiss = (id) => {
    if (!id || id.startsWith("staffgap-") || id.startsWith("latefine-")) return; // live to-dos: reappear until fixed
    api.post(`/notifications/notices/${id}/dismiss`).catch(() => {});
  };
  const dismiss = useCallback((id) => setItems(prev => { const it = prev.find(i => i.id === id); if (it?.kind === "notice") serverDismiss(id); return prev.filter(i => i.id !== id); }), []);
  const clearAll = useCallback(() => setItems(prev => { prev.filter(i => i.kind === "notice").forEach(i => serverDismiss(i.id)); return []; }), []);

  return { items, unread: items.length, permission, requestPermission, dismiss, clearAll };
}

/** Header bell with a dropdown list — one row per booking, read = removed. */
export function NotifBell({ items = [], permission, requestPermission, dismiss, clearAll, onNavigate }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const unread = items.length;
  const needsPermission = permission !== "granted" && permission !== "denied";

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function readItem(it) {
    setOpen(false);
    if (it.kind === "booking") {
      // Booking rows go straight to Billing with the order pre-filled and STAY
      // in the bell until the bill is actually raised.
      onNavigate?.(`/pos?appointment=${it.id}`);
      return;
    }
    dismiss(it.id);
    if (it.kind === "notice" && it.link) {
      if (/^https?:/.test(it.link)) window.open(it.link, "_blank", "noopener");
      else onNavigate?.(it.link);
      return;
    }
    onNavigate?.((KIND[it.kind] || KIND.booking).to);
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => { if (needsPermission) requestPermission(); setOpen(o => !o); }}
        className="relative p-2 rounded-md hover:bg-white/5 transition"
        data-testid="notif-btn"
        aria-label="Notifications"
        title={unread ? `${unread} notification${unread === 1 ? "" : "s"}` : "Notifications"}
      >
        <Bell className={`w-4 h-4 ${unread > 0 ? "text-gold" : "text-white/70"}`} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-gold text-bg-base text-[10px] font-bold flex items-center justify-center" data-testid="notif-badge">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
        {needsPermission && unread === 0 && (
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[320px] bg-[#16121a] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden" data-testid="notif-panel">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="text-sm font-semibold text-white flex items-center gap-2">
              <Bell className="w-3.5 h-3.5 text-gold" /> Notifications
              {unread > 0 && <span className="text-[10px] text-gold bg-gold/10 border border-gold/30 rounded-full px-1.5 py-0.5 font-bold">{unread}</span>}
              {items.some(i => i.kind === "booking") && (
                <span className="text-[9px] font-bold uppercase tracking-wide text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded-full px-1.5 py-0.5" data-testid="notif-pending-bills">
                  🧾 {items.filter(i => i.kind === "booking").length} to bill
                </span>
              )}
            </div>
            {unread > 0 && (
              <button onClick={clearAll} data-testid="notif-clear-all"
                className="text-[11px] text-white/45 hover:text-white flex items-center gap-1">
                <CheckCheck className="w-3 h-3" /> Clear all
              </button>
            )}
          </div>
          <div className="max-h-[340px] overflow-y-auto divide-y divide-white/5">
            {items.length === 0 && (
              <div className="py-10 text-center text-white/35 text-xs" data-testid="notif-empty">You're all caught up ✨</div>
            )}
            {items.map(it => {
              const k = KIND[it.kind] || KIND.booking;
              const KIcon = k.Icon;
              const tx = notifText(it);
              if (it.kind === "booking") {
                return (
                  <div key={it.id} className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.04] cursor-pointer group" data-testid={`notif-item-${it.id}`}
                    onClick={() => readItem(it)}>
                    <div className="w-8 h-8 rounded-full bg-gold/15 border border-gold/40 text-gold flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                      {(it.customer_name || "G").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-white truncate">{it.customer_name}</span>
                        <span className="text-[8.5px] font-bold tracking-wide uppercase text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded-full px-1.5 py-0.5 shrink-0">Pending bill</span>
                      </div>
                      <div className="text-[11px] text-white/55 truncate">{tx.sub}</div>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <span className="text-[10px] text-white/35 truncate">{tx.meta} · {relTime(it.received_at)}</span>
                        <span className="text-[10px] font-bold text-bg-base bg-gold rounded-full px-2 py-0.5 shrink-0 group-hover:brightness-110">Bill now →</span>
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); dismiss(it.id); }} data-testid={`notif-dismiss-${it.id}`}
                      className="opacity-0 group-hover:opacity-100 text-white/35 hover:text-white transition p-1" title="Dismiss">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              }
              return (
                <div key={it.id} className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.04] cursor-pointer group" data-testid={`notif-item-${it.id}`}
                  onClick={() => readItem(it)}>
                  <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${k.cls}`}>
                    <KIcon className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-white truncate">{tx.title}</div>
                    <div className="text-[11px] text-white/55 truncate">{tx.sub}</div>
                    <div className="text-[10px] text-white/35 mt-0.5">
                      {tx.meta && <>{tx.meta}<span className="mx-1.5">·</span></>}{relTime(it.received_at)}
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); dismiss(it.id); }} data-testid={`notif-dismiss-${it.id}`}
                    className="opacity-0 group-hover:opacity-100 text-white/35 hover:text-white transition p-1" title="Dismiss">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
          {items.length > 0 && (
            <div className="px-4 py-2 text-[10px] text-white/30 border-t border-white/10 text-center">
              Tap a booking to open Billing pre-filled — it clears once the bill is raised ✦
            </div>
          )}
        </div>
      )}
    </div>
  );
}
