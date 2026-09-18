import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Fingerprint, Trash2, Plus } from "lucide-react";
import { passkeySupported, registerPasskey } from "@/lib/webauthn";
import { confirmAsync } from "@/components/ConfirmDialog";

// Owner sees every enrolled fingerprint / Face ID device and can revoke one (e.g. a lost phone).
export const PasskeyManagerCard = () => {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/passkeys/mine").then(r => setRows(r.data)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  const add = async () => {
    setBusy(true);
    try { await registerPasskey(); toast.success("🔒 This device can now sign in with fingerprint / Face ID"); localStorage.removeItem("pk_declined"); load(); }
    catch (e) { toast.error(e?.name === "NotAllowedError" ? "Cancelled" : (e?.response?.data?.detail || e?.message || "Couldn't enrol")); }
    finally { setBusy(false); }
  };
  const revoke = async (r) => {
    if (!await confirmAsync("Remove this device? It will no longer be able to sign in with fingerprint / Face ID.", { title: "Remove passkey", confirmLabel: "Remove", danger: true })) return;
    try { await api.delete(`/passkeys/mine/${encodeURIComponent(r.id)}`); toast.success("Device removed"); if (rows.length === 1) localStorage.removeItem("pk_enrolled"); load(); }
    catch { toast.error("Couldn't remove"); }
  };
  const fmt = (s) => s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5" data-testid="passkey-manager-card">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2"><Fingerprint className="w-5 h-5 text-[#b8860b]" /><h3 className="font-semibold text-slate-900">Fingerprint / Face ID devices</h3></div>
        {passkeySupported() && <button onClick={add} disabled={busy} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-900 text-white text-xs font-semibold disabled:opacity-60" data-testid="passkey-add"><Plus className="w-3.5 h-3.5" /> {busy ? "Waiting…" : "Add this device"}</button>}
      </div>
      <p className="text-xs text-slate-500 mb-3">Passkeys live only on your device and can't be phished. Lost a phone? Remove it here and it can no longer sign in.</p>
      {rows === null ? <div className="h-12 animate-pulse bg-slate-50 rounded-xl" /> : rows.length === 0 ? (
        <div className="text-sm text-slate-500" data-testid="passkeys-empty">No devices enrolled yet.</div>
      ) : rows.map(r => (
        <div key={r.id} className="flex items-center justify-between gap-3 py-2 border-t border-slate-100 first:border-0" data-testid="passkey-row">
          <div><div className="text-sm font-semibold text-slate-800">{r.label} <span className="text-[10px] font-normal text-slate-400">· {r.rp_id}</span></div>
            <div className="text-[11px] text-slate-500">Added {fmt(r.created_at)} · last used {fmt(r.last_used_at)}</div></div>
          <button onClick={() => revoke(r)} className="w-8 h-8 rounded-full border border-rose-200 text-rose-600 flex items-center justify-center hover:bg-rose-50" aria-label="Remove" data-testid="passkey-revoke"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
    </div>
  );
};
