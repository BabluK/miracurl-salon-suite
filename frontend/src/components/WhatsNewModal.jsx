import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Sparkles, X, Send } from "lucide-react";

const SEEN_KEY = "mira_whats_new_build";

export default function WhatsNewModal() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const { tenant } = useAuth();

  // Give the one-time Welcome Congrats popup the stage — What's New waits for the next visit.
  const congratsPending = !!(tenant?.id
    && (tenant.signup_offer === "newbiz" || tenant.referred_by_tenant_id)
    && !localStorage.getItem(`miracurl_congrats_seen_${tenant.id}`)
    && tenant.created_at && Date.now() - new Date(tenant.created_at).getTime() < 45 * 86400000);

  useEffect(() => {
    if (congratsPending) return;
    let cancelled = false;
    const show = ({ data }) => {
      if (cancelled || !data?.build || !data.highlights?.length) return;
      if (localStorage.getItem(SEEN_KEY) === data.build) return;
      setData(data);
      setTimeout(() => { if (!cancelled) setOpen(true); }, 1200);
    };
    // one retry — tenant context can attach a moment after login
    api.get("/whats-new").then(show).catch(() => {
      setTimeout(() => { if (!cancelled) api.get("/whats-new").then(show).catch(() => {}); }, 3000);
    });
    return () => { cancelled = true; };
  }, [congratsPending]);

  if (!open || !data) return null;

  const dismiss = () => {
    localStorage.setItem(SEEN_KEY, data.build);
    setOpen(false);
  };

  const shareWA = () => {
    const text = `✨ New on Miracurl (${data.date}):\n\n${data.highlights.map(h => `✦ ${h}`).join("\n")}\n\nLog in to try them → ${window.location.origin}/login`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" data-testid="whats-new-modal">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={dismiss} aria-hidden="true" />
      <div className="relative w-full max-w-md bg-[#111013] border border-gold/30 rounded-2xl overflow-hidden shadow-2xl animate-fade-up">
        <div className="relative bg-gradient-to-br from-gold/25 via-blush/10 to-transparent px-6 pt-6 pb-5">
          <div className="absolute -top-10 -right-10 w-36 h-36 bg-gold/20 rounded-full blur-3xl" />
          <button
            onClick={dismiss}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-black/30 text-white/60 hover:text-white transition"
            data-testid="whats-new-close-btn"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gold/20 border border-gold/40 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-gold" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">Fresh update · {data.date}</div>
              <div className="font-playfair text-2xl text-white leading-tight">What's New ✨</div>
            </div>
          </div>
        </div>
        <div className="px-6 py-5 max-h-[45vh] overflow-y-auto" data-testid="whats-new-list">
          <ul className="space-y-3">
            {data.highlights.map((h, i) => (
              <li key={i} className="flex gap-3 text-sm text-white/80 leading-relaxed">
                <span className="text-gold flex-shrink-0 mt-0.5">✦</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="px-6 pb-6 pt-2 flex flex-col sm:flex-row gap-2">
          <button
            onClick={shareWA}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-[#25D366]/15 border border-[#25D366]/40 text-[#4be588] text-sm font-medium hover:bg-[#25D366]/25 transition"
            data-testid="whats-new-share-wa-btn"
          >
            <Send className="w-4 h-4" /> Share on WhatsApp
          </button>
          <button
            onClick={dismiss}
            className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-md bg-gradient-to-r from-gold to-blush text-bg-base font-semibold text-sm hover:opacity-90 transition"
            data-testid="whats-new-got-it-btn"
          >
            Got it ✦
          </button>
        </div>
      </div>
    </div>
  );
}
