import { useEffect, useState } from "react";
import { Gauge, ExternalLink, TrendingDown, AlertTriangle, CheckCircle2 } from "lucide-react";
import api from "@/lib/api";

const TONE = {
  traffic: { ring: "border-amber-400/40", bg: "from-amber-500/15 to-orange-500/5", text: "text-amber-200", Icon: TrendingDown },
  conversion: { ring: "border-rose-400/40", bg: "from-rose-500/15 to-fuchsia-500/5", text: "text-rose-200", Icon: AlertTriangle },
  healthy: { ring: "border-emerald-400/40", bg: "from-emerald-500/15 to-sky-500/5", text: "text-emerald-200", Icon: CheckCircle2 },
};

function Spark({ daily }) {
  if (!daily?.length) return null;
  const max = Math.max(1, ...daily.map(d => d.visitors));
  return (
    <div className="flex items-end gap-[2px] h-8 mt-2" data-testid="traffic-sparkline" title="Unique visitors per day · last 30 days">
      {daily.map(d => <span key={d.day} className="flex-1 rounded-sm bg-sky-400/70" style={{ height: `${Math.max(8, (d.visitors / max) * 100)}%` }} />)}
    </div>
  );
}

// HQ → Mira Home: is it a traffic problem or a conversion problem? First-party visits vs signups this month.
export function TrafficConversionCard() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/super-admin/traffic-conversion").then(r => setD(r.data)).catch(() => {}); }, []);
  if (!d) return null;
  const v = d.verdict, c = d.current, p = d.previous, t = TONE[v.kind] || TONE.healthy;
  const delta = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
  const dv = delta(c.visitors, p.visitors);
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${t.bg} border ${t.ring} p-4`} data-testid="traffic-conversion-card" data-verdict={v.kind}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-white/70"><Gauge className="w-4 h-4 text-sky-300" /> Traffic vs Conversion · {d.month}</div>
        <div className="flex items-center gap-2">
          <a href={d.ga4_url} target="_blank" rel="noreferrer" className="text-[10px] text-white/40 hover:text-white inline-flex items-center gap-0.5" data-testid="traffic-ga4-link">GA4 <ExternalLink className="w-2.5 h-2.5" /></a>
          <a href={d.clarity_url} target="_blank" rel="noreferrer" className="text-[10px] text-white/40 hover:text-white inline-flex items-center gap-0.5" data-testid="traffic-clarity-link">Clarity <ExternalLink className="w-2.5 h-2.5" /></a>
        </div>
      </div>
      <div className={`flex items-start gap-2 ${t.text}`} data-testid="traffic-verdict">
        <t.Icon className="w-4 h-4 mt-0.5 shrink-0" />
        <div><div className="text-sm font-bold">{v.title}</div><p className="text-[11px] leading-snug opacity-90 mt-0.5">{v.text}</p></div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        {[["Visitors", c.visitors, dv, "traffic-visitors"], ["Signups", c.signups, delta(c.signups, p.signups), "traffic-signups"], ["Conversion", `${c.conversion_pct}%`, null, "traffic-conversion"]].map(([l, val, dl, tid]) => (
          <div key={l} className="rounded-xl bg-black/20 border border-white/10 py-2" data-testid={tid}>
            <div className="text-lg font-bold text-white leading-none">{val}</div>
            <div className="text-[9px] uppercase tracking-wider text-white/45 mt-1">{l}{dl != null && <span className={`ml-1 ${dl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{dl >= 0 ? "+" : ""}{dl}%</span>}</div>
          </div>
        ))}
      </div>
      <Spark daily={d.daily} />
      {d.segments?.length > 0 && (
        <div className="mt-3 space-y-1.5" data-testid="traffic-segments">
          {d.segments.map(s => (
            <div key={s.region} className="rounded-lg bg-black/20 border border-white/10 px-2.5 py-1.5" data-testid={`traffic-segment-${s.region}`}>
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-white/85">{s.region === "intl" ? "🇺🇸" : s.region === "in" ? "🇮🇳" : "🌐"} {s.label}</span>
                <span className="text-white/60">{s.visitors} visitors · {s.mobile_pct}% mobile · {s.signup_page_rate_pct}% reach signup</span>
              </div>
              {s.top_paths?.length > 0 && <div className="text-[10px] text-white/40 mt-0.5 truncate">lands on {s.top_paths.map(p => `${p.path} ${p.n}`).join(" · ")}</div>}
            </div>
          ))}
        </div>
      )}
      <div className="text-[10px] text-white/40 mt-2 flex flex-wrap gap-x-3" data-testid="traffic-footnote">
        <span>projected ~{d.projected_visitors}/mo · floor {d.traffic_floor}</span>
        <span>{c.signup_page_rate_pct}% reach signup page</span>
        {d.top_sources?.length > 0 && <span>src: {d.top_sources.map(s => `${s.source} ${s.n}`).join(", ")}</span>}
        {d.top_referrers?.length > 0 && <span>via {d.top_referrers.map(r => r.ref).slice(0, 3).join(", ")}</span>}
      </div>
    </div>
  );
}
