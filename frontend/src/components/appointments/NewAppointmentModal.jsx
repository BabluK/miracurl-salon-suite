import { X } from "lucide-react";

export function NewAppointmentModal({ form, setForm, customers, staff, services, toggleService, onSubmit, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="card-light w-full max-w-xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-playfair text-2xl">New Appointment</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-light block mb-1">Customer *</label>
              <select data-testid="appt-customer-select" required className="input-light" value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}>
                <option value="">-- select --</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone || "no phone ⚠"})</option>)}
              </select>
              {(() => {
                const sel = customers.find(c => c.id === form.customer_id);
                if (!sel || (sel.phone || "").replace(/\D/g, "").length >= 10) return null;
                return (
                  <input data-testid="appt-guest-phone-input" required type="tel" placeholder="Guest phone number * (for WhatsApp confirmation)"
                    value={form.guest_phone || ""} onChange={e => setForm({ ...form, guest_phone: e.target.value })}
                    className="input-light mt-2 border-amber-400" />
                );
              })()}
            </div>
            <div>
              <label className="label-light block mb-1">Staff *</label>
              <select data-testid="appt-staff-select" required className="input-light" value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })}>
                <option value="">-- select --</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name} • {s.role}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label-light block mb-1">Date & Time *</label>
            <input type="datetime-local" data-testid="appt-datetime-input" required className="input-light" value={form.scheduled_at} onChange={e => setForm({ ...form, scheduled_at: e.target.value })} />
          </div>
          <div>
            <label className="label-light block mb-1">Services * ({form.service_ids.length} selected)</label>
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-md p-2 space-y-1">
              {services.map(s => (
                <label key={s.id} className="flex items-center justify-between px-3 py-2 rounded hover:bg-slate-50 cursor-pointer text-sm">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={form.service_ids.includes(s.id)} onChange={() => toggleService(s.id)} />
                    <span>{s.name}</span>
                    <span className="text-[10px] text-slate-400">{s.category}</span>
                  </div>
                  <span className="text-sky-600">₹{s.price} · {s.duration_min}m</span>
                </label>
              ))}
            </div>
          </div>
          <div><label className="label-light block mb-1">Notes</label><textarea rows="2" className="input-light" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-slate flex-1">Cancel</button>
            <button data-testid="save-appt-btn" type="submit" className="btn-blue flex-1">Book Appointment</button>
          </div>
        </form>
      </div>
    </div>
  );
}
