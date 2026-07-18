import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Scissors, Star, Check, Copy } from "lucide-react";
import { toast, Toaster } from "sonner";

const PUBLIC = axios.create({ baseURL: `${process.env.REACT_APP_BACKEND_URL}/api/public` });
const TOAST_OPTIONS = { style: { background: "#121212", color: "#fff", border: "1px solid rgba(212,175,55,0.3)" } };

export default function RatePublic() {
  const { slug } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [service, setService] = useState("");
  const [text, setText] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [redirectIn, setRedirectIn] = useState(null);
  const draftSeq = useRef(0);

  useEffect(() => {
    PUBLIC.get(`/rate-info/${slug}`).then(r => setInfo(r.data))
      .catch(e => setError(e.response?.data?.detail || "Salon not found"));
  }, [slug]);

  async function fetchDraft(r, svc) {
    const seq = ++draftSeq.current;
    setDrafting(true);
    try {
      const { data } = await PUBLIC.post(`/rate-draft/${slug}`, { rating: r, service: svc });
      if (seq === draftSeq.current) setText(data.text);
    } catch { /* guest types their own */ }
    finally { if (seq === draftSeq.current) setDrafting(false); }
  }

  function pickRating(n) {
    setRating(n);
    if (n >= 4) fetchDraft(n, service);
  }

  function pickService(s) {
    const next = s === service ? "" : s;
    setService(next);
    if (rating >= 4) fetchDraft(rating, next);
  }

  async function postOnGoogle() {
    setBusy(true);
    try { await navigator.clipboard.writeText(text.trim()); } catch { /* long-press fallback */ }
    try {
      await PUBLIC.post(`/rate-submit/${slug}`, { rating, comment: text.trim(), service });
    } catch { /* still redirect — the Google review matters most */ }
    setDone(true);
    setBusy(false);
    if (info?.google_review_url) setRedirectIn(4);
    else toast.success("Thank you for your review ✦");
  }

  async function sendFeedback() {
    setBusy(true);
    try {
      await PUBLIC.post(`/rate-submit/${slug}`, { rating, comment: text.trim(), service });
      setDone(true);
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't send"); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (redirectIn === null) return;
    if (redirectIn <= 0) {
      PUBLIC.post(`/rate-track/${slug}`).catch(() => {});
      window.location.href = info.google_review_url;
      return;
    }
    const t = setTimeout(() => setRedirectIn(n => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [redirectIn, info, slug]);

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base p-6">
      <div className="card-luxe max-w-md text-center">
        <h2 className="font-playfair text-2xl text-red-400">Not found</h2>
        <p className="text-ink-secondary text-sm mt-2">{error}</p>
      </div>
    </div>
  );
  if (!info) return <div className="min-h-screen flex items-center justify-center bg-bg-base text-gold font-playfair text-2xl animate-pulse">Loading…</div>;

  return (
    <div className="min-h-screen bg-bg-base text-ink-primary flex flex-col" data-testid="rate-page">
      <Toaster theme="dark" position="top-center" toastOptions={TOAST_OPTIONS} />
      <header className="border-b border-white/5 py-4">
        <div className="max-w-2xl mx-auto px-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gold flex items-center justify-center shadow-gold-glow">
            <Scissors className="w-5 h-5 text-bg-base" />
          </div>
          <div>
            <div className="font-playfair text-xl" data-testid="rate-brand">{info.salon_name}</div>
            <div className="text-[10px] tracking-[0.25em] uppercase text-gold">Rate Your Visit</div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        {done ? (
          <div className="card-luxe max-w-xl w-full text-center" data-testid="rate-success">
            {redirectIn !== null && (
              <div className="mb-6 rounded-xl border border-gold/40 bg-gold/10 p-4 text-left" data-testid="rate-redirect-banner">
                <p className="text-sm">✅ <b>Your review is copied!</b> Taking you to Google in{" "}
                  <span className="font-playfair text-gold text-lg">{redirectIn}s</span> — just <b>paste &amp; post</b> ✦</p>
                <div className="flex gap-2 mt-3">
                  <button data-testid="rate-redirect-now-btn" onClick={() => setRedirectIn(0)} className="btn-gold flex-1 text-xs py-2">Go to Google now →</button>
                  <button data-testid="rate-redirect-cancel-btn" onClick={() => setRedirectIn(null)} className="btn-ghost text-xs px-4">Stay here</button>
                </div>
              </div>
            )}
            <div className="w-20 h-20 mx-auto rounded-full bg-gold flex items-center justify-center shadow-gold-glow mb-6">
              <Check className="w-10 h-10 text-bg-base" />
            </div>
            <h2 className="font-playfair text-3xl">Thank you ✦</h2>
            <p className="text-ink-secondary mt-3 text-sm">
              {rating >= 4 ? "Your kind words mean the world to us." :
                "Your feedback has gone directly to the salon owner — they'll make it right."}
            </p>
          </div>
        ) : (
          <div className="card-luxe max-w-xl w-full" data-testid="rate-form">
            <div className="text-center">
              <h1 className="font-playfair text-3xl">How was your visit? ✦</h1>
              <p className="text-ink-secondary text-sm mt-2">Tap a star to rate {info.salon_name}</p>
              <div className="flex items-center justify-center gap-2 mt-6">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} data-testid={`rate-star-${n}`} onClick={() => pickRating(n)}
                    onMouseEnter={() => setHovered(n)} onMouseLeave={() => setHovered(0)} className="p-1">
                    <Star className={`w-10 h-10 transition-colors ${(hovered || rating) >= n ? "fill-gold text-gold" : "text-white/20"}`} />
                  </button>
                ))}
              </div>
            </div>

            {rating > 0 && (
              <div className="mt-6 space-y-4">
                {info.services?.length > 0 && (
                  <div>
                    <div className="label-luxe mb-2">{rating >= 4 ? "What did you get done? (helps Mira write your review)" : "Which service disappointed you?"}</div>
                    <div className="flex flex-wrap gap-2">
                      {info.services.map(s => (
                        <button key={s} data-testid={`rate-service-${s}`} onClick={() => pickService(s)}
                          className={`text-xs px-3 py-1.5 rounded-full border transition ${service === s ? "border-gold bg-gold/10 text-gold" : "border-white/15 text-ink-secondary hover:border-gold/50"}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {rating >= 4 ? (
                  <>
                    <div>
                      <div className="label-luxe mb-1">✨ Mira wrote your Google review</div>
                      {drafting ? (
                        <p className="text-sm text-ink-secondary animate-pulse py-4" data-testid="rate-drafting">Mira is writing your review…</p>
                      ) : (
                        <textarea data-testid="rate-draft-text" rows="4" className="input-luxe text-sm w-full" value={text}
                          onChange={e => setText(e.target.value)} maxLength={600} placeholder="Mira's review appears here — or write your own" />
                      )}
                      <p className="text-[10px] text-ink-muted mt-1">Edit it however you like — it&apos;s your review.</p>
                    </div>
                    <button data-testid="rate-post-google-btn" onClick={postOnGoogle} disabled={busy || drafting || !text.trim()}
                      className="btn-gold w-full flex items-center justify-center gap-2 text-sm disabled:opacity-50">
                      <Copy className="w-3.5 h-3.5" /> {busy ? "One moment…" : "Copy & Post on Google ✦"}
                    </button>
                  </>
                ) : (
                  <>
                    <textarea data-testid="rate-feedback-text" rows="4" className="input-luxe text-sm w-full" value={text}
                      onChange={e => setText(e.target.value)} maxLength={800}
                      placeholder="Tell us what went wrong — this goes privately to the owner" />
                    <button data-testid="rate-send-feedback-btn" onClick={sendFeedback} disabled={busy}
                      className="btn-gold w-full text-sm disabled:opacity-50">
                      {busy ? "Sending…" : "Send privately to the owner"}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </main>
      <footer className="border-t border-white/5 py-6 text-center text-xs text-ink-muted">© {info.salon_name}</footer>
    </div>
  );
}
