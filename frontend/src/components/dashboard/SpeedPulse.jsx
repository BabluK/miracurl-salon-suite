import { useEffect, useState } from "react";
import { Zap } from "lucide-react";

// Subtle "Loaded in 0.4s" pill — appears after each dashboard fetch, fades out after a few seconds.
export function SpeedPulse({ ms, serverMs = 0 }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!ms) return undefined;
    setShow(true);
    const id = setTimeout(() => setShow(false), 4500);
    return () => clearTimeout(id);
  }, [ms]);
  if (!ms) return null;
  const label = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  const net = serverMs ? Math.max(ms - serverMs, 0) : 0;
  const title = serverMs ? `Server ${serverMs}ms · network ${net}ms — the rest is the distance between your device and the server` : "Time to fetch your dashboard data";
  return (
    <span data-testid="dashboard-speed-pulse" aria-live="polite" title={title}
      className={`inline-flex items-center gap-1 ml-3 align-middle px-2.5 py-1 rounded-full text-[11px] font-sans font-semibold tracking-wide
        bg-emerald-400/15 text-emerald-200 border border-emerald-300/30 backdrop-blur transition-all duration-700
        ${show ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1 pointer-events-none"}`}>
      <Zap className="w-3 h-3 fill-current animate-pulse" /> Loaded in {label}{serverMs ? <span className="text-emerald-200/60 font-normal" data-testid="dashboard-speed-server">· server {serverMs}ms</span> : null}
    </span>
  );
}
