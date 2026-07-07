import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Star, Send } from "lucide-react";

// Owner rates the Miracurl platform — shown on Super-Admin Partners + public Trusted Partners.
export function RateMiracurlCard() {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    api.get("/partner-review").then(r => {
      if (r.data?.rating) {
        setRating(r.data.rating);
        setText(r.data.text || "");
        setSaved(r.data);
      }
    }).catch(() => {});
  }, []);

  async function save() {
    if (!rating) { toast.error("Tap a star rating first"); return; }
    setSaving(true);
    try {
      const { data } = await api.put("/partner-review", { rating, text });
      setSaved(data);
      toast.success("Thank you! Your review is now live on the Miracurl partners page ✦");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't save your review");
    } finally { setSaving(false); }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm" data-testid="rate-miracurl-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
          <Star className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-800">Rate your Miracurl experience</h2>
          <p className="text-xs text-slate-500 mt-1">
            Your rating and review appear on Miracurl's public "Trusted Partners" page — helping other salons discover the platform.
          </p>
        </div>
        {saved && (
          <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold" data-testid="review-live-badge">
            Live on partners page
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 mt-5" data-testid="rating-stars">
        {[1, 2, 3, 4, 5].map(s => (
          <button key={s} data-testid={`rate-star-${s}`}
            onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(0)}
            onClick={() => setRating(s)} className="p-0.5 transition-transform hover:scale-110">
            <Star className={`w-7 h-7 ${(hover || rating) >= s ? "text-amber-400 fill-amber-400" : "text-slate-300"}`} />
          </button>
        ))}
        {rating > 0 && <span className="text-sm font-semibold text-slate-700 ml-2">{rating}/5</span>}
      </div>

      <textarea data-testid="review-text-input" value={text} onChange={e => setText(e.target.value)} maxLength={500} rows={3}
        placeholder="Tell other salon owners what you like about Miracurl… (optional)"
        className="mt-4 w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200 resize-none" />

      <div className="flex justify-end mt-4">
        <button data-testid="review-save-btn" onClick={save} disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm shadow-sm disabled:opacity-60">
          <Send className="w-4 h-4" /> {saving ? "Publishing…" : saved ? "Update review" : "Publish review"}
        </button>
      </div>
    </div>
  );
}
