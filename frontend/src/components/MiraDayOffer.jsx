import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Sparkles, Download, Send, RefreshCw, CheckCircle2 } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

export function MiraDayOffer() {
  const [offer, setOffer] = useState(null);
  const [busy, setBusy] = useState(""); // "" | suggest | another | accept

  useEffect(() => {
    api.get("/day-offers/today").then(r => setOffer(r.data.offer)).catch(() => {});
  }, []);

  const run = async (action) => {
    setBusy(action);
    try {
      const path = action === "accept" ? "/day-offers/accept"
        : action === "another" ? "/day-offers/suggest-another" : "/day-offers/suggest";
      const payload = action === "accept" ? { offer_id: offer.id, template: "dark_glam" } : {};
      const { data } = await api.post(path, payload);
      setOffer(data.offer);
      if (action === "accept") toast.success("Offer locked for today — poster ready! 🎉");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Mira couldn't do that — try again");
    } finally { setBusy(""); }
  };

  const shareWA = () => {
    const text = `${offer.whatsapp_caption || offer.offer_text}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const dayName = new Date().toLocaleDateString("en-IN", { weekday: "long" });
  const accepted = offer?.status === "accepted";

  return (
    <div className="bg-gradient-to-br from-[#17141c] to-[#26202b] rounded-2xl border border-amber-300/30 p-5 text-white shadow-sm" data-testid="mira-day-offer-card">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-300/15 border border-amber-300/40 flex items-center justify-center">
            <Sparkles className="w-4.5 h-4.5 text-amber-300" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">Mira · Offer of the day</div>
            <div className="font-playfair text-lg leading-tight">It's {dayName} — {["Friday","Saturday","Sunday"].includes(dayName) ? "busy day, let's upsell ✦" : "let's fill those chairs ✦"}</div>
          </div>
        </div>
        {!offer && (
          <button onClick={() => run("suggest")} disabled={!!busy} data-testid="day-offer-ask-btn"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-amber-300 to-rose-200 text-[#17141c] text-sm font-semibold hover:opacity-90 disabled:opacity-50">
            {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {busy ? "Mira is thinking…" : "Ask Mira for today's offer"}
          </button>
        )}
      </div>

      {offer && (
        <div className="mt-4 bg-black/25 border border-white/10 rounded-xl p-4" data-testid="day-offer-suggestion">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="font-playfair text-xl text-amber-200">{offer.title}</div>
              <div className="text-sm text-white/85 mt-0.5">{offer.offer_text}</div>
            </div>
            {offer.discount_pct > 0 && (
              <div className="px-3 py-1.5 rounded-full bg-rose-500/20 border border-rose-400/40 text-rose-200 text-sm font-bold whitespace-nowrap">{offer.discount_pct}% OFF</div>
            )}
          </div>
          {offer.services?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {offer.services.map((s, i) => (
                <div key={i} className="text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                  {s.name} · <span className="line-through text-white/40">₹{Math.round(s.original_price)}</span>{" "}
                  <span className="text-amber-200 font-semibold">₹{Math.round(s.offer_price)}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-white/55 mt-3 leading-relaxed"><span className="text-amber-300">Why:</span> {offer.reasoning}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {accepted ? (
              <>
                <div className="inline-flex items-center gap-1.5 text-emerald-300 text-sm font-medium px-1">
                  <CheckCircle2 className="w-4 h-4" /> Locked for today
                </div>
                {offer.flyer_url && (
                  <a href={`${BACKEND}${offer.flyer_url}`} download target="_blank" rel="noopener noreferrer" data-testid="day-offer-download-btn"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-amber-300 to-rose-200 text-[#17141c] text-sm font-semibold hover:opacity-90">
                    <Download className="w-4 h-4" /> Download today's poster
                  </a>
                )}
                <button onClick={shareWA} data-testid="day-offer-wa-btn"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#25D366]/15 border border-[#25D366]/40 text-[#4be588] text-sm font-medium hover:bg-[#25D366]/25">
                  <Send className="w-4 h-4" /> Share caption
                </button>
              </>
            ) : (
              <>
                <button onClick={() => run("accept")} disabled={!!busy} data-testid="day-offer-accept-btn"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-amber-300 to-rose-200 text-[#17141c] text-sm font-semibold hover:opacity-90 disabled:opacity-60">
                  {busy === "accept" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {busy === "accept" ? "Creating poster (~1 min)…" : "Yes — use this offer ✦"}
                </button>
                <button onClick={() => run("another")} disabled={!!busy} data-testid="day-offer-another-btn"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/15 text-white/80 text-sm hover:bg-white/10 disabled:opacity-50">
                  <RefreshCw className={`w-4 h-4 ${busy === "another" ? "animate-spin" : ""}`} /> Suggest another
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
