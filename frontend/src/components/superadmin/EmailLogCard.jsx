import { useEffect, useState } from "react";
import { Mail, RefreshCw, Search, Send } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

const fmt = (v) => new Date(v).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const tone = (r) => r.sent ? "bg-emerald-100 text-emerald-700" : r.skipped ? "bg-slate-100 text-slate-500" : "bg-rose-100 text-rose-700";
const label = (r) => r.sent ? "delivered to provider" : r.skipped ? "skipped" : "failed";
const REASONS = { no_real_recipient: "no real inbox — the only address was a login-only @miracurl.com email (add a real email in Settings → profile)" };

function ResendControl({ row, onDone }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState((row.to || []).join(", "));
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const recipients = to.split(/[,\s]+/).map(x => x.trim()).filter(Boolean);
      const { data } = await api.post(`/super-admin/email-log/${row.id}/resend`, { to: recipients });
      toast.success(`Resent to ${data.sent_to.join(", ")}${data.attachments ? ` with ${data.attachments} attachment(s)` : ""}`);
      setOpen(false); onDone?.();
    } catch (e) { toast.error(e.response?.data?.detail || "Resend failed"); }
    finally { setBusy(false); }
  };
  if (!open) return <button onClick={() => setOpen(true)} data-testid={`email-resend-${row.id}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-600 text-white text-[10px] font-bold hover:bg-sky-700 shrink-0"><Send className="w-3 h-3" /> Resend</button>;
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      <input value={to} onChange={e => setTo(e.target.value)} data-testid={`email-resend-to-${row.id}`} placeholder="corrected@email.com" className="px-2 py-0.5 rounded-md border border-sky-300 text-[11px] w-56" />
      <button onClick={go} disabled={busy || !to.trim()} data-testid={`email-resend-go-${row.id}`} className="px-2 py-0.5 rounded-full bg-sky-600 text-white text-[10px] font-bold disabled:opacity-50">{busy ? "Sending…" : "Send"}</button>
      <button onClick={() => setOpen(false)} className="text-[10px] text-slate-400 hover:text-slate-600">cancel</button>
    </span>
  );
}

export function EmailLogCard() {
  const [d, setD] = useState(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    try { const r = await api.get(`/super-admin/email-log?limit=100&status=${status}&q=${encodeURIComponent(q)}`); setD(r.data); }
    catch { /* card is informational */ } finally { setBusy(false); }
  };
  useEffect(() => { load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return null;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5" data-testid="email-log-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Mail className="w-4 h-4 text-sky-600" /> Email delivery log</h3>
          <p className="text-xs text-slate-500 mt-0.5">Every email the platform tried to send — who, what, and exactly why it didn't go out. "Delivered to provider" means Resend accepted it; the receiving mailbox must exist to land in an inbox.</p>
        </div>
        <span data-testid="email-provider-badge" className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${d.provider_ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
          {d.provider_ok ? `● Resend configured · from ${d.sender}` : `○ Email not configured — ${d.provider_error}`}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
        {[["Last 7 days", d.week.total, "text-slate-800"], ["Delivered", d.week.sent, "text-emerald-700"], ["Failed", d.week.failed, "text-rose-700"], ["Skipped", d.week.skipped, "text-slate-500"]].map(([k, v, c]) => (
          <div key={k} className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2" data-testid={`email-week-${k.toLowerCase().replace(/\s/g, "-")}`}><div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{k}</div><div className={`text-lg font-bold ${c}`}>{v}</div></div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <div className="flex gap-1">
          {["all", "sent", "failed", "skipped"].map(s => <button key={s} onClick={() => setStatus(s)} data-testid={`email-log-filter-${s}`} className={`px-2.5 py-1 rounded-md text-[11px] font-semibold capitalize ${status === s ? "bg-slate-800 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>{s}</button>)}
        </div>
        <div className="relative ml-auto">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && load()} placeholder="Search recipient, subject or error…" data-testid="email-log-search" className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs w-64" />
        </div>
        <button onClick={load} disabled={busy} data-testid="email-log-refresh" className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center"><RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} /></button>
      </div>
      <div className="mt-3 max-h-80 overflow-y-auto divide-y divide-slate-100" data-testid="email-log-rows">
        {d.rows.length === 0 && <div className="text-xs text-slate-400 py-4 text-center">No emails match.</div>}
        {d.rows.map(r => (
          <div key={r.id} className="py-2 text-xs flex flex-wrap items-start gap-x-3 gap-y-1" data-testid={`email-log-row-${r.id}`}>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${tone(r)}`}>{label(r)}</span>
            <span className="font-semibold text-slate-800 truncate max-w-[260px]" title={(r.to || []).join(", ")}>{(r.to || []).join(", ") || "—"}</span>
            <span className="text-slate-600 truncate flex-1 min-w-[200px]" title={r.subject}>{r.subject}</span>
            {r.attachments ? <span className="text-slate-400">📎{r.attachments}</span> : null}
            <span className="text-slate-400 shrink-0">{fmt(r.at)}</span>
            {(!r.sent || r.resent_from) && !r.resent_ok && <ResendControl row={r} onDone={load} />}
            {r.resent_ok && <span className="text-[10px] text-emerald-700 font-semibold shrink-0">↻ resent to {(r.resent_to || []).join(", ")}</span>}
            {r.resent_from && <span className="text-[10px] text-slate-400 shrink-0">(resend)</span>}
            {r.error && <div className="w-full text-[11px] text-rose-600 pl-1">↳ {REASONS[r.error] || r.error}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
