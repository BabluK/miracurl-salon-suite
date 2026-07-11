import { Building2, Receipt, CalendarCheck, Mic, Wand2, Briefcase, ShieldCheck, Bell, BarChart3, Users, Video, Globe } from "lucide-react";

const MODULES = [
  { icon: Building2, label: "Tenants", c: "#38bdf8", tab: "tenants" },
  { icon: CalendarCheck, label: "Bookings", c: "#a78bfa" },
  { icon: Receipt, label: "POS & Billing", c: "#fb7185", tab: "billing" },
  { icon: Mic, label: "Mira AI", c: "#fbbf24" },
  { icon: Wand2, label: "Marketing", c: "#34d399" },
  { icon: Briefcase, label: "Hiring", c: "#f472b6", tab: "hiring" },
  { icon: ShieldCheck, label: "Staff Registry", c: "#22d3ee", tab: "verify-staff" },
  { icon: Bell, label: "Notifications", c: "#fb923c", tab: "notifications" },
  { icon: BarChart3, label: "Revenue", c: "#d4af37", tab: "revenue" },
  { icon: Users, label: "Leads", c: "#e879f9", tab: "inquiries" },
  { icon: Video, label: "AI CCTV", c: "#94a3b8" },
  { icon: Globe, label: "Public Pages", c: "#4ade80" },
];

export function PlatformOrbitMap({ onGoTab }) {
  return (
    <div className="rounded-3xl bg-slate-950 border border-indigo-900/50 p-6 sm:p-8 overflow-hidden relative" data-testid="platform-orbit-map">
      <div className="text-center relative z-10">
        <div className="text-[10px] tracking-[0.35em] uppercase text-amber-300/70">The Miracurl Universe</div>
        <h2 className="font-playfair text-2xl text-white mt-2">Everything orbits your salons</h2>
        <p className="text-white/40 text-xs mt-1">12 modules · one platform · tap any node to jump in</p>
      </div>
      <div className="orbit-stage mx-auto my-4">
        {/* rotating orbit rings */}
        <span className="orbit-ring orbit-ring-1" />
        <span className="orbit-ring orbit-ring-2" />
        {/* center hub */}
        <div className="orbit-hub" data-testid="orbit-hub">
          <img src="/brand/miracurl-rosegold-icon.png" alt="Miracurl" className="w-10 h-10 object-contain" draggable="false" />
          <span className="text-[9px] tracking-[0.25em] uppercase text-amber-300 mt-1">Miracurl HQ</span>
        </div>
        {/* orbiting module nodes: outer ring (even idx) + inner ring (odd idx) */}
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
    </div>
  );
}
