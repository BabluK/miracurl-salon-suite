import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Landmark, Save } from "lucide-react";

// Super Admin → GST / MSME profile. Applied automatically to every tenant payment (plans + credit packs).
export const HqTaxCard = () => {
  const [p, setP] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/hq/tax-profile").then(r => setP(r.data)).catch(() => toast.error("Couldn't load tax profile")); }, []);
  if (!p) return null;
  const set = (k) => (e) => setP(x => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const save = async () => {
    setBusy(true);
    try { const { data } = await api.put("/hq/tax-profile", { ...p, gst_rate_pct: Number(p.gst_rate_pct) }); setP(data); toast.success("Tax profile saved — applies to all new tenant payments"); }
    catch (e) { toast.error(e.response?.data?.detail || "Save failed"); }
    finally { setBusy(false); }
  };
  const Field = ({ k, label, ph, hint }) => (
    <label className="block"><span className="text-xs font-semibold text-slate-600">{label}</span>
      <input value={p[k] ?? ""} onChange={set(k)} placeholder={ph} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" data-testid={`hq-tax-${k}`} />
      {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
  const sample = 999, gst = Math.round(sample * Number(p.gst_rate_pct || 0) / 100);
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5" data-testid="hq-tax-card">
      <div className="flex items-center gap-2 mb-1"><Landmark className="w-5 h-5 text-[#b8860b]" /><h3 className="font-semibold text-slate-900">Billing & Tax (GST / MSME)</h3></div>
      <p className="text-xs text-slate-500 mb-4">Every tenant payment — subscriptions and SMS/WhatsApp credit packs — adds GST on top automatically. Fill GSTIN & MSME once they arrive; invoices update instantly.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field k="legal_name" label="Legal name on invoices" ph="Miracurl Studio" />
        <Field k="gst_rate_pct" label="GST rate %" ph="18" hint="Default 18% (SaaS)" />
        <Field k="gstin" label="GSTIN" ph="29ABCDE1234F1Z5" hint={p.gstin ? "" : "Not received yet — GST is still charged; invoices say 'GSTIN pending'"} />
        <Field k="msme" label="MSME / Udyam number" ph="UDYAM-KR-03-0012345" />
        <div className="sm:col-span-2"><Field k="address" label="Registered address (invoice footer)" ph="Bengaluru, Karnataka" /></div>
      </div>
      <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={p.apply_gst !== false} onChange={set("apply_gst")} data-testid="hq-tax-apply" /> Charge GST on tenant payments</label>
      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2" data-testid="hq-tax-preview">Preview: plan ₹{sample} → GST ₹{p.apply_gst === false ? 0 : gst} → tenant pays <b>₹{sample + (p.apply_gst === false ? 0 : gst)}</b></div>
        <button onClick={save} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold disabled:opacity-60" data-testid="hq-tax-save"><Save className="w-4 h-4" /> {busy ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
};
