import { useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { UserPlus, X } from "lucide-react";

export default function AddGuestModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

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
        email: email.trim() || null,
      });
      onCreated(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't create guest");
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
          <input data-testid="add-guest-name" value={name} onChange={e => setName(e.target.value)} required className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200" placeholder="Full name" />
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium">Phone *</label>
          <input data-testid="add-guest-phone" value={phone} onChange={e => setPhone(e.target.value)} required className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200" placeholder="98765 43210" />
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium">Email (optional)</label>
          <input data-testid="add-guest-email" type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200" placeholder="you@example.com" />
        </div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
          <button
            type="submit"
            data-testid="add-guest-save-btn"
            disabled={busy}
            className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-sky-500 to-blue-500 text-white text-sm font-semibold disabled:opacity-60"
          >{busy ? "Saving…" : "Save Guest"}</button>
        </div>
      </form>
    </div>
  );
}
