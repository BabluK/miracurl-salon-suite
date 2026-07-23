import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Building2, Receipt, CalendarCheck, Mic, Wand2, Briefcase, ShieldCheck, Bell, BarChart3, Users, Video, Globe, PhoneCall } from "lucide-react";
import api from "@/lib/api";

const HUB = { x: 42, y: 48 };

const NODES = [
  { label: "Revenue", sub: "Track income & growth", icon: BarChart3, c: "#facc15", x: 43, y: 8, tab: "revenue" },
  { label: "Hiring", sub: "Manage hiring pipeline", icon: Briefcase, c: "#f472b6", x: 23, y: 15, tab: "hiring" },
  { label: "AI CCTV", sub: "Smart surveillance", icon: Video, c: "#a78bfa", x: 68, y: 13 },
  { label: "Notifications", sub: "Alerts & updates", icon: Bell, c: "#fb923c", x: 57, y: 26, tab: "notifications" },
  { label: "Staff Registry", sub: "Staff database", icon: ShieldCheck, c: "#22d3ee", x: 11, y: 38, tab: "verify-staff" },
  { label: "Mira AI", sub: "AI Assistant", icon: Mic, c: "#fbbf24", x: 25, y: 43, tab: "mira-leads" },
  { label: "Leads", sub: "Incoming leads", icon: Users, c: "#e879f9", x: 63, y: 47, tab: "inquiries" },
  { label: "Tenants", sub: "Manage tenants", icon: Building2, c: "#38bdf8", x: 82, y: 47, tab: "tenants" },
  { label: "Bookings", sub: "Schedule & manage", icon: CalendarCheck, c: "#c084fc", x: 15, y: 68 },
  { label: "Marketing", sub: "Campaigns & ads", icon: Wand2, c: "#34d399", x: 28, y: 85 },
  { label: "Public Pages", sub: "Website pages", icon: Globe, c: "#4ade80", x: 55, y: 71 },
  { label: "POS & Billing", sub: "Sales & invoices", icon: Receipt, c: "#fb7185", x: 62, y: 88, tab: "billing" },
];

const VX = 10, VY = 7; // % → viewBox(1000×700)

const curveD = (n) => {
  const mx = (HUB.x + n.x) / 2, my = (HUB.y + n.y) / 2;
  const dx = n.x - HUB.x, dy = n.y - HUB.y;
  const len = Math.hypot(dx, dy) || 1;
  const k = 5.5;
  const cx = mx - (dy / len) * k, cy = my + (dx / len) * k;
  return `M ${HUB.x * VX} ${HUB.y * VY} Q ${cx * VX} ${cy * VY} ${n.x * VX} ${n.y * VY}`;
};

const ago = (iso) => {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return `${Math.floor(s / 86400)} d ago`;
};

