import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Briefcase, Plus, X, Users, CalendarClock, Phone, Trash2 } from "lucide-react";
import { confirmAsync } from "@/components/ConfirmDialog";
import { useAuth } from "@/context/AuthContext";

const SALON_ROLES = ["Hair Stylist", "Beautician", "Nail Artist", "Makeup Artist", "Massage Therapist", "Barber", "Receptionist", "Salon Manager", "Other"];
const RESTO_ROLES = ["Chef", "Cook / Commis", "Tandoor Chef", "Waiter / Steward", "Kitchen Helper", "Cashier / Biller", "Restaurant Manager", "Delivery Staff", "Housekeeping", "Other"];
const URGENCY = [
  { key: "immediate", label: "Immediately", chip: "bg-rose-50 text-rose-600 border-rose-200" },
  { key: "two_weeks", label: "Within 2 weeks", chip: "bg-amber-50 text-amber-600 border-amber-200" },
  { key: "flexible", label: "Flexible", chip: "bg-slate-50 text-slate-500 border-slate-200" },
];
const STATUS_CHIP = {
  shortlisted: "bg-sky-50 text-sky-600",
  trial_scheduled: "bg-amber-50 text-amber-600",
  hired: "bg-emerald-50 text-emerald-600",
  rejected: "bg-slate-100 text-slate-400",
};

