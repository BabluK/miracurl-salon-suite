import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Star, Loader2, Heart } from "lucide-react";
import { toast, Toaster } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function FeedbackPublic() {
  const { token } = useParams();
  const API = useMemo(() => axios.create({ baseURL: `${BACKEND_URL}/api/public/feedback` }), []);
  const [info, setInfo] = useState(null);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    API.get(`/${token}`).then(({ data }) => {
      setInfo(data);
      if (data.submitted) setDone({ already: true });
    }).catch(() => setInfo({ error: true }));
  }, [API, token]);

  const submit = async () => {
    if (!rating) { toast.error("Tap the stars to rate us first ⭐"); return; }
    setBusy(true);
    try {
      const { data } = await API.post(`/${token}`, { rating, comment, name });
      setDone(data);
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't submit — try again"); }
    finally { setBusy(false); }
  };

  if (!info) return <div className="min-h-screen bg-[#080809] flex items-center justify-center"><Loader2 className="w-8 h-8 text-gold animate-spin" /></div>;
  if (info.error) return <div className="min-h-screen bg-[#080809] flex items-center justify-center text-white/60 text-sm">This feedback link is invalid or has expired.</div>;

  return (
    <div className="min-h-screen bg-[#080809] text-white flex items-center justify-center px-5" data-testid="feedback-page">
      <Toaster theme="dark" position="top-center" />
      <div className="w-full max-w-md bg-white/5 border border-gold/25 rounded-3xl p-8 text-center">
        {done ? (
          <>
            <div className="text-5xl">💛</div>
            <h1 className="font-playfair text-2xl mt-3">{done.already ? "Already received — thank you!" : "Thank you!"}</h1>
            <p className="text-sm text-white/60 mt-2">
              {done.published
                ? "Your kind words mean the world — they may be featured on miracurl-suite.com ✨"
                : "Your feedback helps us serve you better every day."}
            </p>
          </>
        ) : (
          <>
            <Heart className="w-10 h-10 text-gold mx-auto" />
            <h1 className="font-playfair text-2xl mt-3">How did we do?</h1>
            <p className="text-sm text-white/60 mt-1">
              We recently resolved your request for <b className="text-white">{info.salon_name}</b>{info.context ? ` (${info.context})` : ""}.
            </p>
            <div className="flex justify-center gap-2 mt-6" data-testid="feedback-stars">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} data-testid={`feedback-star-${n}`}
                  onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} onClick={() => setRating(n)}>
                  <Star className={`w-9 h-9 transition-colors ${(hover || rating) >= n ? "fill-gold text-gold" : "text-white/20"}`} />
                </button>
              ))}
            </div>
            <textarea rows={3} maxLength={400} value={comment} onChange={e => setComment(e.target.value)}
              placeholder="Tell us more — what did you love, what can we improve?" data-testid="feedback-comment"
              className="w-full mt-5 bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-sm placeholder:text-white/30 focus:border-gold focus:outline-none" />
            <input value={name} onChange={e => setName(e.target.value)} maxLength={80}
              placeholder="Your name (shown with your review)" data-testid="feedback-name"
              className="w-full mt-2.5 bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-sm placeholder:text-white/30 focus:border-gold focus:outline-none" />
            <button onClick={submit} disabled={busy} data-testid="feedback-submit-btn"
              className="w-full mt-5 btn-gold justify-center flex items-center gap-2 disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />} Send feedback
            </button>
          </>
        )}
      </div>
    </div>
  );
}
