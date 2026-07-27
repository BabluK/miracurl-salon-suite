import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { X, Copy, Mail, Loader2, Trash2, CreditCard } from "lucide-react";

const STATUS_STYLE = {
  pending: "bg-amber-50 border-amber-200 text-amber-700",
  paid: "bg-emerald-50 border-emerald-200 text-emerald-700",
  expired: "bg-slate-100 border-slate-200 text-slate-500",
  cancelled: "bg-rose-50 border-rose-200 text-rose-600",
};

export default function PayLinkModal({ tenant, onClose }) {
  const [data, setData] = useState(null);
  const [plan, setPlan] = useState("half_year");
  const [amount, setAmount] = useState("");
  const [months, setMonths] = useState(6);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");

  const load = () => api.get(`/super-admin/pay-links?tenant_id=${tenant.id}`).then(r => setData(r.data)).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tenant.id]);

  const generate = async () => {
    setBusy("gen");
    try {
      const body = { tenant_id: tenant.id, plan, note };
      if (plan === "custom") { body.custom_amount = Number(amount); body.custom_months = Number(months); }
      const { data: d } = await api.post("/super-admin/pay-links", body);
      const url = `${window.location.origin}/pay/${d.link.token}`;
      navigator.clipboard?.writeText(url).catch(() => {});
      toast.success("Payment link created & copied — valid 7 days ✦");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't create the link"); }
    finally { setBusy(""); }
  };

  const copy = (l) => {
    navigator.clipboard.writeText(`${window.location.origin}/pay/${l.token}`);
    toast.success("Link copied");
  };

  const sendMail = async (l) => {
    setBusy(l.id);
    try {
      const { data: d } = await api.post(`/super-admin/pay-links/${l.id}/email`);
      toast.success(`💌 Beautiful onboarding email sent to ${d.sent_to}`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Email failed"); }
    finally { setBusy(""); }
  };

  const revoke = async (l) => {
    if (!window.confirm("Revoke this payment link? The salon won't be able to pay through it.")) return;
    try { await api.delete(`/super-admin/pay-links/${l.id}`); toast.success("Link revoked"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Couldn't revoke"); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid="pay-link-modal" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-playfair text-xl flex items-center gap-2"><CreditCard className="w-5 h-5 text-amber-600" /> Subscription Payment Link</h2>
            <p className="text-xs text-slate-500 mt-0.5">{tenant.name} · owner pays directly, plan activates instantly</p>
          </div>
          <button onClick={onClose} data-testid="pay-link-close" className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        {!data ? <div className="py-8 text-center text-slate-400 text-sm">Loading…</div> : (
          <>
            <div className="mt-4 space-y-2">
              {data.plans.map(p => (
                <label key={p.key} data-testid={`pay-link-plan-${p.key}`}
                  className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 cursor-pointer text-sm ${plan === p.key ? "border-amber-400 bg-amber-50" : "border-slate-200 hover:border-slate-300"}`}>
                  <input type="radio" name="pl-plan" checked={plan === p.key} onChange={() => setPlan(p.key)} className="accent-amber-500" />
                  <span className="flex-1">{p.label}</span>
                  <b>₹{p.price.toLocaleString("en-IN")}</b>
                </label>
              ))}
              <label data-testid="pay-link-plan-custom"
                className={`flex flex-wrap items-center gap-3 border rounded-xl px-3 py-2.5 cursor-pointer text-sm ${plan === "custom" ? "border-amber-400 bg-amber-50" : "border-slate-200 hover:border-slate-300"}`}>
                <input type="radio" name="pl-plan" checked={plan === "custom"} onChange={() => setPlan("custom")} className="accent-amber-500" />
                <span>Custom deal 🤝</span>
                {plan === "custom" && (
                  <span className="flex items-center gap-2 ml-auto">
                    <input type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)} placeholder="₹ price"
                      data-testid="pay-link-custom-amount" className="w-24 input-light !py-1.5 text-xs" onClick={e => e.preventDefault()} />
                    <select value={months} onChange={e => setMonths(e.target.value)} data-testid="pay-link-custom-months" className="input-light !py-1.5 text-xs">
                      <option value={1}>1 month</option><option value={3}>3 months</option>
                      <option value={6}>6 months</option><option value={12}>12 months</option>
                    </select>
                  </span>
                )}
              </label>
              <input value={note} onChange={e => setNote(e.target.value)} maxLength={300} data-testid="pay-link-note"
                placeholder="Personal note on the page & email (optional) — e.g. 'Special launch price for you!'"
                className="input-light w-full text-xs" />
              <button onClick={generate} disabled={busy === "gen" || (plan === "custom" && !amount)} data-testid="pay-link-generate-btn"
                className="btn-blue w-full justify-center flex items-center gap-2 disabled:opacity-50">
                {busy === "gen" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                Generate link (valid {data.valid_days} days){data.test_mode ? " · TEST mode" : ""}
              </button>
            </div>

            {data.links.length > 0 && (
              <div className="mt-5">
                <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">Links for this salon</div>
                <div className="space-y-2">
                  {data.links.map(l => (
                    <div key={l.id} className="border border-slate-200 rounded-xl px-3 py-2 text-xs" data-testid={`pay-link-row-${l.id}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase ${STATUS_STYLE[l.status] || STATUS_STYLE.expired}`}>{l.status}</span>
                        <span className="font-semibold">₹{Number(l.amount).toLocaleString("en-IN")}</span>
                        <span className="text-slate-500">{l.plan_label}</span>
                        {l.emailed_at && <span className="text-[10px] text-sky-600" title={`Emailed to ${l.emailed_to}`}>📧 emailed</span>}
                        <span className="ml-auto flex items-center gap-1">
                          {l.status === "pending" && (
                            <>
                              <button onClick={() => copy(l)} title="Copy link" data-testid={`pay-link-copy-${l.id}`} className="p-1.5 text-slate-500 hover:text-amber-600 border border-slate-200 rounded-md"><Copy className="w-3 h-3" /></button>
                              <button onClick={() => sendMail(l)} disabled={busy === l.id} title={`Email the link to ${l.owner_email || "owner"}`} data-testid={`pay-link-email-${l.id}`}
                                className="p-1.5 text-slate-500 hover:text-emerald-600 border border-slate-200 rounded-md disabled:opacity-50">
                                {busy === l.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                              </button>
                              <button onClick={() => revoke(l)} title="Revoke link" data-testid={`pay-link-revoke-${l.id}`} className="p-1.5 text-slate-400 hover:text-rose-600 border border-slate-200 rounded-md"><Trash2 className="w-3 h-3" /></button>
                            </>
                          )}
                        </span>
                      </div>
                      <div className="font-mono text-[10px] text-slate-400 mt-1 truncate">{window.location.origin}/pay/{l.token}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
