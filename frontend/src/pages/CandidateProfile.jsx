import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { ShieldCheck, MapPin, Star, CalendarClock, CheckCircle2 } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { SiteHeader } from "@/components/SiteHeader";
import SalesChatWidget from "@/components/SalesChatWidget";

export default function CandidateProfile() {
  const { token } = useParams();
  const [p, setP] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/public/candidate/${token}`).then(r => setP(r.data))
      .catch(e => setErr(formatApiError(e.response?.data?.detail) || "Profile link expired or invalid"));
  }, [token]);

  const confirm = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/public/candidate/${token}/confirm-trial`);
      setP(prev => ({ ...prev, owner_confirmed: true }));
      toast.success(data.message);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Couldn't confirm"); }
    finally { setBusy(false); }
  };

  if (err) return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center p-6">
      <div className="text-center text-white/60 text-sm" data-testid="candidate-error">{err}</div>
    </div>
  );
  if (!p) return <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center text-white/40 text-sm">Loading profile…</div>;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white" data-testid="candidate-profile-page">
      <SiteHeader variant="light" />
      <SalesChatWidget />
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="flex items-center justify-end mb-8">
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Verified Candidate</div>
        </div>

        <div className="rounded-2xl bg-[#111013] border border-gold/25 p-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="font-playfair text-3xl" data-testid="candidate-name">{p.candidate_name}</h1>
              <div className="text-sm text-white/60 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{p.designation || "Salon professional"}</span>
                {p.city && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {p.city}</span>}
                {p.hq_verified && (
                  <span className="inline-flex items-center gap-1 text-emerald-400"><ShieldCheck className="w-3.5 h-3.5" /> HQ Verified</span>
                )}
              </div>
            </div>
            {p.avg_rating != null && (
              <div className="text-center px-4 py-2 rounded-xl bg-amber-400/10 border border-amber-400/30">
                <div className="font-playfair text-2xl text-amber-300 flex items-center gap-1"><Star className="w-5 h-5 fill-amber-300" /> {p.avg_rating}</div>
                <div className="text-[10px] text-white/40">{p.ratings_count} salon rating{p.ratings_count === 1 ? "" : "s"}</div>
              </div>
            )}
          </div>
          <div className="text-xs text-white/40 mt-3">Proposed by Miracurl HQ for your <b className="text-gold">{p.role}</b> opening.</div>
        </div>

        {/* Trial + confirm */}
        <div className="mt-4 rounded-2xl bg-[#111013] border border-white/10 p-5" data-testid="candidate-trial-card">
          {p.trial_date ? (
            <div className="flex items-center gap-2 text-amber-300 text-sm">
              <CalendarClock className="w-4 h-4" /> Trial proposed: <b>{p.trial_date}</b> at <b>{p.trial_time}</b>
              {p.trial_notes && <span className="text-white/50">· {p.trial_notes}</span>}
            </div>
          ) : (
            <div className="text-sm text-white/60">Shortlisted — HQ will propose a trial slot shortly.</div>
          )}
          {p.owner_confirmed ? (
            <div className="mt-3 inline-flex items-center gap-2 text-emerald-400 text-sm font-medium" data-testid="candidate-confirmed">
              <CheckCircle2 className="w-4 h-4" /> Confirmed — HQ will finalise with the candidate
            </div>
          ) : (
            <button onClick={confirm} disabled={busy} data-testid="candidate-confirm-btn"
              className="mt-3 inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-gradient-to-r from-gold to-blush text-bg-base text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              <CheckCircle2 className="w-4 h-4" /> {busy ? "Confirming…" : p.trial_date ? "Confirm this trial ✦" : "Approve this candidate ✦"}
            </button>
          )}
        </div>

        {/* Work history */}
        <div className="mt-4 space-y-3" data-testid="candidate-history">
          <div className="text-[10px] uppercase tracking-[0.25em] text-white/40 px-1">Verified work history</div>
          {p.history.length === 0 && <div className="text-sm text-white/40 px-1">No employment records yet.</div>}
          {p.history.map((h, i) => (
            <div key={i} className="rounded-xl bg-[#111013] border border-white/10 p-4">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <div className="font-medium">{h.salon_name || "Salon"}</div>
                  <div className="text-xs text-white/50 mt-0.5">
                    {h.designation} · {h.from_date} → {h.to_date || <span className="text-emerald-400">present</span>}
                  </div>
                </div>
                {h.rating && (
                  <span className="text-xs text-amber-300 font-semibold inline-flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-amber-300" /> {h.rating}
                  </span>
                )}
              </div>
              {h.skills?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {h.skills.map((s, j) => <span key={j} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/60">{s}</span>)}
                </div>
              )}
              {h.comment && <p className="text-xs text-white/50 italic mt-2">"{h.comment}"</p>}
            </div>
          ))}
        </div>

        <p className="text-[10px] text-white/25 mt-8 text-center">Work history verified by Miracurl HQ · Contact details shared after trial confirmation.</p>
      </div>
    </div>
  );
}
