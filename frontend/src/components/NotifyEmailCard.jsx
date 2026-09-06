import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { MailCheck, Loader2, AlertTriangle } from "lucide-react";

export function NotifyEmailCard({ dark = false }) {
  const [me, setMe] = useState(null);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/auth/me").then(r => { setMe(r.data); setVal(r.data.notify_email || ""); }).catch(() => {}); }, []);
  if (!me) return null;
  const loginOnly = /@miracurl\.com$/i.test(me.email || "");
  const save = async () => {
    setBusy(true);
    try { const { data } = await api.put("/auth/me/notify-email", { notify_email: val }); setMe(m => ({ ...m, notify_email: data.notify_email })); toast.success(data.notify_email ? `Emails will go to ${data.notify_email}` : "Notification email cleared"); }
    catch (e) { toast.error(e.response?.data?.detail || "Couldn't save"); }
    setBusy(false);
  };
  const shell = dark ? "rounded-2xl border border-[#d4af37]/30 bg-[#15151b] text-slate-100 p-5" : "bg-white rounded-2xl border border-slate-200 p-6 mt-6 text-slate-800";
  const sub = dark ? "text-slate-400" : "text-slate-500";
  return (
    <div className={shell} data-testid="notify-email-card">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${dark ? "bg-[#d4af37]/15 text-[#F0D9A5]" : "bg-sky-100 text-sky-600"}`}><MailCheck className="w-5 h-5" /></div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold">Notification email</h2>
          <p className={`text-xs mt-1 ${sub}`}>Your login ID <b>{me.email}</b> stays as it is. Reset links, reports, alerts and receipts are delivered to the real inbox below.</p>
          {loginOnly && !me.notify_email && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5" data-testid="notify-email-warning"><AlertTriangle className="w-3.5 h-3.5" /> @miracurl.com can't receive mail — add a real inbox or you won't get password-reset links.</div>
          )}
          <div className="flex gap-2 mt-3 flex-wrap">
            <input type="email" value={val} onChange={e => setVal(e.target.value)} placeholder="you@gmail.com" data-testid="notify-email-input"
              className={`flex-1 min-w-[220px] rounded-lg px-3 py-2 text-sm border ${dark ? "!bg-white/5 border-white/10 !text-slate-100" : "border-slate-200"}`} />
            <button onClick={save} disabled={busy} data-testid="notify-email-save" className={`px-4 py-2 rounded-full text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-1.5 ${dark ? "bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b]" : "bg-slate-900 text-white hover:bg-slate-700"}`}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save</button>
          </div>
          {me.notify_email && <div className={`text-[11px] mt-2 ${sub}`} data-testid="notify-email-current">Currently: <b>{me.notify_email}</b></div>}
        </div>
      </div>
    </div>
  );
}
