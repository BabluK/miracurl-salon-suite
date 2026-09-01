import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Gift, X, Sparkles, PartyPopper } from "lucide-react";

const SPARKLES = [
  { top: "8%", left: "12%", d: "0s" }, { top: "16%", left: "82%", d: "0.4s" },
  { top: "70%", left: "8%", d: "0.8s" }, { top: "78%", left: "88%", d: "0.2s" },
  { top: "40%", left: "94%", d: "0.6s" }, { top: "55%", left: "4%", d: "1s" },
];

export const WelcomeCongratsModal = () => {
  const { tenant } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  const isNewbiz = tenant?.signup_offer === "newbiz";
  const isReferred = !!tenant?.referred_by_tenant_id;
  const key = tenant?.id ? `miracurl_congrats_seen_${tenant.id}` : null;

  useEffect(() => {
    if (!key || (!isNewbiz && !isReferred)) return;
    if (localStorage.getItem(key)) return;
    const created = tenant.created_at ? new Date(tenant.created_at).getTime() : 0;
    if (!created || Date.now() - created > 45 * 86400000) return;
    const tm = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(tm);
  }, [key, isNewbiz, isReferred, tenant?.created_at]);

  if (!open) return null;
  const dismiss = () => { localStorage.setItem(key, "1"); setOpen(false); };
  const trialEnd = String(tenant.trial_end_date || tenant.trial_ends_at || "").slice(0, 10);

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm" data-testid="welcome-congrats-modal">
      <div className="relative w-full max-w-md rounded-3xl overflow-hidden bg-[#17171f] border border-amber-400/40 shadow-2xl shadow-amber-500/20 animate-in fade-in zoom-in-95 duration-500">
        {SPARKLES.map((s, i) => (
          <Sparkles key={i} className="absolute w-3.5 h-3.5 text-amber-300/80 animate-ping" style={{ top: s.top, left: s.left, animationDelay: s.d, animationDuration: "2.4s" }} />
        ))}
        <button onClick={dismiss} data-testid="congrats-close-btn" className="absolute top-3 right-3 z-10 p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
          <X className="w-4 h-4" />
        </button>
        <div className="bg-gradient-to-br from-amber-400 via-yellow-300 to-amber-500 px-8 pt-9 pb-7 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-[#17171f] flex items-center justify-center shadow-lg ring-4 ring-amber-200/60">
            <PartyPopper className="w-8 h-8 text-amber-300" />
          </div>
          <h2 className="font-playfair text-2xl text-[#17171f] mt-4 tracking-tight">Congratulations, {tenant.name}! 🎉</h2>
        </div>
        <div className="px-8 py-7 text-center space-y-4">
          {isNewbiz ? (
            <p className="text-sm text-slate-300 leading-relaxed" data-testid="congrats-message">
              We're really happy to have you onboard ✦ Your <b className="text-amber-300">FREE 90-day setup</b> is active
              {trialEnd && <> until <b className="text-amber-300">{trialEnd}</b></>} — bookings, billing, CRM, WhatsApp
              marketing and Mira AI, all yours to grow with.
            </p>
          ) : (
            <p className="text-sm text-slate-300 leading-relaxed" data-testid="congrats-message">
              We're really happy to have you onboard ✦ A fellow business owner referred you — great businesses travel by
              word of mouth, and yours just joined the family.
            </p>
          )}
          <div className="rounded-2xl bg-amber-400/10 border border-amber-400/30 px-4 py-3 text-[13px] text-amber-200">
            💛 Love Miracurl already? <b>Refer more &amp; earn more</b> — every business you refer extends your plan for free
            (5 referrals = 3 months free!)
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button onClick={dismiss} data-testid="congrats-later-btn"
              className="flex-1 py-2.5 rounded-full text-xs text-slate-400 border border-white/10 hover:bg-white/5 transition-colors">
              Maybe later
            </button>
            <button onClick={() => { dismiss(); nav("/refer"); }} data-testid="congrats-refer-btn"
              className="flex-1 py-2.5 rounded-full text-xs font-bold text-[#17171f] bg-gradient-to-r from-amber-400 to-yellow-300 hover:brightness-110 transition-all inline-flex items-center justify-center gap-1.5">
              <Gift className="w-3.5 h-3.5" /> Refer &amp; Earn
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
