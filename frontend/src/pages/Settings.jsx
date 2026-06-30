import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Receipt, Save, ShieldCheck, Info } from "lucide-react";

export default function Settings() {
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [gstNumber, setGstNumber] = useState("");
  const [gstLegalName, setGstLegalName] = useState("");
  const [taxPct, setTaxPct] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/settings/tax")
      .then(r => {
        setTaxEnabled(!!r.data.tax_enabled);
        setGstNumber(r.data.gst_number || "");
        setGstLegalName(r.data.gst_legal_name || "");
        setTaxPct(Number(r.data.tax_pct || 0));
      })
      .catch(e => toast.error(e.response?.data?.detail || "Couldn't load settings"))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (taxEnabled) {
      if (!gstNumber.trim()) { toast.error("Enter your GSTIN to enable tax"); return; }
      if (!Number(taxPct) || taxPct <= 0) { toast.error("Set a tax % greater than 0"); return; }
    }
    setSaving(true);
    try {
      await api.put("/settings/tax", {
        tax_enabled: taxEnabled,
        gst_number: gstNumber.trim() || null,
        gst_legal_name: gstLegalName.trim() || null,
        tax_pct: Number(taxPct) || 0,
      });
      toast.success(taxEnabled ? "Tax enabled — invoices will charge GST" : "Tax disabled — invoices have no GST");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't save settings");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="text-slate-500 text-sm">Loading…</div>;

  return (
    <div className="bg-slate-50 -mx-8 -my-8 px-8 py-8 min-h-[calc(100vh-4rem)]" data-testid="settings-page">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold text-slate-800">Salon Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Configure how billing, tax and your business identity behave on invoices.</p>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center">
              <Receipt className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-800">Tax / GST on invoices</h2>
              <p className="text-xs text-slate-500 mt-1">
                By default, invoices do <b>not</b> charge any tax. Only enable this if your salon is GST registered and you intend to collect GST from guests.
              </p>
            </div>
          </div>

          <label className="flex items-center justify-between gap-4 mt-6 p-4 rounded-xl border border-slate-200 bg-slate-50/60">
            <div>
              <div className="font-medium text-slate-800 text-sm">Enable tax on invoices</div>
              <div className="text-xs text-slate-500 mt-0.5">When on, every POS invoice will add GST at the rate below.</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={taxEnabled}
              data-testid="settings-tax-toggle"
              onClick={() => setTaxEnabled(v => !v)}
              className={`relative inline-flex h-6 w-11 rounded-full transition ${taxEnabled ? "bg-sky-500" : "bg-slate-300"}`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition mt-0.5 ${taxEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </label>

          <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 transition ${taxEnabled ? "opacity-100" : "opacity-50 pointer-events-none"}`}>
            <div>
              <label className="text-xs text-slate-500 font-medium">GSTIN *</label>
              <input
                data-testid="settings-gstin"
                value={gstNumber}
                onChange={e => setGstNumber(e.target.value.toUpperCase())}
                placeholder="29ABCDE1234F1Z5"
                maxLength={15}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 font-mono uppercase tracking-wider"
              />
              <p className="text-[11px] text-slate-400 mt-1">15-character GST identification number</p>
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium">Legal name (as on GSTIN)</label>
              <input
                data-testid="settings-gst-legal-name"
                value={gstLegalName}
                onChange={e => setGstLegalName(e.target.value)}
                placeholder="Miracurl Salon Pvt Ltd"
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium">Tax rate (%) *</label>
              <input
                data-testid="settings-tax-pct"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={taxPct}
                onChange={e => setTaxPct(e.target.value)}
                placeholder="18"
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
              <p className="text-[11px] text-slate-400 mt-1">Salon services in India are typically 18% GST.</p>
            </div>
          </div>

          <div className="mt-5 flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              {taxEnabled ? (
                <>Tax will be added at <b>{Number(taxPct || 0).toFixed(2)}%</b> on every invoice. Guests will see a clear GST line.</>
              ) : (
                <>Tax is currently <b>off</b>. Invoices will show only Subtotal, Discount and Total. You can switch this on anytime.</>
              )}
            </div>
          </div>

          <div className="flex justify-end mt-6">
            <button
              data-testid="settings-save-btn"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-sky-500 to-blue-500 text-white font-semibold text-sm hover:from-sky-600 hover:to-blue-600 shadow-sm disabled:opacity-60"
            >
              <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Data isolation</h2>
              <p className="text-xs text-slate-500 mt-1">
                Your salon's customers, invoices and staff are isolated by tenant ID and never visible to other salons on Miracurl.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
