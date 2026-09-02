import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

/** Tiny live connection-quality dot in the header: pings /api/ every 30s. */
export const NetSpeedIndicator = () => {
  const [state, setState] = useState({ ms: null, level: "checking" });

  useEffect(() => {
    let alive = true;
    const ping = async () => {
      if (!navigator.onLine) { if (alive) setState({ ms: null, level: "offline" }); return; }
      const t0 = performance.now();
      try {
        await fetch(`${API}/api/`, { cache: "no-store" });
        const ms = Math.round(performance.now() - t0);
        if (alive) setState({ ms, level: ms < 400 ? "fast" : ms < 1200 ? "ok" : "slow" });
      } catch {
        if (alive) setState({ ms: null, level: "offline" });
      }
    };
    const first = setTimeout(ping, 4000);
    const iv = setInterval(ping, 30000);
    const on = () => ping();
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => { alive = false; clearTimeout(first); clearInterval(iv); window.removeEventListener("online", on); window.removeEventListener("offline", on); };
  }, []);

  const cfg = {
    checking: { color: "text-white/40", dot: "bg-white/30", label: "Checking…" },
    fast: { color: "text-emerald-400", dot: "bg-emerald-400", label: `Fast · ${state.ms}ms` },
    ok: { color: "text-amber-400", dot: "bg-amber-400", label: `OK · ${state.ms}ms` },
    slow: { color: "text-rose-400", dot: "bg-rose-400", label: `Slow · ${state.ms}ms` },
    offline: { color: "text-rose-500", dot: "bg-rose-500", label: "Offline" },
  }[state.level];

  const Icon = state.level === "offline" ? WifiOff : Wifi;
  return (
    <div className="relative flex items-center gap-1 px-1.5 py-1 rounded-md" title={`Connection: ${cfg.label}`}
         data-testid="net-speed-indicator" aria-label={`Connection ${cfg.label}`}>
      <Icon className={`w-4 h-4 ${cfg.color}`} />
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${state.level !== "offline" ? "animate-pulse" : ""}`} />
      <span className={`hidden sm:inline text-[10px] font-medium ${cfg.color}`}>{state.ms != null ? `${state.ms}ms` : ""}</span>
    </div>
  );
};
