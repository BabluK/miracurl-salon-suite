import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Gift, Copy, Share2, Users, IndianRupee, CheckCircle2, Sparkles } from "lucide-react";
import { shareText, openWhatsApp } from "@/lib/share";
import { Skeleton } from "@/components/ui/skeleton";

export default function ReferEarn() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/settings/affiliate");
        setData(data);
      } catch (e) {
        toast.error(formatApiError(e.response?.data?.detail) || "Failed to load referral data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const referralUrl = data ? `${window.location.origin}/?ref=${data.slug}` : "";
  const shareMessage = data
    ? `Hey! I run my salon on Miracurl — bookings, billing, and rewards all in one place.\n\nStart a free 7-day trial with my invite:\n${referralUrl}\n\nYou'll thank me later ✂️`
    : "";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      toast.success("Referral link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — please copy manually");
    }
  }

  async function share() {
    await shareText({
      title: "Try Miracurl for your salon",
      text: shareMessage,
    });
  }

  function whatsapp() {
    openWhatsApp(shareMessage);
  }

  if (loading) {
    return (
      <div className="space-y-6" data-testid="refer-loading">
        <Skeleton className="h-32 w-full bg-white/5" />
        <Skeleton className="h-24 w-full bg-white/5" />
      </div>
    );
  }

  if (!data) return null;

  const reward = Math.round(data.reward_per_signup || 1000);
  const credits = Math.round(data.credits || 0);
  const count = data.count || 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6" data-testid="refer-earn-page">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gold/20 via-blush/10 to-transparent border border-gold/30 p-6 sm:p-8">
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-gold/20 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-full bg-gold/20 flex items-center justify-center">
              <Gift className="w-5 h-5 text-gold" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">Refer & Earn</div>
              <div className="font-playfair text-2xl sm:text-3xl leading-tight">Get ₹{reward} for every salon you invite</div>
            </div>
          </div>
          <p className="text-white/70 text-sm sm:text-base max-w-xl">
            Share your invite link with other salon owners. When they sign up and complete their trial,
            we credit <span className="text-gold font-semibold">₹{reward}</span> to your subscription — automatically applied on your next renewal.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          label="Credits earned"
          value={`₹${credits.toLocaleString("en-IN")}`}
          icon={IndianRupee}
          testid="refer-credits"
        />
        <StatCard
          label="Salons referred"
          value={count}
          icon={Users}
          testid="refer-count"
        />
        <StatCard
          label="Reward per signup"
          value={`₹${reward}`}
          icon={Sparkles}
          testid="refer-reward"
        />
      </div>

      {/* Share link */}
      <div className="rounded-2xl bg-[#0F0F0F] border border-white/5 p-5 sm:p-6 space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-white/40 mb-2">Your unique invite link</div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              readOnly
              value={referralUrl}
              onFocus={(e) => e.target.select()}
              className="flex-1 bg-black/40 border border-white/10 rounded-md px-3 py-2.5 text-sm text-white/90 font-mono truncate"
              data-testid="refer-link-input"
            />
            <button
              onClick={copyLink}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md text-sm transition"
              data-testid="refer-copy-btn"
            >
              {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onClick={whatsapp}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-[#25D366] hover:bg-[#20b859] text-white font-medium rounded-md text-sm transition"
            data-testid="refer-whatsapp-btn"
          >
            <Share2 className="w-4 h-4" />
            Share on WhatsApp
          </button>
          <button
            onClick={share}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-gold to-blush text-bg-base font-semibold rounded-md text-sm transition hover:opacity-90"
            data-testid="refer-share-btn"
          >
            <Share2 className="w-4 h-4" />
            Share…
          </button>
        </div>
      </div>

      {/* Referrals list */}
      <div className="rounded-2xl bg-[#0F0F0F] border border-white/5 p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="font-playfair text-lg">Your referrals</div>
          <div className="text-xs text-white/40">{count} salon{count === 1 ? "" : "s"}</div>
        </div>
        {(!data.referrals || data.referrals.length === 0) ? (
          <div className="text-center py-10 text-white/50 text-sm" data-testid="refer-empty">
            No referrals yet — share your link to start earning.
          </div>
        ) : (
          <div className="divide-y divide-white/5" data-testid="refer-list">
            {data.referrals.map((r, i) => (
              <div key={r.id || i} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm text-white/90 truncate">{r.referred_salon_name || r.referred_slug}</div>
                  <div className="text-[11px] text-white/40 mt-0.5">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : ""}
                  </div>
                </div>
                {r.status === "pending" ? (
                  <div className="text-[11px] text-white/50 border border-white/15 rounded-full px-2.5 py-1 whitespace-nowrap" title="Credited after their first subscription payment">⏳ Pending first payment</div>
                ) : (
                  <div className="text-xs text-gold font-semibold whitespace-nowrap">+₹{reward} credited</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="rounded-2xl bg-[#0F0F0F] border border-white/5 p-5 sm:p-6">
        <div className="font-playfair text-lg mb-4">How it works</div>
        <ol className="space-y-3 text-sm text-white/70">
          {[
            "Share your invite link with any salon owner via WhatsApp or SMS.",
            "They sign up for a free 7-day trial and set up their salon.",
            `You get ₹${reward} credited to your Miracurl subscription — automatically applied on your next renewal.`,
          ].map((step, i) => (
            <li key={step} className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-gold/20 border border-gold/40 flex items-center justify-center text-gold text-xs font-semibold flex-shrink-0">
                {i + 1}
              </div>
              <div>{step}</div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, testid }) {
  return (
    <div className="rounded-xl bg-[#0F0F0F] border border-white/5 p-4" data-testid={testid}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/40 mb-2">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="font-playfair text-2xl sm:text-3xl text-gold">{value}</div>
    </div>
  );
}
