import { useState } from "react";
import pinApi from "@/lib/ownerPin";
import { toast } from "sonner";
import { Gift, Copy, Share2, Wallet, Lock, Loader2 } from "lucide-react";

function AffiliateLinkRow({ slug }) {
  const link = `${window.location.origin}/?ref=${slug}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied — share it anywhere");
    } catch {
      toast.error("Couldn't copy. Long-press the link to copy manually.");
    }
  };
  const share = async () => {
    const text = `Move your salon online with Miracurl — 7-day free trial, no card needed. Sign up using my link: ${link}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Miracurl Salon Suite", text, url: link });
        return;
      } catch {
        // dismissed / unsupported — fall through to WhatsApp
      }
    }
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };
  return (
    <div className="mt-1 flex items-center gap-2">
      <input
        readOnly
        value={link}
        data-testid="settings-affiliate-link"
        className="flex-1 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-sm font-mono"
        onFocus={e => e.target.select()}
      />
      <button type="button" onClick={copy} data-testid="settings-affiliate-copy"
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50">
        <Copy className="w-4 h-4" /> Copy
      </button>
      <button type="button" onClick={share} data-testid="settings-affiliate-share"
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white text-sm font-medium hover:from-rose-600 hover:to-fuchsia-700">
        <Share2 className="w-4 h-4" /> Share
      </button>
    </div>
  );
}

export function AffiliateCard() {
  const [affiliate, setAffiliate] = useState(null);
  const [busy, setBusy] = useState(false);

  const unlock = async () => {
    setBusy(true);
    try {
      const { data } = await pinApi.get("/settings/affiliate");
      setAffiliate(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't unlock — check your PIN");
    } finally { setBusy(false); }
  };

  if (!affiliate) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm" data-testid="settings-affiliate-card">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Refer & Earn a Free Month</h2>
              <p className="text-xs text-slate-500 mt-1">Your referral rewards and link are PIN-protected — unlock to view and share.</p>
            </div>
          </div>
          <button onClick={unlock} disabled={busy} data-testid="settings-affiliate-unlock"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-semibold hover:bg-slate-700 disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />} Unlock with Owner PIN
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm" data-testid="settings-affiliate-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center">
          <Gift className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-800">Refer & Earn a Free Month</h2>
          <p className="text-xs text-slate-500 mt-1">
            Share your unique link below. Every salon that signs up using it gets a 7-day free trial — and when they make their first payment, you get
            <b className="text-rose-600"> 1 FREE MONTH</b> added to your subscription automatically.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
        <div className="md:col-span-1 bg-gradient-to-br from-rose-50 to-fuchsia-50 border border-rose-100 rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-rose-700 font-semibold">
            <Wallet className="w-3.5 h-3.5" /> Free months earned
          </div>
          <div className="text-3xl font-bold text-slate-900 mt-2" data-testid="settings-affiliate-balance">
            {affiliate.months_earned || 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">{affiliate.count} salon{affiliate.count === 1 ? "" : "s"} referred so far</div>
          {(affiliate.free_months_banked || 0) > 0 && (
            <div className="text-[11px] text-emerald-600 mt-1" data-testid="settings-affiliate-banked">🎁 {affiliate.free_months_banked} month{affiliate.free_months_banked === 1 ? "" : "s"} banked — auto-applies on your next plan purchase</div>
          )}
          {Number(affiliate.credits || 0) > 0 && (
            <div className="text-[11px] text-slate-400 mt-1">+ ₹{Number(affiliate.credits).toLocaleString("en-IN")} legacy credit balance</div>
          )}
        </div>

        <div className="md:col-span-2">
          <label className="text-xs text-slate-500 font-medium">Your referral link</label>
          <AffiliateLinkRow slug={affiliate.slug} />
          <p className="text-[11px] text-slate-400 mt-2">Tip: post this in salon-owner WhatsApp groups, on your Instagram bio, or DM friends who run salons.</p>
        </div>
      </div>

      {affiliate.referrals && affiliate.referrals.length > 0 && (
        <div className="mt-6">
          <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">Recent signups via your link</div>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Salon</th>
                  <th className="text-left px-3 py-2 font-medium">Signed up</th>
                  <th className="text-right px-3 py-2 font-medium">Reward</th>
                </tr>
              </thead>
              <tbody>
                {affiliate.referrals.slice(0, 8).map(r => (
                  <tr key={r.id} className="border-t border-slate-100" data-testid={`affiliate-row-${r.referred_slug}`}>
                    <td className="px-3 py-2 text-slate-800">
                      {r.referred_salon_name}
                      <div className="text-[11px] text-slate-500">{r.referred_slug}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-600 text-xs">
                      {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      {r.status === "credited"
                        ? <span className="text-emerald-600 font-semibold">✅ 1 free month</span>
                        : <span className="text-amber-600">⏳ pending first payment</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
