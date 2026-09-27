import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { X, PhoneOff, Save, Loader2 } from "lucide-react";
import { COUNTRY_CODES } from "@/lib/countryCodes";

function Row({ c, onFixed }) {
  const [phone, setPhone] = useState(c.phone || "");
  const [cc, setCc] = useState(c.country_code || "+91");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const { data: full } = await api.get(`/customers/${c.id}`);
      await api.put(`/customers/${c.id}`, { ...full, phone: phone.trim(), country_code: cc });
      toast.success(`${c.name}'s number updated`);
      onFixed(c.id);
    } catch (e) {
      toast.error(e?.response?.data?.detail?.code === "PHONE_EXISTS" ? "Another guest already has this number — use Merge duplicates" : "Couldn't save");
    } finally { setBusy(false); }
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-center py-3 border-b border-slate-100" data-testid={`invalid-phone-row-${c.id}`}>
      <div className="min-w-0">
        <p className="font-semibold text-slate-800 truncate">{c.name} <span className="text-xs text-slate-400 font-normal">· {c.visits || 0} visits</span></p>
        <p className="text-xs text-rose-600">{c.reason} — saved as <span className="font-mono">{c.phone || "—"}</span></p>
      </div>
      <div className="flex items-center gap-1.5">
        <select value={cc} onChange={e => setCc(e.target.value)} className="h-9 rounded-lg border border-slate-200 text-xs px-1 bg-white" data-testid={`invalid-phone-cc-${c.id}`}>
          {COUNTRY_CODES.map(o => <option key={o.iso} value={o.code}>{o.flag} {o.code}</option>)}
        </select>
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Correct number" inputMode="tel"
          className="h-9 w-40 rounded-lg border border-slate-200 px-2 text-sm font-mono bg-white text-slate-800" data-testid={`invalid-phone-input-${c.id}`} />
        <button onClick={save} disabled={busy || !phone.trim()} data-testid={`invalid-phone-save-${c.id}`}
          className="h-9 px-3 rounded-lg bg-[#9b3a4e] text-white text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
        </button>
      </div>
    </div>
  );
}

export function InvalidPhonesModal({ onClose, onFixed }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get("/customers/invalid-phones").then(r => setRows(r.data)).catch(() => setRows([])); }, []);
  const fixed = (id) => { setRows(r => r.filter(x => x.id !== id)); onFixed?.(); };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()} data-testid="invalid-phones-modal">
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="font-playfair text-xl text-slate-900 inline-flex items-center gap-2"><PhoneOff className="w-5 h-5 text-rose-600" /> Fix phone numbers</h2>
            <p className="text-xs text-slate-500 mt-1">These guests can't receive WhatsApp reminders or offers until their number is corrected. Ask them at the next visit or check the bill.</p>
          </div>
          <button onClick={onClose} data-testid="invalid-phones-close" className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 overflow-y-auto">
          {rows === null && <p className="py-8 text-center text-sm text-slate-400">Checking every saved number…</p>}
          {rows?.length === 0 && <p className="py-8 text-center text-sm text-emerald-700" data-testid="invalid-phones-empty">All guest numbers look valid ✓</p>}
          {rows?.map(c => <Row key={c.id} c={c} onFixed={fixed} />)}
        </div>
        {rows?.length > 0 && <p className="px-5 py-3 text-[11px] text-slate-400" data-testid="invalid-phones-count">{rows.length} guest{rows.length > 1 ? "s" : ""} need a correct number</p>}
      </div>
    </div>
  );
}
