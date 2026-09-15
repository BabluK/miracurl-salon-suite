import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";

const TONES = {
  emerald: ["bg-emerald-50 text-emerald-600", "#10b981"], sky: ["bg-sky-50 text-sky-600", "#0ea5e9"],
  amber: ["bg-amber-50 text-amber-500", "#f59e0b"], rose: ["bg-rose-50 text-rose-500", "#e11d48"],
  violet: ["bg-violet-50 text-violet-600", "#8b5cf6"],
};

export function pctDelta(cur, prev) {
  if (prev == null) return null;
  if (!prev) return cur ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

export function Delta({ value, label = "vs last period" }) {
  if (value == null) return <div className="text-[11px] text-slate-400">no prior period</div>;
  const up = value >= 0, Icon = up ? TrendingUp : TrendingDown;
  return (
    <div className="text-right">
      <div className={`inline-flex items-center gap-1 text-xs font-semibold ${up ? "text-emerald-600" : "text-rose-500"}`}><Icon className="w-3.5 h-3.5" /> {up ? "+" : ""}{value}%</div>
      <div className="text-[11px] text-slate-400">{label}</div>
    </div>
  );
}

export function KpiCard({ icon: Icon, tone = "emerald", label, value, sub, delta, spark, sparkKey = "v", children, testid }) {
  const [chip, color] = TONES[tone];
  return (
    <div className="relative rounded-2xl bg-white border border-slate-200 shadow-sm p-5 overflow-hidden" data-testid={testid}>
      <div className="flex items-start gap-4">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${chip}`}><Icon className="w-6 h-6" /></div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 font-semibold">{label}</div>
          <div className="font-playfair text-3xl sm:text-4xl text-slate-900 leading-tight mt-1 truncate">{value}</div>
          {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
        </div>
        {delta !== undefined && <Delta value={delta} />}
        {children}
      </div>
      {spark && spark.length > 1 && (
        <div className="h-12 -mx-5 -mb-5 mt-3 opacity-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs><linearGradient id={`g-${tone}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.35} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
              <Area type="monotone" dataKey={sparkKey} stroke={color} strokeWidth={2} fill={`url(#g-${tone})`} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
