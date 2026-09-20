import { useCallback, useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Check, Loader2, Pencil, Users, X } from "lucide-react";

const ROLE_STYLE = {
  admin: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  manager: "bg-violet-50 text-violet-700 border-violet-200",
  staff: "bg-slate-100 text-slate-600 border-slate-200",
};

function LoginRow({ u, onRenamed }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(u.email);
  const [busy, setBusy] = useState(false);
  const branch = u.branch === "__main__" ? "Main branch" : u.branch;

  async function save() {
    const email = val.trim().toLowerCase();
    if (!email || email === u.email) { setEditing(false); return; }
    setBusy(true);
    try {
      const { data } = await api.put(`/super-admin/users/${u.id}/email`, { email });
      toast.success(`${u.name || "Login"} now signs in as ${data.email} ✦`);
      setEditing(false);
      onRenamed();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Couldn't change email");
    } finally { setBusy(false); }
  }

  return (
    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2" data-testid={`tenant-login-${u.id}`}>
      <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border font-semibold shrink-0 ${ROLE_STYLE[u.role] || ROLE_STYLE.staff}`}>
        {u.is_owner ? "owner" : u.role}
      </span>
      <div className="min-w-0 flex-1">
        {editing ? (
          <input autoFocus type="email" value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            data-testid={`tenant-login-email-input-${u.id}`}
            className="w-full px-2 py-1 rounded border border-fuchsia-300 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-fuchsia-200" />
        ) : (
          <div className="text-xs font-medium text-slate-700 truncate" data-testid={`tenant-login-email-${u.id}`}>{u.email}</div>
        )}
        <div className="text-[10px] text-slate-400 truncate">
          {u.name}{branch ? ` · 🔒 ${branch}` : ""}{u.salon_count > 1 ? ` · ${u.salon_count} businesses on this login` : ""}{u.disabled ? " · disabled" : ""}
        </div>
      </div>
      {editing ? (
        <>
          <button type="button" onClick={save} disabled={busy} data-testid={`tenant-login-save-${u.id}`} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded shrink-0">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button type="button" onClick={() => { setEditing(false); setVal(u.email); }} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded shrink-0"><X className="w-3.5 h-3.5" /></button>
        </>
      ) : (
        <button type="button" onClick={() => setEditing(true)} data-testid={`tenant-login-edit-${u.id}`} title="Change this login's email (password & branch stay)"
          className="p-1.5 text-slate-400 hover:text-fuchsia-600 hover:bg-fuchsia-50 rounded shrink-0"><Pencil className="w-3.5 h-3.5" /></button>
      )}
    </div>
  );
}

export function TenantLoginsCard({ tenantId, refreshKey, onChanged }) {
  const [data, setData] = useState(null);
  const load = useCallback(() => {
    api.get(`/super-admin/tenants/${tenantId}/logins`).then(r => setData(r.data)).catch(() => {});
  }, [tenantId]);
  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div className="border-t border-slate-100 pt-4" data-testid="tenant-logins-card">
      <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2 flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-violet-500" /> Logins for this business</div>
      <div className="space-y-1.5">
        {(data?.logins || []).map(u => <LoginRow key={u.id} u={u} onRenamed={() => { load(); onChanged?.(); }} />)}
        {data && data.logins.length === 0 && <p className="text-[11px] text-slate-400">No logins yet.</p>}
      </div>
      <p className="text-[10px] text-slate-400 mt-1.5">Tap ✎ to swap a placeholder login (e.g. name@miracurl.com) for a real email. Password, role and branch lock are kept — only the sign-in email changes.</p>
    </div>
  );
}
