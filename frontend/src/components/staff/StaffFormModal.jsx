import { X, IndianRupee } from "lucide-react";
import ImageUploader from "@/components/ImageUploader";

export function StaffFormModal({ editing, form, setForm, branches, onClose, onSubmit, onPhotoUploaded }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3" onClick={onClose}>
      <div className="card-light w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-playfair text-2xl">{editing ? "Edit Staff" : "New Staff"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
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
            {branches.length > 0 && (
              <div>
                <label className="label-light block mb-1">Assigned branch</label>
                <select data-testid="staff-branch-select" className="input-light" value={form.branch || ""} onChange={e => setForm({ ...form, branch: e.target.value })}>
                  <option value="">Main salon (no branch tag)</option>
                  {branches.map(b => <option key={b.id || b.name} value={b.name}>{b.name}</option>)}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">Staff gets this branch tag & must check in at THIS branch&apos;s GPS location</p>
              </div>
            )}
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
              onUploaded={onPhotoUploaded}
              fallback="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-slate flex-1">Cancel</button>
            <button data-testid="save-staff-btn" type="submit" className="btn-blue flex-1">{editing ? "Update" : "Create"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
