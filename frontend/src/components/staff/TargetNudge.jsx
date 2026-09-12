import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Target, TrendingUp, Flame, Trophy } from "lucide-react";

const inr = (n) => `₹${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;

// Live "₹ to target" bar for the stylist's own month — refreshes every 2 min and whenever `refreshKey` changes.
export function TargetNudge({ refreshKey }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => api.get("/staff/me/target-progress").then(r => alive && setD(r.data)).catch(() => alive && setD({ has_target: false }));
    load();
    const id = setInterval(load, 120000);
    return () => { alive = false; clearInterval(id); };
  }, [refreshKey]);
  if (!d || !d.has_target) return null;

  const done = d.achieved;
  const pct = Math.min(100, d.pct || 0);
  return (
    <div className={`rounded-2xl border p-5 sm:p-6 ${done ? "bg-emerald-950/40 border-emerald-500/30" : "bg-[#0F0F0F] border-gold/30"}`} data-testid="target-nudge">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="font-playfair text-lg flex items-center gap-2">
            {done ? <Trophy className="w-4 h-4 text-emerald-400" /> : <Target className="w-4 h-4 text-gold" />}
            {done ? "Target smashed ✦" : "₹ to target"}
          </div>
          <p className="text-xs text-white/50 mt-0.5">
            {done ? `You've unlocked ${inr(d.unlock_amount)} in commission this month — keep going, every rupee still counts.`
              : d.incentives_configured ? `Hit ${inr(d.monthly_target)} to unlock up to ${inr(d.unlock_at_target)} in commission${d.commission_pct ? ` (${d.commission_pct}% of services` : ""}${d.target_commission_pct ? `${d.commission_pct ? " + " : " ("}${d.target_commission_pct}% of everything` : ""}${(d.commission_pct || d.target_commission_pct) ? ")" : ""}.`
              : `Monthly business goal: ${inr(d.monthly_target)}.`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-2xl font-semibold ${done ? "text-emerald-400" : "text-gold"}`} data-testid="target-nudge-remaining">{done ? inr(d.gross) : inr(d.remaining)}</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">{done ? "billed this month" : "still to go"}</div>
        </div>
      </div>
      <div className="h-3 rounded-full bg-white/10 overflow-hidden" data-testid="target-nudge-bar">
        <div className={`h-full rounded-full transition-[width] duration-700 ${done ? "bg-emerald-400" : d.on_track ? "bg-gradient-to-r from-gold to-blush" : "bg-gradient-to-r from-amber-500 to-rose-500"}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-[11px] text-white/60">
        <span data-testid="target-nudge-progress">{inr(d.gross)} of {inr(d.monthly_target)} · {pct}%</span>
        {!done && (
          <span className={`inline-flex items-center gap-1 ${d.on_track ? "text-emerald-300" : "text-amber-300"}`} data-testid="target-nudge-pace">
            {d.on_track ? <TrendingUp className="w-3 h-3" /> : <Flame className="w-3 h-3" />}
            {d.days_left} day{d.days_left === 1 ? "" : "s"} left · need {inr(d.per_day_needed)}/day{d.per_day_so_far ? ` (you're at ${inr(d.per_day_so_far)}/day)` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
