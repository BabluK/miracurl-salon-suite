import { useEffect, useState, useCallback } from "react";
import api, { API, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { FileText, Download, Save, Plus, X, ChevronDown, ChevronUp } from "lucide-react";

const DESIGNATIONS = ["Beauty Expert", "Nail Expert", "Hair Expert", "Manager", "Chemical Expert"];
const inputCls = "w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90 placeholder:text-white/25 focus:outline-none focus:border-gold/50";
const labelCls = "block text-[10px] uppercase tracking-[0.2em] text-white/40 mb-1";
const EMPTY_JOB = { salon_name: "", from_date: "", to_date: "", phone: "", address: "" };

export function ResumeBuilder({ standalone = false }) {
  const [open, setOpen] = useState(standalone);
  const [r, setR] = useState(null);
  const [prompts, setPrompts] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/staff/me/resume");
      const { role_prompts, saved, ...rest } = data;
      setPrompts(role_prompts || {});
      setR(rest);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Couldn't load resume");
    }
  }, []);
  useEffect(() => { if (open && !r) load(); }, [open, r, load]);

  const set = (k, v) => setR(prev => ({ ...prev, [k]: v }));

  function toggleDesignation(d) {
    const on = r.designations.includes(d);
    const designations = on ? r.designations.filter(x => x !== d) : [...r.designations, d];
    const responsibilities = { ...r.responsibilities };
    if (!on && !(responsibilities[d] || "").trim()) responsibilities[d] = prompts[d] || "";
    setR({ ...r, designations, responsibilities });
  }

  async function save(silent = false) {
    setBusy(true);
    try {
      await api.put("/staff/me/resume", r);
      if (!silent) toast.success("Resume saved ✦");
      return true;
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
      return false;
    } finally { setBusy(false); }
  }

  async function download() {
    if (!(await save(true))) return;
    setBusy(true);
    try {
      const resp = await api.get("/staff/me/resume.pdf", { responseType: "blob", timeout: 60000 });
      const blob = resp.data instanceof Blob ? resp.data : new Blob([resp.data], { type: "application/pdf" });
      if (!blob.size || (blob.type && !blob.type.includes("pdf"))) throw new Error("bad-pdf");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `resume-${(r.name || "me").replace(/\s+/g, "-").toLowerCase()}.pdf`;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      toast.success("Resume downloaded ✦ All the best!");
    } catch (e) {
      const detail = formatApiError(e?.response?.data?.detail);
      toast.error(detail || "Couldn't download — opening the PDF in a new tab instead");
      window.open(`${API}/staff/me/resume.pdf`, "_blank", "noopener");
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-2xl bg-[#0F0F0F] border border-white/5 p-5 sm:p-6" data-testid="resume-builder-card">
      {!standalone && (
        <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between" data-testid="resume-builder-toggle">
          <div className="font-playfair text-lg flex items-center gap-2">
            <FileText className="w-4 h-4 text-gold" /> Resume Builder
          </div>
          <span className="text-white/40 flex items-center gap-2 text-xs">
            Build & download your professional resume {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </button>
      )}

      {open && !r && <div className="text-white/40 text-sm py-6">Loading…</div>}

      {open && r && (
        <div className="mt-5 space-y-5" data-testid="resume-form">
          {/* Basics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className={labelCls}>Full name</label>
              <input data-testid="resume-name" className={inputCls} value={r.name} onChange={e => set("name", e.target.value)} /></div>
            <div><label className={labelCls}>Total experience (years)</label>
              <input data-testid="resume-exp" className={inputCls} value={r.total_experience_years} onChange={e => set("total_experience_years", e.target.value)} placeholder="e.g. 4.5" /></div>
            <div><label className={labelCls}>Email</label>
              <input className={inputCls} value={r.email} onChange={e => set("email", e.target.value)} /></div>
            <div><label className={labelCls}>Phone</label>
              <input className={inputCls} value={r.phone} onChange={e => set("phone", e.target.value)} /></div>
            <div><label className={labelCls}>Current address</label>
              <input data-testid="resume-current-address" className={inputCls} value={r.current_address} onChange={e => set("current_address", e.target.value)} /></div>
            <div><label className={labelCls}>Permanent address</label>
              <input className={inputCls} value={r.permanent_address} onChange={e => set("permanent_address", e.target.value)} /></div>
          </div>
          <p className="text-[11px] text-white/30 -mt-2">Your profile photo appears in a circle on the top-right of the resume automatically.</p>

          {/* Designations */}
          <div>
            <label className={labelCls}>Designation (select all that apply)</label>
            <div className="flex flex-wrap gap-2">
              {DESIGNATIONS.map(d => (
                <button key={d} data-testid={`resume-desig-${d.toLowerCase().replace(/\s/g, "-")}`}
                  onClick={() => toggleDesignation(d)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition ${r.designations.includes(d)
                    ? "bg-gold text-bg-base border-gold font-semibold"
                    : "border-white/15 text-white/60 hover:border-gold/50"}`}>
                  {d}
                </button>
              ))}
            </div>
            {r.designations.map(d => (
              <div key={d} className="mt-3">
                <label className={labelCls}>{d} — responsibilities (auto-written, edit freely)</label>
                <textarea data-testid={`resume-resp-${d.toLowerCase().replace(/\s/g, "-")}`} rows={3} className={inputCls}
                  value={r.responsibilities[d] || ""}
                  onChange={e => set("responsibilities", { ...r.responsibilities, [d]: e.target.value })} />
              </div>
            ))}
          </div>

          {/* Current employment */}
          <div className="rounded-xl border border-white/10 p-4 space-y-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-gold/80">Current salon / company</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={labelCls}>Salon name</label>
                <input className={inputCls} value={r.current_salon} onChange={e => set("current_salon", e.target.value)} /></div>
              <div><label className={labelCls}>Currently working</label>
                <select data-testid="resume-working-select" className={inputCls} value={r.currently_working ? "yes" : "no"} onChange={e => set("currently_working", e.target.value === "yes")}>
                  <option value="yes">Yes</option><option value="no">No</option>
                </select></div>
              <div><label className={labelCls}>Salon phone (for verification)</label>
                <input className={inputCls} value={r.salon_phone} onChange={e => set("salon_phone", e.target.value)} /></div>
              <div><label className={labelCls}>Salon address</label>
                <input className={inputCls} value={r.salon_address} onChange={e => set("salon_address", e.target.value)} /></div>
            </div>
          </div>

          {/* Past jobs */}
          <div className="rounded-xl border border-white/10 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.2em] text-gold/80">Previous salons / companies</div>
              <button data-testid="resume-add-job" onClick={() => set("past_jobs", [...r.past_jobs, { ...EMPTY_JOB, uid: `job-${Date.now()}` }])}
                className="text-xs text-gold flex items-center gap-1 hover:opacity-80"><Plus className="w-3.5 h-3.5" /> Add</button>
            </div>
            {r.past_jobs.length === 0 && <div className="text-white/30 text-xs">No previous workplaces added.</div>}
            {r.past_jobs.map((j, i) => (
              <div key={j.uid || `${j.salon_name}-${i}`} className="rounded-lg bg-white/5 p-3 space-y-2 relative" data-testid={`resume-job-${i}`}>
                <button onClick={() => set("past_jobs", r.past_jobs.filter((_, xi) => xi !== i))}
                  className="absolute top-2 right-2 text-white/30 hover:text-red-400"><X className="w-4 h-4" /></button>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div><label className={labelCls}>Salon name</label>
                    <input className={inputCls} value={j.salon_name} onChange={e => set("past_jobs", r.past_jobs.map((x, xi) => xi === i ? { ...x, salon_name: e.target.value } : x))} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className={labelCls}>From</label>
                      <input className={inputCls} placeholder="Jan 2022" value={j.from_date} onChange={e => set("past_jobs", r.past_jobs.map((x, xi) => xi === i ? { ...x, from_date: e.target.value } : x))} /></div>
                    <div><label className={labelCls}>To</label>
                      <input className={inputCls} placeholder="Mar 2024" value={j.to_date} onChange={e => set("past_jobs", r.past_jobs.map((x, xi) => xi === i ? { ...x, to_date: e.target.value } : x))} /></div>
                  </div>
                  <div><label className={labelCls}>Phone (for verification)</label>
                    <input className={inputCls} value={j.phone} onChange={e => set("past_jobs", r.past_jobs.map((x, xi) => xi === i ? { ...x, phone: e.target.value } : x))} /></div>
                  <div><label className={labelCls}>Address</label>
                    <input className={inputCls} value={j.address} onChange={e => set("past_jobs", r.past_jobs.map((x, xi) => xi === i ? { ...x, address: e.target.value } : x))} /></div>
                </div>
              </div>
            ))}
          </div>

          {/* Extras */}
          <div className="grid grid-cols-1 gap-3">
            <div><label className={labelCls}>Achievements</label>
              <textarea rows={2} className={inputCls} value={r.achievements} onChange={e => set("achievements", e.target.value)} placeholder="e.g. Best Stylist of the Month — 3 times" /></div>
            <div><label className={labelCls}>Hobbies</label>
              <input className={inputCls} value={r.hobbies} onChange={e => set("hobbies", e.target.value)} placeholder="e.g. Sketching, learning new nail-art styles" /></div>
            <div><label className={labelCls}>Awards / appreciation (comments)</label>
              <textarea rows={2} className={inputCls} value={r.awards} onChange={e => set("awards", e.target.value)} placeholder="Client appreciation, certificates, awards…" /></div>
          </div>

          <p className="text-[11px] text-white/30">Resume ends with: “Regards, {r.name || "Your name"}{r.phone ? ` · ${r.phone}` : ""}”</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button data-testid="resume-save-btn" disabled={busy} onClick={() => save()}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-white/10 hover:bg-white/15 border border-white/10 rounded-md text-sm transition disabled:opacity-50">
              <Save className="w-4 h-4" /> Save resume
            </button>
            <button data-testid="resume-download-btn" disabled={busy} onClick={download}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-gold to-blush text-bg-base font-medium rounded-md text-sm hover:opacity-90 transition disabled:opacity-50">
              <Download className="w-4 h-4" /> Download PDF resume
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
