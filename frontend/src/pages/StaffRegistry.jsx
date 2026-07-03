import { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  ShieldCheck, Plus, Search, X, Copy, ExternalLink, Star,
  Building2, Pencil, Trash2, ChevronDown, ChevronUp, FileDown,
} from "lucide-react";
import ImageUploader from "@/components/ImageUploader";
import { API } from "@/lib/api";

export const BADGE_STYLES = {
  EXTRAORDINARY: "bg-violet-100 text-violet-700 border-violet-300",
  EXCELLENT: "bg-emerald-100 text-emerald-700 border-emerald-300",
  GOOD: "bg-sky-100 text-sky-700 border-sky-300",
  NEW: "bg-slate-100 text-slate-600 border-slate-300",
  BAD: "bg-red-100 text-red-700 border-red-300",
};

const EMPTY_REG = { name: "", aadhaar: "", phone: "", email: "", permanent_address: "", city: "", photo_url: "" };
const EMPTY_EMP = { designation: "", skills: "", from_date: "", to_date: "", current: false, reason_for_leaving: "", rating: "", comment: "" };
const REASONS = ["Working", "Resigned", "Terminated", "Absconded", "Contract Ended", "Other"];

function BadgeChip({ badge, rating }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border ${BADGE_STYLES[badge] || BADGE_STYLES.NEW}`}>
      {badge}{rating != null && <span className="normal-case">· {rating}★</span>}
    </span>
  );
}

export default function StaffRegistry() {
  const { tenant } = useAuth();
  const [list, setList] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [openReg, setOpenReg] = useState(false);
  const [regForm, setRegForm] = useState(EMPTY_REG);
  const [empModal, setEmpModal] = useState(null); // {employee, editing}
  const [empForm, setEmpForm] = useState(EMPTY_EMP);
  const [expanded, setExpanded] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (query = "") => {
    setLoading(true);
    try {
      const { data } = await api.get(`/registry/employees${query ? `?q=${encodeURIComponent(query)}` : ""}`);
      setList(data);
    } catch { toast.error("Couldn't load registry"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const publicUrl = `${window.location.origin}/staff-registry`;
  const copyPublic = async () => {
    try { await navigator.clipboard.writeText(publicUrl); toast.success("Public registry link copied!"); }
    catch { toast.error("Copy failed — link: " + publicUrl); }
  };

  async function register(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post("/registry/employees", regForm);
      toast.success(`Registered ✦ Staff ID: ${data.staff_code}`);
      setOpenReg(false); setRegForm(EMPTY_REG); setQ(""); load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Couldn't register employee");
    } finally { setSaving(false); }
  }

  function startEmployment(employee, editing = null) {
    setEmpModal({ employee, editing });
    setEmpForm(editing ? {
      designation: editing.designation || "", skills: (editing.skills || []).join(", "),
      from_date: editing.from_date || "", to_date: editing.to_date || "", current: !editing.to_date,
      reason_for_leaving: editing.reason_for_leaving || "", rating: editing.rating || "", comment: editing.comment || "",
    } : EMPTY_EMP);
  }

  async function saveEmployment(e) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      designation: empForm.designation.trim(),
      skills: empForm.skills.split(",").map(s => s.trim()).filter(Boolean),
      from_date: empForm.from_date,
      to_date: empForm.current ? null : (empForm.to_date || null),
      reason_for_leaving: empForm.current ? "Working" : empForm.reason_for_leaving,
      rating: empForm.rating ? parseFloat(empForm.rating) : null,
      comment: empForm.comment.trim(),
    };
    try {
      if (empModal.editing) {
        await api.put(`/registry/employments/${empModal.editing.id}`, payload);
        toast.success("Record updated");
      } else {
        await api.post(`/registry/employees/${empModal.employee.id}/employments`, payload);
        toast.success("Employment record added");
      }
      setEmpModal(null); load(q);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Save failed");
    } finally { setSaving(false); }
  }

  async function removeEmployment(rid) {
    if (!window.confirm("Delete this employment record?")) return;
    try { await api.delete(`/registry/employments/${rid}`); toast.success("Deleted"); load(q); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail) || "Delete failed"); }
  }

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800 space-y-6" data-testid="staff-registry-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-playfair text-2xl sm:text-3xl flex items-center gap-2"><ShieldCheck className="w-7 h-7 text-violet-600" /> Staff Registry</h1>
          <p className="text-slate-500 text-sm mt-1">Cross-salon employment history — register your staff, rate them, and verify new hires before onboarding.</p>
        </div>
        <button data-testid="registry-add-employee-btn" onClick={() => setOpenReg(true)} className="btn-blue flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" /> Register Employee
        </button>
      </div>

      {/* Public link banner */}
      <div className="bg-gradient-to-r from-violet-600 to-purple-700 rounded-2xl p-4 text-white flex flex-col sm:flex-row sm:items-center gap-3" data-testid="registry-public-link-banner">
        <div className="flex-1">
          <div className="text-xs uppercase tracking-[0.2em] text-white/80 font-medium">Public Verification Link</div>
          <div className="text-sm mt-1 font-mono truncate">{publicUrl}</div>
          <p className="text-xs text-white/75 mt-1">Any salon owner can verify a staff's history & badge here — no login needed. Staff can download their badge PDF too.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button data-testid="registry-copy-public-btn" onClick={copyPublic} className="px-3 py-1.5 rounded-md bg-white text-violet-700 text-xs font-semibold hover:bg-slate-100 flex items-center gap-1"><Copy className="w-3 h-3" /> Copy</button>
          <a data-testid="registry-open-public-btn" href={publicUrl} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-md bg-white/20 hover:bg-white/30 text-white text-xs font-semibold flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Open</a>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={(e) => { e.preventDefault(); load(q); }} className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input data-testid="registry-search-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search any staff — ID (STF-00001), phone or name…" className="input-light w-full pl-9" />
        </div>
        <button type="submit" data-testid="registry-search-btn" className="btn-slate">Search</button>
        {q && <button type="button" onClick={() => { setQ(""); load(); }} className="btn-slate px-3"><X className="w-4 h-4" /></button>}
      </form>

      {/* List */}
      {loading ? <div className="text-slate-400 py-8 text-center">Loading…</div> : (
        <div className="space-y-3">
          {list.length === 0 && (
            <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-2xl" data-testid="registry-empty">
              {q ? "No staff found — check the ID or phone number." : "No employees registered yet — click “Register Employee” to add your first staff."}
            </div>
          )}
          {list.map(p => (
            <div key={p.id} className="card-light" data-testid={`registry-emp-${p.staff_code}`}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <img src={p.photo_url || "https://ui-avatars.com/api/?background=ede9fe&color=6d28d9&name=" + encodeURIComponent(p.name)} alt={p.name} className="w-14 h-14 rounded-full object-cover border-2 border-violet-200" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{p.name}</span>
                    <span className="text-xs font-mono bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">{p.staff_code}</span>
                    <BadgeChip badge={p.badge} rating={p.avg_rating} />
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    +{p.phone} {p.email && `· ${p.email}`} · {p.aadhaar_masked} · <b>{p.total_years} yrs</b> total service {p.city && `· ${p.city}`}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <a href={`${API}/public/registry/${p.staff_code}/pdf`} target="_blank" rel="noreferrer" data-testid={`registry-pdf-${p.staff_code}`}
                    className="text-xs py-1.5 px-3 rounded-md bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1">
                    <FileDown className="w-3 h-3" /> Badge PDF
                  </a>
                  <button data-testid={`registry-add-record-${p.staff_code}`} onClick={() => startEmployment(p)}
                    className="text-xs py-1.5 px-3 rounded-md bg-violet-50 border border-violet-200 text-violet-700 hover:bg-violet-100 inline-flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add Record
                  </button>
                  <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="p-1.5 text-slate-500 hover:text-violet-600" data-testid={`registry-expand-${p.staff_code}`}>
                    {expanded === p.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {expanded === p.id && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                  {p.employments.length === 0 && <div className="text-xs text-slate-400">No employment records yet.</div>}
                  {p.employments.map(emp => (
                    <div key={emp.id} className="flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" /> {emp.salon_name} — {emp.designation}
                          {emp.rating && <span className="inline-flex items-center gap-0.5 text-xs text-amber-600"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{emp.rating}/5</span>}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {emp.from_date} → {emp.to_date || "Present"} ({emp.years} yrs){emp.reason_for_leaving && ` · ${emp.reason_for_leaving}`}
                        </div>
                        {emp.comment && <div className="text-xs text-slate-600 italic mt-1">“{emp.comment}”</div>}
                      </div>
                      {emp.tenant_id === tenant?.id && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => startEmployment(p, emp)} className="p-1.5 text-slate-500 hover:text-sky-600" data-testid={`registry-edit-record-${emp.id}`}><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => removeEmployment(emp.id)} className="p-1.5 text-slate-500 hover:text-red-500" data-testid={`registry-del-record-${emp.id}`}><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Register modal */}
      {openReg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3" onClick={() => setOpenReg(false)}>
          <div className="card-light w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-playfair text-xl">Register Employee</h3>
              <button onClick={() => setOpenReg(false)} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={register} className="space-y-3">
              <div className="flex justify-center"><ImageUploader value={regForm.photo_url} onChange={url => setRegForm(f => ({ ...f, photo_url: url }))} kind="staff" circular /></div>
              <div><label className="label-light block mb-1">Full name *</label><input data-testid="reg-name-input" required minLength={2} className="input-light w-full" value={regForm.name} onChange={e => setRegForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div>
                <label className="label-light block mb-1">Aadhaar number * <span className="text-slate-400 normal-case">(12 digits — stored masked & encrypted, shown as XXXX-XXXX-1234)</span></label>
                <input data-testid="reg-aadhaar-input" required pattern="\d{12}" maxLength={12} inputMode="numeric" className="input-light w-full font-mono" placeholder="123412341234" value={regForm.aadhaar} onChange={e => setRegForm(f => ({ ...f, aadhaar: e.target.value.replace(/\D/g, "") }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label-light block mb-1">Phone *</label><input data-testid="reg-phone-input" required className="input-light w-full" value={regForm.phone} onChange={e => setRegForm(f => ({ ...f, phone: e.target.value }))} /></div>
                <div><label className="label-light block mb-1">Email</label><input data-testid="reg-email-input" type="email" className="input-light w-full" value={regForm.email} onChange={e => setRegForm(f => ({ ...f, email: e.target.value }))} /></div>
              </div>
              <div><label className="label-light block mb-1">Permanent address *</label><textarea data-testid="reg-address-input" required minLength={5} rows={2} className="input-light w-full" value={regForm.permanent_address} onChange={e => setRegForm(f => ({ ...f, permanent_address: e.target.value }))} /></div>
              <div><label className="label-light block mb-1">City</label><input data-testid="reg-city-input" className="input-light w-full" value={regForm.city} onChange={e => setRegForm(f => ({ ...f, city: e.target.value }))} /></div>
              <button data-testid="reg-submit-btn" disabled={saving} className="btn-blue w-full">{saving ? "Registering…" : "Create Staff ID"}</button>
            </form>
          </div>
        </div>
      )}

      {/* Employment modal */}
      {empModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3" onClick={() => setEmpModal(null)}>
          <div className="card-light w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-playfair text-xl">{empModal.editing ? "Edit" : "Add"} Employment Record</h3>
              <button onClick={() => setEmpModal(null)} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-slate-500 mb-4">{empModal.employee.name} · {empModal.employee.staff_code} — record will show under <b>{tenant?.name}</b></p>
            <form onSubmit={saveEmployment} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label-light block mb-1">Designation *</label><input data-testid="emp-designation-input" required minLength={2} className="input-light w-full" placeholder="Senior Stylist" value={empForm.designation} onChange={e => setEmpForm(f => ({ ...f, designation: e.target.value }))} /></div>
                <div><label className="label-light block mb-1">Skills (comma separated)</label><input data-testid="emp-skills-input" className="input-light w-full" placeholder="Haircut, Colour" value={empForm.skills} onChange={e => setEmpForm(f => ({ ...f, skills: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label-light block mb-1">From *</label><input data-testid="emp-from-input" required type="date" className="input-light w-full" value={empForm.from_date} onChange={e => setEmpForm(f => ({ ...f, from_date: e.target.value }))} /></div>
                <div>
                  <label className="label-light block mb-1">To</label>
                  <input data-testid="emp-to-input" type="date" disabled={empForm.current} className="input-light w-full disabled:opacity-40" value={empForm.to_date} onChange={e => setEmpForm(f => ({ ...f, to_date: e.target.value }))} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input data-testid="emp-current-checkbox" type="checkbox" checked={empForm.current} onChange={e => setEmpForm(f => ({ ...f, current: e.target.checked }))} /> Currently working here
              </label>
              {!empForm.current && (
                <div>
                  <label className="label-light block mb-1">Reason for leaving</label>
                  <select data-testid="emp-reason-select" className="input-light w-full" value={empForm.reason_for_leaving} onChange={e => setEmpForm(f => ({ ...f, reason_for_leaving: e.target.value }))}>
                    <option value="">—</option>
                    {REASONS.filter(r => r !== "Working").map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="label-light block mb-1">Your rating (affects their badge)</label>
                <select data-testid="emp-rating-select" className="input-light w-full" value={empForm.rating} onChange={e => setEmpForm(f => ({ ...f, rating: e.target.value }))}>
                  <option value="">Not rated</option>
                  {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} ★ {n >= 4 ? "— Great" : n === 3 ? "— OK" : "— Poor"}</option>)}
                </select>
              </div>
              <div><label className="label-light block mb-1">Comment / behaviour note (public)</label><textarea data-testid="emp-comment-input" rows={3} className="input-light w-full" placeholder="Punctual, great with clients…" value={empForm.comment} onChange={e => setEmpForm(f => ({ ...f, comment: e.target.value }))} /></div>
              <button data-testid="emp-submit-btn" disabled={saving} className="btn-blue w-full">{saving ? "Saving…" : empModal.editing ? "Update Record" : "Add Record"}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
