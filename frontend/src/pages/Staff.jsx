import { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import {
  Plus, X, Edit3, Trash2, Phone, Mail, Percent, IndianRupee,
  KeyRound, Eye, EyeOff, Copy, Power, MessageCircle, Clock,
} from "lucide-react";
import { toast } from "sonner";
import ImageUploader from "@/components/ImageUploader";
import { ManagersSection } from "@/components/ManagersSection";
import { openWhatsApp } from "@/lib/share";

const EMPTY_FORM = {
  name: "", role: "Stylist", phone: "", email: "", specialties: "",
  commission_pct: 10, monthly_base_salary: 0, salary_visible: true,
  image_url: "", active: true,
  shift_start: "10:00", shift_end: "21:00", overtime_rate: 0,
  max_advance: 0, notice_period_days: 30, serving_notice: false,
  last_working_day: "", aadhaar: "",
};

const buildStaffPayload = (form) => ({
  ...form,
  specialties: form.specialties.split(",").map(x => x.trim()).filter(Boolean),
  commission_pct: parseFloat(form.commission_pct) || 0,
  monthly_base_salary: parseFloat(form.monthly_base_salary) || 0,
  salary_visible: !!form.salary_visible,
  overtime_rate: parseFloat(form.overtime_rate) || 0,
  max_advance: parseFloat(form.max_advance) || 0,
  notice_period_days: parseInt(form.notice_period_days, 10) || 30,
  serving_notice: !!form.serving_notice,
  last_working_day: form.last_working_day || null,
  aadhaar: (form.aadhaar || "").trim() || null,
});

export default function Staff() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [tempCred, setTempCred] = useState(null); // {name, email, temp_password, phone}
  const [advanceFor, setAdvanceFor] = useState(null); // staff for advance modal

  const load = useCallback(async () => {
    const { data } = await api.get("/staff");
    setList(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  function startNew() { setEditing(null); setForm(EMPTY_FORM); setOpen(true); }
  function startEdit(s) {
    setEditing(s);
    setForm({
      ...EMPTY_FORM, ...s,
      specialties: (s.specialties || []).join(", "),
      monthly_base_salary: s.monthly_base_salary ?? 0,
      salary_visible: s.salary_visible !== false,
      shift_start: s.shift_start || "10:00",
      shift_end: s.shift_end || "21:00",
      overtime_rate: s.overtime_rate ?? 0,
      max_advance: s.max_advance ?? 0,
      notice_period_days: s.notice_period_days ?? 30,
      serving_notice: !!s.serving_notice,
      last_working_day: s.last_working_day || "",
      aadhaar: "",
    });
    setOpen(true);
  }

  async function save(e) {
    e.preventDefault();
    try {
      const payload = buildStaffPayload(form);
      if (editing) {
        await api.put(`/staff/${editing.id}`, payload);
        toast.success("Staff updated");
      } else {
        await api.post("/staff", payload);
        toast.success("Staff added");
      }
      setOpen(false); load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
    }
  }

  async function remove(id) {
    if (!window.confirm("Delete this staff member? Their login (if any) will also be removed.")) return;
    try {
      await api.delete(`/staff/${id}`);
      toast.success("Deleted");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Delete failed");
    }
  }

  async function toggleActive(s) {
    const willBeActive = !s.active;
    const msg = willBeActive
      ? `Enable ${s.name}? Their login (if any) will be reactivated.`
      : `Disable ${s.name}? They will not be able to log in until re-enabled.`;
    if (!window.confirm(msg)) return;
    try {
      await api.post(`/staff/${s.id}/toggle-active`);
      toast.success(willBeActive ? "Staff enabled" : "Staff disabled");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    }
  }

  async function createLogin(s) {
    const email = window.prompt(`Create login for ${s.name}.\nEnter their email:`, s.email || "");
    if (!email || !email.trim()) return;
    try {
      const { data } = await api.post(`/staff/${s.id}/create-login`, { email: email.trim().toLowerCase() });
      setTempCred({ name: s.name, phone: s.phone, email: data.email, temp_password: data.temp_password });
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to create login");
    }
  }

  async function resetLogin(s) {
    if (!window.confirm(`Reset ${s.name}'s password? A new temporary password will be generated and they'll set their own on next login.`)) return;
    try {
      const { data } = await api.post(`/staff/${s.id}/reset-login`);
      setTempCred({ name: s.name, phone: s.phone, email: data.email, temp_password: data.temp_password });
      toast.success("New password generated — share it with the staff");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to reset password");
    }
  }

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-playfair text-2xl sm:text-3xl">Team Management</h1>
          <p className="text-slate-500 text-sm mt-1">Your stylists, therapists and the talents that make your salon shine.</p>
        </div>
        <button data-testid="add-staff-btn" onClick={startNew} className="btn-blue flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" /> Add Staff
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {list.map(s => (
          <div key={s.id} data-testid={`staff-card-${s.id}`} className="card-light text-center group hover:border-sky-300 transition-all">
            <div className="relative inline-block">
              <img src={s.image_url || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300"} alt={s.name} className={`w-24 h-24 rounded-full object-cover mx-auto border-2 ${s.active ? 'border-sky-400' : 'border-gray-300 grayscale'} transition`} />
              <span className={`absolute bottom-1 right-1 w-3 h-3 rounded-full border-2 border-white ${s.active ? 'bg-emerald-400' : 'bg-gray-400'}`} />
            </div>
            <h4 className="font-playfair text-xl mt-3">{s.name}</h4>
            <p className="text-xs uppercase tracking-[0.2em] text-sky-600 mt-1">{s.role}</p>
            <div className="flex flex-wrap gap-1 justify-center mt-3">
              {(s.specialties || []).map(sp => (
                <span key={sp} className="text-[10px] bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">{sp}</span>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-1 text-xs text-slate-500">
              <div className="flex items-center gap-2 justify-center"><Phone className="w-3 h-3" /> {s.phone}</div>
              {s.email && <div className="flex items-center gap-2 justify-center"><Mail className="w-3 h-3" /> {s.email}</div>}
              <div className="flex items-center gap-2 justify-center text-sky-600"><Percent className="w-3 h-3" /> {s.commission_pct}% commission</div>
              <div className="flex items-center gap-2 justify-center text-slate-500" data-testid={`shift-chip-${s.id}`}>
                <Clock className="w-3 h-3" /> {s.shift_start || "10:00"}–{s.shift_end || "21:00"}
                {Number(s.overtime_rate) > 0 && <span className="text-violet-600">· OT ₹{s.overtime_rate}/hr</span>}
              </div>
              {s.serving_notice && (
                <div className="inline-flex items-center gap-1 text-[10px] mt-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-300 text-amber-700 font-medium" data-testid={`notice-badge-${s.id}`}>
                  Serving notice{s.last_working_day ? ` · last day ${s.last_working_day}` : ""}
                </div>
              )}
              {s.aadhaar_last4 && (
                <div className="text-[10px] text-slate-400">Aadhaar · XXXX-XXXX-{s.aadhaar_last4}</div>
              )}
              {s.monthly_base_salary > 0 && (
                <div className="flex items-center gap-2 justify-center text-emerald-600 font-medium">
                  <IndianRupee className="w-3 h-3" /> ₹{Number(s.monthly_base_salary).toLocaleString("en-IN")}/mo base
                </div>
              )}
              {s.user_id ? (
                <div className="inline-flex items-center gap-1 text-[10px] mt-1 px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700">
                  <KeyRound className="w-3 h-3" /> Login active
                </div>
              ) : (
                <div className="inline-flex items-center gap-1 text-[10px] mt-1 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-500">
                  No login
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 justify-center mt-4">
              <button data-testid={`edit-staff-${s.id}`} onClick={() => startEdit(s)} className="btn-slate flex items-center gap-1 text-xs py-1.5 px-3"><Edit3 className="w-3 h-3" /> Edit</button>
              <button
                data-testid={`advance-staff-${s.id}`}
                onClick={() => setAdvanceFor(s)}
                className="text-xs py-1.5 px-3 rounded-md bg-violet-50 border border-violet-200 text-violet-700 hover:bg-violet-100 inline-flex items-center gap-1"
                title="Give / view salary advance"
              >
                <IndianRupee className="w-3 h-3" /> Advance
              </button>
              {!s.user_id ? (
                <button
                  data-testid={`create-login-${s.id}`}
                  onClick={() => createLogin(s)}
                  className="text-xs py-1.5 px-3 rounded-md bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 inline-flex items-center gap-1"
                  title="Create login credentials for this staff"
                >
                  <KeyRound className="w-3 h-3" /> Give login
                </button>
              ) : (
                <button
                  data-testid={`reset-login-${s.id}`}
                  onClick={() => resetLogin(s)}
                  className="text-xs py-1.5 px-3 rounded-md bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 inline-flex items-center gap-1"
                  title="Generate a new temporary password for this staff"
                >
                  <KeyRound className="w-3 h-3" /> Reset password
                </button>
              )}
              <button
                data-testid={`toggle-active-${s.id}`}
                onClick={() => toggleActive(s)}
                className={`text-xs py-1.5 px-3 rounded-md inline-flex items-center gap-1 border ${s.active ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'}`}
                title={s.active ? "Disable this staff — they cannot log in" : "Enable this staff"}
              >
                <Power className="w-3 h-3" /> {s.active ? "Disable" : "Enable"}
              </button>
              <button data-testid={`delete-staff-${s.id}`} onClick={() => remove(s.id)} className="p-1.5 text-slate-500 hover:text-red-500 transition"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
        {list.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400">No staff yet — click &ldquo;Add Staff&rdquo; to get started.</div>
        )}
      </div>

      <ManagersSection onCredential={setTempCred} />

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3" onClick={() => setOpen(false)}>
          <div className="card-light w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-playfair text-2xl">{editing ? "Edit Staff" : "New Staff"}</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div><label className="label-light block mb-1">Name *</label><input data-testid="staff-name-input" required className="input-light" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="label-light block mb-1">Role</label><input required className="input-light" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="Senior Stylist" /></div>
                <div><label className="label-light block mb-1">Phone *</label><input data-testid="staff-phone-input" required className="input-light" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              </div>
              <div><label className="label-light block mb-1">Email</label><input type="email" className="input-light" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div><label className="label-light block mb-1">Specialties (comma separated)</label><input className="input-light" value={form.specialties} onChange={e => setForm({ ...form, specialties: e.target.value })} placeholder="Hair, Color, Makeup" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label-light block mb-1">Commission %</label>
                  <input type="number" step="0.5" className="input-light" value={form.commission_pct} onChange={e => setForm({ ...form, commission_pct: e.target.value })} />
                </div>
                <div>
                  <label className="label-light block mb-1 inline-flex items-center gap-1"><IndianRupee className="w-3 h-3" /> Monthly base salary</label>
                  <input
                    data-testid="staff-base-salary-input"
                    type="number" step="100" min="0"
                    className="input-light"
                    value={form.monthly_base_salary}
                    onChange={e => setForm({ ...form, monthly_base_salary: e.target.value })}
                    placeholder="e.g. 20000"
                  />
                </div>
              </div>
              <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer select-none">
                <input
                  data-testid="staff-salary-visible-toggle"
                  type="checkbox"
                  checked={!!form.salary_visible}
                  onChange={e => setForm({ ...form, salary_visible: e.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Allow this staff to view their salary</span>
                  <span className="block text-xs text-slate-500">If unchecked, they can still check in/out but salary slips will be hidden from their portal.</span>
                </span>
              </label>
              <div className="rounded-xl border border-slate-200 p-3 space-y-3" data-testid="staff-shift-section">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Shift, Advance & Compliance</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label-light block mb-1">Shift start</label>
                    <input data-testid="staff-shift-start-input" type="time" className="input-light" value={form.shift_start} onChange={e => setForm({ ...form, shift_start: e.target.value })} />
                    <p className="text-[10px] text-slate-400 mt-1">10-min grace, then ₹50 fine per 5 min late</p>
                  </div>
                  <div>
                    <label className="label-light block mb-1">Shift end</label>
                    <input data-testid="staff-shift-end-input" type="time" className="input-light" value={form.shift_end} onChange={e => setForm({ ...form, shift_end: e.target.value })} />
                    <p className="text-[10px] text-slate-400 mt-1">Work after this earns overtime</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label-light block mb-1">Overtime ₹/hr</label>
                    <input data-testid="staff-overtime-rate-input" type="number" min="0" step="10" className="input-light" value={form.overtime_rate} onChange={e => setForm({ ...form, overtime_rate: e.target.value })} placeholder="50 Beautician · 100 Senior" />
                  </div>
                  <div>
                    <label className="label-light block mb-1">Max advance ₹/month</label>
                    <input data-testid="staff-max-advance-input" type="number" min="0" step="500" className="input-light" value={form.max_advance} onChange={e => setForm({ ...form, max_advance: e.target.value })} placeholder="e.g. 5000" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label-light block mb-1">Notice period (days)</label>
                    <input data-testid="staff-notice-days-input" type="number" min="0" className="input-light" value={form.notice_period_days} onChange={e => setForm({ ...form, notice_period_days: e.target.value })} />
                  </div>
                  <div>
                    <label className="label-light block mb-1">Aadhaar number</label>
                    <input data-testid="staff-aadhaar-input" inputMode="numeric" maxLength={14} className="input-light" value={form.aadhaar} onChange={e => setForm({ ...form, aadhaar: e.target.value })}
                      placeholder={editing?.aadhaar_last4 ? `Saved · XXXX-XXXX-${editing.aadhaar_last4}` : "12 digits"} />
                    <p className="text-[10px] text-slate-400 mt-1">Stored securely — only last 4 digits shown</p>
                  </div>
                </div>
                <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer select-none">
                  <input data-testid="staff-serving-notice-toggle" type="checkbox" checked={!!form.serving_notice}
                    onChange={e => {
                      const on = e.target.checked;
                      const lwd = on && !form.last_working_day
                        ? new Date(Date.now() + (parseInt(form.notice_period_days, 10) || 30) * 86400000).toISOString().slice(0, 10)
                        : form.last_working_day;
                      setForm({ ...form, serving_notice: on, last_working_day: on ? lwd : "" });
                    }}
                    className="mt-0.5" />
                  <span>
                    <span className="font-medium">Serving notice period</span>
                    <span className="block text-xs text-slate-500">Marks this staff as resigned — last working day auto-computed from notice period.</span>
                  </span>
                </label>
                {form.serving_notice && (
                  <div>
                    <label className="label-light block mb-1">Last working day</label>
                    <input data-testid="staff-last-working-day-input" type="date" className="input-light" value={form.last_working_day} onChange={e => setForm({ ...form, last_working_day: e.target.value })} />
                  </div>
                )}
              </div>
              <div>
                <label className="label-light block mb-1">Staff photo</label>
                <ImageUploader
                  kind="staff"
                  circular
                  value={form.image_url}
                  onChange={(url) => setForm({ ...form, image_url: url })}
                  onUploaded={async (url) => {
                    if (!editing) { toast.success("Photo attached — it saves with the profile ✦"); return; }
                    try {
                      await api.put(`/staff/${editing.id}`, { ...buildStaffPayload(form), image_url: url });
                      toast.success("Photo uploaded & saved ✦");
                      load();
                    } catch { toast.error("Auto-save failed — press Save"); }
                  }}
                  fallback="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="btn-slate flex-1">Cancel</button>
                <button data-testid="save-staff-btn" type="submit" className="btn-blue flex-1">{editing ? "Update" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {tempCred && (
        <TempCredModal cred={tempCred} onClose={() => setTempCred(null)} />
      )}

      {advanceFor && (
        <AdvanceModal staff={advanceFor} onClose={() => setAdvanceFor(null)} />
      )}
    </div>
  );
}

function AdvanceModal({ staff, onClose }) {
  const [rows, setRows] = useState(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const month = new Date().toISOString().slice(0, 7);
  const thisMonth = (rows || []).find(r => r.month === month);
  const maxAdv = Number(staff.max_advance) || 0;

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/staff/${staff.id}/advances`);
      setRows(data);
    } catch { setRows([]); }
  }, [staff.id]);
  useEffect(() => { load(); }, [load]);

  async function give(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/staff/${staff.id}/advance`, { amount: parseFloat(amount) || 0, note });
      toast.success(`Advance recorded for ${staff.name}`);
      setAmount(""); setNote("");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Couldn't record advance");
    } finally { setBusy(false); }
  }

  async function undo(aid) {
    if (!window.confirm("Remove this advance entry?")) return;
    try {
      await api.delete(`/staff/${staff.id}/advance/${aid}`);
      toast.success("Advance removed");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Couldn't remove");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3" onClick={onClose}>
      <div className="card-light w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid="advance-modal">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-playfair text-xl">Salary advance — {staff.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 px-3 py-2 mb-4 space-y-0.5">
          <div>• Max limit: <b>{maxAdv > 0 ? `₹${maxAdv.toLocaleString("en-IN")}` : "not set (edit staff to set it)"}</b></div>
          <div>• One advance per month, only after the 15th</div>
          <div>• Auto-deducted from this month&apos;s salary slip</div>
        </div>
        {thisMonth ? (
          <div className="rounded-lg bg-violet-50 border border-violet-200 px-3 py-2 mb-4 text-sm text-violet-800 flex items-center justify-between" data-testid="advance-this-month">
            <span>This month: <b>₹{Number(thisMonth.amount).toLocaleString("en-IN")}</b> on {thisMonth.created_at?.slice(0, 10)}</span>
            <button onClick={() => undo(thisMonth.id)} className="text-xs text-red-500 hover:underline">undo</button>
          </div>
        ) : (
          <form onSubmit={give} className="space-y-3 mb-4">
            <div>
              <label className="label-light block mb-1">Amount ₹ *</label>
              <input data-testid="advance-amount-input" required type="number" min="1" step="any" max={maxAdv > 0 ? maxAdv : undefined} className="input-light" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div>
              <label className="label-light block mb-1">Note</label>
              <input data-testid="advance-note-input" className="input-light" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. family emergency" maxLength={200} />
            </div>
            <button data-testid="advance-submit-btn" disabled={busy || maxAdv <= 0} type="submit" className="btn-blue w-full">{busy ? "Recording…" : "Record advance"}</button>
          </form>
        )}
        <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">History</div>
        {rows === null ? (
          <div className="text-slate-400 text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-slate-400 text-sm">No advances yet.</div>
        ) : (
          <div className="divide-y divide-slate-100 text-sm">
            {rows.map(r => (
              <div key={r.id} className="py-2 flex items-center justify-between">
                <div>
                  <span className="font-medium">₹{Number(r.amount).toLocaleString("en-IN")}</span>
                  <span className="text-slate-400 text-xs ml-2">{r.month}{r.note ? ` · ${r.note}` : ""}</span>
                </div>
                <span className="text-[10px] text-slate-400">{r.given_by}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TempCredModal({ cred, onClose }) {
  const [showPw, setShowPw] = useState(true);
  const copyAll = async () => {
    const text = `Miracurl login for ${cred.name}\n\nEmail: ${cred.email}\nTemporary password: ${cred.temp_password}\n\nYou'll be asked to set your own password on first login. Login at: ${window.location.origin}/login`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied — paste it into WhatsApp / SMS");
    } catch {
      toast.error("Copy failed");
    }
  };
  const whatsapp = () => {
    const text = `👋 Hey ${cred.name}, your salon login is ready:\n\n📧 Email: ${cred.email}\n🔑 Temporary password: ${cred.temp_password}\n\nLog in at: ${window.location.origin}/login\n\nYou'll be asked to set your own password on first login.`;
    openWhatsApp(text, cred.phone);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3">
      <div className="card-light w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-playfair text-xl">Login credentials created</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 mb-4">
          ⚠️ This is the <b>only time</b> you&apos;ll see this password. Share it with {cred.name} now — they&apos;ll change it on first login.
        </div>
        <div className="space-y-3 text-sm">
          <div>
            <div className="text-xs text-slate-500 mb-1">Email</div>
            <div className="font-mono bg-slate-50 border border-slate-200 rounded-md px-3 py-2">{cred.email}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">Temporary password</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 font-mono bg-slate-50 border border-slate-200 rounded-md px-3 py-2 tracking-wider">
                {showPw ? cred.temp_password : "•".repeat(cred.temp_password.length)}
              </div>
              <button
                onClick={() => setShowPw(!showPw)}
                className="p-2 text-slate-500 hover:text-sky-600"
                aria-label="Toggle password visibility"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-5">
          <button onClick={copyAll} className="btn-slate flex items-center justify-center gap-2">
            <Copy className="w-4 h-4" /> Copy
          </button>
          <button onClick={whatsapp} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#25D366] hover:bg-[#20b859] text-white font-medium rounded-md text-sm">
            <MessageCircle className="w-4 h-4" /> Send on WhatsApp
          </button>
        </div>
        <button onClick={onClose} className="w-full mt-3 btn-blue">Done</button>
      </div>
    </div>
  );
}
