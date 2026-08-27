import { useState } from "react";
import pinApi from "@/lib/ownerPin";
import { toast } from "sonner";
import { Gem, Lock, Loader2, IndianRupee, Share2 } from "lucide-react";

export function CircleBonusCard({ slug }) {
  const [wallet, setWallet] = useState(null);
  const [busy, setBusy] = useState(false);

  const shareLink = async () => {
    const link = `${window.location.origin}/success-stories?ref=${slug}`;
    const text = `I run my salon on Miracurl Salon Suite — AI offers, 24/7 online bookings, billing & payroll in one app. See how salons grow with it: ${link}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Miracurl Salon Suite", text, url: link }); return; }
      catch { /* dismissed — fall through to WhatsApp */ }
    }
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const unlock = async () => {
    setBusy(true);
    try {
      const { data } = await pinApi.get("/circle-bonus/wallet");
      setWallet(data);
    } catch (e) {
      if (e?.message !== "PIN_CANCELLED") toast.error(e.response?.data?.detail || "Couldn't unlock — check your PIN");
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-amber-200/30 bg-gradient-to-br from-amber-50 to-rose-50 p-5" data-testid="circle-bonus-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <Gem className="w-4 h-4 text-amber-600" /> Miracurl Circle ✦ referral bonus
        </div>
        <div className="flex items-center gap-2">
          <button onClick={shareLink} data-testid="circle-bonus-share-btn"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500">
            <Share2 className="w-3.5 h-3.5" /> Share & earn ₹1,000
          </button>
          {!wallet && (
            <button onClick={unlock} disabled={busy} data-testid="circle-bonus-unlock-btn"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-900 text-amber-50 text-xs font-semibold hover:bg-amber-800 disabled:opacity-50">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />} Unlock with Owner PIN
            </button>
          )}
        </div>
      </div>
      {!wallet ? (
        <p className="text-xs text-amber-800/70 mt-2">
          Earn <b>₹1,000</b> every time a business joins Miracurl through your booking page. Balance is PIN-protected.
        </p>
      ) : (
        <div className="mt-3">
          <div className="flex items-baseline gap-1" data-testid="circle-bonus-balance">
            <IndianRupee className="w-5 h-5 text-amber-700" />
            <span className="text-3xl font-bold text-amber-900">{wallet.balance.toLocaleString("en-IN")}</span>
            <span className="text-xs text-amber-800/60 ml-2">earned from referrals</span>
          </div>
          {wallet.history.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              {wallet.history.slice(0, 5).map((h, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-amber-900/80 bg-white/60 rounded-lg px-3 py-2">
                  <span>✦ {h.lead_name}{h.lead_salon ? ` — ${h.lead_salon}` : ""} joined Miracurl</span>
                  <span className="font-semibold">+₹{Number(h.amount).toLocaleString("en-IN")}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-amber-800/60 mt-2">No referrals converted yet — share your booking page, guests who own salons will find the ✦ link in the footer!</p>
          )}
        </div>
      )}
    </div>
  );
}
