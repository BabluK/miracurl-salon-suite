// Polite once-a-day trial expiry reminder — shown during the last 7 days of trial.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { toast } from "sonner";
import { Sparkles, CreditCard, HeartHandshake, Crown } from "lucide-react";

export const TrialReminder = () => {
  const { tenant } = useAuth();
  const nav = useNavigate();
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!tenant) return;
    const isTrial = tenant.status === "trial";
    const applyDays = (endRaw, paid) => {
      if (!endRaw) return;
      const end = new Date(`${String(endRaw).slice(0, 10)}T23:59:59`);
      const days = Math.ceil((end - new Date()) / 86400000);
      const founder = !paid && tenant.signup_offer === "founder_6m" && days <= 30;
      if (paid && days > 7) return; // paid salons: only warn in the last week / after expiry
      const key = founder
        ? `founder_offer_popup_${new Date().toISOString().slice(0, 10)}`
        : !paid && days > 7
          ? `trial_welcome_${tenant.id || tenant.slug}`
          : `${paid ? "renewal" : "trial"}_popup_${new Date().toISOString().slice(0, 10)}`;
      try {
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, "1");
      } catch { /* private mode */ }
      setInfo({ days, paid, founder, credit: Number(tenant.founder_offer_credit || tenant.affiliate_credits || 0),
        pct: tenant.founder_discount_pct || 20,
        endDate: end.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) });
    };
    if (isTrial) {
      const congratsPending = (tenant.signup_offer === "newbiz" || tenant.referred_by_tenant_id)
        && !localStorage.getItem(`miracurl_congrats_seen_${tenant.id}`)
        && tenant.created_at && Date.now() - new Date(tenant.created_at).getTime() < 45 * 86400000;
      if (congratsPending) return; // the Welcome Congrats popup owns the first visit
      applyDays(tenant.trial_end_date || tenant.trial_ends_at, false);
    } else if (tenant.subscription_end_date) {
      applyDays(tenant.subscription_end_date, true);
    } else {
      // tenant object may be slim — ask the billing endpoint (admins/managers only; ignore errors)
      api.get("/billing/subscription-status")
        .then(({ data }) => { if (data.source === "subscription") applyDays(data.end_date, true); })
        .catch(() => {});
    }
  }, [tenant]);

  if (!info) return null;
  if (info.founder) return <FounderOfferPopup info={info} onClose={() => setInfo(null)} onPay={() => { setInfo(null); nav("/settings#subscription"); }} />;
  const urgent = !info.paid && info.days <= 7;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="trial-reminder-popup">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden text-center trial-pop-in">
        {urgent ? (
          <div className="relative bg-gradient-to-br from-[#15151b] via-[#2a2233] to-[#7a2d4e] px-7 pt-7 pb-6 text-white">
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, #d4af37 0, transparent 40%), radial-gradient(circle at 80% 70%, #f472b6 0, transparent 45%)" }} />
            <div className="relative">
              <div className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.25em] uppercase text-[#d4af37] font-semibold"><Sparkles className="w-3 h-3" /> Free trial ending</div>
              <div className="font-playfair text-5xl mt-3 leading-none" data-testid="trial-reminder-days">{info.days > 0 ? info.days : info.days === 0 ? "Today" : "Ended"}</div>
              <div className="text-xs text-white/70 mt-1">{info.days > 0 ? `day${info.days === 1 ? "" : "s"} left · until ${info.endDate}` : info.days === 0 ? `your trial ends today, ${info.endDate}` : `your trial ended on ${info.endDate}`}</div>
            </div>
          </div>
        ) : (
          <div className="w-14 h-14 mx-auto mt-7 rounded-2xl bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center text-white mb-1">
            <Sparkles className="w-7 h-7" />
          </div>
        )}
        <div className="px-7 pb-7">
        <h3 className={`font-playfair text-2xl text-slate-800 ${urgent ? "mt-5" : "mt-3"}`}>{info.paid ? (info.days >= 0 ? "Renewal reminder ✦" : "Grace period active ✦") : info.days > 7 ? "Welcome to Miracurl ✦" : "Pay before your trial ends ✦"}</h3>
        <p className="text-sm text-slate-600 mt-3 leading-relaxed" data-testid="trial-reminder-message">
          {info.paid ? (
            info.days >= 0 ? (
              <>Your subscription ends on <b className="text-slate-800">{info.endDate}</b>{info.days > 0 ? <> — <b>{info.days} day{info.days === 1 ? "" : "s"}</b> to go</> : <> — <b>today</b></>}.
                Renew now so bookings, SMS and Mira keep running without interruption 💜</>
            ) : (
              <>Your subscription ended on <b className="text-slate-800">{info.endDate}</b>. You're currently in a courtesy <b>grace period</b> —
                please renew soon or contact the Miracurl team, otherwise access will be paused 💜</>
            )
          ) : info.days > 7 ? (
            <>Your {tenant?.business_type === "restaurant" ? "restaurant" : "salon"} is all set! You&apos;re on a <b>free trial</b> until <b className="text-slate-800">{info.endDate}</b> ({info.days} days).
              Explore everything — {tenant?.business_type === "restaurant" ? "QR ordering, kitchen, POS, reports" : "bookings, POS, reports"} &amp; more. Subscribe anytime to keep it running without interruption 💜</>
          ) : info.days >= 0 ? (
            <>Your free trial ends on <b className="text-slate-800">{info.endDate}</b>{info.days > 0 ? <> — just <b>{info.days} day{info.days === 1 ? "" : "s"}</b> to go</> : <> — <b>today</b></>}.
              We&apos;d love to keep serving your {tenant?.business_type === "restaurant" ? "restaurant" : "salon"}! Kindly choose a subscription before then so everything continues without interruption 💜</>
          ) : (
            <>Your free trial ended on <b className="text-slate-800">{info.endDate}</b>. We&apos;d love to have you continue with us —
              kindly choose a subscription to keep your {tenant?.business_type === "restaurant" ? "restaurant" : "salon"} running smoothly 💜</>
          )}
        </p>
        <div className="flex gap-3 mt-6">
          <button
            data-testid="trial-reminder-ok-btn"
            onClick={() => setInfo(null)}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition"
          >OK</button>
          <button
            data-testid="trial-reminder-pay-btn"
            onClick={() => { setInfo(null); nav("/settings#subscription"); }}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 text-white text-sm font-semibold hover:from-amber-600 hover:to-rose-600 transition inline-flex items-center justify-center gap-2"
          ><CreditCard className="w-4 h-4" /> Pay &amp; Activate</button>
        </div>
        {info.paid && info.days < 0 && (
          <button
            data-testid="trial-reminder-grace-btn"
            onClick={async () => {
              try {
                const { data } = await api.post("/billing/grace-request");
                toast.success(data.already_requested
                  ? "Already requested — the Miracurl team is reviewing it 💜"
                  : "Grace request sent to the Miracurl team ✦ We'll get back to you soon");
              } catch { toast.error("Couldn't send the request — please try again"); }
              setInfo(null);
            }}
            className="mt-3 w-full py-2.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-700 text-sm font-semibold hover:bg-amber-100 transition inline-flex items-center justify-center gap-2"
          ><HeartHandshake className="w-4 h-4" /> Request Grace from Miracurl Team</button>
        )}
        </div>
      </div>
    </div>
  );
};

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

