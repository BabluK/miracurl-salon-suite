import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Briefcase, MapPin, IndianRupee, ShieldCheck, X } from "lucide-react";
import BrandMark from "@/components/BrandMark";

const URGENCY_LABEL = { immediate: "🔥 Urgent", two_weeks: "Within 2 weeks", flexible: "Flexible start" };

export default function JobsBoard() {
  const [jobs, setJobs] = useState(null);
  const [applyJob, setApplyJob] = useState(null);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState("");

  useEffect(() => {
    api.get("/public/jobs").then(r => setJobs(r.data.jobs)).catch(() => setJobs([]));
  }, []);

  const apply = async () => {
    setSending(true);
    try {
      const { data } = await api.post(`/public/jobs/${applyJob.id}/apply`, { phone, name });
      setDone(data.message);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Couldn't apply");
    } finally { setSending(false); }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white" data-testid="jobs-board-page">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <BrandMark variant="dark" size="xs" />
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">Careers · Verified Salons</div>
        </div>
        <h1 className="font-playfair text-4xl sm:text-5xl">Salon jobs, <span className="text-gold">verified</span>.</h1>
        <p className="text-white/60 text-sm mt-3 max-w-xl">
          Open positions at Miracurl partner salons. Only professionals in the <b className="text-white/80">Miracurl HQ-verified staff registry</b> can
          apply — use your registered mobile number. HQ schedules your trial directly.
        </p>

        <div className="mt-8 space-y-3" data-testid="jobs-list">
          {jobs === null ? (
            <div className="text-white/40 text-sm">Loading positions…</div>
          ) : jobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-white/50 text-sm" data-testid="jobs-empty">
              No open positions right now — check back soon.
            </div>
          ) : jobs.map(j => (
            <div key={j.id} className="rounded-2xl bg-[#111013] border border-white/10 p-5 flex items-start justify-between gap-4 flex-wrap hover:border-gold/40 transition" data-testid={`job-card-${j.id}`}>
              <div>
                <div className="font-playfair text-xl flex items-center gap-2"><Briefcase className="w-4.5 h-4.5 text-gold" /> {j.role}</div>
                <div className="text-xs text-white/50 mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                  <span className="inline-flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> {j.salon}</span>
                  <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {j.location}</span>
                  <span className="inline-flex items-center gap-1"><IndianRupee className="w-3.5 h-3.5" /> {Math.round(j.salary_min).toLocaleString("en-IN")}–{Math.round(j.salary_max).toLocaleString("en-IN")}/mo</span>
                  <span>{j.experience_years}+ yrs exp</span>
                  <span className="text-amber-300">{URGENCY_LABEL[j.urgency]}</span>
                </div>
              </div>
              <button onClick={() => { setApplyJob(j); setDone(""); setPhone(""); setName(""); }} data-testid={`job-apply-${j.id}`}
                className="px-4 py-2 rounded-full bg-gradient-to-r from-gold to-blush text-bg-base text-sm font-semibold hover:opacity-90">
                Apply
              </button>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-white/30 mt-10">
          Not in the registry yet? Ask your current salon owner (any Miracurl partner) to add you to the Staff Registry — it's free and gives you a verified work history.
        </p>
      </div>

      {applyJob && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setApplyJob(null)} />
          <div className="relative w-full max-w-sm bg-[#111013] border border-gold/30 rounded-2xl p-6" data-testid="job-apply-modal">
            <button onClick={() => setApplyJob(null)} className="absolute top-4 right-4 text-white/40 hover:text-white" data-testid="job-apply-close">
              <X className="w-4 h-4" />
            </button>
            {done ? (
              <div className="text-center py-4" data-testid="job-apply-success">
                <div className="text-4xl mb-3">🎉</div>
                <div className="font-playfair text-xl text-gold">Application received!</div>
                <p className="text-sm text-white/70 mt-2">{done}</p>
              </div>
            ) : (
              <>
                <div className="font-playfair text-xl">Apply — {applyJob.role}</div>
                <p className="text-xs text-white/50 mt-1.5">Enter your name and the mobile number registered in the Miracurl staff registry.</p>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Your full name (as registered)"
                  className="mt-4 w-full bg-black/40 border border-white/10 rounded-md px-3 py-2.5 text-sm" data-testid="job-apply-name" />
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="10-digit registered mobile"
                  inputMode="numeric" className="mt-3 w-full bg-black/40 border border-white/10 rounded-md px-3 py-2.5 text-sm" data-testid="job-apply-phone" />
                <button onClick={apply} disabled={sending || phone.replace(/\D/g, "").length < 10 || name.trim().length < 2} data-testid="job-apply-submit"
                  className="mt-4 w-full py-2.5 rounded-full bg-gradient-to-r from-gold to-blush text-bg-base text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                  {sending ? "Verifying…" : "Verify & apply ✦"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
