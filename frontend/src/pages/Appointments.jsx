import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Plus, X, Calendar as CalendarIcon, Check, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLOR = {
  scheduled: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  no_show: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

export default function Appointments() {
  const [list, setList] = useState([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [services, setServices] = useState([]);
  const [form, setForm] = useState({ customer_id: "", staff_id: "", service_ids: [], scheduled_at: "", notes: "" });

  const load = useCallback(async () => {
    const { data } = await api.get(`/appointments?date=${date}`);
    setList(data);
  }, [date]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get("/customers").then(r => setCustomers(r.data));
    api.get("/staff").then(r => setStaff(r.data));
    api.get("/services").then(r => setServices(r.data));
  }, []);

  function startNew() {
    const t = new Date(); t.setHours(t.getHours() + 1, 0, 0, 0);
    const iso = t.toISOString().slice(0, 16);
    setForm({ customer_id: "", staff_id: "", service_ids: [], scheduled_at: iso, notes: "" });
    setOpen(true);
  }

  async function save(e) {
    e.preventDefault();
    if (!form.customer_id || !form.staff_id || form.service_ids.length === 0) {
      toast.error("Select customer, staff and at least one service"); return;
    }
    try {
      await api.post("/appointments", { ...form, scheduled_at: new Date(form.scheduled_at).toISOString() });
      toast.success("Appointment booked"); setOpen(false); load();
    } catch (err) { toast.error("Booking failed"); }
  }

  async function setStatus(id, status) {
    await api.put(`/appointments/${id}/status`, { status });
    toast.success("Status updated"); load();
  }
  async function remove(id) {
    if (!window.confirm("Cancel this appointment?")) return;
    await api.delete(`/appointments/${id}`); toast.success("Deleted"); load();
  }

  function toggleService(sid) {
    setForm(f => ({ ...f, service_ids: f.service_ids.includes(sid) ? f.service_ids.filter(x => x !== sid) : [...f.service_ids, sid] }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-playfair text-3xl">Appointments</h1>
          <p className="text-ink-secondary text-sm mt-1">Schedule, track and complete bookings.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <CalendarIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            <input type="date" data-testid="appt-date-filter" className="input-luxe pl-10" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <button data-testid="add-appointment-btn" onClick={startNew} className="btn-gold flex items-center gap-2"><Plus className="w-4 h-4" /> New Booking</button>
        </div>
      </div>

      <div className="card-luxe p-0 overflow-hidden">
        <table className="luxe-table">
          <thead><tr><th>Time</th><th>Customer</th><th>Services</th><th>Stylist</th><th>Total</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {list.map(a => (
              <tr key={a.id} data-testid={`appt-row-${a.id}`}>
                <td>
                  <div className="font-mono text-gold">{new Date(a.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  <div className="text-[10px] text-ink-muted">{a.duration_min} min</div>
                </td>
                <td className="font-medium">{a.customer_name}</td>
                <td className="text-sm text-ink-secondary">{a.service_names.join(", ")}</td>
                <td className="text-sm">{a.staff_name}</td>
                <td className="text-gold font-medium">₹{a.total}</td>
                <td>
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${STATUS_COLOR[a.status]}`}>{a.status.replace('_', ' ')}</span>
                </td>
                <td>
                  <div className="flex items-center gap-1 justify-end">
                    {a.status === "scheduled" && (
                      <>
                        <button data-testid={`complete-appt-${a.id}`} onClick={() => setStatus(a.id, "completed")} className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded"><Check className="w-4 h-4" /></button>
                        <button data-testid={`cancel-appt-${a.id}`} onClick={() => setStatus(a.id, "cancelled")} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded"><XCircle className="w-4 h-4" /></button>
                      </>
                    )}
                    <button onClick={() => remove(a.id)} data-testid={`delete-appt-${a.id}`} className="p-1.5 text-ink-muted hover:text-red-400 hover:bg-red-500/5 rounded text-xs">×</button>
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan="7" className="text-center text-ink-secondary py-12"><Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />No appointments on {date}</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="card-luxe w-full max-w-xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-playfair text-2xl">New Appointment</h3>
              <button onClick={() => setOpen(false)} className="text-ink-muted hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-luxe block mb-1">Customer *</label>
                  <select data-testid="appt-customer-select" required className="input-luxe" value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}>
                    <option value="">-- select --</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-luxe block mb-1">Staff *</label>
                  <select data-testid="appt-staff-select" required className="input-luxe" value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })}>
                    <option value="">-- select --</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.name} • {s.role}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label-luxe block mb-1">Date & Time *</label>
                <input type="datetime-local" data-testid="appt-datetime-input" required className="input-luxe" value={form.scheduled_at} onChange={e => setForm({ ...form, scheduled_at: e.target.value })} />
              </div>
              <div>
                <label className="label-luxe block mb-1">Services * ({form.service_ids.length} selected)</label>
                <div className="max-h-48 overflow-y-auto border border-white/10 rounded-md p-2 space-y-1">
                  {services.map(s => (
                    <label key={s.id} className="flex items-center justify-between px-3 py-2 rounded hover:bg-white/5 cursor-pointer text-sm">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={form.service_ids.includes(s.id)} onChange={() => toggleService(s.id)} />
                        <span>{s.name}</span>
                        <span className="text-[10px] text-ink-muted">{s.category}</span>
                      </div>
                      <span className="text-gold">₹{s.price} · {s.duration_min}m</span>
                    </label>
                  ))}
                </div>
              </div>
              <div><label className="label-luxe block mb-1">Notes</label><textarea rows="2" className="input-luxe" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="btn-ghost flex-1">Cancel</button>
                <button data-testid="save-appt-btn" type="submit" className="btn-gold flex-1">Book Appointment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
