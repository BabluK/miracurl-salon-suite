import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Scissors, Star, Check, IndianRupee, Heart, Copy, Share2 } from "lucide-react";
import { toast, Toaster } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const PUBLIC = axios.create({ baseURL: `${BACKEND_URL}/api/public` });

export default function ReviewPublic() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await PUBLIC.get(`/review-info/${token}`);
        setInfo(data);
      } catch (e) {
        setError(e.response?.data?.detail || "Invalid review link");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function submit() {
    if (rating === 0) { toast.error("Please tap a star to rate"); return; }
    setBusy(true);
    try {
      const { data } = await PUBLIC.post(`/review/${token}`, { rating, comment: comment.trim() || null });
      setSubmitted(data);
      toast.success("Thank you for your feedback!");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't submit");
    } finally { setBusy(false); }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-bg-base text-gold font-playfair text-2xl animate-pulse">Miracurl</div>;
  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base p-6">
      <div className="card-luxe max-w-md text-center">
        <h2 className="font-playfair text-2xl text-red-400">Link not found</h2>
        <p className="text-ink-secondary text-sm mt-2">{error}</p>
        <a href="/book" className="btn-gold inline-block mt-6">Book a Visit</a>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg-base text-ink-primary flex flex-col" data-testid="review-page">
      <Toaster theme="dark" position="top-center" toastOptions={{ style: { background: '#121212', color: '#fff', border: '1px solid rgba(212,175,55,0.3)' } }} />

      <header className="border-b border-white/5 py-4">
        <div className="max-w-2xl mx-auto px-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gold flex items-center justify-center shadow-gold-glow">
            <Scissors className="w-5 h-5 text-bg-base" />
          </div>
          <div>
            <div className="font-playfair text-xl">Miracurl</div>
            <div className="text-[10px] tracking-[0.25em] uppercase text-gold">Rate Your Visit</div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        {!submitted ? (
          <div className="card-luxe max-w-xl w-full">
            <div className="text-center">
              <Heart className="w-10 h-10 text-gold mx-auto mb-3" />
              <h2 className="font-playfair text-3xl">Hey {info.customer_name.split(" ")[0]} ✦</h2>
              <p className="text-ink-secondary text-sm mt-2">
                How was your <span className="text-gold">{info.service_names.join(", ")}</span>
                {info.staff_name && <> with <span className="text-gold">{info.staff_name}</span></>}?
              </p>
            </div>

            {info.already_submitted ? (
              <div className="mt-8 text-center">
                <div className="flex items-center justify-center gap-1 mb-3">
                  {[1, 2, 3, 4, 5].map(n => (
                    <Star key={n} className={`w-7 h-7 ${n <= info.existing_rating ? "fill-gold text-gold" : "text-white/20"}`} />
                  ))}
                </div>
                <p className="text-ink-secondary">Thanks — you&apos;ve already shared {info.existing_rating}★ for this visit.</p>
                <a href="/book" className="btn-gold inline-block mt-6">Book Another Visit</a>
              </div>
            ) : (
              <>
                <div className="mt-8 flex items-center justify-center gap-2" data-testid="review-stars">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      data-testid={`review-star-${n}`}
                      onMouseEnter={() => setHovered(n)}
                      onMouseLeave={() => setHovered(0)}
                      onClick={() => setRating(n)}
                      className="p-1 transition-transform hover:scale-110"
                    >
                      <Star
                        className={`w-12 h-12 transition-colors ${
                          (hovered || rating) >= n ? "fill-gold text-gold drop-shadow-[0_0_8px_rgba(212,175,55,0.5)]" : "text-white/15"
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <p className="text-center text-xs text-ink-muted mt-3 h-4">
                  {rating > 0 && {1:"Sorry to hear that 😔",2:"We'll do better",3:"Thanks for the feedback",4:"So glad you enjoyed it",5:"You made our day! ✦"}[rating]}
                </p>

                <div className="mt-6">
                  <label className="label-luxe block mb-2">Tell us more (optional)</label>
                  <textarea
                    data-testid="review-comment-input"
                    rows="4"
                    className="input-luxe"
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder={rating >= 4 ? "What did you love most about your visit?" : "How can we improve?"}
                    maxLength={600}
                  />
                  <div className="text-[10px] text-ink-muted text-right mt-1">{comment.length}/600</div>
                </div>

                {rating >= 4 && (
                  <div className="mt-4 p-3 rounded-md bg-gold/5 border border-gold/20 text-xs text-ink-secondary flex items-center gap-2">
                    <IndianRupee className="w-3 h-3 text-gold" /> Submit a 4★ or 5★ review and we&apos;ll add ₹50 credit to your account, auto-applied on your next visit.
                  </div>
                )}

                <button
                  data-testid="review-submit-btn"
                  onClick={submit}
                  disabled={busy || rating === 0}
                  className="btn-gold w-full mt-6 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busy ? "Submitting..." : "Submit Review"}
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="card-luxe max-w-xl w-full text-center" data-testid="review-success">
            <div className="w-20 h-20 mx-auto rounded-full bg-gold flex items-center justify-center shadow-gold-glow mb-6">
              <Check className="w-10 h-10 text-bg-base" />
            </div>
            <h2 className="font-playfair text-3xl">Thank you ✦</h2>
            <div className="flex items-center justify-center gap-1 mt-4">
              {[1, 2, 3, 4, 5].map(n => (
                <Star key={n} className={`w-6 h-6 ${n <= submitted.review.rating ? "fill-gold text-gold" : "text-white/20"}`} />
              ))}
            </div>
            <p className="text-ink-secondary mt-4">Your feedback helps us serve you better.</p>

            {submitted.reward && (
              <div className="card-luxe mt-6 bg-gradient-to-br from-gold/10 via-bg-surface to-blush/5 border-gold/30 text-left" data-testid="review-reward">
                <div className="flex items-center gap-3 mb-3">
                  <IndianRupee className="w-6 h-6 text-gold" />
                  <h3 className="font-playfair text-xl">₹{submitted.reward.credit} credit added!</h3>
                </div>
                <p className="text-xs text-ink-secondary mb-3">Your reward is auto-applied to your next bill. You can also share your coupon with a friend.</p>
                <div className="bg-bg-base/60 border border-white/10 rounded-md p-3 flex items-center gap-3">
                  <div className="flex-1">
                    <div className="label-luxe">Coupon Code</div>
                    <div className="font-playfair text-xl text-gold tracking-widest mt-1">{submitted.reward.code}</div>
                  </div>
                  <button
                    data-testid="copy-reward-code-btn"
                    onClick={async () => {
                      try { await navigator.clipboard.writeText(submitted.reward.code); toast.success("Code copied!"); }
                      catch { toast.error("Copy not available"); }
                    }}
                    className="btn-ghost text-xs px-3 py-2 flex items-center gap-1"
                  ><Copy className="w-3 h-3" /> Copy</button>
                </div>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Just had a ${submitted.review.rating}★ experience at Miracurl ✦ Try them! Use code ${submitted.reward.code} for ₹50 off. Book: ${window.location.origin}/book`)}`}
                  target="_blank" rel="noreferrer"
                  className="btn-gold w-full mt-3 flex items-center justify-center gap-2 text-xs"
                  data-testid="review-share-whatsapp"
                ><Share2 className="w-3 h-3" /> Share with a Friend on WhatsApp</a>
              </div>
            )}

            <a href="/book" className="btn-ghost inline-block mt-6">Book another visit</a>
          </div>
        )}
      </main>

      <footer className="border-t border-white/5 py-6 text-center text-xs text-ink-muted">
        © Miracurl · Crafted with care in Marathahalli
      </footer>
    </div>
  );
}
