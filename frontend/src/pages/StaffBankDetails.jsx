import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Landmark, Save } from "lucide-react";

const inputCls = "w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90 placeholder:text-white/25 focus:outline-none focus:border-gold/50";
const labelCls = "block text-[10px] uppercase tracking-[0.2em] text-white/40 mb-1";

export default function StaffBankDetails() {
  const [form, setForm] = useState({ bank_name: "", ifsc: "", account_holder: "", account_number: "" });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/staff/me/profile").then(r => {
      const b = r.data.bank_details || {};
      setForm({ bank_name: b.bank_name || "", ifsc: b.ifsc || "", account_holder: b.account_holder || "", account_number: b.account_number || "" });
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put("/staff/me/bank-details", { ...form, ifsc: form.ifsc.toUpperCase().trim() });
      toast.success("Bank details saved ✦ Your salon admin can now see them");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Save failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="max-w-xl space-y-6" data-testid="staff-bank-details-page">
      <div>
        <h1 className="font-playfair text-2xl sm:text-3xl flex items-center gap-2">
          <Landmark className="w-6 h-6 text-gold" /> Bank Details
        </h1>
        <p className="text-white/50 text-sm mt-1">Your salary is paid to this account. Details are visible only to your salon admin.</p>
      </div>

      <div className="rounded-2xl bg-[#0F0F0F] border border-white/5 p-5 sm:p-6">
        {!loaded ? (
          <div className="text-white/40 text-sm py-4">Loading…</div>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div>
              <label className={labelCls}>Bank name</label>
              <input data-testid="bank-name-input" required className={inputCls} value={form.bank_name}
                onChange={e => setForm({ ...form, bank_name: e.target.value })} placeholder="e.g. HDFC Bank" maxLength={100} />
            </div>
            <div>
              <label className={labelCls}>Account number</label>
              <input data-testid="bank-account-input" className={`${inputCls} tracking-wider`} value={form.account_number} inputMode="numeric"
                onChange={e => setForm({ ...form, account_number: e.target.value.replace(/\D/g, "").slice(0, 24) })} placeholder="e.g. 50100123456789" maxLength={24} />
            </div>
            <div>
              <label className={labelCls}>IFSC code</label>
              <input data-testid="bank-ifsc-input" required className={`${inputCls} uppercase tracking-wider`} value={form.ifsc}
                onChange={e => setForm({ ...form, ifsc: e.target.value })} placeholder="e.g. HDFC0001234" maxLength={20} />
            </div>
            <div>
              <label className={labelCls}>Account holder name</label>
              <input data-testid="bank-holder-input" required className={inputCls} value={form.account_holder}
                onChange={e => setForm({ ...form, account_holder: e.target.value })} placeholder="Name exactly as in the bank" maxLength={100} />
            </div>
            <button data-testid="bank-save-btn" disabled={busy} type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-gold to-blush text-bg-base font-medium rounded-md text-sm hover:opacity-90 transition disabled:opacity-50">
              <Save className="w-4 h-4" /> {busy ? "Saving…" : "Save bank details"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
