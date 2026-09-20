import { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { ShieldCheck, Plus, KeyRound, Trash2, X, GitBranch, UserMinus, Pencil, Check } from "lucide-react";
import pinApi from "@/lib/ownerPin";
import { mainSalonLabel } from "@/lib/branch";
import { useAuth } from "@/context/AuthContext";
import { confirmAsync } from "@/components/ConfirmDialog";

export const ManagersSection = ({ onCredential, onChanged }) => {
  const { tenant } = useAuth();
  const branches = tenant?.branches || [];
  const [managers, setManagers] = useState([]);
  const [open, setOpen] = useState(false);
  const EMPTY = { name: "", email: "", password: "", role: "Manager", phone: "", branch: "", specialties: "", commission_pct: 10, monthly_base_salary: 0, salary_visible: true };
  const [form, setForm] = useState(EMPTY);
  const [pwEdit, setPwEdit] = useState(null); // { id, value }
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api.get("/managers").then(r => setManagers(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post("/managers", {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password.trim() || undefined,
        role: form.role.trim() || "Manager",
        phone: form.phone.trim(),
        branch: form.branch,
        specialties: form.specialties.split(",").map(s => s.trim()).filter(Boolean),
        commission_pct: Number(form.commission_pct) || 0,
        monthly_base_salary: Number(form.monthly_base_salary) || 0,
        salary_visible: form.salary_visible,
      });
      onCredential({ name: data.name, email: data.email, temp_password: data.temp_password, email_sent: data.welcome_email_sent });
      setOpen(false);
      setForm(EMPTY);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Couldn't create manager");
    } finally { setSaving(false); }
  }

  async function reset(m) {
    if (!await confirmAsync(`Reset ${m.name}'s password? A new temporary password will be generated.`)) return;
    try {
      const { data } = await api.post(`/managers/${m.id}/reset`);
      onCredential({ name: m.name, email: data.email, temp_password: data.temp_password, email_sent: data.welcome_email_sent });
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Reset failed");
    }
  }

  async function savePassword(m) {
    const pw = (pwEdit?.value || "").trim();
    if (pw.length < 8) return toast.error("Password needs at least 8 characters");
    try {
      await api.put(`/managers/${m.id}/password`, { password: pw });
      toast.success(`${m.name}'s password set ✦ they can sign in with it right away (other devices signed out)`);
      setPwEdit(null);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Couldn't set password");
    }
  }

  async function setBranch(m, branch) {
    try {
      await api.patch(`/managers/${m.id}/branch`, { branch });
      toast.success(branch ? `${m.name} locked to ${branch === "__main__" ? "the main salon" : branch} — they'll only see that branch` : `${m.name} can now see all branches`);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Couldn't update branch");
    }
  }

  async function demote(m) {
    if (!await confirmAsync(`Demote ${m.name} back to staff? They keep their login & staff profile, but lose manager access.`)) return;
    try {
      await pinApi.post(`/managers/${m.id}/demote`);
      toast.success(`${m.name} is now regular staff again`);
      load();
      onChanged?.();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Couldn't demote");
    }
  }

  async function remove(m) {
    if (!await confirmAsync(`Remove manager ${m.name}? Their login will be deleted.`)) return;
    try {
      await api.delete(`/managers/${m.id}`);
      toast.success("Manager removed");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Delete failed");
    }
  }

  const [emailEdit, setEmailEdit] = useState(null); // { id, value }
  async function saveEmail(m, merge = false) {
    const email = (emailEdit?.value || "").trim().toLowerCase();
    if (!email || email === m.email) { setEmailEdit(null); return; }
    try {
      const { data } = await api.patch(`/managers/${m.id}/email`, { email, merge });
      if (data.merged) toast.success(`Merged — ${data.email} is now the single manager login for every branch (GPS picks the branch at sign-in). ${data.removed} removed.`, { duration: 9000 });
      else toast.success(`${m.name} now signs in as ${data.email} — same password, same branch ✦`);
      setEmailEdit(null);
      load();
      onChanged?.();
    } catch (err) {
      const d = err.response?.data?.detail;
      if (err.response?.status === 409 && d?.code === "manager_email_in_use") {
        const ok = await confirmAsync(`${d.message}\n\nMerge into ONE login?\n• ${d.name}'s login (${email}) stays and gets unlocked from its branch — GPS picks the branch at every sign-in\n• ${m.name}'s login (${m.email}) is removed (staff history is kept)`);
        if (ok) return saveEmail(m, true);
        return;
      }
      toast.error(formatApiError(d) || "Couldn't change email");
    }
  }

  return (
    <div className="card-light" data-testid="managers-section">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h2 className="font-playfair text-xl">Managers</h2>
            <p className="text-xs text-slate-500 mt-0.5">Restricted logins — daily operations only. No Reports, Settings or Plans. WhatsApp messages need your approval.</p>
            <p className="text-[11px] text-violet-700 mt-1">One manager = one login for every branch: leave the branch on “📍 GPS picks branch at login” and the device chooses its branch at sign-in (remembered 15 days). You don&apos;t need a separate login per branch.</p>
          </div>
        </div>
        <button data-testid="add-manager-btn" onClick={() => setOpen(true)} className="btn-blue flex items-center justify-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Add Manager
        </button>
      </div>

      {managers.length === 0 ? (
        <div className="text-slate-400 text-sm py-6 text-center border border-dashed border-slate-200 rounded-xl" data-testid="managers-empty">
          No managers yet. Already added your manager as a staff member? Use the <b>Promote</b> button on their staff card above — their login, branch and history carry over. Or add a fresh manager login here.
        </div>
      ) : (
        <div className="space-y-2">
          {managers.map(m => (
            <div key={m.id} className="flex flex-col sm:flex-row sm:items-center gap-2 border border-slate-200 rounded-xl px-4 py-3" data-testid={`manager-row-${m.id}`}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-800">{m.name}</div>
                {emailEdit?.id === m.id ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <input autoFocus type="email" value={emailEdit.value} onChange={e => setEmailEdit({ id: m.id, value: e.target.value })}
                      onKeyDown={e => { if (e.key === "Enter") saveEmail(m); if (e.key === "Escape") setEmailEdit(null); }}
                      data-testid={`manager-email-input-${m.id}`} className="input-light text-xs py-1 px-2 w-full max-w-[280px]" placeholder="new login email" />
                    <button type="button" data-testid={`manager-email-save-${m.id}`} onClick={() => saveEmail(m)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"><Check className="w-4 h-4" /></button>
                    <button type="button" onClick={() => setEmailEdit(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <button type="button" data-testid={`manager-email-edit-${m.id}`} onClick={() => setEmailEdit({ id: m.id, value: m.email })}
                    title="Change login email — password & branch stay the same" className="text-xs text-slate-500 hover:text-violet-700 inline-flex items-center gap-1 group">
                    {m.email} <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                )}
              </div>
              {branches.length > 0 && (
                <div className="flex items-center gap-1.5 shrink-0" title="Lock this login to one branch — they'll only see that branch's data">
                  <GitBranch className="w-3.5 h-3.5 text-slate-400" />
                  <select data-testid={`manager-branch-${m.id}`} value={m.branch || ""} onChange={e => setBranch(m, e.target.value)}
                    className={`text-xs border rounded-lg px-2 py-1.5 bg-white max-w-[230px] ${m.branch ? "border-violet-300 text-violet-700 font-semibold" : "border-slate-200 text-slate-500"}`}>
                    <option value="">📍 GPS picks branch at login</option>
                    <option value="__main__">🏠 {mainSalonLabel(tenant)} (Main)</option>
                    {branches.map(b => <option key={b.id || b.name} value={b.name}>🔒 {b.name}</option>)}
                  </select>
                </div>
              )}
              {m.must_change_password && (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">Awaiting first login</span>
              )}
              <div className="flex items-center gap-1.5 shrink-0">
                {pwEdit?.id === m.id ? (
                  <div className="flex items-center gap-1">
                    <input autoFocus type="text" value={pwEdit.value} onChange={e => setPwEdit({ id: m.id, value: e.target.value })}
                      onKeyDown={e => { if (e.key === "Enter") savePassword(m); if (e.key === "Escape") setPwEdit(null); }}
                      data-testid={`manager-password-set-input-${m.id}`} className="input-light text-xs py-1 px-2 w-40 font-mono" placeholder="new password (8+)" autoComplete="off" />
                    <button type="button" data-testid={`manager-password-set-save-${m.id}`} onClick={() => savePassword(m)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"><Check className="w-4 h-4" /></button>
                    <button type="button" onClick={() => setPwEdit(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <button type="button" data-testid={`manager-password-set-${m.id}`} onClick={() => setPwEdit({ id: m.id, value: "" })} title="Choose the manager's password yourself"
                    className="text-xs py-1.5 px-3 rounded-md bg-violet-50 border border-violet-200 text-violet-700 hover:bg-violet-100 inline-flex items-center gap-1"><KeyRound className="w-3.5 h-3.5" /> Set password</button>
                )}
                <button
                  data-testid={`reset-manager-${m.id}`}
                  onClick={() => reset(m)}
                  className="text-xs py-1.5 px-3 rounded-md bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 inline-flex items-center gap-1"
                >
                  <KeyRound className="w-3 h-3" /> Reset password
                </button>
                <button data-testid={`demote-manager-${m.id}`} onClick={() => demote(m)} title="Demote back to staff (keeps login & staff profile)"
                  className="text-xs py-1.5 px-3 rounded-md bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1">
                  <UserMinus className="w-3 h-3" /> Demote
                </button>
                <button data-testid={`delete-manager-${m.id}`} onClick={() => remove(m)} className="p-1.5 text-slate-500 hover:text-red-500 transition">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3" onClick={() => setOpen(false)}>
          <div className="card-light w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-playfair text-xl">Add Manager</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={create} className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Full name *</label>
                <input data-testid="manager-name-input" required minLength={2} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-light w-full" placeholder="e.g. Ramesh Kumar" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Role</label>
                  <input data-testid="manager-role-input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="input-light w-full" placeholder="Manager / Stylist" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Phone</label>
                  <input data-testid="manager-phone-input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="input-light w-full" placeholder="+91 98…" />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Login email *</label>
                <input data-testid="manager-email-input" required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input-light w-full" placeholder="manager@yoursalon.com" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Login password <span className="text-slate-400">(optional — blank = temp password emailed)</span></label>
                <input data-testid="manager-password-input" type="text" minLength={8} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="input-light w-full font-mono" placeholder="Min 8 characters — you choose it" autoComplete="off" />
              </div>
              {branches.length > 0 && (
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Branch (lock this login to one location)</label>
                  <select data-testid="manager-branch-input" value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))} className="input-light w-full">
                    <option value="">📍 GPS picks the branch at login (recommended)</option>
                    <option value="__main__">🏠 {mainSalonLabel(tenant)} (Main only)</option>
                    {branches.map(b => <option key={b.id || b.name} value={b.name}>🔒 {b.name} only</option>)}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">GPS mode: at every login the manager is asked for their location and can only pick the branch within 100 m — the others are disabled. A branch-locked login always sees one branch, wherever they are.</p>
                </div>
              )}
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Specialties (comma separated)</label>
                <input data-testid="manager-specialties-input" value={form.specialties} onChange={e => setForm(f => ({ ...f, specialties: e.target.value }))} className="input-light w-full" placeholder="Hair Color, Bridal Makeup" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Commission %</label>
                  <input data-testid="manager-commission-input" type="number" min={0} max={100} value={form.commission_pct} onChange={e => setForm(f => ({ ...f, commission_pct: e.target.value }))} className="input-light w-full" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">₹ Monthly base salary</label>
                  <input data-testid="manager-salary-input" type="number" min={0} value={form.monthly_base_salary} onChange={e => setForm(f => ({ ...f, monthly_base_salary: e.target.value }))} className="input-light w-full" />
                </div>
              </div>
              <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                <input data-testid="manager-salary-visible-input" type="checkbox" checked={form.salary_visible} onChange={e => setForm(f => ({ ...f, salary_visible: e.target.checked }))} className="mt-0.5 w-4 h-4 accent-violet-600" />
                <span>Allow this manager to view their salary<br /><span className="text-[11px] text-slate-500">If unchecked, salary slips are hidden from their portal.</span></span>
              </label>
              <p className="text-[11px] text-slate-500">A temporary password will be generated — share it on WhatsApp. The manager sets their own password on first login. They&apos;ll also appear in Staff & bookings.</p>
              <button data-testid="manager-create-submit" disabled={saving} type="submit" className="btn-blue w-full">{saving ? "Creating…" : "Create manager login"}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
