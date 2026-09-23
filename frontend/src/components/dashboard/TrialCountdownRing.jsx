import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Sprout, ArrowRight, Sparkles } from "lucide-react";

const R = 34;
const C = 2 * Math.PI * R;

function phase(days) {
  if (days < 0) return { tone: "rose", title: "Your free 90 days have ended", copy: "Pick a plan to keep bookings, POS and Mira running — we'd love to keep serving you." };
  if (days <= 7) return { tone: "rose", title: "Final week of your free setup", copy: "Choose a plan before day 90 so nothing pauses — takes under a minute." };
  if (days <= 30) return { tone: "amber", title: "One month to go", copy: "You've set things up — now's a good time to look at plans and lock in your price." };
  return { tone: "emerald", title: "Enjoy your FREE 90-day setup", copy: "No card needed. Explore everything — we'll nudge you gently as day 90 gets closer." };
}

const TONES = {
  emerald: { stroke: "#10b981", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", num: "text-emerald-700" },
  amber:   { stroke: "#f59e0b", chip: "bg-amber-50 text-amber-700 border-amber-200",       num: "text-amber-700" },
  rose:    { stroke: "#f43f5e", chip: "bg-rose-50 text-rose-700 border-rose-200",          num: "text-rose-700" },
};

export const TrialCountdownRing = () => {
  const { tenant } = useAuth();
  const nav = useNavigate();
  if (!tenant || tenant.status !== "trial" || tenant.signup_offer !== "newbiz") return null;
  const endRaw = tenant.trial_end_date || tenant.trial_ends_at;
  if (!endRaw) return null;

  const end = new Date(`${String(endRaw).slice(0, 10)}T23:59:59`);
  const start = tenant.created_at ? new Date(tenant.created_at) : new Date(end.getTime() - 90 * 86400000);
  const total = Math.max(1, Math.floor((end - start) / 86400000));
  const days = Math.min(total, Math.ceil((end - new Date()) / 86400000));
  const used = Math.min(total, Math.max(0, total - Math.max(0, days)));
  const pct = used / total;
  const p = phase(days);
  const t = TONES[p.tone];
  const endLabel = end.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="dash-cream-card rounded-3xl p-4 sm:p-5 flex items-center gap-4 sm:gap-6" data-testid="trial-countdown-ring">
      <div className="relative shrink-0 w-[88px] h-[88px]">
        <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
          <circle cx="40" cy="40" r={R} fill="none" stroke="#e2e8f0" strokeWidth="7" />
          <circle cx="40" cy="40" r={R} fill="none" stroke={t.stroke} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
            style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.4,0,.2,1)" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span className={`font-playfair text-2xl ${t.num}`} data-testid="trial-days-left">{Math.max(0, days)}</span>
          <span className="text-[9px] uppercase tracking-[0.18em] text-slate-400 mt-0.5">{days < 0 ? "ended" : days === 1 ? "day" : "days"}</span>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${t.chip}`}>
            <Sprout className="w-3 h-3" /> New-business · 90-day free setup
          </span>
          <span className="text-[11px] text-slate-400">day {Math.min(total, used + 1)} of {total} · ends {endLabel}</span>
        </div>
        <h3 className="text-base md:text-lg font-semibold text-slate-800 mt-1.5" data-testid="trial-ring-title">{p.title}</h3>
        <p className="text-sm text-slate-500 mt-0.5">{p.copy}</p>
      </div>
      <button data-testid="trial-ring-plans-btn" onClick={() => nav("/settings")}
        className="hidden sm:inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors shrink-0">
        {days <= 30 ? <><Sparkles className="w-3.5 h-3.5" /> View plans</> : <>Plans <ArrowRight className="w-3.5 h-3.5" /></>}
      </button>
    </div>
  );
};
