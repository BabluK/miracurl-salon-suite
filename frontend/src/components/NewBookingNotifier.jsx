import { useEffect, useRef, useState, useCallback } from "react";
import log from "@/lib/log";
import api from "@/lib/api";
import { toast } from "sonner";
import { Bell } from "lucide-react";

// localStorage key: last seen booking timestamp (ISO). Keeps the badge in sync
// across page refreshes so an admin who already saw a booking isn't re-nagged.
const LAST_SEEN_KEY = "miracurl_notif_last_seen";
const POLL_MS = 20_000;

function readLastSeen() {
  try {
    return localStorage.getItem(LAST_SEEN_KEY) || new Date().toISOString();
  } catch {
    return new Date().toISOString();
  }
}
function writeLastSeen(iso) {
  try { localStorage.setItem(LAST_SEEN_KEY, iso); } catch { /* noop */ }
}

/**
 * Plays a short 2-tone chime using Web Audio API — no audio file needed, works
 * on all modern browsers (Chrome/Edge/Safari/Firefox). Kept short so it feels
 * professional (not a slot-machine).
 */
function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const notes = [
      { freq: 880, start: 0.00, dur: 0.18 },   // A5
      { freq: 1174.66, start: 0.14, dur: 0.28 }, // D6
    ];
    notes.forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      // Quick attack, gentle decay — sounds like a soft "ding-dong"
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.35, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    });
    // Close the context a bit later so the tail plays out cleanly
    setTimeout(() => ctx.close?.(), 600);
  } catch (e) {
    log.warn("[NewBookingNotifier] chime failed:", e);
  }
}

function showOsNotification(b) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const when = new Date(b.scheduled_at).toLocaleString("en-IN", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
    const services = (b.service_names || []).join(", ") || "Service";
    const n = new Notification("New booking ✦ Miracurl", {
      body: `${b.customer_name} • ${services}\nWith ${b.staff_name} at ${when}`,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: `booking-${b.id}`, // dedupe if the same booking pops twice
      renotify: false,
    });
    n.onclick = () => {
      window.focus();
      window.location.hash = "";
      window.history.pushState({}, "", "/appointments");
      window.dispatchEvent(new PopStateEvent("popstate"));
      n.close();
    };
  } catch (e) {
    log.warn("[NewBookingNotifier] OS notification failed:", e);
  }
}

/**
 * Polls the backend for new bookings created since the last-seen timestamp.
 * When one arrives it: plays a chime, fires an OS notification, shows a toast,
 * and bumps the badge count on the header bell icon.
 *
 * Only mounted for admin/owner users — staff don't need booking alerts.
 * Suppressed automatically when the tab is hidden (browsers throttle timers
 * there anyway) — resumes as soon as the tab is visible again.
 */
export function useNewBookingNotifier({ enabled }) {
  const [unread, setUnread] = useState(0);
  const [permission, setPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const lastSeenRef = useRef(readLastSeen());
  const firstRunRef = useRef(true);

  const poll = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const { data } = await api.get("/notifications/new-bookings", {
        params: { since: lastSeenRef.current },
      });
      // Advance the pointer using server_time so tenant/client clock drift
      // doesn't create duplicates or gaps.
      lastSeenRef.current = data.server_time || new Date().toISOString();
      writeLastSeen(lastSeenRef.current);

      if (firstRunRef.current) {
        // Don't nag with old bookings on first mount — just anchor the pointer.
        firstRunRef.current = false;
        return;
      }
      if (data.count > 0) {
        setUnread((u) => u + data.count);
        playChime();
        for (const b of data.bookings) {
          const when = new Date(b.scheduled_at).toLocaleString("en-IN", {
            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
          });
          const services = (b.service_names || []).join(", ") || "Service";
          toast.success(`New booking ✦ ${b.customer_name}`, {
            description: `${services} with ${b.staff_name} on ${when}`,
            duration: 8000,
          });
          showOsNotification(b);
        }
      }
    } catch (e) {
      // Silent — polling errors shouldn't spam. Just log for dev.
      log.debug("[NewBookingNotifier] poll error:", e?.response?.status);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    // Kick immediately, then on interval; also re-poll when tab becomes visible
    poll();
    const iv = setInterval(poll, POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, poll]);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) {
      toast.error("This browser doesn't support desktop notifications");
      return;
    }
    if (Notification.permission === "granted") {
      toast.info("Notifications already enabled");
      return;
    }
    if (Notification.permission === "denied") {
      toast.error("Notifications blocked. Enable them in your browser settings for this site.");
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") {
        toast.success("Notifications enabled — you'll hear a chime for new bookings ✦");
        // Fire a welcome ping so the user knows it works
        try {
          const n = new Notification("Miracurl notifications on ✦", {
            body: "You'll get a chime and pop-up for every new booking.",
            icon: "/icon-192.png",
          });
          setTimeout(() => n.close(), 4000);
        } catch { /* noop */ }
        playChime();
      }
    } catch (e) {
      log.warn("[NewBookingNotifier] permission request failed:", e);
    }
  }, []);

  const clearUnread = useCallback(() => setUnread(0), []);

  return { unread, permission, requestPermission, clearUnread };
}

/**
 * Header bell — shows unread count + click-to-clear + one-shot button to enable
 * OS notifications if the browser hasn't been asked yet.
 */
export function NotifBell({ unread, permission, requestPermission, clearUnread, onNavigate }) {
  const needsPermission = permission !== "granted" && permission !== "denied";
  return (
    <button
      onClick={() => {
        if (needsPermission) { requestPermission(); return; }
        clearUnread();
        onNavigate?.("/appointments");
      }}
      className="relative p-2 rounded-md hover:bg-white/5 transition"
      data-testid="notif-btn"
      aria-label={needsPermission ? "Enable booking notifications" : "New bookings"}
      title={needsPermission ? "Click to enable booking notifications" : (unread ? `${unread} new booking${unread === 1 ? "" : "s"}` : "No new bookings")}
    >
      <Bell className={`w-4 h-4 ${unread > 0 ? "text-gold" : "text-white/70"}`} />
      {unread > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-gold text-bg-base text-[10px] font-bold flex items-center justify-center"
          data-testid="notif-badge"
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
      {needsPermission && unread === 0 && (
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
      )}
    </button>
  );
}
