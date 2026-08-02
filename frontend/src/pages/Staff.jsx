import { useEffect, useState, useCallback } from "react";
import api, { formatApiError, API } from "@/lib/api";
import pinApi from "@/lib/ownerPin";
import { Plus, Landmark, CreditCard, FileDown } from "lucide-react";
import { toast } from "sonner";
import { ManagersSection } from "@/components/ManagersSection";
import { useAuth } from "@/context/AuthContext";
import { StaffCard } from "@/components/staff/StaffCard";
import { PromoteModal } from "@/components/staff/PromoteModal";
import { StaffFormModal } from "@/components/staff/StaffFormModal";
import { AdvanceModal } from "@/components/staff/AdvanceModal";
import { TempCredModal } from "@/components/staff/TempCredModal";
import { LeaveApprovalsPanel } from "@/components/staff/LeaveApprovalsPanel";
import { StaffLeaderboard } from "@/components/staff/StaffLeaderboard";
import { PendingSignupsPanel } from "@/components/staff/PendingSignupsPanel";

const EMPTY_FORM = {
  name: "", role: "Stylist", phone: "", email: "", personal_email: "", specialties: "",
  commission_pct: 10, monthly_base_salary: 0, salary_visible: true,
  image_url: "", active: true, blood_group: "",
  shift_start: "10:00", shift_end: "21:00", overtime_rate: 0, week_off_day: "",
  max_advance: 0, notice_period_days: 30, serving_notice: false,
  last_working_day: "", aadhaar: "", branch: "",
  monthly_target: 0, target_commission_pct: 0,
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
  monthly_target: parseFloat(form.monthly_target) || 0,
  target_commission_pct: parseFloat(form.target_commission_pct) || 0,
});

export default function Staff() {
  const { tenant } = useAuth();
  const branches = tenant?.branches || [];
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [tempCred, setTempCred] = useState(null); // {name, email, temp_password, phone}
  const [advanceFor, setAdvanceFor] = useState(null); // staff for advance modal
  const [lbKey, setLbKey] = useState(0);
  const [promoteFor, setPromoteFor] = useState(null);
  const [managerUserIds, setManagerUserIds] = useState([]);

  const load = useCallback(async () => {
    const { data } = await api.get("/staff");
    setList(data);
    setLbKey(k => k + 1);
    try {
      const m = await api.get("/managers");
      setManagerUserIds(m.data.map(x => x.id));
    } catch { /* manager role can't list managers */ }
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
      week_off_day: s.week_off_day || "",
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
        await pinApi.put(`/staff/${editing.id}`, payload);
        toast.success("Staff updated");
      } else {
        await pinApi.post("/staff", payload);
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
      await pinApi.delete(`/staff/${id}`);
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

  async function photoUploaded(url) {
    if (!editing) { toast.success("Photo attached — it saves with the profile ✦"); return; }
    try {
      await pinApi.put(`/staff/${editing.id}`, { ...buildStaffPayload(form), image_url: url });
      toast.success("Photo uploaded & saved ✦");
      load();
    } catch { toast.error("Auto-save failed — press Save"); }
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

      <PendingSignupsPanel onChanged={load} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {list.map(s => (
          <StaffCard
            key={s.id}
            s={s}
            onEdit={startEdit}
            onAdvance={setAdvanceFor}
            onCreateLogin={createLogin}
            onResetLogin={resetLogin}
            onToggleActive={toggleActive}
            onDelete={remove}
            isManager={!!s.user_id && managerUserIds.includes(s.user_id)}
            onPromote={setPromoteFor}
            mainLabel={`Main salon${tenant?.location ? ` — ${tenant.location}` : ""}`}
          />
        ))}
        {list.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400">No staff yet — click &ldquo;Add Staff&rdquo; to get started.</div>
        )}
      </div>

      {list.some(s => s.active) && (
        <div className="card-light" data-testid="id-cards-section">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="w-4 h-4 text-sky-600" />
            <h3 className="font-playfair text-xl">Employee ID Cards</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">Print-ready ID card PDFs for everyone currently working — with photo, role, blood group and a scannable barcode. Tip: set each staff&apos;s blood group in their profile so it prints on the card.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.filter(s => s.active).map(s => (
              <div key={s.id} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5" data-testid={`id-card-row-${s.id}`}>
                <img src={s.image_url || `https://ui-avatars.com/api/?background=e0e7ff&color=3730a3&name=${encodeURIComponent(s.name)}`} alt="" className="w-9 h-9 rounded-full object-cover border border-slate-200" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{s.name}</div>
                  <div className="text-[11px] text-slate-500 truncate">{s.role}{s.blood_group ? ` · ${s.blood_group}` : ""}</div>
                </div>
                <a href={`${API}/id-cards/staff/${s.id}/pdf`} target="_blank" rel="noreferrer" data-testid={`id-card-download-${s.id}`}
                  className="text-xs py-1.5 px-3 rounded-md bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 inline-flex items-center gap-1 shrink-0">
                  <FileDown className="w-3 h-3" /> ID Card
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      <StaffLeaderboard refreshKey={lbKey} />

      <LeaveApprovalsPanel />

      <ManagersSection onCredential={setTempCred} onChanged={load} />

      {promoteFor && (
        <PromoteModal staff={promoteFor} onClose={() => setPromoteFor(null)}
          onDone={(cred) => { if (cred) setTempCred(cred); load(); }} />
      )}

      {list.some(s => s.bank_details && (s.bank_details.bank_name || s.bank_details.ifsc || s.bank_details.account_holder)) && (
        <div className="card-light" data-testid="staff-bank-details-card">
          <div className="flex items-center gap-2 mb-1">
            <Landmark className="w-4 h-4 text-sky-600" />
            <h3 className="font-playfair text-xl">Staff Bank Details</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">Added by staff from their portal — use these for salary payouts.</p>
          <div className="overflow-x-auto">
            <table className="luxe-table-light min-w-[560px] w-full">
              <thead>
                <tr>
                  <th className="text-left">Name</th>
                  <th className="text-left">Bank</th>
                  <th className="text-left">IFSC</th>
                  <th className="text-left">Account holder</th>
                </tr>
              </thead>
              <tbody>
                {list.filter(s => s.bank_details && (s.bank_details.bank_name || s.bank_details.ifsc || s.bank_details.account_holder)).map(s => (
                  <tr key={s.id} data-testid={`bank-row-${s.id}`}>
                    <td className="font-medium">{s.name}</td>
                    <td>{s.bank_details.bank_name || "—"}</td>
                    <td className="font-mono text-xs uppercase">{s.bank_details.ifsc || "—"}</td>
                    <td>{s.bank_details.account_holder || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {open && (
        <StaffFormModal
          editing={editing}
          form={form}
          setForm={setForm}
          branches={branches}
          onClose={() => setOpen(false)}
          onSubmit={save}
          onPhotoUploaded={photoUploaded}
          onTransferred={() => { setOpen(false); load(); }}
        />
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
