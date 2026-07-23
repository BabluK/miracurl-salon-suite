import { useEffect, useState, useCallback } from "react";
import { Building2, Receipt, CalendarCheck, Mic, Wand2, Briefcase, ShieldCheck, Bell, BarChart3, Users, Video, Globe, PhoneCall } from "lucide-react";
import api from "@/lib/api";

const MODULES = [
  { icon: Building2, label: "Tenants", c: "#38bdf8", tab: "tenants" },
  { icon: CalendarCheck, label: "Bookings", c: "#a78bfa" },
  { icon: Receipt, label: "POS & Billing", c: "#fb7185", tab: "billing" },
  { icon: Mic, label: "Mira AI", c: "#fbbf24", tab: "mira-leads" },
  { icon: Wand2, label: "Marketing", c: "#34d399" },
  { icon: Briefcase, label: "Hiring", c: "#f472b6", tab: "hiring" },
  { icon: ShieldCheck, label: "Staff Registry", c: "#22d3ee", tab: "verify-staff" },
  { icon: Bell, label: "Notifications", c: "#fb923c", tab: "notifications" },
  { icon: BarChart3, label: "Revenue", c: "#d4af37", tab: "revenue" },
  { icon: Users, label: "Leads", c: "#e879f9", tab: "inquiries" },
  { icon: Video, label: "AI CCTV", c: "#94a3b8" },
  { icon: Globe, label: "Public Pages", c: "#4ade80" },
];

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

  const load = useCallback(() => {
    api.get("/super-admin/platform-map/live").then(({ data }) => setLive(data)).catch(() => {});
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

  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-4">
      <div className="rounded-3xl bg-slate-950 border border-indigo-900/50 p-6 sm:p-8 overflow-hidden relative" data-testid="platform-orbit-map">
        <div className="text-center relative z-10">
          <div className="text-[10px] tracking-[0.35em] uppercase text-amber-300/70">The Miracurl Universe</div>
          <h2 className="font-playfair text-2xl text-white mt-2">Everything orbits your salons</h2>
          <p className="text-white/40 text-xs mt-1">12 modules · one platform · tap any node to jump in</p>
        </div>
        <div className="orbit-stage mx-auto my-4">
          <span className="orbit-ring orbit-ring-1" />
          <span className="orbit-ring orbit-ring-2" />
          <div className="orbit-hub" data-testid="orbit-hub">
            <img src="/brand/miracurl-rosegold-icon.png" alt="Miracurl" className="w-10 h-10 object-contain" draggable="false" />
            <span className="text-[9px] tracking-[0.25em] uppercase text-amber-300 mt-1">Miracurl HQ</span>
          </div>
          {MODULES.map((m, i) => {
            const ring = i % 2 === 0 ? "outer" : "inner";
            const slot = Math.floor(i / 2);
            const angle = slot * 60;
            const I = m.icon;
            return (
              <div key={m.label} className={`orbit-carrier orbit-${ring}`} style={{ "--angle": `${angle}deg` }}>
                <div className="orbit-arm">
                  <button
                    onClick={() => m.tab && onGoTab?.(m.tab)}
                    data-testid={`orbit-node-${m.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                    className={`orbit-node ${m.tab ? "cursor-pointer" : "cursor-default"}`}
                    style={{ "--c": m.c, borderColor: `${m.c}66`, boxShadow: `0 0 16px ${m.c}44` }}>
                    <I className="w-4 h-4" style={{ color: m.c }} />
                    <span className="text-[9px] font-semibold whitespace-nowrap" style={{ color: m.c }}>{m.label}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-[10px] text-white/40 relative z-10">
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
