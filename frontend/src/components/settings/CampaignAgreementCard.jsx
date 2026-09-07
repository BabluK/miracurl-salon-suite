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
  const [f, setF] = useState({ full_name: "", designation: "Owner", agree: false });
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
        <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" checked={f.agree} onChange={e => setF({ ...f, agree: e.target.checked })} className="mt-1" data-testid="agreement-agree" />
          <span>I confirm I am authorised to sign for this salon, I have read the full Participation Agreement and the Miracurl Terms &amp; Conditions, and I agree to be legally bound by them, including the {a.share_pct}% settlement share. My name, date-time, IP address and device will be recorded as my electronic signature.</span>
        </label>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="h-10 px-4 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50" data-testid="agreement-cancel">Cancel</button>
          <button onClick={submit} disabled={busy || !f.agree || f.full_name.trim().length < 3} className="h-10 px-5 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-40 inline-flex items-center gap-2" data-testid="agreement-accept-btn">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />} Accept &amp; e-sign
          </button>
        </div>
      </div>
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
