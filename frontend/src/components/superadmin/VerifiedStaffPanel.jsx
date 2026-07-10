import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { BadgeCheck, Plus, Trash2, Building2 } from "lucide-react";

const EMPTY = { name: "", phone: "", aadhaar: "", salon_name: "", role: "", years_worked: "1", city: "", owner_comment: "", photo_url: "" };

export const VerifiedStaffPanel = () => {
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/super/registry/staff");
      setRecords(data.records || []);
    } catch { toast.error("Couldn't load verified staff"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post("/super/registry/staff", {
        ...form, years_worked: parseFloat(form.years_worked) || 1,
      });
      toast.success(`Staff verified ✦ ID: ${data.staff_code} — now visible on the public portal`);
      setForm(EMPTY); load();
    } catch (err) {
      const d = err.response?.data?.detail;
      toast.error(typeof d === "string" ? d : Array.isArray(d) ? d.map(x => x.msg).join(" · ") : "Couldn't add staff");
    } finally { setSaving(false); }
  }

  async function remove(r) {
    if (!window.confirm(`Remove the verified record for "${r.staff?.name || "this staff"}" at ${r.salon_name}?`)) return;
    try { await api.delete(`/super/registry/staff/${r.id}`); toast.success("Record removed"); load(); }
    catch { toast.error("Delete failed"); }
  }

  return (
    <div className="space-y-6" data-testid="verified-staff-panel">
      <div>
        <h1 className="font-playfair text-3xl flex items-center gap-2"><BadgeCheck className="w-7 h-7 text-amber-500" /> Staff Verification</h1>
        <p className="text-slate-500 text-sm mt-1">
          Add a salon&apos;s staff after verifying them in person. The record appears on the public registry with a
          gold <b className="text-amber-600">✦ HQ Verified</b> badge — any salon can look them up before hiring.
        </p>
      </div>

      <form onSubmit={save} className="card-light space-y-4" data-testid="verified-staff-form">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label-light block mb-1">Staff Name *</label>
            <input data-testid="vstaff-name-input" required minLength={2} className="input-light" value={form.name} onChange={set("name")} placeholder="Priya Sharma" />
          </div>
          <div>
            <label className="label-light block mb-1">Phone *</label>
            <input data-testid="vstaff-phone-input" required className="input-light" value={form.phone} onChange={set("phone")} placeholder="9876543210" />
          </div>
          <div>
            <label className="label-light block mb-1">Aadhaar (12 digits, optional)</label>
            <input data-testid="vstaff-aadhaar-input" className="input-light font-mono" value={form.aadhaar} onChange={set("aadhaar")} placeholder="XXXX XXXX XXXX" maxLength={12} />
            <p className="text-[10px] text-slate-400 mt-0.5">Only a hash + last 4 digits are stored — never the full number.</p>
          </div>
          <div>
            <label className="label-light block mb-1">Salon Name (where they work) *</label>
            <input data-testid="vstaff-salon-input" required minLength={2} className="input-light" value={form.salon_name} onChange={set("salon_name")} placeholder="Glow Beauty Studio" />
          </div>
          <div>
            <label className="label-light block mb-1">Role / Designation</label>
            <input data-testid="vstaff-role-input" className="input-light" value={form.role} onChange={set("role")} placeholder="Senior Stylist" />
          </div>
          <div>
            <label className="label-light block mb-1">Years worked there</label>
            <input data-testid="vstaff-years-input" type="number" min="0" max="50" step="0.5" className="input-light" value={form.years_worked} onChange={set("years_worked")} />
          </div>
          <div>
            <label className="label-light block mb-1">City</label>
            <input data-testid="vstaff-city-input" className="input-light" value={form.city} onChange={set("city")} placeholder="Bengaluru" />
          </div>
          <div>
            <label className="label-light block mb-1">Photo URL (optional)</label>
            <input data-testid="vstaff-photo-input" className="input-light" value={form.photo_url} onChange={set("photo_url")} placeholder="https://…" />
          </div>
        </div>
        <div>
          <label className="label-light block mb-1">Owner&apos;s comment (collected in person)</label>
          <textarea data-testid="vstaff-comment-input" rows={2} className="input-light" value={form.owner_comment} onChange={set("owner_comment")} placeholder="Reliable, great with bridal makeup — verified with the owner on site." />
        </div>
        <button data-testid="vstaff-save-btn" type="submit" disabled={saving} className="btn-blue flex items-center gap-2">
          <Plus className="w-4 h-4" /> {saving ? "Verifying…" : "Add Verified Staff"}
        </button>
      </form>

      <div className="card-light p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 text-sm font-semibold text-slate-700">Verified records ({records.length})</div>
        {loading ? <div className="text-slate-400 py-8 text-center">Loading…</div> : records.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm" data-testid="vstaff-empty">No verified staff yet — add the first one above.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {records.map(r => (
              <div key={r.id} className="px-5 py-3 flex items-center gap-3" data-testid={`vstaff-row-${r.id}`}>
                <img src={r.staff?.photo_url || "https://ui-avatars.com/api/?background=fef3c7&color=b45309&name=" + encodeURIComponent(r.staff?.name || "S")} alt="" className="w-10 h-10 rounded-full object-cover border border-amber-200" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{r.staff?.name || "—"}</span>
                    <span className="text-xs font-mono bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">{r.staff?.staff_code}</span>
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-100 to-yellow-50 text-amber-700 border border-amber-300">✦ HQ Verified</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> {r.salon_name} · {r.designation || r.role} · since {r.from_date}
                    {r.staff?.phone && <span> · +{r.staff.phone}</span>}
                  </div>
                </div>
                <button data-testid={`vstaff-delete-${r.id}`} onClick={() => remove(r)} className="p-1.5 text-slate-400 hover:text-red-500" title="Remove verified record">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
