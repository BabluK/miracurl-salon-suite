import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { UserPlus, X } from "lucide-react";
import { COUNTRY_CODES, countryByIso, phoneDisplay } from "@/lib/countryCodes";

export default function AddGuestModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [ccIso, setCcIso] = useState("IN");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState("Female");
  const [dob, setDob] = useState("");
  const [anniversary, setAnniversary] = useState("");
  const [busy, setBusy] = useState(false);
  const [duplicate, setDuplicate] = useState(null);
  const [matches, setMatches] = useState([]);
  const searchTimer = useRef(null);

  const cc = countryByIso(ccIso);

  function onPhoneChange(v) {
    // pasting "+91 82170 72523" auto-picks the country
    const trimmed = v.trim();
    if (trimmed.startsWith("+")) {
      const hit = COUNTRY_CODES.find(c => trimmed.replace(/\s/g, "").startsWith(c.code));
      if (hit) {
        setCcIso(hit.iso);
        v = trimmed.replace(/\s/g, "").slice(hit.code.length);
      }
    }
    setPhone(v);
    setDuplicate(null);
    clearTimeout(searchTimer.current);
    const digits = v.replace(/\D/g, "");
    if (digits.length >= 4) {
      searchTimer.current = setTimeout(() => {
        api.get(`/customers/search-phone?q=${digits}`)
          .then(({ data }) => setMatches(data))
          .catch(() => setMatches([]));
      }, 250);
    } else {
      setMatches([]);
    }
  }

  useEffect(() => () => clearTimeout(searchTimer.current), []);

  async function save(e) {
    e.preventDefault();
    if (!name.trim() || !/^\d{7,15}$/.test(phone.replace(/\D/g, ""))) {
      toast.error("Name and a valid phone are required");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/customers", {
        name: name.trim(),
        phone: phone.replace(/\D/g, ""),
        country_code: cc.code,
        email: email.trim() || null,
        gender,
        dob: dob || null,
        anniversary: anniversary || null,
      });
      onCreated(data);
    } catch (err) {
      const d = err.response?.data?.detail;
      if (err.response?.status === 409 && d?.code === "PHONE_EXISTS") {
        setDuplicate(d.customer);
      } else {
        toast.error(typeof d === "string" ? d : "Couldn't create guest");
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={save} className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()} data-testid="add-guest-modal">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><UserPlus className="w-5 h-5 text-sky-500" /> Add Guest</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700" data-testid="add-guest-close-btn"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-slate-500">Add a new walk-in customer. Their personal referral code is generated automatically.</p>
        <div>
          <label className="text-xs text-slate-500 font-medium">Name *</label>
          <input data-testid="add-guest-name" value={name} onChange={e => setName(e.target.value)} required autoFocus className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200" placeholder="Guest name" />
        </div>
        <div className="relative">
          <label className="text-xs text-slate-500 font-medium">Phone *</label>
          <div className="mt-1 flex items-stretch rounded-lg border border-slate-200 bg-slate-50 overflow-hidden focus-within:ring-2 focus-within:ring-sky-200">
            <select data-testid="add-guest-country-code" value={ccIso} onChange={e => setCcIso(e.target.value)}
              className="pl-2 pr-1 py-2 bg-white border-r border-slate-200 text-sm text-slate-700 font-semibold focus:outline-none cursor-pointer">
              {COUNTRY_CODES.map(c => (
                <option key={c.iso} value={c.iso}>{c.flag} {c.iso} {c.code}</option>
              ))}
            </select>
            <input data-testid="add-guest-phone" value={phone} onChange={e => onPhoneChange(e.target.value)} required
              className="flex-1 px-3 py-2 bg-slate-50 text-slate-800 text-sm focus:outline-none" placeholder="98765 43210" inputMode="tel" />
          </div>
          {matches.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden" data-testid="add-guest-phone-matches">
              <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-amber-600 font-bold bg-amber-50">Already saved — tap to bill them</p>
              {matches.map(m => {
                const pd = phoneDisplay(m);
                return (
                  <button type="button" key={m.id} data-testid={`add-guest-match-${m.id}`}
                    onClick={() => onCreated(m)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-sky-50 transition border-t border-slate-100">
                    <span className="text-sm font-medium text-slate-800">{m.name}</span>
                    <span className="flex items-center gap-1.5 text-xs text-slate-500">
                      {pd.flag} {pd.code} {pd.number}
                      <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-500">{pd.iso}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {duplicate && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2" data-testid="add-guest-duplicate-panel">
            <p className="text-xs text-amber-800 font-medium">
              ⚠️ This number is already saved as <span className="font-bold">{duplicate.name}</span> ({duplicate.phone}). One number can only belong to one guest.
            </p>
            <div className="flex gap-2">
              <button type="button" data-testid="add-guest-use-existing-btn"
                onClick={() => onCreated(duplicate)}
                className="flex-1 px-3 py-2 rounded-lg bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition">
                Use {duplicate.name} for this bill
              </button>
              <button type="button" data-testid="add-guest-change-number-btn"
                onClick={() => setDuplicate(null)}
                className="px-3 py-2 rounded-lg border border-amber-300 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition">
                Change number
              </button>
            </div>
          </div>
        )}
        <div>
          <label className="text-xs text-slate-500 font-medium">Email (optional)</label>
          <input data-testid="add-guest-email" type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200" placeholder="guest@email.com" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-500 font-medium">Gender</label>
            <select data-testid="add-guest-gender" value={gender} onChange={e => setGender(e.target.value)} className="mt-1 w-full px-2 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none">
              <option>Female</option><option>Male</option><option>Other</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 font-medium">🎂 Birthday</label>
            <input data-testid="add-guest-dob" type="date" value={dob} onChange={e => setDob(e.target.value)} className="mt-1 w-full px-2 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-xs focus:outline-none" />
          </div>
          <div>
            <label className="text-xs text-slate-500 font-medium">💞 Anniversary</label>
            <input data-testid="add-guest-anniversary" type="date" value={anniversary} onChange={e => setAnniversary(e.target.value)} className="mt-1 w-full px-2 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-xs focus:outline-none" />
          </div>
        </div>
        <p className="text-[10px] text-slate-400">Save birthday &amp; anniversary — POS will remind you to offer a special discount that week.</p>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition" data-testid="add-guest-cancel-btn">Cancel</button>
          <button type="submit" disabled={busy} className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-500 text-white text-sm font-bold shadow-md hover:shadow-lg transition disabled:opacity-60" data-testid="add-guest-save-btn">
            {busy ? "Saving…" : "Save Guest"}
          </button>
        </div>
      </form>
    </div>
  );
}