export default function HireStaff() {
  const { tenant } = useAuth();
  const resto = tenant?.business_type === "restaurant";
  const ROLES = resto ? RESTO_ROLES : SALON_ROLES;
  const [requests, setRequests] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ role: resto ? "Chef" : "Hair Stylist", experience_years: 1, salary_min: 15000, salary_max: 25000, urgency: "two_weeks", notes: "" });

  const load = () => api.get("/hiring/requests").then(r => setRequests(r.data.requests)).catch(() => {});
  useEffect(() => { load(); }, []);
  useEffect(() => { setForm(f => ({ ...f, role: resto ? "Chef" : "Hair Stylist" })); }, [resto]);

  const submit = async () => {
    setSaving(true);
    try {
      await api.post("/hiring/requests", form);
      toast.success("Hiring request sent to Miracurl HQ — we'll find you candidates ✦");
      setShowForm(false);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Couldn't submit"); }
    finally { setSaving(false); }
  };

  const closeReq = async (rid) => {
    if (!await confirmAsync("Close this hiring request?")) return;
    try { await api.post(`/hiring/requests/${rid}/close`); load(); } catch { toast.error("Couldn't close"); }
  };

  const deleteReq = async (r) => {
    if (!await confirmAsync(`Delete the closed "${r.role}" request permanently? Its applications are removed too.`)) return;
    try {
      await api.delete(`/hiring/requests/${r.id}`);
      toast.success("Request deleted");
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Couldn't delete"); }
  };

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800" data-testid="hire-staff-page">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-slate-400 font-semibold">Hiring Marketplace</div>
            <h1 className="font-playfair text-3xl mt-1 flex items-center gap-3"><Briefcase className="w-7 h-7 text-amber-500" /> Hire verified staff</h1>
            <p className="text-slate-500 text-sm mt-1">Tell HQ who you need — we match you with HQ-verified professionals from the Miracurl registry and schedule trials for you.</p>
          </div>
          <button onClick={() => setShowForm(true)} data-testid="hire-new-request-btn"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-amber-400 to-rose-400 text-white text-sm font-semibold hover:opacity-90 shadow-[0_8px_20px_-6px_rgba(245,158,11,0.5)]">
            <Plus className="w-4 h-4" /> Request staff
          </button>
        </div>

        {requests.length === 0 ? (
          <div className="rounded-2xl bg-white border border-dashed border-slate-300 p-10 text-center text-slate-500 text-sm" data-testid="hire-empty">
            No hiring requests yet. Tap <b className="text-amber-600">Request staff</b> — HQ handles sourcing, verification and trial scheduling.
          </div>
        ) : requests.map(r => (
          <div key={r.id} className="card-light" data-testid={`hire-request-${r.id}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="font-playfair text-xl">{r.role}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {r.experience_years}+ yrs · ₹{Math.round(r.salary_min).toLocaleString("en-IN")}–₹{Math.round(r.salary_max).toLocaleString("en-IN")}/mo
                  · posted {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] px-2.5 py-1 rounded-full border ${URGENCY.find(u => u.key === r.urgency)?.chip}`}>
                  {URGENCY.find(u => u.key === r.urgency)?.label}
                </span>
                <span className={`text-[11px] px-2.5 py-1 rounded-full ${r.status === "open" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                  {r.status}
                </span>
                {r.status === "open" ? (
                  <button onClick={() => closeReq(r.id)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700" data-testid={`hire-close-${r.id}`} title="Close request">
                    <X className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={() => deleteReq(r)} className="p-1.5 rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-500" data-testid={`hire-delete-${r.id}`} title="Delete (Owner PIN)">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <Users className="w-3.5 h-3.5" /> {r.applicant_count} applicant{r.applicant_count === 1 ? "" : "s"} · {r.candidates.length} curated by HQ
            </div>
            {r.candidates.length > 0 && (
              <div className="mt-3 space-y-2" data-testid={`hire-candidates-${r.id}`}>
                {r.candidates.map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 flex-wrap">
                    <div>
                      <div className="text-sm font-medium">{c.candidate_name} <span className="text-slate-400 text-xs">· {c.candidate_designation || "—"} · {c.candidate_city}</span></div>
                      {c.status === "trial_scheduled" && (
                        <div className="text-xs text-amber-600 mt-0.5 flex items-center gap-1.5">
                          <CalendarClock className="w-3.5 h-3.5" /> Trial: {c.trial_date} {c.trial_time} {c.trial_notes && `· ${c.trial_notes}`}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_CHIP[c.status] || "bg-slate-100 text-slate-500"}`}>{c.status.replace("_", " ")}</span>
                      {c.candidate_phone && (
                        <a href={`tel:${c.candidate_phone}`} className="p-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-amber-600" title={c.candidate_phone}>
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {showForm && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowForm(false)} />
            <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-2xl" data-testid="hire-form-modal">
              <div className="font-playfair text-xl">Who do you need?</div>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
                className="input-light w-full" data-testid="hire-role-select">
                {ROLES.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
              <div className="grid grid-cols-3 gap-3">
                <label className="text-xs text-slate-500">Min exp (yrs)
                  <input type="number" min="0" value={form.experience_years} onChange={e => setForm({ ...form, experience_years: +e.target.value })}
                    className="mt-1 input-light w-full" data-testid="hire-exp-input" /></label>
                <label className="text-xs text-slate-500">Salary min ₹
                  <input type="number" min="0" value={form.salary_min} onChange={e => setForm({ ...form, salary_min: +e.target.value })}
                    className="mt-1 input-light w-full" data-testid="hire-salmin-input" /></label>
                <label className="text-xs text-slate-500">Salary max ₹
                  <input type="number" min="0" value={form.salary_max} onChange={e => setForm({ ...form, salary_max: +e.target.value })}
                    className="mt-1 input-light w-full" data-testid="hire-salmax-input" /></label>
              </div>
              <div className="flex gap-2">
                {URGENCY.map(u => (
                  <button key={u.key} onClick={() => setForm({ ...form, urgency: u.key })} data-testid={`hire-urgency-${u.key}`}
                    className={`flex-1 text-xs px-2 py-2 rounded-lg border transition ${form.urgency === u.key ? "border-amber-400 bg-amber-50 text-amber-700 font-semibold" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                    {u.label}
                  </button>
                ))}
              </div>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
                placeholder="Anything specific? (skills, timing, languages…)"
                className="input-light w-full" data-testid="hire-notes-input" />
              <button onClick={submit} disabled={saving} data-testid="hire-submit-btn"
                className="w-full py-2.5 rounded-full bg-gradient-to-r from-amber-400 to-rose-400 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                {saving ? "Sending…" : "Send to Miracurl HQ ✦"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
