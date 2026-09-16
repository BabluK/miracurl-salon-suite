import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Target, TrendingUp, Flame, Trophy, CalendarDays } from "lucide-react";

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
  const monthLabel = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  return (
    <div className={`rounded-2xl border p-5 sm:p-6 ${done ? "bg-emerald-950/40 border-emerald-500/30" : "bg-[#0F0F0F] border-gold/30"}`} data-testid="target-nudge">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-emerald-500/20 text-emerald-300" : "bg-gold/15 text-gold"}`}>
            {done ? <Trophy className="w-5 h-5" /> : <Target className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <div className="font-playfair text-lg text-white">{done ? "Target smashed ✦" : "Monthly Business Goal"}</div>
            <p className="text-xs text-white/50 mt-0.5">
              {done ? `You've unlocked ${inr(d.unlock_amount)} in commission this month — keep going, every rupee still counts.`
                : `Keep going! You're ${pct}% of the way there.${d.incentives_configured ? ` Hit ${inr(d.monthly_target)} to unlock up to ${inr(d.unlock_at_target)} in commission.` : ""}`}
            </p>
          </div>
        </div>
        <div className="shrink-0 hidden sm:inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 text-white/70" data-testid="target-month-pill">
          <CalendarDays className="w-3.5 h-3.5" /> {monthLabel}
        </div>
      </div>
      <div className="flex items-end gap-4">
        <div className="flex-1">
          <div className="h-3 rounded-full bg-white/10 overflow-hidden" data-testid="target-nudge-bar">
            <div className={`h-full rounded-full transition-[width] duration-700 ${done ? "bg-emerald-400" : d.on_track ? "bg-gradient-to-r from-gold to-blush" : "bg-gradient-to-r from-amber-500 to-rose-500"}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-[11px] text-white/60">
            <span data-testid="target-nudge-progress"><b className="text-white/85">{inr(d.gross)}</b> of {inr(d.monthly_target)}</span>
            {!done && (
              <span className={`inline-flex items-center gap-1 ${d.on_track ? "text-emerald-300" : "text-amber-300"}`} data-testid="target-nudge-pace">
                {d.on_track ? <TrendingUp className="w-3 h-3" /> : <Flame className="w-3 h-3" />}
                {d.days_left} day{d.days_left === 1 ? "" : "s"} left · need {inr(d.per_day_needed)}/day{d.per_day_so_far ? ` (you're at ${inr(d.per_day_so_far)}/day)` : ""}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`font-playfair text-2xl ${done ? "text-emerald-400" : "text-gold"}`} data-testid="target-nudge-remaining">{done ? inr(d.gross) : inr(d.remaining)}</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">{done ? "billed this month" : "still to go"}</div>
        </div>
      </div>
    </div>
  );
}
