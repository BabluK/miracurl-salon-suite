import { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { BadgeCheck, Briefcase, FileText, LogOut, Pencil, ShieldCheck, UserRound } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const http = axios.create({ baseURL: API, withCredentials: true });
const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map(x => x?.msg || "").join(" ");
  return e?.message || "Something went wrong";
};

const inputCls = "w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-amber-400/60";

function AuthForms({ onAuthed }) {
  const [mode, setMode] = useState("login"); // login | register | reset
  const [f, setF] = useState({ phone: "", aadhaar: "", password: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        const { data } = await http.post("/employee/login", { phone: f.phone, password: f.password });
        toast.success(`Welcome back, ${data.name || "there"}!`);
        onAuthed();
      } else if (mode === "register") {
        const { data } = await http.post("/employee/register", { phone: f.phone, aadhaar: f.aadhaar, password: f.password });
        toast.success(`Registered! Welcome, ${data.name} (${data.staff_code})`);
        onAuthed();
      } else {
        await http.post("/employee/reset-password", { phone: f.phone, aadhaar: f.aadhaar, new_password: f.password });
        toast.success("Password reset — please log in");
        setMode("login");
      }
    } catch (err) { toast.error(errMsg(err)); }
    setBusy(false);
  };

  return (
    <div className="w-full max-w-md mx-auto bg-white/[0.04] border border-white/10 rounded-2xl p-6 sm:p-8 backdrop-blur-md" data-testid="employee-auth-card">
      <div className="flex rounded-full bg-white/5 border border-white/10 p-1 mb-6 text-xs">
        {[["login", "Login"], ["register", "Register"], ["reset", "Reset Password"]].map(([m, l]) => (
          <button key={m} type="button" onClick={() => setMode(m)} data-testid={`emp-tab-${m}`}
            className={`flex-1 py-2 rounded-full transition ${mode === m ? "bg-amber-400 text-black font-semibold" : "text-white/60"}`}>{l}</button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-3">
        <input required data-testid="emp-phone-input" className={inputCls} placeholder="Registered mobile number" value={f.phone} onChange={set("phone")} inputMode="numeric" />
        {mode !== "login" && (
          <input required data-testid="emp-aadhaar-input" className={inputCls} placeholder="Aadhaar number (12 digits)" value={f.aadhaar} onChange={set("aadhaar")} inputMode="numeric" maxLength={14} />
        )}
        <input required data-testid="emp-password-input" className={inputCls} type="password" minLength={mode === "login" ? 1 : 8}
          placeholder={mode === "reset" ? "New password (min 8 chars)" : mode === "register" ? "Create password (min 8 chars)" : "Password"}
          value={f.password} onChange={set("password")} />
        <button disabled={busy} data-testid="emp-submit-btn"
          className="w-full py-3 rounded-lg bg-gradient-to-r from-amber-400 to-rose-300 text-black font-semibold text-sm hover:opacity-90 transition disabled:opacity-50">
          {busy ? "Please wait…" : mode === "login" ? "Log in" : mode === "register" ? "Verify & Register" : "Reset password"}
        </button>
      </form>
      <p className="text-[11px] text-white/40 mt-4 leading-relaxed">
        {mode === "register"
          ? "Only staff onboarded in the Miracurl registry can register — your mobile and Aadhaar must match our records. Not registered? Contact the Miracurl Admin team."
          : mode === "reset"
            ? "Verify with your registered mobile + Aadhaar to set a new password."
            : "Use the mobile number you registered with. New here? Use the Register tab."}
      </p>
    </div>
  );
}

function ProfileEditor({ me, onSaved }) {
  const p = me.profile;
  const [f, setF] = useState({ name: p.name || "", email: p.email || "", city: p.city || "", current_address: p.current_address || "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await http.patch("/employee/me", f); toast.success("Profile updated"); onSaved(); }
    catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <div className="space-y-3" data-testid="emp-profile-editor">
      {[["name", "Full name"], ["email", "Email"], ["city", "City"], ["current_address", "Current address"]].map(([k, l]) => (
        <div key={k}>
          <label className="text-[10px] uppercase tracking-widest text-white/40">{l}</label>
          <input data-testid={`emp-profile-${k}`} className={inputCls} value={f[k]} onChange={e => setF(prev => ({ ...prev, [k]: e.target.value }))} />
        </div>
      ))}
      <button onClick={save} disabled={busy} data-testid="emp-profile-save-btn"
        className="px-5 py-2.5 rounded-lg bg-amber-400 text-black text-sm font-semibold hover:opacity-90 disabled:opacity-50">
        {busy ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}

function ResumeBuilder() {
  const [f, setF] = useState({ summary: "", skills: "", education: "", languages: "", extra_experience: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { http.get("/employee/resume").then(r => setF(prev => ({ ...prev, ...r.data }))).catch(() => {}); }, []);
  const upd = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }));

  const save = async () => {
    setBusy(true);
    try { await http.put("/employee/resume", f); toast.success("Resume saved"); }
    catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  const download = async () => {
    try {
      const res = await fetch(`${API}/employee/resume/pdf`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not generate PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "my-miracurl-resume.pdf"; a.click();
      URL.revokeObjectURL(url);
      toast.success("Resume PDF downloaded");
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div data-testid="emp-resume-builder">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2"><FileText className="w-4 h-4 text-amber-300" /> My Resume</h3>
        <div className="flex gap-2">
          <button onClick={save} disabled={busy} data-testid="emp-resume-save-btn"
            className="px-4 py-2 rounded-lg bg-white/10 border border-white/15 text-white text-xs font-semibold hover:bg-white/15 disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
          <button onClick={download} data-testid="emp-resume-download-btn"
            className="px-4 py-2 rounded-lg bg-amber-400 text-black text-xs font-semibold hover:opacity-90">Download PDF</button>
        </div>
      </div>
      <p className="text-[11px] text-white/40 mb-3">Your verified employment history is added to the PDF automatically — fill the rest once and download anytime.</p>
      <div className="space-y-3">
        <textarea data-testid="emp-resume-summary" className={`${inputCls} min-h-[70px]`} placeholder="Profile summary — e.g. Senior hair stylist with 6 years in bridal & color work…" value={f.summary} onChange={upd("summary")} maxLength={600} />
        <input data-testid="emp-resume-skills" className={inputCls} placeholder="Skills (comma separated) — e.g. Balayage, Bridal makeup, Keratin" value={f.skills} onChange={upd("skills")} maxLength={300} />
        <input data-testid="emp-resume-education" className={inputCls} placeholder="Education / certifications" value={f.education} onChange={upd("education")} maxLength={300} />
        <input data-testid="emp-resume-languages" className={inputCls} placeholder="Languages — e.g. Kannada, Hindi, English" value={f.languages} onChange={upd("languages")} maxLength={200} />
        <textarea data-testid="emp-resume-extra" className={`${inputCls} min-h-[60px]`} placeholder="Other experience (before Miracurl salons, freelance work…)" value={f.extra_experience} onChange={upd("extra_experience")} maxLength={800} />
      </div>
    </div>
  );
}

function Dashboard({ me, reload, onLogout }) {
  const p = me.profile;
  const [editing, setEditing] = useState(false);
  return (
    <div className="w-full max-w-3xl mx-auto space-y-6" data-testid="employee-dashboard">
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-md">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 min-w-0">
            {p.photo_url ? <img src={p.photo_url} alt="" className="w-14 h-14 rounded-full object-cover border border-amber-400/40" />
              : <span className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center"><UserRound className="w-6 h-6 text-amber-300" /></span>}
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-white truncate" data-testid="emp-name">{p.name}</h2>
              <p className="text-xs text-white/50 flex items-center gap-1.5 mt-0.5">
                <BadgeCheck className="w-3.5 h-3.5 text-emerald-400" /> Staff code {p.staff_code} · {p.city || "—"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditing(!editing)} data-testid="emp-edit-toggle-btn"
              className="px-3 py-2 rounded-lg border border-white/15 text-white/70 text-xs flex items-center gap-1.5 hover:bg-white/5"><Pencil className="w-3.5 h-3.5" /> {editing ? "Close" : "Edit details"}</button>
            <button onClick={onLogout} data-testid="emp-logout-btn"
              className="px-3 py-2 rounded-lg border border-white/15 text-white/70 text-xs flex items-center gap-1.5 hover:bg-white/5"><LogOut className="w-3.5 h-3.5" /> Logout</button>
          </div>
        </div>
        {editing && <div className="mt-6 pt-6 border-t border-white/10"><ProfileEditor me={me} onSaved={() => { setEditing(false); reload(); }} /></div>}
      </div>

      <div className="bg-gradient-to-r from-amber-400/15 to-rose-300/10 border border-amber-400/30 rounded-2xl p-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-white font-semibold flex items-center gap-2"><Briefcase className="w-4 h-4 text-amber-300" /> Current openings</h3>
          <p className="text-xs text-white/50 mt-1">See jobs at every salon registered with Miracurl and apply with your resume.</p>
        </div>
        <Link to="/jobs" data-testid="emp-view-jobs-btn"
          className="px-5 py-2.5 rounded-full bg-amber-400 text-black text-sm font-semibold hover:opacity-90">Browse jobs →</Link>
      </div>

      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6" data-testid="emp-resume-card">
        <ResumeBuilder />
      </div>

      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6">
        <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400" /> Employment history</h3>
        {me.employments.length === 0 && <p className="text-xs text-white/40">No employment records yet.</p>}
        <div className="divide-y divide-white/5">
          {me.employments.map((r, i) => (
            <div key={i} className="py-3 flex items-center justify-between gap-3" data-testid={`emp-history-${i}`}>
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{r.salon} <span className="text-white/40">· {r.designation}</span></p>
                <p className="text-[11px] text-white/40">{r.from_date} → {r.to_date || "Present"}</p>
              </div>
              {r.hq_verified && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">HQ Verified</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function EmployeePortal() {
  const [me, setMe] = useState(null);
  const [checking, setChecking] = useState(true);

  const load = () => http.get("/employee/me").then(r => setMe(r.data)).catch(() => setMe(null)).finally(() => setChecking(false));
  useEffect(() => { load(); }, []);

  const logout = async () => {
    try { await http.post("/employee/logout"); } catch { /* fine */ }
    setMe(null);
    toast.success("Logged out");
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white px-4 py-10 sm:py-16" data-testid="employee-portal-page">
      <div className="text-center mb-10">
        <div className="text-[10px] tracking-[0.4em] uppercase text-amber-300/70">Miracurl · Employee Portal</div>
        <h1 className="font-playfair text-3xl sm:text-4xl mt-3">Your career, verified ✦</h1>
        <p className="text-white/40 text-sm mt-2 max-w-md mx-auto">For staff onboarded in the Miracurl registry — manage your profile and apply to salon openings.</p>
      </div>
      {checking ? <p className="text-center text-white/40 text-sm">Loading…</p>
        : me ? <Dashboard me={me} reload={load} onLogout={logout} />
          : <AuthForms onAuthed={load} />}
    </div>
  );
}
