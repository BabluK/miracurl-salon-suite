import { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { ShieldCheck, Plus, KeyRound, Trash2, X, GitBranch, UserMinus } from "lucide-react";
import pinApi from "@/lib/ownerPin";
import { useAuth } from "@/context/AuthContext";

export const ManagersSection = ({ onCredential, onChanged }) => {
  const { tenant } = useAuth();
  const branches = tenant?.branches || [];
  const [managers, setManagers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "Manager", phone: "", branch: "", specialties: "", commission_pct: 10, monthly_base_salary: 0, salary_visible: true });
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
        role: form.role.trim() || "Manager",
        phone: form.phone.trim(),
        branch: form.branch,
        specialties: form.specialties.split(",").map(s => s.trim()).filter(Boolean),
        commission_pct: Number(form.commission_pct) || 0,
        monthly_base_salary: Number(form.monthly_base_salary) || 0,
        salary_visible: form.salary_visible,
      });
      onCredential({ name: data.name, email: data.email, temp_password: data.temp_password });
      setOpen(false);
      setForm({ name: "", email: "", role: "Manager", phone: "", branch: "", specialties: "", commission_pct: 10, monthly_base_salary: 0, salary_visible: true });
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Couldn't create manager");
    } finally { setSaving(false); }
  }

  async function reset(m) {
    if (!window.confirm(`Reset ${m.name}'s password? A new temporary password will be generated.`)) return;
    try {
      const { data } = await api.post(`/managers/${m.id}/reset`);
      onCredential({ name: m.name, email: data.email, temp_password: data.temp_password });
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Reset failed");
    }
  }

  async function setBranch(m, branch) {
    try {
      await api.patch(`/managers/${m.id}/branch`, { branch });
      toast.success(branch ? `${m.name} locked to ${branch} — they'll only see that branch` : `${m.name} can now see all branches`);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Couldn't update branch");
    }
  }

  async function demote(m) {
    if (!window.confirm(`Demote ${m.name} back to staff? They keep their login & staff profile, but lose manager access.`)) return;
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
    if (!window.confirm(`Remove manager ${m.name}? Their login will be deleted.`)) return;
    try {
      await api.delete(`/managers/${m.id}`);
      toast.success("Manager removed");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Delete failed");
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
                <div className="text-xs text-slate-500">{m.email}</div>
              </div>
              {branches.length > 0 && (
                <div className="flex items-center gap-1.5 shrink-0" title="Lock this login to one branch — they'll only see that branch's data">
                  <GitBranch className="w-3.5 h-3.5 text-slate-400" />
                  <select data-testid={`manager-branch-${m.id}`} value={m.branch || ""} onChange={e => setBranch(m, e.target.value)}
                    className={`text-xs border rounded-lg px-2 py-1.5 bg-white max-w-[170px] ${m.branch ? "border-violet-300 text-violet-700 font-semibold" : "border-slate-200 text-slate-500"}`}>
                    <option value="">🌐 All branches</option>
                    <option value="__main__">🏠 Main salon only</option>
                    {branches.map(b => <option key={b.id || b.name} value={b.name}>🔒 {b.name}</option>)}
                  </select>
                </div>
              )}
              {m.must_change_password && (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">Awaiting first login</span>
              )}
              <div className="flex items-center gap-1.5 shrink-0">
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
              {branches.length > 0 && (
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Branch (lock this login to one location)</label>
                  <select data-testid="manager-branch-input" value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))} className="input-light w-full">
                    <option value="">🌐 All branches (not locked)</option>
                    <option value="__main__">🏠 Main salon only</option>
                    {branches.map(b => <option key={b.id || b.name} value={b.name}>🔒 {b.name} only</option>)}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">A branch-locked login only ever sees its own branch — no switching. Only your owner login can switch branches (PIN protected).</p>
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
