// Polite once-a-day trial expiry reminder — shown during the last 7 days of trial.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { Sparkles, CreditCard } from "lucide-react";

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
      if (paid && days > 7) return; // paid salons: only warn in the last week / after expiry
      const key = !paid && days > 7
        ? `trial_welcome_${tenant.id || tenant.slug}`
        : `${paid ? "renewal" : "trial"}_popup_${new Date().toISOString().slice(0, 10)}`;
      try {
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, "1");
      } catch { /* private mode */ }
      setInfo({ days, paid, endDate: end.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) });
    };
    if (isTrial) {
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
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="trial-reminder-popup">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-7 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center text-white mb-4">
          <Sparkles className="w-7 h-7" />
        </div>
        <h3 className="font-playfair text-2xl text-slate-800">{info.paid ? (info.days >= 0 ? "Renewal reminder ✦" : "Grace period active ✦") : info.days > 7 ? "Welcome to Miracurl ✦" : "A gentle reminder ✦"}</h3>
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
            <>Your salon is all set! You're on a <b>free trial</b> until <b className="text-slate-800">{info.endDate}</b> ({info.days} days).
              Explore everything — bookings, POS, reports & more. Subscribe anytime to keep it running without interruption 💜</>
          ) : info.days >= 0 ? (
            <>Your free trial ends on <b className="text-slate-800">{info.endDate}</b>{info.days > 0 ? <> — just <b>{info.days} day{info.days === 1 ? "" : "s"}</b> to go</> : <> — <b>today</b></>}.
              We'd love to keep serving your salon! Kindly choose a subscription before then so everything continues without interruption 💜</>
          ) : (
            <>Your free trial ended on <b className="text-slate-800">{info.endDate}</b>. We'd love to have you continue with us —
              kindly choose a subscription to keep your salon running smoothly 💜</>
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
            onClick={() => { setInfo(null); nav("/settings"); }}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 text-white text-sm font-semibold hover:from-amber-600 hover:to-rose-600 transition inline-flex items-center justify-center gap-2"
          ><CreditCard className="w-4 h-4" /> Pay &amp; Activate</button>
        </div>
      </div>
    </div>
  );
};

export default TrialReminder;
