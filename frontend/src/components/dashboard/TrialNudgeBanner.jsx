import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Minus, Sparkles, ArrowRight, X, Clock } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const TIER_LABEL = { starter: "Starter", professional: "Professional", premium: "Premium AI" };
const SNOOZE_KEY = "trial-nudge-snoozed-until";

export const TrialNudgeBanner = () => {
  const { tenant } = useAuth();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [hidden, setHidden] = useState(() => Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now());

  useEffect(() => {
    if (tenant?.currency !== "USD" || tenant?.status !== "trial") return;
    api.get("/tenants/current/trial-nudge").then((r) => setD(r.data)).catch(() => {});
  }, [tenant?.currency, tenant?.status]);

  if (!d?.show || hidden) return null;

  const snooze = () => { localStorage.setItem(SNOOZE_KEY, String(Date.now() + 24 * 3600 * 1000)); setHidden(true); };
  const rec = d.recommended;
  const usedSet = new Set(d.used);
  const outside = [...d.needs_pro, ...d.needs_premium];
  const name = (m) => d.modules[m] || m;
  const daysText = d.days_left === 0 ? "ends today" : d.days_left === 1 ? "ends tomorrow" : `ends in ${d.days_left} days`;

  return (
    <div className="dash-cream-card rounded-3xl !p-0 overflow-hidden" data-testid="trial-nudge-banner">
      <div className="flex flex-col lg:flex-row">
        <div className="lg:w-[38%] p-5 sm:p-6 bg-[linear-gradient(135deg,#fff7ed_0%,#fffbeb_60%,#fdf2f8_100%)] relative">
          <button onClick={snooze} className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/80 border border-amber-200 text-amber-700 inline-flex items-center justify-center hover:bg-white" title="Remind me tomorrow" data-testid="trial-nudge-snooze"><X className="w-3.5 h-3.5" /></button>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-semibold" data-testid="trial-nudge-days">
            <Clock className="w-3 h-3" /> Free trial {daysText}
          </div>
          <h3 className="font-playfair text-xl sm:text-2xl text-slate-900 mt-3 leading-tight">Pick the plan that fits how you already work</h3>
          <p className="text-sm text-slate-600 mt-2" data-testid="trial-nudge-summary">
            {d.used.length === 0
              ? "You haven't explored much yet — Starter covers bookings, POS and clients."
              : outside.length === 0
                ? <>Everything you've used so far — <b>{d.used.map(name).join(", ")}</b> — is included in <b>Starter</b>.</>
                : <>You've been using <b>{outside.map(name).join(", ")}</b>{d.needs_premium.length ? <> — {d.needs_premium.map(name).join(", ")} need{d.needs_premium.length === 1 ? "s" : ""} <b>Premium AI</b></> : <> — these need <b>Professional</b></>}.</>}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => nav("/settings#subscription")} data-testid="trial-nudge-cta"
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-[background-color,transform] active:scale-95">
              <Sparkles className="w-4 h-4" /> Choose {TIER_LABEL[rec]} — ${d.tiers[rec]?.price}/mo <ArrowRight className="w-4 h-4" />
            </button>
            <div className="text-[11px] text-slate-500 self-center">or ${d.tiers[rec]?.annual}/yr · 2 months free</div>
          </div>
        </div>
        <div className="flex-1 p-5 sm:p-6 grid sm:grid-cols-2 gap-3">
          <TierColumn tier="starter" d={d} usedSet={usedSet} highlight={rec === "starter"} />
          <TierColumn tier="professional" d={d} usedSet={usedSet} highlight={rec !== "starter"} extra={d.needs_premium.length ? d.needs_premium : null} />
        </div>
      </div>
    </div>
  );
};

const TierColumn = ({ tier, d, usedSet, highlight, extra }) => {
  const t = d.tiers[tier];
  const starterSet = new Set(d.tiers.starter.modules);
  const rows = tier === "starter" ? t.modules : t.modules.filter((m) => !starterSet.has(m));
  return (
    <div className={`rounded-2xl border p-4 ${highlight ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"}`} data-testid={`trial-nudge-tier-${tier}`}>
      <div className="flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-[0.18em] font-semibold opacity-70">{TIER_LABEL[tier]}</div>
        <div className="font-outfit font-bold text-lg">${t.price}<span className="text-xs font-medium opacity-60">/mo</span></div>
      </div>
      {tier === "professional" && <div className="text-[11px] opacity-70 mt-0.5">Everything in Starter, plus</div>}
      <ul className="mt-3 space-y-1.5">
        {rows.map((m) => {
          const used = usedSet.has(m);
          return (
            <li key={m} className="flex items-center gap-2 text-sm" data-testid={`trial-nudge-row-${m}`}>
              {used ? <Check className={`w-4 h-4 shrink-0 ${highlight ? "text-emerald-300" : "text-emerald-600"}`} /> : <Minus className="w-4 h-4 shrink-0 opacity-30" />}
              <span className={used ? "font-semibold" : "opacity-70"}>{d.modules[m] || m}</span>
              {used && <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full ${highlight ? "bg-emerald-400/20 text-emerald-200" : "bg-emerald-50 text-emerald-700"}`}>you used this</span>}
            </li>
          );
        })}
        {extra && (
          <li className="pt-2 mt-2 border-t border-white/15 text-xs opacity-80" data-testid="trial-nudge-premium-note">
            <b>{extra.map((m) => d.modules[m] || m).join(", ")}</b> {extra.length === 1 ? "is" : "are"} Premium AI (${d.tiers.premium.price}/mo)
          </li>
        )}
      </ul>
    </div>
  );
};
