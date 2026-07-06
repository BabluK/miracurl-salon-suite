import { X } from "lucide-react";
import ImageUploader from "@/components/ImageUploader";

export const REASONS = ["Working", "Resigned", "Terminated", "Absconded", "Contract Ended", "Transferred", "Other"];

function ratingLabel(n) {
  if (n >= 4) return "— Great";
  if (n === 3) return "— OK";
  return "— Poor";
}

function Modal({ onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3" onClick={onClose}>
      <div className={`card-light w-full ${wide ? "max-w-lg" : "max-w-md"} max-h-[92vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function RegisterEmployeeModal({ regForm, setRegForm, onSubmit, saving, onClose }) {
  return (
    <Modal onClose={onClose} wide>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-playfair text-xl">Register Employee</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
      </div>
      <form onSubmit={onSubmit} className="space-y-3">
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
        <div><label className="label-light block mb-1">Current address</label><textarea data-testid="reg-current-address-input" rows={2} className="input-light w-full" placeholder="Where they live now (if different)" value={regForm.current_address} onChange={e => setRegForm(f => ({ ...f, current_address: e.target.value }))} /></div>
        <div><label className="label-light block mb-1">City</label><input data-testid="reg-city-input" className="input-light w-full" value={regForm.city} onChange={e => setRegForm(f => ({ ...f, city: e.target.value }))} /></div>
        <button data-testid="reg-submit-btn" disabled={saving} className="btn-blue w-full">{saving ? "Registering…" : "Create Staff ID"}</button>
      </form>
    </Modal>
  );
}

export function EditEmployeeModal({ editEmp, editForm, setEditForm, onSubmit, saving, onClose }) {
  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-playfair text-xl">Edit Details</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
      </div>
      <p className="text-xs text-slate-500 mb-4">{editEmp.name} · {editEmp.staff_code} — name &amp; Aadhaar are identity fields and can't be changed.</p>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="flex justify-center"><ImageUploader value={editForm.photo_url} onChange={url => setEditForm(f => ({ ...f, photo_url: url }))} kind="staff" circular /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label-light block mb-1">Phone *</label><input data-testid="edit-emp-phone-input" required className="input-light w-full" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} /></div>
          <div><label className="label-light block mb-1">Email</label><input data-testid="edit-emp-email-input" type="email" className="input-light w-full" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} /></div>
        </div>
        <div><label className="label-light block mb-1">Current address</label><textarea data-testid="edit-emp-address-input" rows={2} className="input-light w-full" value={editForm.current_address} onChange={e => setEditForm(f => ({ ...f, current_address: e.target.value }))} /></div>
        <div><label className="label-light block mb-1">City</label><input data-testid="edit-emp-city-input" className="input-light w-full" value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} /></div>
        <button data-testid="edit-emp-save-btn" disabled={saving} className="btn-blue w-full">{saving ? "Saving…" : "Save Details"}</button>
      </form>
    </Modal>
  );
}

export function EmploymentRecordModal({
  empModal, empForm, setEmpForm, onSubmit, saving, onClose,
  tenant, openElsewhere, transferOn, setTransferOn,
}) {
  return (
    <Modal onClose={onClose} wide>
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-playfair text-xl">{empModal.editing ? "Edit" : "Add"} Employment Record</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
      </div>
      <p className="text-xs text-slate-500 mb-4">{empModal.employee.name} · {empModal.employee.staff_code} — record will show under <b>{tenant?.name}</b></p>
      <form onSubmit={onSubmit} className="space-y-3">
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
        {openElsewhere && empForm.current && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3" data-testid="transfer-banner">
            <label className="flex items-start gap-2.5 text-xs text-amber-800 cursor-pointer">
              <input data-testid="transfer-checkbox" type="checkbox" checked={transferOn} onChange={e => setTransferOn(e.target.checked)} className="mt-0.5" />
              <span>
                <b>Transfer detected:</b> {empModal.employee.name} is still marked as working at <b>{openElsewhere.salon_name}</b>.
                Close that record automatically (end date = your From date, reason “Transferred”) and start yours — keeps the timeline clean.
              </span>
            </label>
          </div>
        )}
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
            {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} ★ {ratingLabel(n)}</option>)}
          </select>
        </div>
        <div><label className="label-light block mb-1">Comment / behaviour note (public)</label><textarea data-testid="emp-comment-input" rows={3} className="input-light w-full" placeholder="Punctual, great with clients…" value={empForm.comment} onChange={e => setEmpForm(f => ({ ...f, comment: e.target.value }))} /></div>
        <button data-testid="emp-submit-btn" disabled={saving} className="btn-blue w-full">{saving ? "Saving…" : empModal.editing ? "Update Record" : "Add Record"}</button>
      </form>
    </Modal>
  );
}
