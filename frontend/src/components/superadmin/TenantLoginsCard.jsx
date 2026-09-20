import { useCallback, useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Check, Loader2, Pencil, Users, X, Trash2, ArrowLeftRight } from "lucide-react";
import { confirmAsync } from "@/components/ConfirmDialog";

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

  async function toggleRole() {
    const to = u.role === "manager" ? "admin" : "manager";
    const msg = to === "manager"
      ? `Make ${u.email} a MANAGER login?\n\nSame password. Restricted menu (no Reports/Settings/Plans). Covers every business currently on this login — the branch/salon picker asks where they are at sign-in.`
      : `Make ${u.email} an OWNER (admin) login?\n\nSame password, full access to every business on this login.`;
    if (!await confirmAsync(msg)) return;
    setBusy(true);
    try {
      const { data } = await api.put(`/super-admin/users/${u.id}/role`, { role: to, tenant_ids: [] });
      toast.success(`${data.email} is now ${to === "admin" ? "an owner" : "a manager"} login for ${data.tenant_ids.length} business(es) ✦`);
      onRenamed();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Couldn't change role");
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
        <>
          {(u.role === "manager" || (u.role === "admin" && !u.is_owner)) && (
            <button type="button" onClick={toggleRole} disabled={busy} data-testid={`tenant-login-role-${u.id}`} title={u.role === "manager" ? "Make owner login" : "Make manager login"}
              className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded shrink-0"><ArrowLeftRight className="w-3.5 h-3.5" /></button>
          )}
          <button type="button" onClick={() => setEditing(true)} data-testid={`tenant-login-edit-${u.id}`} title="Change this login's email (password & branch stay)"
            className="p-1.5 text-slate-400 hover:text-fuchsia-600 hover:bg-fuchsia-50 rounded shrink-0"><Pencil className="w-3.5 h-3.5" /></button>
        </>
      )}
    </div>
  );
}

const TEST_RE = /(@test\.com$|^test_user_|^test_staff_|^staff_rev_|^stafftest@)/;

export function TenantLoginsCard({ tenantId, refreshKey, onChanged }) {
  const [data, setData] = useState(null);
  const [purging, setPurging] = useState(false);
  const load = useCallback(() => {
    api.get(`/super-admin/tenants/${tenantId}/logins`).then(r => setData(r.data)).catch(() => {});
  }, [tenantId]);
  useEffect(() => { load(); }, [load, refreshKey]);
  const logins = data?.logins || [];
  const testLogins = logins.filter(u => u.role !== "admin" && TEST_RE.test(u.email));
  const real = logins.filter(u => !testLogins.includes(u));

  async function purge() {
    if (!await confirmAsync(`Remove ${testLogins.length} test logins (…@test.com, test_user_…) and their test staff profiles?\n\nThese were created by automated test runs — they are not real people.`)) return;
    setPurging(true);
    try {
      const { data: r } = await api.delete(`/super-admin/tenants/${tenantId}/test-logins`);
      toast.success(`Removed ${r.removed} test logins and ${r.staff_removed} test staff profiles ✦`);
      load(); onChanged?.();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Couldn't remove test logins");
    } finally { setPurging(false); }
  }

  return (
    <div className="border-t border-slate-100 pt-4" data-testid="tenant-logins-card">
      <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2 flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-violet-500" /> Logins for this business</div>
      <div className="space-y-1.5">
        {real.map(u => <LoginRow key={u.id} u={u} onRenamed={() => { load(); onChanged?.(); }} />)}
        {data && logins.length === 0 && <p className="text-[11px] text-slate-400">No logins yet.</p>}
      </div>
      {testLogins.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex items-center gap-2 flex-wrap" data-testid="tenant-test-logins">
          <span className="text-[11px] text-amber-800"><b>{testLogins.length} test logins</b> left by automated test runs (…@test.com) are hidden here — they aren&apos;t real people.</span>
          <button type="button" onClick={purge} disabled={purging} data-testid="tenant-test-logins-purge"
            className="ml-auto inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-60">
            {purging ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Remove all {testLogins.length}
          </button>
        </div>
      )}
      <p className="text-[10px] text-slate-400 mt-1.5">Tap ✎ to swap a placeholder login (e.g. name@miracurl.com) for a real email; ⇄ flips a login between owner and manager. Password is kept either way.</p>
    </div>
  );
}
