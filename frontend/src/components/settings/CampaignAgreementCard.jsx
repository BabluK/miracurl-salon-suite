import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle2, Download, FileSignature, Loader2, ScrollText, ShieldCheck } from "lucide-react";

async function dl(kind, name) {
  try {
    const r = await api.get(`/settings/rewards-campaign/docs/${kind}.pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } catch { toast.error("Couldn't download the PDF"); }
}

const KEY_TERMS = (pct) => [
  `Settlement share: after the campaign closes, the salon pays Miracurl ${pct}% of its campaign-period POS earnings (Clause 4.1).`,
  "Payment within 15 days of the settlement notice via the Razorpay link; 1.5%/month interest on late payment (Clause 4.3–4.4).",
  "Earnings are computed from Miracurl POS invoices only — no voiding/splitting of bills to reduce totals (Clauses 3.3, 5).",
  "The salon honours winners' Diamond / Platinum / Gold memberships at its outlet; Miracurl funds them (Clauses 2.2, 3.2).",
  "Customer photos only with consent; DPDP Act 2023 compliance (Clause 3.4).",
  "On settlement, the salon receives the 'Trusted by Miracurl' badge on the home page and its booking page (Clause 6).",
  "Electronic acceptance is binding under the IT Act 2000 s.10A; governed by Indian law, courts at Bengaluru (Clause 9).",
];

function AcceptModal({ a, onClose, onDone }) {
  const [f, setF] = useState({ full_name: "", designation: "Owner", agree: false, agree_share: false, agree_visibility: false });
  const ready = f.agree && f.agree_share && f.agree_visibility && f.full_name.trim().length >= 3;
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/settings/rewards-campaign/agreement/accept", f);
      toast.success(`Agreement accepted${data.emailed ? " — signed copy emailed to you" : ""}`);
      onDone();
    } catch (e) {
      const d = e.response?.data?.detail;
      toast.error(typeof d === "string" ? d : Array.isArray(d) ? d.map(x => x.msg).join(" · ") : "Couldn't record acceptance");
    } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto" onClick={onClose} data-testid="agreement-modal">
      <div className="relative w-full max-w-2xl rounded-3xl bg-white shadow-2xl my-auto p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center"><FileSignature className="w-5 h-5" /></div>
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Salon Participation Agreement</h3>
            <p className="text-xs text-slate-500">{a.campaign} · version {a.version} · Miracurl share {a.share_pct}%</p>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 max-h-56 overflow-y-auto" data-testid="agreement-key-terms">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">Key terms (summary — the full agreement PDF governs)</div>
          <ol className="list-decimal pl-5 space-y-1.5 text-sm text-slate-700">{KEY_TERMS(a.share_pct).map((t, i) => <li key={i}>{t}</li>)}</ol>
          <button onClick={() => dl("agreement", "Miracurl-Participation-Agreement.pdf")} className="mt-3 text-xs text-amber-700 font-semibold inline-flex items-center gap-1 hover:underline" data-testid="agreement-modal-download"><Download className="w-3.5 h-3.5" /> Read the full agreement (PDF)</button>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-[10px] uppercase tracking-wide text-slate-500 block">Full name of signatory *
            <input value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm normal-case !bg-white !text-slate-800" placeholder="As on your ID" data-testid="agreement-name" />
          </label>
          <label className="text-[10px] uppercase tracking-wide text-slate-500 block">Designation *
            <input value={f.designation} onChange={e => setF({ ...f, designation: e.target.value })} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm normal-case !bg-white !text-slate-800" placeholder="Owner / Proprietor / Director" data-testid="agreement-designation" />
          </label>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-3 space-y-2.5" data-testid="agreement-consents">
          <div className="text-[10px] uppercase tracking-wide text-amber-800 font-semibold">Two consents — both required</div>
          <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={f.agree_share} onChange={e => setF({ ...f, agree_share: e.target.checked })} className="mt-1 accent-[#9b3a4e]" data-testid="agreement-agree-share" />
            <span><b>{a.share_pct}% of all campaign earnings</b> — after the campaign closes I will pay Miracurl {a.share_pct}% of my campaign-period POS earnings (Clause 4).</span>
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={f.agree_visibility} onChange={e => setF({ ...f, agree_visibility: e.target.checked })} className="mt-1 accent-[#9b3a4e]" data-testid="agreement-agree-visibility" />
            <span><b>Business visibility to Miracurl HQ during the campaign</b> — I allow Miracurl HQ to view my salon's workspace (bookings, billing totals, entries, settings) to set up, support and verify the campaign. HQ access is logged in my Audit log and never includes deleting my data (Clause 5.5).</span>
          </label>
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" checked={f.agree} onChange={e => setF({ ...f, agree: e.target.checked })} className="mt-1 accent-[#9b3a4e]" data-testid="agreement-agree" />
          <span>I confirm I am authorised to sign for this salon, I have read the full Participation Agreement and the Miracurl Terms &amp; Conditions, and I agree to be legally bound by them. My name, date-time, IP address and device will be recorded as my electronic signature.</span>
        </label>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="h-10 px-4 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50" data-testid="agreement-cancel">Cancel</button>
          <button onClick={submit} disabled={busy || !ready} className="h-10 px-5 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-40 inline-flex items-center gap-2" data-testid="agreement-accept-btn">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />} Accept &amp; e-sign
          </button>
        </div>
      </div>
    </div>
  );
}

const STEPS = [["invited", "Invited"], ["agreed", "Agreement signed"], ["call_scheduled", "Setup call"], ["call_done", "Setup done"], ["live", "Live"]];

function OnboardingSteps({ a }) {
  const ob = a.onboarding || {};
  const status = ob.live ? "live" : ob.status === "none" ? (a.accepted ? "agreed" : "invited") : ob.status;
  const cur = STEPS.findIndex(([k]) => k === status);
  const callAt = ob.call_at ? new Date(ob.call_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <div className="mt-3" data-testid="campaign-onboarding-steps">
      <ol className="flex flex-wrap gap-1.5">
        {STEPS.map(([k, l], i) => (
          <li key={k} className={`text-[11px] px-2.5 py-1 rounded-full border ${i <= cur ? "bg-emerald-50 border-emerald-200 text-emerald-700 font-semibold" : "border-slate-200 text-slate-400"}`}>{i + 1}. {l}</li>
        ))}
        {ob.status === "paused" && <li className="text-[11px] px-2.5 py-1 rounded-full border border-red-200 bg-red-50 text-red-600 font-semibold">Paused by HQ</li>}
      </ol>
      <p className="text-xs text-slate-600 mt-2" data-testid="campaign-onboarding-hint">
        {ob.live ? "🎉 Your campaign is live — download the QR poster below and place it at the billing counter."
          : callAt ? `📞 Setup call with Miracurl: ${callAt}. After the call HQ marks you live and the QR poster unlocks.`
          : a.accepted ? "✅ Agreement signed. Miracurl HQ will set up your campaign (or call you) and mark it live — the QR poster unlocks then."
          : "Step 1: download the guide & agreement, then Review & accept. Miracurl HQ sets you up right after."}
      </p>
    </div>
  );
}

export function CampaignAgreementCard() {
  const [a, setA] = useState(null);
  const [open, setOpen] = useState(false);
  const load = () => api.get("/settings/rewards-campaign/agreement").then(r => setA(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!a || !a.enabled || (!a.eligible && !a.acceptance)) return null;
  const btn = "px-3 py-1.5 rounded-full border text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-50";
  return (
    <div id="campaign-agreement" className="bg-white rounded-2xl border border-slate-200 p-6 mt-6 shadow-sm" data-testid="campaign-agreement-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0"><ScrollText className="w-5 h-5" /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold text-slate-800">Brand Model Campaign — agreement &amp; documents</h2>
            {a.accepted
              ? <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold inline-flex items-center gap-1" data-testid="agreement-status">
                  <CheckCircle2 className="w-3 h-3" /> Accepted by {a.acceptance.full_name} · {String(a.acceptance.accepted_at).slice(0, 10)}</span>
              : <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-bold" data-testid="agreement-status">{a.needs_reaccept ? "Terms updated — please re-accept" : "Acceptance required"}</span>}
          </div>
          <p className="text-xs text-slate-500 mt-1">{a.campaign}: read the step-by-step guide, then accept the Participation Agreement (includes the {a.share_pct}% settlement share after the campaign). Acceptance is an electronic signature under the IT Act 2000.</p>
          <OnboardingSteps a={a} />
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <button onClick={() => dl("guide", "Miracurl-Brand-Model-Campaign-Guide.pdf")} className={`${btn} border-amber-300 text-amber-800`} data-testid="agreement-dl-guide"><Download className="w-3.5 h-3.5" /> Campaign guide (PDF)</button>
            <button onClick={() => dl("agreement", `Miracurl-Participation-Agreement${a.accepted ? "-SIGNED" : ""}.pdf`)} className={`${btn} border-slate-300 text-slate-700`} data-testid="agreement-dl-agreement"><Download className="w-3.5 h-3.5" /> {a.accepted ? "Signed agreement (PDF)" : "Agreement (PDF)"}</button>
            <button onClick={() => dl("terms", "Miracurl-Terms-and-Conditions.pdf")} className={`${btn} border-slate-300 text-slate-600`} data-testid="agreement-dl-terms"><Download className="w-3.5 h-3.5" /> Terms &amp; Conditions</button>
            {!a.accepted && <button onClick={() => setOpen(true)} className="ml-auto h-9 px-4 rounded-full bg-slate-900 text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-700" data-testid="agreement-open-btn"><FileSignature className="w-4 h-4" /> Review &amp; accept</button>}
            {a.accepted && <span className="ml-auto text-[11px] text-emerald-700 inline-flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Legally binding e-acceptance on record</span>}
          </div>
        </div>
      </div>
      {open && <AcceptModal a={a} onClose={() => setOpen(false)} onDone={() => { setOpen(false); load(); }} />}
    </div>
  );
}
