import { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  ShieldCheck, Plus, Search, X, Copy, ExternalLink, Star,
  Building2, Pencil, Trash2, ChevronDown, ChevronUp, FileDown, UserMinus,
} from "lucide-react";
import { API } from "@/lib/api";
import { RegisterEmployeeModal, EditEmployeeModal, EmploymentRecordModal } from "@/components/staff/RegistryModals";

export const BADGE_STYLES = {
  EXTRAORDINARY: "bg-violet-100 text-violet-700 border-violet-300",
  EXCELLENT: "bg-emerald-100 text-emerald-700 border-emerald-300",
  GOOD: "bg-sky-100 text-sky-700 border-sky-300",
  NEW: "bg-slate-100 text-slate-600 border-slate-300",
  BAD: "bg-red-100 text-red-700 border-red-300",
};

const EMPTY_REG = { name: "", aadhaar: "", phone: "", email: "", permanent_address: "", current_address: "", city: "", photo_url: "" };
const EMPTY_EMP = { designation: "", skills: "", from_date: "", to_date: "", current: false, reason_for_leaving: "", rating: "", comment: "" };

function BadgeChip({ badge, rating }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border ${BADGE_STYLES[badge] || BADGE_STYLES.NEW}`}>
      {badge}{rating != null && <span className="normal-case">· {rating}★</span>}
    </span>
  );
}

export function HqChip() {
  return (
    <span data-testid="hq-verified-chip" className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-100 to-yellow-50 text-amber-700 border border-amber-300">
      ✦ HQ Verified
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
  const [editEmp, setEditEmp] = useState(null);
  const [editForm, setEditForm] = useState({ phone: "", email: "", photo_url: "", current_address: "", city: "" });
  const [expanded, setExpanded] = useState(null);
  const [saving, setSaving] = useState(false);
  const [transferOn, setTransferOn] = useState(true);
  const [leftModal, setLeftModal] = useState(null); // employment record being closed
  const [leftForm, setLeftForm] = useState({ reason_for_leaving: "Resigned", rating: "", comment: "" });

  const openElsewhere = empModal && !empModal.editing
    ? (empModal.employee.employments || []).find(e => !e.to_date && e.tenant_id !== tenant?.id)
    : null;

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

  function startEdit(p) {
    setEditEmp(p);
    setEditForm({ phone: p.phone || "", email: p.email || "", photo_url: p.photo_url || "", current_address: p.current_address || "", city: p.city || "" });
  }

  async function saveEdit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/registry/employees/${editEmp.id}`, editForm);
      toast.success("Details updated");
      setEditEmp(null); load(q);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Update failed");
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
      } else if (openElsewhere && transferOn && empForm.current) {
        const { data } = await api.post(`/registry/employees/${empModal.employee.id}/transfer`, payload);
        toast.success(`Transferred ✦ Closed ${data.closed} open record${data.closed === 1 ? "" : "s"} at the previous salon`);
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

  function startMarkLeft(emp) {
    setLeftModal(emp);
    setLeftForm({ reason_for_leaving: "Resigned", rating: "", comment: "" });
  }

  async function confirmMarkLeft(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/registry/employments/${leftModal.id}/mark-left`, {
        reason_for_leaving: leftForm.reason_for_leaving,
        rating: leftForm.rating ? parseFloat(leftForm.rating) : null,
        comment: leftForm.comment.trim(),
      });
      toast.success("Marked as left — moved to Past Staff (still visible on the public portal)");
      setLeftModal(null); load(q);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Couldn't mark as left");
    } finally { setSaving(false); }
  }

  const isPastHere = (p) => {
    const mine = (p.employments || []).filter(e => e.tenant_id === tenant?.id);
    return mine.length > 0 && mine.every(e => e.to_date);
  };
  const activeList = q ? list : list.filter(p => !isPastHere(p));
  const pastList = q ? [] : list.filter(isPastHere);

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
          <input data-testid="registry-search-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search any staff — Aadhaar (full history), phone, name or ID (STF-00001)…" className="input-light w-full pl-9" />
        </div>
        <button type="submit" data-testid="registry-search-btn" className="btn-slate">Search</button>
        {q && <button type="button" onClick={() => { setQ(""); load(); }} className="btn-slate px-3"><X className="w-4 h-4" /></button>}
      </form>
      <p className="text-[11px] text-slate-400 -mt-3">Search by <b>phone number</b> to see the full past history · <b>Staff ID</b> shows the current organization only.</p>

      {/* List */}
      {loading ? <div className="text-slate-400 py-8 text-center">Loading…</div> : (
        <div className="space-y-3">
          {list.length === 0 && (
            <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-2xl" data-testid="registry-empty">
              {q ? "No staff found — check the ID or phone number." : "No employees registered yet — click “Register Employee” to add your first staff."}
            </div>
          )}
          {(() => { const card = (p) => (
            <div key={p.id} className="card-light" data-testid={`registry-emp-${p.staff_code}`}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <img src={p.photo_url || "https://ui-avatars.com/api/?background=ede9fe&color=6d28d9&name=" + encodeURIComponent(p.name)} alt={p.name} className="w-14 h-14 rounded-full object-cover border-2 border-violet-200" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{p.name}</span>
                    <span className="text-xs font-mono bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">{p.staff_code}</span>
                    <BadgeChip badge={p.badge} rating={p.avg_rating} />
                    {p.hq_verified && <HqChip />}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    +{p.phone} {p.email && `· ${p.email}`} · {p.aadhaar_masked} · <b>{p.total_years} yrs</b> total service {p.city && `· ${p.city}`}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {p.created_by_tenant === tenant?.id && (
                    <button data-testid={`registry-edit-emp-${p.staff_code}`} onClick={() => startEdit(p)} title="Edit phone / photo / address"
                      className="p-1.5 text-slate-500 hover:text-sky-600 border border-slate-200 rounded-md">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
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
                          {!emp.to_date ? (
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full" data-testid={`registry-status-current-${emp.id}`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Currently Working
                            </span>
                          ) : (
                            <span className="text-[10px] uppercase tracking-wider bg-slate-100 border border-slate-200 text-slate-500 px-2 py-0.5 rounded-full" data-testid={`registry-status-left-${emp.id}`}>
                              Left · Past Organization
                            </span>
                          )}
                          {emp.rating && <span className="inline-flex items-center gap-0.5 text-xs text-amber-600"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{emp.rating}/5</span>}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {emp.from_date} → {emp.to_date || "Present"} · Duration: <b className="text-slate-700">{emp.years} yrs</b>{emp.to_date && emp.reason_for_leaving && ` · ${emp.reason_for_leaving}`}
                        </div>
                        {emp.comment && <div className="text-xs text-slate-600 italic mt-1">“{emp.comment}”</div>}
                      </div>
                      {emp.tenant_id === tenant?.id && (
                        <div className="flex items-center gap-1 shrink-0">
                          {!emp.to_date && (
                            <button onClick={() => startMarkLeft(emp)} title="Mark as left salon" data-testid={`registry-mark-left-${emp.id}`}
                              className="text-[11px] px-2 py-1 rounded-md border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 inline-flex items-center gap-1">
                              <UserMinus className="w-3 h-3" /> Mark Left
                            </button>
                          )}
                          <button onClick={() => startEmployment(p, emp)} className="p-1.5 text-slate-500 hover:text-sky-600" data-testid={`registry-edit-record-${emp.id}`}><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => removeEmployment(emp.id)} className="p-1.5 text-slate-500 hover:text-red-500" data-testid={`registry-del-record-${emp.id}`}><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ); return (<>
            {activeList.map(card)}
            {pastList.length > 0 && (
              <div className="pt-2 space-y-3" data-testid="registry-past-staff-section">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400 font-semibold pt-2 border-t border-slate-200">
                  <UserMinus className="w-3.5 h-3.5" /> Past Staff — left your salon ({pastList.length})
                </div>
                {pastList.map(card)}
              </div>
            )}
          </>); })()}
        </div>
      )}

      {/* Register modal */}
      {openReg && (
        <RegisterEmployeeModal
          regForm={regForm} setRegForm={setRegForm} onSubmit={register}
          saving={saving} onClose={() => setOpenReg(false)}
        />
      )}

      {/* Edit basic details modal */}
      {editEmp && (
        <EditEmployeeModal
          editEmp={editEmp} editForm={editForm} setEditForm={setEditForm}
          onSubmit={saveEdit} saving={saving} onClose={() => setEditEmp(null)}
        />
      )}

      {/* Employment modal */}
      {empModal && (
        <EmploymentRecordModal
          empModal={empModal} empForm={empForm} setEmpForm={setEmpForm}
          onSubmit={saveEmployment} saving={saving} onClose={() => setEmpModal(null)}
          tenant={tenant} openElsewhere={openElsewhere}
          transferOn={transferOn} setTransferOn={setTransferOn}
        />
      )}
      {/* Mark-as-left modal */}
      {leftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setLeftModal(null)}>
          <form onSubmit={confirmMarkLeft} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()} data-testid="mark-left-modal">
            <h3 className="font-playfair text-xl flex items-center gap-2"><UserMinus className="w-5 h-5 text-amber-600" /> Mark as Left Salon</h3>
            <p className="text-xs text-slate-500">
              This closes the record at <b>{leftModal.salon_name}</b>. The staff moves to your <b>Past Staff</b> list but their history stays visible on the public verification portal.
            </p>
            <div>
              <label className="label-light block mb-1">Reason for leaving</label>
              <select data-testid="mark-left-reason" className="input-light w-full" value={leftForm.reason_for_leaving}
                onChange={e => setLeftForm(f => ({ ...f, reason_for_leaving: e.target.value }))}>
                {["Resigned", "Terminated", "Absconded", "Contract Ended", "Transferred", "Other"].map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="label-light block mb-1">Rating (1–5, optional)</label>
              <input data-testid="mark-left-rating" type="number" min="1" max="5" step="0.5" className="input-light w-full" value={leftForm.rating}
                onChange={e => setLeftForm(f => ({ ...f, rating: e.target.value }))} placeholder="e.g. 4.5" />
            </div>
            <div>
              <label className="label-light block mb-1">Comment (optional)</label>
              <textarea data-testid="mark-left-comment" rows={2} className="input-light w-full" value={leftForm.comment}
                onChange={e => setLeftForm(f => ({ ...f, comment: e.target.value }))} placeholder="Great worker — left for higher studies." />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setLeftModal(null)} className="btn-slate flex-1">Cancel</button>
              <button data-testid="mark-left-confirm-btn" type="submit" disabled={saving}
                className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold py-2 disabled:opacity-50">
                {saving ? "Saving…" : "Mark as Left"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
