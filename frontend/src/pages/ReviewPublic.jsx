import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Scissors, Star, Check, IndianRupee, Heart, Copy, Share2, ExternalLink } from "lucide-react";
import { toast, Toaster } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const PUBLIC = axios.create({ baseURL: `${BACKEND_URL}/api/public` });
const TOAST_OPTIONS = { style: { background: '#121212', color: '#fff', border: '1px solid rgba(212,175,55,0.3)' } };

export default function ReviewPublic() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [salon, setSalon] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const [error, setError] = useState("");
  const [disService, setDisService] = useState("");
  const [draft, setDraft] = useState(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [prefillBusy, setPrefillBusy] = useState(false);
  const [redirectIn, setRedirectIn] = useState(null);
  const googleUrlRef = useRef("");
  const prefillCache = useRef({});
  const autoFilled = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: info }, { data: salonData }] = await Promise.all([
          PUBLIC.get(`/review-info/${token}`),
          PUBLIC.get(`/salon`),
        ]);
        setInfo(info);
        setSalon(salonData);
      } catch (e) {
        setError(e.response?.data?.detail || "Invalid review link");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function pickRating(n) {
    setRating(n);
    if (n < 4 || (comment.trim() && !autoFilled.current)) return;
    if (prefillCache.current[n]) {
      setComment(prefillCache.current[n]);
      autoFilled.current = true;
      return;
    }
    setPrefillBusy(true);
    try {
      const { data } = await PUBLIC.post(`/review-draft/${token}`, { rating: n });
      prefillCache.current[n] = data.text;
      setComment(data.text);
      autoFilled.current = true;
    } catch { /* quota/rate-limit — guest just types their own */ }
    finally { setPrefillBusy(false); }
  }

  async function submit() {
    if (rating === 0) { toast.error("Please tap a star to rate"); return; }
    setBusy(true);
    try {
      const { data } = await PUBLIC.post(`/review/${token}`, {
        rating, comment: comment.trim() || null,
        disappointed_service: rating <= 3 ? (disService || null) : null,
      });
      setSubmitted(data);
      toast.success("Thank you for your feedback!");
      if (rating >= 4) {
        const reviewText = comment.trim();
        const gUrl = info?.google_review_url || salon?.google_review_url || "";
        if (reviewText) {
          setDraft({ text: reviewText, google_review_url: gUrl });
          // Auto-copy Mira's review + auto-redirect to Google so the guest just pastes & posts
          try { await navigator.clipboard.writeText(reviewText); } catch { /* long-press fallback below */ }
          if (gUrl) { googleUrlRef.current = gUrl; setRedirectIn(6); }
        } else {
          setDraftBusy(true);
          PUBLIC.post(`/review-draft/${token}`, { rating })
            .then(r => setDraft(r.data))
            .catch(() => {})
            .finally(() => setDraftBusy(false));
        }
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't submit");
    } finally { setBusy(false); }
  }

  async function copyAndOpenGoogle() {
    const url = draft?.google_review_url || info?.google_review_url || salon?.google_review_url;
    try { await navigator.clipboard.writeText(draft.text); toast.success("Review copied — just paste it on Google ✦"); }
    catch { toast.error("Couldn't copy — long-press the text to copy"); }
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  // Countdown → take the guest straight to the Google review box (review already copied)
  useEffect(() => {
    if (redirectIn === null) return;
    if (redirectIn <= 0) {
      if (googleUrlRef.current) window.location.href = googleUrlRef.current;
      return;
    }
    const t = setTimeout(() => setRedirectIn(n => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [redirectIn]);

  const brandName = info?.salon_name || salon?.name || "Our Salon";
  const brandLoc = info?.salon_location || salon?.location || "";

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-bg-base text-gold font-playfair text-2xl animate-pulse">Loading…</div>;
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
    <div className="min-h-screen bg-bg-base text-ink-primary flex flex-col relative" data-testid="review-page">
      <Toaster theme="dark" position="top-center" toastOptions={TOAST_OPTIONS} />
      {(() => { const bgImg = info?.hero_image || "/assets/review-bg.jpg"; return (
        <>
          <img src={bgImg} alt="" aria-hidden="true"
            className="fixed inset-0 w-full h-full object-cover opacity-60 pointer-events-none" />
          <div className="fixed inset-0 bg-gradient-to-b from-bg-base/55 via-bg-base/70 to-bg-base/90 pointer-events-none" />
        </>
      ); })()}

      <header className="relative z-10 bg-[#f7f2e5]/95 backdrop-blur border-b border-[#e6d9b8] py-3" data-testid="review-header">
        <div className="max-w-2xl mx-auto px-6 flex items-center gap-4">
          {info?.logo_url ? (
            <span className="w-16 h-16 sm:w-20 sm:h-20 rounded-full p-[3px] bg-gradient-to-br from-[#d4af37] via-[#f3e3ae] to-[#b08d3f] flex-shrink-0 shadow-[0_4px_18px_rgba(180,140,50,0.5)]" data-testid="review-salon-logo">
              <img src={info.logo_url} alt={brandName} className="w-full h-full rounded-full object-cover bg-white" />
            </span>
          ) : (
            <span className="w-14 h-14 rounded-full p-[3px] bg-gradient-to-br from-[#d4af37] via-[#f3e3ae] to-[#b08d3f] flex-shrink-0 shadow-[0_4px_18px_rgba(180,140,50,0.5)]">
              <span className="w-full h-full rounded-full bg-[#17141c] text-[#e8c37f] flex items-center justify-center font-playfair text-2xl font-bold">
                {(brandName || "M").charAt(0)}
              </span>
            </span>
          )}
          <div className="min-w-0 leading-tight">
            <div className="font-playfair text-base sm:text-xl tracking-[0.06em] text-[#8a6d1f] font-semibold truncate" data-testid="review-brand">{brandName}</div>
            <div className="text-[8px] sm:text-[10px] uppercase tracking-[0.32em] text-[#a5926a] truncate mt-0.5">
              {info?.business_type === "restaurant" ? "Fine Dining · Powered by Mira AI" : "Luxury Salon · Powered by Mira AI"}
            </div>
            <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.25em] text-[#b08d3f] mt-0.5">Rate Your Visit ✦</div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6 relative z-10">
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
                      onClick={() => pickRating(n)}
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

                {rating > 0 && rating <= 3 && (
                  <div className="mt-6 p-4 rounded-md bg-white/5 border border-white/10" data-testid="review-low-rating-block">
                    <label className="label-luxe block mb-2">Which service disappointed you?</label>
                    <select data-testid="review-disappointed-select" className="input-luxe" value={disService} onChange={e => setDisService(e.target.value)}>
                      <option value="">Choose a service (optional)</option>
                      {(info.service_names || []).map(s => <option key={s} value={s}>{s}</option>)}
                      <option value="Overall experience">Overall experience</option>
                    </select>
                    <p className="text-[10px] text-ink-muted mt-2">Your feedback goes privately to the salon owner — it is never published anywhere.</p>
                  </div>
                )}

                <div className="mt-6">
                  <label className="label-luxe block mb-2">
                    Tell us more (optional)
                    {prefillBusy && <span className="text-gold normal-case tracking-normal ml-2 animate-pulse" data-testid="review-prefill-loading">✨ Mira is drafting a review for you…</span>}
                  </label>
                  <textarea
                    data-testid="review-comment-input"
                    rows="4"
                    className="input-luxe"
                    value={comment}
                    onChange={e => { setComment(e.target.value); autoFilled.current = false; }}
                    placeholder={rating >= 4 ? "What did you love most about your visit?" : "Tell us what went wrong — the owner reads every word"}
                    maxLength={600}
                  />
                  <div className="flex items-center justify-between mt-1">
                    <div className="text-[10px] text-ink-muted">
                      {autoFilled.current && comment ? "✨ Written by Mira from your visit — edit it however you like" : ""}
                    </div>
                    <div className="text-[10px] text-ink-muted">{comment.length}/600</div>
                  </div>
                </div>

                {rating >= 4 && (
                  <div className="mt-4 p-3 rounded-md bg-gold/5 border border-gold/20 text-xs text-ink-secondary flex items-center gap-2" data-testid="review-reward-banner">
                    <IndianRupee className="w-3 h-3 text-gold" />
                    {rating === 5
                      ? <>Submit your 5★ review and we&apos;ll add <b className="text-gold">₹30 credit</b> to your account, auto-applied on your next visit.</>
                      : <>Submit your 4★ review and we&apos;ll add <b className="text-gold">₹20 credit</b> to your account — make it 5★ for ₹30!</>}
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
            {redirectIn !== null && (
              <div className="mb-6 rounded-xl border border-gold/40 bg-gold/10 p-4 text-left" data-testid="google-redirect-banner">
                <p className="text-sm text-ink-primary">
                  ✅ <b>Your review is copied!</b> Taking you to Google in{" "}
                  <span className="font-playfair text-gold text-lg">{redirectIn}s</span> — just <b>paste &amp; post</b> ✦
                </p>
                <div className="flex gap-2 mt-3">
                  <button data-testid="google-redirect-now-btn" onClick={() => setRedirectIn(0)}
                    className="btn-gold flex-1 text-xs py-2">Go to Google now →</button>
                  <button data-testid="google-redirect-cancel-btn" onClick={() => setRedirectIn(null)}
                    className="btn-ghost text-xs px-4">Stay here</button>
                </div>
              </div>
            )}
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
                  href={`https://wa.me/?text=${encodeURIComponent(`Just had a ${submitted.review.rating}★ experience at ${brandName} ✦ Try them! Use code ${submitted.reward.code} for ₹${submitted.reward.credit} off. Book: ${window.location.origin}/book`)}`}
                  target="_blank" rel="noreferrer"
                  className="btn-gold w-full mt-3 flex items-center justify-center gap-2 text-xs"
                  data-testid="review-share-whatsapp"
                ><Share2 className="w-3 h-3" /> Share with a Friend on WhatsApp</a>
              </div>
            )}

            {/* Mira-written Google review — one-tap copy & paste for 4★+ */}
            {submitted.review.rating >= 4 && (draftBusy || draft) && (
              <div className="card-luxe mt-6 text-left" data-testid="mira-review-draft">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">✨</span>
                  <h3 className="font-playfair text-xl">Mira wrote your Google review</h3>
                </div>
                {draftBusy ? (
                  <p className="text-sm text-ink-secondary animate-pulse py-4">Mira is writing a review based on your visit…</p>
                ) : (
                  <>
                    <textarea data-testid="mira-draft-text" rows="4" className="input-luxe text-sm" value={draft.text}
                      onChange={e => setDraft({ ...draft, text: e.target.value })} maxLength={600} />
                    <p className="text-[10px] text-ink-muted mt-1">Edit it if you like — it&apos;s your review.</p>
                    <button data-testid="copy-open-google-btn" onClick={copyAndOpenGoogle}
                      className="btn-gold w-full mt-3 flex items-center justify-center gap-2 text-sm">
                      <Copy className="w-3.5 h-3.5" /> Copy &amp; Open Google — just paste ✦
                    </button>
                  </>
                )}
              </div>
            )}

            {submitted.review.rating <= 3 && (
              <div className="card-luxe mt-6 text-left bg-white/5" data-testid="complaint-ack">
                <p className="text-sm text-ink-secondary">💌 Your feedback has gone <b className="text-gold">directly to the salon owner</b> — not published anywhere. They take this personally and will make it right.</p>
              </div>
            )}

            {/* Google Review CTA — most prominent for 4★+ */}
            {salon?.google_review_url && submitted.review.rating >= 4 && !draft && !draftBusy && (
              <div className="card-luxe mt-6 text-left relative overflow-hidden" data-testid="google-review-cta">
                <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-gold/5 blur-2xl pointer-events-none" />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-2">
                    <svg className="w-7 h-7" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
                      <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
                      <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
                      <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
                    </svg>
                    <div>
                      <h3 className="font-playfair text-xl">Loved your visit?</h3>
                      <p className="text-xs text-ink-secondary">Share it on Google — it helps other guests find us.</p>
                    </div>
                  </div>
                  <a
                    data-testid="google-review-link"
                    href={salon.google_review_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-gold w-full flex items-center justify-center gap-2 text-sm mt-2"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Leave a Google Review
                  </a>
                </div>
              </div>
            )}

            <a href="/book" className="btn-ghost inline-block mt-6">Book another visit</a>
          </div>
        )}
      </main>

      <footer className="border-t border-white/5 py-6 text-center text-xs text-ink-muted">
        © {brandName}{brandLoc ? ` · ${brandLoc}` : ""}
      </footer>
    </div>
  );
}
