import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Globe2, Loader2 } from "lucide-react";

export const InternationalCard = () => {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get("/settings/international").then(r => setS(r.data)).catch(() => {}); }, []);
  if (!s) return null;

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/settings/international", {
        currency: s.currency, timezone: s.timezone, deposit_amount: Number(s.deposit_amount) || 0,
      });
      toast.success("International settings saved ✦ Mira now quotes in your currency & local time");
    } catch (e) { toast.error(e.response?.data?.detail || "Save failed"); }
    setBusy(false);
  };

  const intl = s.currency !== "INR";
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm" data-testid="international-card">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center"><Globe2 className="w-5 h-5" /></div>
        <div>
          <h2 className="text-lg font-semibold text-slate-800">International — currency, timezone &amp; deposits</h2>
          <p className="text-xs text-slate-500 mt-1">Mira quotes prices in your currency and books in your local timezone. Salons outside India can also collect a Stripe booking deposit to kill no-shows.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <label className="text-xs text-slate-500">Currency
          <select value={s.currency} onChange={e => setS({ ...s, currency: e.target.value })} data-testid="intl-currency-select"
            className="block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm mt-1 bg-white">
            {s.currencies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500">Timezone
          <select value={s.timezone} onChange={e => setS({ ...s, timezone: e.target.value })} data-testid="intl-timezone-select"
            className="block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm mt-1 bg-white">
            {s.timezones.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500">Booking deposit ({s.currency === "INR" ? "—" : s.currency})
          <input type="number" min="0" max="500" step="1" value={s.deposit_amount} disabled={!intl}
            onChange={e => setS({ ...s, deposit_amount: e.target.value })} data-testid="intl-deposit-input"
            className="block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm mt-1 disabled:bg-slate-50 disabled:text-slate-300" />
        </label>
      </div>
      {!intl && <p className="text-[11px] text-slate-400 mt-2">💡 Deposits use Stripe and unlock when you pick a non-INR currency (India continues on Razorpay).</p>}
      {intl && Number(s.deposit_amount) > 0 && (
        <p className="text-[11px] text-emerald-600 mt-2" data-testid="intl-deposit-hint">✓ Guests booking online will be asked for a {s.currency} {s.deposit_amount} deposit via Stripe {s.stripe_ready ? "(test mode active — go live by adding your Stripe key)" : "(⚠ Stripe key missing)"}</p>
      )}
      <button onClick={save} disabled={busy} data-testid="intl-save-btn"
        className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-slate-900 text-white text-xs font-bold hover:bg-slate-700 disabled:opacity-50">
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save international settings
      </button>
    </div>
  );
};
