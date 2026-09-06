import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { KeyRound, Loader2, ShieldCheck, UserRound, Mail, Instagram, Phone, Save } from "lucide-react";

const inp = "mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm normal-case";
const lbl = "text-[10px] uppercase tracking-wide text-slate-500 block";

export function SuperAdminProfileCard() {
  const [me, setMe] = useState(null);
  const [f, setF] = useState({ name: "", notify_email: "", instagram: "", phone: "" });
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => { api.get("/auth/me").then(r => { setMe(r.data); setF({ name: r.data.name || "", notify_email: r.data.notify_email || "", instagram: r.data.instagram || "", phone: r.data.phone || "" }); }).catch(() => {}); }, []);
  if (!me || me.role !== "super_admin") return null;

  const saveProfile = async () => {
    setBusy("profile");
    try { const { data } = await api.put("/auth/me/profile", f); setMe(m => ({ ...m, ...data })); toast.success("Profile saved ✦"); }
    catch (e) { toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Couldn't save profile"); }
    setBusy("");
  };
  const saveLogin = async () => {
    if (!window.confirm(`Change your login email from ${me.email} to ${email}? You'll sign in with the new address from now on.`)) return;
    setBusy("login");
    try {
      const { data } = await api.put("/auth/me/login-email", { new_email: email, current_password: pw });
      setMe(m => ({ ...m, email: data.email })); setEmail(""); setPw("");
      toast.success(`Login email is now ${data.email} ✦ (old: ${data.previous_email})`);
    } catch (e) { toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Couldn't change login email"); }
    setBusy("");
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6" data-testid="super-admin-profile-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-900 text-[#F0D9A5] flex items-center justify-center shrink-0"><UserRound className="w-5 h-5" /></div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-slate-800">Super-admin profile</h2>
          <p className="text-xs text-slate-500 mt-1">Your login ID, real inbox (Gmail), Instagram and WhatsApp — used for HQ alerts, reset links and the "Powered by Miracurl" contact details.</p>
          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            <label className={lbl}>Display name<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={inp} data-testid="sa-profile-name" /></label>
            <label className={lbl}><span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" /> Gmail / notification inbox</span><input type="email" value={f.notify_email} onChange={e => setF({ ...f, notify_email: e.target.value })} placeholder="you@gmail.com" className={inp} data-testid="sa-profile-gmail" /></label>
            <label className={lbl}><span className="inline-flex items-center gap-1"><Instagram className="w-3 h-3" /> Instagram ID</span><div className="relative mt-1"><span className="absolute left-3 top-2 text-sm text-slate-400">@</span><input value={f.instagram} onChange={e => setF({ ...f, instagram: e.target.value })} placeholder="miracurl.suite" className="w-full border border-slate-200 rounded-lg pl-7 pr-3 py-2 text-sm" data-testid="sa-profile-instagram" /></div></label>
            <label className={lbl}><span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> WhatsApp number</span><input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="+91 98xxxxxxx" className={inp} data-testid="sa-profile-phone" /></label>
          </div>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <button onClick={saveProfile} disabled={busy === "profile"} data-testid="sa-profile-save" className="h-9 px-4 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-50 inline-flex items-center gap-1.5">{busy === "profile" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save profile</button>
            {me.notify_email ? <span className="text-[11px] text-emerald-700" data-testid="sa-profile-inbox-ok">✓ HQ mail goes to {me.notify_email}</span> : <span className="text-[11px] text-amber-700" data-testid="sa-profile-inbox-warn">HQ mail currently goes to admin@ / support@miracurl-suite.com — add your Gmail to receive it there too.</span>}
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 pt-6 border-t border-slate-100">
        <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0"><KeyRound className="w-5 h-5" /></div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-slate-800">Login email</h2>
          <p className="text-xs text-slate-500 mt-1">Currently signing in as <b data-testid="login-email-current">{me.email}</b>. Change it to a real inbox (e.g. <code>admin@miracurl-suite.com</code>) so login ID and notifications are the same address. Your password and sessions stay the same.</p>
          <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 mt-3 items-end">
            <label className={lbl}>New login email<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@miracurl-suite.com" className={inp} data-testid="login-email-input" /></label>
            <label className={lbl}>Current password<input type="password" value={pw} onChange={e => setPw(e.target.value)} className={inp} data-testid="login-email-password" /></label>
            <button onClick={saveLogin} disabled={busy === "login" || !email || !pw} data-testid="login-email-save" className="h-9 px-4 rounded-full bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 inline-flex items-center gap-1.5">{busy === "login" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Change login email</button>
          </div>
        </div>
      </div>
    </div>
  );
}
