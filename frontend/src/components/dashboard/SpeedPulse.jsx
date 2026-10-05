import { useEffect, useState } from "react";
import { Zap } from "lucide-react";

// Subtle "Loaded in 0.4s" pill — appears after each dashboard fetch, fades out after a few seconds.
// ms = wall time until the data was in hand; serverMs = backend compute (Server-Timing header);
// wireMs = browser-measured request duration. network = wire − server, device = ms − wire (main thread busy).
export function SpeedPulse({ ms, serverMs = 0, wireMs = 0, instant = false }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!ms) return undefined;
    setShow(true);
    const id = setTimeout(() => setShow(false), 4500);
    return () => clearTimeout(id);
  }, [ms]);
  if (!ms) return null;
  const fmt = (v) => (v < 1000 ? `${v}ms` : `${(v / 1000).toFixed(1)}s`);
  const wire = wireMs && wireMs <= ms ? wireMs : ms;
  const net = serverMs ? Math.max(wire - serverMs, 0) : 0;
  const device = Math.max(ms - wire, 0);
  const showDevice = wireMs > 0 && device >= 80;
  const title = serverMs
    ? `Server ${serverMs}ms · network ${net}ms${showDevice ? ` · device ${device}ms` : ""} — network is the round-trip between your device and the server; device is time your phone/browser was busy before it could use the reply`
    : "Time to fetch your dashboard data";
  const title2 = instant ? `Your numbers painted instantly from this device's last snapshot, then refreshed from the server. ${title}` : title;
  return (
    <span data-testid="dashboard-speed-pulse" aria-live="polite" title={title2}
      className={`inline-flex items-center gap-1 ml-3 align-middle px-2.5 py-1 rounded-full text-[11px] font-sans font-semibold tracking-wide
        bg-emerald-400/15 text-emerald-200 border border-emerald-300/30 backdrop-blur transition-all duration-700
        ${show ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1 pointer-events-none"}`}>
      <Zap className="w-3 h-3 fill-current animate-pulse" />
      {instant ? <span data-testid="dashboard-speed-instant">Instant ✦ refreshed in {fmt(ms)}</span> : <>Loaded in {fmt(ms)}</>}
      {serverMs ? (
        <span className="text-emerald-200/60 font-normal" data-testid="dashboard-speed-server">
          · server {serverMs}ms · network {fmt(net)}{showDevice ? <span data-testid="dashboard-speed-device"> · device {fmt(device)}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
