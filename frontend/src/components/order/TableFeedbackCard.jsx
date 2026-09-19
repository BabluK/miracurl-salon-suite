import { useState } from "react";
import axios from "axios";
import { Star, Loader2, Heart } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export function TableFeedbackCard({ slug, orderId, salonName, initialRating = 0 }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(initialRating > 0 ? initialRating : 0);

  const submit = async () => {
    if (!rating) return;
    setBusy(true);
    try {
      await axios.post(`${BACKEND_URL}/api/public/table-order/${slug}/${orderId}/feedback`, { rating, comment: comment.trim() || null });
      setDone(rating);
    } catch (e) { setBusy(false); }
  };

  if (done) return (
    <div className="mt-6 rounded-3xl border border-gold/40 bg-black/50 backdrop-blur-md p-6 text-center" data-testid="table-feedback-thanks">
      <Heart className="w-8 h-8 text-gold mx-auto" />
      <p className="font-playfair text-2xl mt-2">Thank you!</p>
      <p className="text-white/70 text-sm mt-1">You rated us {done}★ — {salonName || "we"} appreciate you dining with us today. Hope to see you again soon ♡</p>
    </div>
  );

  return (
    <div className="mt-6 rounded-3xl border border-gold/40 bg-black/50 backdrop-blur-md p-6" data-testid="table-feedback-card">
      <p className="text-[11px] tracking-[0.3em] uppercase text-gold text-center">How was your meal?</p>
      <p className="font-playfair text-2xl text-center mt-1">Rate your experience</p>
      <div className="flex justify-center gap-2 mt-4" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => setRating(n)} onMouseEnter={() => setHover(n)} data-testid={`feedback-star-${n}`} aria-label={`${n} star`}
            className="p-1 active:scale-90 transition-transform">
            <Star className={`w-10 h-10 transition-colors ${(hover || rating) >= n ? "text-gold fill-gold drop-shadow-[0_0_10px_rgba(212,175,55,0.6)]" : "text-white/25"}`} />
          </button>
        ))}
      </div>
      <p className="text-center text-xs text-white/50 mt-2 h-4">{["", "We're sorry — tell us what went wrong", "Could be better", "Good", "Great!", "Loved it! ♡"][hover || rating]}</p>
      <input value={comment} onChange={e => setComment(e.target.value.slice(0, 300))} placeholder="One line about your experience (optional)"
        data-testid="feedback-comment-input"
        className="mt-3 w-full px-4 py-3 rounded-full bg-white/5 border border-white/15 text-sm placeholder:text-white/40 focus:outline-none focus:border-gold/60" />
      <button onClick={submit} disabled={!rating || busy} data-testid="feedback-submit-btn"
        className="mt-3 w-full py-3.5 rounded-full bg-gradient-to-r from-[#d4af37] to-[#f3d27a] text-black font-bold flex items-center justify-center gap-2 disabled:opacity-40">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />} Send feedback
      </button>
    </div>
  );
}