function FounderOfferPopup({ info, onClose, onPay }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" data-testid="founder-offer-popup">
      <div className="w-full max-w-md rounded-3xl overflow-hidden shadow-[0_30px_80px_-20px_rgba(212,175,55,0.45)] trial-pop-in bg-[#15151b] text-white border border-[#d4af37]/40">
        <div className="relative px-7 pt-8 pb-6 text-center">
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 15% 10%, #d4af37 0, transparent 45%), radial-gradient(circle at 85% 90%, #7a2d4e 0, transparent 50%)" }} />
          <div className="relative">
            <div className="inline-flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-[#d4af37] font-semibold border border-[#d4af37]/50 rounded-full px-3 py-1"><Crown className="w-3 h-3" /> Founding member</div>
            <h3 className="font-playfair text-3xl mt-4 leading-tight">A thank-you from Bablu ✦</h3>
            <p className="text-sm text-white/70 mt-3 leading-relaxed" data-testid="founder-offer-message">
              Your 6 free months end on <b className="text-white">{info.endDate}</b>{info.days > 0 ? <> — <b className="text-white">{info.days} day{info.days === 1 ? "" : "s"}</b> to go</> : null}.
              You were one of the first salons to trust Miracurl, so your first paid year comes with a founding-member gift:
            </p>
            <div className="mt-5 rounded-2xl bg-white/5 border border-[#d4af37]/40 px-5 py-4">
              <div className="text-[10px] tracking-[0.25em] uppercase text-white/50">{info.pct}% off · already in your account</div>
              <div className="font-playfair text-4xl text-[#d4af37] mt-1" data-testid="founder-offer-credit">{info.credit ? `${inr(info.credit)} credit` : `${info.pct}% off`}</div>
              <div className="text-xs text-white/60 mt-1">applies automatically at checkout · no coupon needed</div>
            </div>
          </div>
        </div>
        <div className="px-7 pb-7 flex gap-3">
          <button onClick={onClose} data-testid="founder-offer-later-btn"
            className="flex-1 py-3 rounded-full border border-white/15 text-white/70 text-sm font-medium hover:bg-white/5 transition">Remind me tomorrow</button>
          <button onClick={onPay} data-testid="founder-offer-pay-btn"
            className="flex-1 py-3 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] text-sm font-bold hover:brightness-110 transition inline-flex items-center justify-center gap-2 shadow-[0_8px_24px_-8px_rgba(212,175,55,0.7)]">
            <CreditCard className="w-4 h-4" /> Continue with Miracurl</button>
        </div>
      </div>
    </div>
  );
}

export default TrialReminder;