export function PlatformOrbitMap({ onGoTab }) {
  const [live, setLive] = useState(null);
  const lastEventAtRef = useRef(null);

  const load = useCallback(() => {
    api.get("/super-admin/platform-map/live").then(({ data }) => {
      setLive(data);
      const newest = data?.events?.[0];
      if (newest?.at) {
        if (lastEventAtRef.current && newest.at > lastEventAtRef.current) {
          const line = `Hey Miracurl! ${newest.title}${newest.sub ? ` — ${newest.sub}` : ""}`;
          window.dispatchEvent(new CustomEvent("mira-live-event", { detail: line }));
        }
        lastEventAtRef.current = newest.at;
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event("mira-map-briefing")), 700);
    return () => clearTimeout(t);
  }, []);

  const stars = useMemo(() => Array.from({ length: 28 }, (_, i) => ({
    left: `${(i * 37 + 11) % 97}%`, top: `${(i * 53 + 7) % 93}%`,
    d: `${(i % 5) * 0.7}s`, s: 1 + (i % 3),
  })), []);

  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-4">
      <div className="rounded-3xl bg-[#05060f] border border-indigo-900/50 overflow-hidden relative" data-testid="platform-orbit-map">
        <style>{`
          @keyframes neuroFlow { to { stroke-dashoffset: -48; } }
          @keyframes neuroTwinkle { 0%,100% { opacity: .12; transform: scale(.6); } 50% { opacity: .9; transform: scale(1.15); } }
          @keyframes neuroCardGlow { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.35); } }
          @keyframes neuroHubPulse { 0%,100% { box-shadow: 0 0 34px 6px rgba(168,85,247,.45), 0 0 80px 18px rgba(217,70,239,.18), inset 0 0 26px rgba(251,191,36,.25); }
            50% { box-shadow: 0 0 50px 12px rgba(168,85,247,.65), 0 0 110px 30px rgba(217,70,239,.3), inset 0 0 34px rgba(251,191,36,.4); } }
          @keyframes neuroRingSpin { to { transform: rotate(360deg); } }
          .neuro-line { stroke-dasharray: 2 10; stroke-linecap: round; animation: neuroFlow 2.6s linear infinite; }
          .neuro-star { position: absolute; border-radius: 9999px; background: #fff; animation: neuroTwinkle 3s ease-in-out infinite; }
          .neuro-card { animation: neuroCardGlow 3.4s ease-in-out infinite; }
        `}</style>

        {stars.map((st, i) => (
          <span key={i} className="neuro-star" style={{ left: st.left, top: st.top, width: st.s, height: st.s, animationDelay: st.d }} />
        ))}
        <div className="absolute inset-x-0 bottom-0 h-40 pointer-events-none"
          style={{ background: "radial-gradient(120% 90% at 50% 120%, rgba(88,28,135,.35), transparent 70%)" }} />

        <div className="text-center relative z-10 pt-6 px-6">
          <div className="text-[10px] tracking-[0.35em] uppercase text-amber-300/70">The Miracurl Universe · Neural View</div>
          <h2 className="font-playfair text-2xl text-white mt-1.5">Everything orbits your salons</h2>
          <p className="text-white/40 text-xs mt-1">12 modules · one AI brain · tap any node to jump in</p>
        </div>

        <div className="relative h-[600px] mx-2 sm:mx-4" data-testid="neuro-map-stage">
          <svg viewBox="0 0 1000 700" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
            <g style={{ transformOrigin: `${HUB.x * VX}px ${HUB.y * VY}px`, animation: "neuroRingSpin 90s linear infinite" }}>
              <ellipse cx={HUB.x * VX} cy={HUB.y * VY} rx="330" ry="255" fill="none" stroke="rgba(148,163,255,.14)" strokeWidth="1" strokeDasharray="3 9" />
              <ellipse cx={HUB.x * VX} cy={HUB.y * VY} rx="215" ry="160" fill="none" stroke="rgba(217,70,239,.12)" strokeWidth="1" strokeDasharray="2 8" />
            </g>
            {NODES.map((n, i) => {
              const d = curveD(n);
              return (
                <g key={n.label}>
                  <path d={d} fill="none" stroke={n.c} strokeWidth="5" opacity="0.07" />
                  <path d={d} fill="none" stroke={n.c} strokeWidth="1.6" opacity="0.75" className="neuro-line"
                    style={{ animationDelay: `${i * 0.18}s` }} />
                  <circle r="7" fill={n.c} opacity="0.22">
                    <animateMotion dur={`${4.2 + (i % 4) * 0.9}s`} begin={`${i * 0.45}s`} repeatCount="indefinite" path={d} />
                  </circle>
                  <circle r="3" fill="#fff">
                    <animateMotion dur={`${4.2 + (i % 4) * 0.9}s`} begin={`${i * 0.45}s`} repeatCount="indefinite" path={d} />
                    <animate attributeName="opacity" values="0.2;1;0.2" dur="1.1s" repeatCount="indefinite" />
                  </circle>
                  <circle r="4" fill={n.c} opacity="0.85">
                    <animateMotion dur={`${5.4 + (i % 3) * 1.1}s`} begin={`${i * 0.7 + 1.6}s`} repeatCount="indefinite" path={d} keyPoints="1;0" keyTimes="0;1" calcMode="linear" />
                    <animate attributeName="r" values="2.5;4.5;2.5" dur="1.4s" repeatCount="indefinite" />
                  </circle>
                </g>
              );
            })}
          </svg>

          <div className="absolute -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center justify-center rounded-full bg-[#0a0b1a] border border-fuchsia-500/40 w-40 h-40 sm:w-44 sm:h-44"
            style={{ left: `${HUB.x}%`, top: `${HUB.y}%`, animation: "neuroHubPulse 3.2s ease-in-out infinite" }}
            data-testid="orbit-hub">
            <img src="/brand/miracurl-rosegold-icon.png" alt="Miracurl" className="w-14 h-14 object-contain" draggable="false" />
            <span className="text-[10px] tracking-[0.3em] uppercase text-amber-300 mt-2 font-semibold">Miracurl HQ</span>
          </div>

          {NODES.map((n, i) => {
            const I = n.icon;
            return (
              <button key={n.label}
                onClick={() => n.tab && onGoTab?.(n.tab)}
                data-testid={`orbit-node-${n.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={`neuro-card absolute -translate-x-1/2 -translate-y-1/2 z-10 rounded-2xl border-2 bg-[#0a0b1a]/85 backdrop-blur-md px-3.5 py-2 sm:px-4 sm:py-2.5 flex items-center gap-2.5 transition-transform hover:scale-110 ${n.tab ? "cursor-pointer" : "cursor-default"}`}
                style={{ left: `${n.x}%`, top: `${n.y}%`, borderColor: `${n.c}99`,
                  boxShadow: `0 0 18px ${n.c}55, inset 0 0 16px ${n.c}1e`,
                  animationDelay: `${i * 0.28}s` }}>
                <I className="w-4 h-4 shrink-0" style={{ color: n.c }} />
                <span className="text-left">
                  <span className="block text-[11px] sm:text-xs font-bold leading-tight whitespace-nowrap" style={{ color: n.c }}>{n.label}</span>
                  <span className="block text-[8px] sm:text-[9px] text-white/40 leading-tight whitespace-nowrap">{n.sub}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-[10px] text-white/40 relative z-10 pb-5">
          <span><span className="inline-block w-2 h-2 rounded-full bg-sky-400 mr-1.5" />Data Flow</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-fuchsia-400 mr-1.5" />AI Processing</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1.5" />Real-time Sync</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1.5" />Automated Action</span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl bg-slate-950 border border-indigo-900/50 p-4" data-testid="map-mira-calls-card">
          <div className="flex items-center gap-2 text-white text-sm font-bold">
            <PhoneCall className="w-4 h-4 text-fuchsia-400" /> Mira Outbound Calls
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {[["Calls made", live?.call_stats?.total], ["Today", live?.call_stats?.today],
              ["🎉 Interested", live?.call_stats?.interested], ["💬 AI conversations", live?.call_stats?.conversations]].map(([l, v]) => (
              <div key={l} className="bg-white/5 rounded-xl px-3 py-2">
                <div className="text-lg font-bold text-white">{v ?? "—"}</div>
                <div className="text-[10px] text-white/40">{l}</div>
              </div>
            ))}
          </div>
          <button onClick={() => onGoTab?.("mira-leads")} data-testid="map-goto-leads" className="mt-2 text-[11px] text-fuchsia-400 hover:text-fuchsia-300">Open Lead Agent →</button>
        </div>

        <div className="rounded-2xl bg-slate-950 border border-indigo-900/50 p-4" data-testid="map-live-activity">
          <div className="flex items-center justify-between">
            <span className="text-white text-sm font-bold">Live Activity Stream</span>
            <span className="text-[9px] font-bold text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 rounded-full px-2 py-0.5 animate-pulse">LIVE</span>
          </div>
          <div className="mt-3 space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {(live?.events || []).map((e, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="text-base leading-none mt-0.5">{e.icon}</span>
                <div className="min-w-0">
                  <p className="text-[11px] text-white/85 leading-tight truncate">{e.title}</p>
                  <p className="text-[9px] text-white/35">{e.sub ? `${e.sub} · ` : ""}{ago(e.at)}</p>
                </div>
              </div>
            ))}
            {!live?.events?.length && <p className="text-[11px] text-white/30">Waiting for activity…</p>}
          </div>
        </div>

        <div className="rounded-2xl bg-slate-950 border border-indigo-900/50 p-4" data-testid="map-ai-insight">
          <div className="text-white text-sm font-bold">✨ AI Insight</div>
          <p className="text-xs text-white/70 mt-2">
            <b className={`${(live?.insight?.change_pct ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {(live?.insight?.change_pct ?? 0) >= 0 ? "+" : ""}{live?.insight?.change_pct ?? 0}%
            </b>{" "}
            leads this week ({live?.insight?.leads_this_week ?? 0}) vs last week ({live?.insight?.leads_prev_week ?? 0})
          </p>
          <div className="mt-2 text-[10px] text-white/30 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> All systems operational
          </div>
        </div>
      </div>
    </div>
  );
}
