import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { API } from "@/lib/api";
import { toast } from "sonner";
import { BadgeCheck, Plus, Trash2, Building2, FileDown, Inbox, Phone, PhoneCall, Loader2, Sparkles, Mail } from "lucide-react";

const REQ_STATUS = {
  new: { label: "🔴 New request", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  owner_verified: { label: "🟡 Verified by Salon Owner", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  badge_issued: { label: "🟢 Badge issued", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

function VerificationRequests() {
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/super/registry/verify-requests");
      setItems(data.items || []);
    } catch { toast.error("Couldn't load verification requests"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const markVerified = async (r) => {
    setBusyId(r.id);
    try {
      await api.post(`/super/registry/verify-requests/${r.id}/owner-verified`);
      toast.success("Marked as verified by the salon owner ✓ — you can now generate the badge");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't update"); }
    finally { setBusyId(""); }
  };

  const generateBadge = async (r) => {
    setBusyId(r.id);
    try {
      const { data } = await api.post(`/super/registry/verify-requests/${r.id}/generate-badge`);
      if (data.email_sent) toast.success(`Badge generated ✦ Staff ID ${data.staff_code} created & PDF emailed to ${r.email} 🎉`);
      else toast.warning(`Badge generated ✦ Staff ID ${data.staff_code} created — but email failed (${data.email_error || "unknown"}). Use Download to send it manually.`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Badge generation failed"); }
    finally { setBusyId(""); }
  };

  const remove = async (r) => {
    if (!window.confirm(`Delete the verification request from ${r.name}?`)) return;
    try { await api.delete(`/super/registry/verify-requests/${r.id}`); toast.success("Request removed"); load(); }
    catch { toast.error("Delete failed"); }
  };

  return (
    <div className="card-light p-0 overflow-hidden" data-testid="verification-requests-panel">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Inbox className="w-4 h-4 text-pink-500" /> Verification Requests
            {items.filter(i => i.status === "new").length > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold inline-flex items-center justify-center">
                {items.filter(i => i.status === "new").length}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Stylists who tapped "Get verified" on the public portal. Call the salon owner → mark verified → generate the badge (emails the PDF & creates their Staff ID).</p>
        </div>
      </div>
      {loading ? <div className="text-slate-400 py-8 text-center text-sm">Loading…</div> : items.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm" data-testid="verify-requests-empty">No verification requests yet — they arrive from the public Staff Registry page.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map(r => {
            const st = REQ_STATUS[r.status] || REQ_STATUS.new;
            return (
              <div key={r.id} className="px-5 py-4" data-testid={`verify-request-row-${r.id}`}>
                <div className="flex flex-wrap items-start gap-3">
                  <img
                    src={r.photo_id ? `${API}/public/registry/photo/${r.photo_id}` : "https://ui-avatars.com/api/?background=fdf2f8&color=db2777&name=" + encodeURIComponent(r.name || "S")}
                    alt={r.name} data-testid={`verify-request-photo-${r.id}`}
                    className="w-14 h-14 rounded-xl object-cover border-2 border-pink-200 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-slate-800">{r.name}</span>
                      <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border ${st.cls}`} data-testid={`verify-request-status-${r.id}`}>{st.label}</span>
                      {r.staff_code && <span className="text-xs font-mono bg-amber-50 border border-amber-200 text-amber-700 rounded px-1.5 py-0.5" data-testid={`verify-request-staffcode-${r.id}`}>✦ {r.staff_code}</span>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-slate-500 mt-1.5">
                      <span>📱 {r.phone} · ✉️ {r.email}</span>
                      <span>🏠 {r.salon_name || "salon not shared"}{r.city ? `, ${r.city}` : ""}</span>
                      <span>👤 Owner/manager: {r.owner_phone ? `+91 ${r.owner_phone}` : "not shared"}</span>
                      <span>📅 Joined: {r.joining || "—"} · Experience: {r.experience || "—"}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      Requested {r.created_at ? new Date(r.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                      {r.badge_issued_at && <> · Badge issued {new Date(r.badge_issued_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}</>}
                      {r.status === "badge_issued" && (r.email_sent === false) && <span className="text-rose-500 font-semibold"> · ⚠ badge email failed — download & send manually</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {r.owner_phone && r.status === "new" && (
                      <a href={`tel:+91${r.owner_phone}`} data-testid={`verify-request-call-${r.id}`} title="Call the salon owner/manager to verify"
                        className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 text-[11px] font-semibold hover:bg-sky-100">
                        <PhoneCall className="w-3.5 h-3.5" /> Call owner
                      </a>
                    )}
                    {r.status === "new" && (
                      <button onClick={() => markVerified(r)} disabled={busyId === r.id} data-testid={`verify-request-owner-ok-${r.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-500 disabled:opacity-50">
                        {busyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BadgeCheck className="w-3.5 h-3.5" />} Verified by Salon Owner
                      </button>
                    )}
                    {r.status === "owner_verified" && (
                      <button onClick={() => generateBadge(r)} disabled={busyId === r.id} data-testid={`verify-request-generate-${r.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 text-white text-[11px] font-bold hover:opacity-90 disabled:opacity-50">
                        {busyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Generate Badge & Email
                      </button>
                    )}
                    {r.status === "badge_issued" && (
                      <>
                        <a href={`${API}/super/registry/verify-requests/${r.id}/badge.pdf`} target="_blank" rel="noreferrer" data-testid={`verify-request-download-${r.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 text-[11px] font-bold hover:bg-amber-100">
                          <FileDown className="w-3.5 h-3.5" /> Download Badge PDF
                        </a>
                        <button onClick={() => generateBadge(r)} disabled={busyId === r.id} data-testid={`verify-request-resend-${r.id}`} title={`Re-email the badge PDF to ${r.email}`}
                          className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-semibold hover:bg-slate-50 disabled:opacity-50">
                          {busyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />} Resend email
                        </button>
                      </>
                    )}
                    {r.phone && (
                      <a href={`tel:+91${r.phone}`} title="Call the stylist" data-testid={`verify-request-call-staff-${r.id}`}
                        className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-sky-50 hover:text-sky-600"><Phone className="w-4 h-4" /></a>
                    )}
                    <button onClick={() => remove(r)} data-testid={`verify-request-delete-${r.id}`} title="Delete request"
                      className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
          For staff of salons <b>not using your software</b> — visit the owner, verify them in person, and record them here.
          They appear on the public registry with a gold <b className="text-amber-600">✦ HQ Verified</b> badge so any salon can check them before hiring.
          Your own team has its own section: <b>Miracurl Team</b>.
        </p>
      </div>

      <VerificationRequests />

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
                    <span data-testid="hq-verified-badge" className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-100 to-yellow-50 text-amber-700 border border-amber-300">✦ HQ Verified</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> {r.salon_name} · {r.designation || r.role} · since {r.from_date}
                    {r.staff?.phone && <span> · +{r.staff.phone}</span>}
                  </div>
                </div>
                <a href={`${API}/super/id-cards/${r.employee_id}/pdf`} target="_blank" rel="noreferrer" data-testid={`vstaff-idcard-${r.id}`}
                  className="text-xs py-1.5 px-3 rounded-md bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 inline-flex items-center gap-1 shrink-0" title="Download Miracurl ID card PDF">
                  <FileDown className="w-3 h-3" /> ID Card
                </a>
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
