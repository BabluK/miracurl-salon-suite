import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Activity, AlertTriangle, BarChart3, CheckCircle2, Copy, ExternalLink, FileSignature, FileText, IndianRupee, Link2, Loader2, Mail, MessageCircle, RotateCcw, Save, Send, ShieldCheck, Wallet, X } from "lucide-react";

async function dlDoc(path, name) {
  try {
    const r = await api.get(path, { responseType: "blob" });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } catch { toast.error("Couldn't download the PDF"); }
}
import api from "@/lib/api";

const inp = "border border-white/10 rounded-lg px-2 py-1 text-xs !bg-white/5 !text-slate-200";
const inr = (v) => `₹${Number(v || 0).toLocaleString("en-IN")}`;
const STATUS = {
  overdue: "bg-rose-500/15 text-rose-300 border-rose-400/40", pending: "bg-amber-500/15 text-amber-200 border-amber-400/40",
  not_set: "bg-white/5 text-slate-400 border-white/10", paid: "bg-emerald-500/15 text-emerald-300 border-emerald-400/40",
  waived: "bg-slate-500/15 text-slate-300 border-slate-400/30",
};

function Chip({ label, value, tone = "text-[#F0D9A5]", testId }) {
  return (
    <div className="rounded-xl bg-white/[.04] border border-white/10 px-3 py-2 min-w-[110px]" data-testid={testId}>
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-sm font-bold ${tone}`}>{value}</div>
    </div>
  );
}

function EarningsModal({ r, onClose }) {
  const [d, setD] = useState(null);
  useEffect(() => { api.get(`/super-admin/rewards-campaign/settlements/${r.tenant_id}/earnings`).then(x => setD(x.data)).catch(() => setD({ error: true })); }, [r.tenant_id]);
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-[130] flex items-start justify-center bg-black/60 p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl my-auto rounded-2xl bg-[#1c1c22] border border-[#d4af37]/40 p-5 space-y-3" onClick={e => e.stopPropagation()} data-testid="settlement-earnings-modal">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[#d4af37]" />
          <div className="text-sm font-bold text-slate-100">Campaign earnings · {r.name}</div>
          {d && !d.error && <span className="text-[10px] text-slate-500">{d.period.start} → {d.period.end} · from Miracurl POS invoices (no customer data)</span>}
          <button onClick={onClose} className="ml-auto p-1 text-slate-400 hover:text-slate-200" data-testid="settlement-earnings-close"><X className="w-4 h-4" /></button>
        </div>
        {!d ? <div className="text-xs text-slate-400 py-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /> Loading bills…</div> : d.error ? <div className="text-xs text-rose-300">Couldn't load earnings</div> : (
          <>
            <div className="flex gap-2 flex-wrap">
              <Chip label="Total earnings" value={inr(d.revenue)} testId="earnings-total" />
              <Chip label="Bills" value={`${d.bills} (${d.eligible_bills} eligible)`} tone="text-slate-200" testId="earnings-bills" />
              <Chip label={`Miracurl ${d.share_pct}%`} value={inr(d.share_amount)} tone="text-emerald-300" testId="earnings-share" />
              <a href="#" onClick={async e => { e.preventDefault(); await dlDoc(`/super-admin/rewards-campaign/settlements/${r.tenant_id}/earnings.csv`, `campaign-earnings-${r.slug}.csv`); }} className="ml-auto self-center px-3 py-1.5 rounded-full border border-white/15 text-xs text-slate-200 hover:border-[#d4af37]/60" data-testid="earnings-csv">Export CSV</a>
            </div>
            {d.monthly.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {d.monthly.map(m => <div key={m.month} className="rounded-xl bg-white/[.04] border border-white/10 px-3 py-2" data-testid={`earnings-month-${m.month}`}><div className="text-[9px] uppercase tracking-wider text-slate-500">{m.month}</div><div className="text-sm font-bold text-slate-100">{inr(m.revenue)}</div><div className="text-[10px] text-slate-500">{m.bills} bills</div></div>)}
              </div>
            )}
            <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-[#1c1c22]"><tr className="text-left text-slate-500"><th className="px-3 py-2">Date</th><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Branch</th><th className="px-3 py-2">Mode</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
                <tbody>
                  {d.recent.length === 0 ? <tr><td colSpan="5" className="px-3 py-6 text-center text-slate-500">No POS bills recorded in the campaign window yet.</td></tr>
                    : d.recent.map(b => <tr key={b.invoice_no} className="border-t border-white/5 text-slate-200"><td className="px-3 py-1.5">{b.date}</td><td className="px-3 py-1.5 font-mono">{b.invoice_no}</td><td className="px-3 py-1.5 text-slate-400">{b.branch || "—"}</td><td className="px-3 py-1.5 text-slate-400">{b.payment_mode}</td><td className="px-3 py-1.5 text-right font-semibold">{inr(b.total)}</td></tr>)}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const FLAG = {
  silent: ["bg-rose-500/15 border-rose-400/40 text-rose-300", "No POS bills"], drop: ["bg-rose-500/15 border-rose-400/40 text-rose-300", "Sharp drop"],
  ok: ["bg-emerald-500/15 border-emerald-400/40 text-emerald-300", "Healthy"], early: ["bg-white/5 border-white/10 text-slate-400", "Too early"],
  no_baseline: ["bg-white/5 border-white/10 text-slate-400", "No baseline"],
};

function EarningsWatch({ onViewBills }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => api.get("/super-admin/rewards-campaign/anomalies").then(r => setD(r.data)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  if (!d) return null;
  const alertNow = async () => {
    setBusy(true);
    try { const { data: x } = await api.post("/super-admin/rewards-campaign/anomalies/alert"); toast.success(x.flagged ? `Mira emailed HQ about ${x.flagged} salon(s)` : "Nothing to flag — all salons look healthy"); load(); }
    catch (e) { toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Couldn't send"); }
    setBusy(false);
  };
  return (
    <div className={`rounded-2xl border p-3 space-y-2 ${d.flagged ? "border-rose-400/40 bg-rose-500/[.05]" : "border-white/10 bg-white/[.02]"}`} data-testid="earnings-watch">
      <div className="flex items-center gap-2 flex-wrap">
        <Activity className={`w-4 h-4 ${d.flagged ? "text-rose-300" : "text-[#d4af37]"}`} />
        <button onClick={() => setOpen(o => !o)} className="text-sm font-bold text-slate-100 hover:text-[#F0D9A5]" data-testid="earnings-watch-toggle">Mira earnings watch {d.flagged ? <span className="ml-1 px-1.5 py-0.5 rounded-full bg-rose-500/30 text-rose-200 text-[10px]" data-testid="earnings-watch-flagged">{d.flagged} flagged</span> : <span className="ml-1 text-[10px] text-emerald-300">· all clear</span>}</button>
        <span className="text-[11px] text-slate-500">flags salons billing ≥{d.threshold_pct}% below their 3-month pre-campaign average (possible off-app billing) · Mira emails HQ every Monday{d.last_alert ? ` · last check ${d.last_alert}` : ""}</span>
        <button onClick={alertNow} disabled={busy} className="ml-auto h-7 px-2.5 rounded-lg border border-white/15 text-slate-300 text-[11px] inline-flex items-center gap-1 hover:border-[#d4af37]/60 disabled:opacity-40" data-testid="earnings-watch-alert-now">{busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />} Email HQ now</button>
      </div>
      {(open || d.flagged > 0) && (
        <div className="space-y-1.5">
          {d.rows.map(r => (
            <div key={r.tenant_id} className="flex items-center gap-2 flex-wrap text-[11px] rounded-xl bg-white/[.03] border border-white/5 px-3 py-2" data-testid={`anomaly-row-${r.slug}`}>
              <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${FLAG[r.flag][0]}`} data-testid={`anomaly-flag-${r.slug}`}>{FLAG[r.flag][1]}{r.flag === "drop" ? ` −${r.drop_pct}%` : ""}</span>
              <b className="text-slate-100">{r.name}</b>
              <span className="text-slate-500">before ₹{Number(r.baseline_monthly).toLocaleString("en-IN")}/mo → campaign ₹{Number(r.current_monthly).toLocaleString("en-IN")}/mo ({r.current_bills} bills in {r.days_in_campaign}d)</span>
              <span className="text-slate-400 basis-full sm:basis-auto sm:ml-auto italic">“{r.mira_note}”</span>
              <button onClick={() => onViewBills(r)} className="px-2 py-0.5 rounded-full border border-white/15 text-slate-300 text-[10px] hover:border-[#d4af37]/60" data-testid={`anomaly-bills-${r.slug}`}>bills</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ r, busy, onSave, onAction, onRemind, onSendDocs, onEarnings }) {
  const [f, setF] = useState({ amount: r.amount || "", due_date: r.due_date || "", note: r.note || "" });
  useEffect(() => { setF({ amount: r.amount || "", due_date: r.due_date || "", note: r.note || "" }); }, [r.amount, r.due_date, r.note]);
  const dirty = String(f.amount) !== String(r.amount || "") || f.due_date !== (r.due_date || "") || f.note !== (r.note || "");
  const open = r.status === "pending" || r.status === "overdue";
  const last = r.reminders[r.reminders.length - 1];
  const b = (k) => busy === `${r.tenant_id}:${k}`;
  return (
    <div className={`rounded-2xl border p-3 space-y-2 ${r.status === "overdue" ? "border-rose-400/30 bg-rose-500/[.04]" : "border-white/10 bg-white/[.03]"}`} data-testid={`settlement-row-${r.slug}`}>
      <div className="flex items-center gap-2 flex-wrap">
        {r.logo_url ? <img src={r.logo_url} alt="" className="w-8 h-8 rounded-full object-cover border border-white/10" /> : <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs">💇</span>}
        <div className="min-w-0 flex-1">
          <div className="text-sm text-slate-100 font-semibold truncate">{r.name} <span className="text-[10px] text-slate-500 font-normal">· {r.location || r.slug}</span></div>
          <div className="text-[10px] text-slate-500 flex items-center gap-1.5 flex-wrap">
            <span>{r.participants} applicant{r.participants === 1 ? "" : "s"} · {r.winners} winner{r.winners === 1 ? "" : "s"}</span>
            <span>· {r.email ? <span className="text-slate-300" data-testid={`settlement-email-${r.slug}`}>{r.email}</span> : <span className="text-rose-300" data-testid={`settlement-email-${r.slug}`}>no real email on file</span>}</span>
            <span>· {r.phone || "no phone"}</span>
            <a href={r.public_url} target="_blank" rel="noreferrer" className="text-[#d4af37]/80 hover:text-[#d4af37] inline-flex items-center gap-0.5" data-testid={`settlement-public-${r.slug}`}><ExternalLink className="w-2.5 h-2.5" /> public page</a>
          </div>
        </div>
        {r.agreement && (r.agreement.status === "accepted"
          ? <button onClick={() => dlDoc(`/super-admin/rewards-campaign/docs/agreement/${r.tenant_id}.pdf`, `Agreement-${r.slug}-SIGNED.pdf`)} className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-[10px] font-bold inline-flex items-center gap-1 hover:bg-emerald-500/25" title={`Accepted by ${r.agreement.by} · ${String(r.agreement.at).slice(0, 10)} — download signed copy`} data-testid={`settlement-agreement-${r.slug}`}><FileSignature className="w-3 h-3" /> Agreement signed</button>
          : <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${r.agreement.status === "outdated" ? "bg-amber-500/15 border-amber-400/40 text-amber-200" : "bg-rose-500/15 border-rose-400/40 text-rose-300"}`} data-testid={`settlement-agreement-${r.slug}`}>{r.agreement.status === "outdated" ? "Agreement: re-accept needed" : "Agreement pending"}</span>)}
        {r.trusted && <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-[10px] font-bold inline-flex items-center gap-1" data-testid={`settlement-trusted-${r.slug}`}><ShieldCheck className="w-3 h-3" /> Trusted badge live</span>}
        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${STATUS[r.status]}`} data-testid={`settlement-status-${r.slug}`}>{r.status.replace("_", " ")}</span>
        {r.status === "paid" && <span className="text-[10px] text-emerald-300/80">{r.paid_method}{r.paid_ref ? ` · ${r.paid_ref}` : ""} · {String(r.paid_at || "").slice(0, 10)}</span>}
      </div>
      {r.suggested && (
        <div className="flex items-center gap-2 flex-wrap text-[11px]" data-testid={`settlement-suggest-${r.slug}`}>
          <span className="px-2.5 py-1 rounded-lg bg-[#d4af37]/10 border border-[#d4af37]/30 text-slate-200 inline-flex items-center gap-1.5"><BarChart3 className="w-3 h-3 text-[#d4af37]" /> Total earnings during campaign: <b className="text-[#F0D9A5] text-sm" data-testid={`settlement-earnings-${r.slug}`}>₹{Number(r.suggested.revenue).toLocaleString("en-IN")}</b> <span className="text-slate-500">({r.suggested.bills} bills, {r.suggested.eligible_bills} eligible)</span></span>
          <button onClick={() => onEarnings(r)} className="px-2 py-0.5 rounded-full border border-white/15 text-slate-300 text-[10px] hover:border-[#d4af37]/60" data-testid={`settlement-viewbills-${r.slug}`}>View bills</button>
          <span className="text-slate-400">× {r.suggested.pct}% =</span>
          <b className="text-[#F0D9A5]">₹{Number(r.suggested.amount).toLocaleString("en-IN")}</b>
          {r.suggested.amount > 0 && String(r.suggested.amount) !== String(f.amount) && (r.status === "not_set" || r.status === "pending" || r.status === "overdue") && (
            <button onClick={() => setF({ ...f, amount: r.suggested.amount })} className="px-2 py-0.5 rounded-full border border-[#d4af37]/50 text-[#F0D9A5] text-[10px] font-semibold hover:bg-[#d4af37]/10" data-testid={`settlement-use-suggest-${r.slug}`}>Use this</button>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-1 text-[10px] text-slate-500">₹<input type="number" min="0" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} placeholder="amount" className={inp + " w-24"} data-testid={`settlement-amount-${r.slug}`} /></label>
        <input type="date" value={f.due_date} onChange={e => setF({ ...f, due_date: e.target.value })} className={inp} data-testid={`settlement-due-${r.slug}`} />
        <input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="note e.g. 2 Gold memberships redeemed" className={inp + " flex-1 min-w-[160px]"} data-testid={`settlement-note-${r.slug}`} />
        <button onClick={() => onSave(r, { amount: Number(f.amount || 0), due_date: f.due_date, note: f.note })} disabled={!dirty || !!busy} data-testid={`settlement-save-${r.slug}`}
          className="h-7 px-2.5 rounded-lg bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-40">{b("save") ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save</button>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={() => onSendDocs(r)} disabled={!!busy || !r.email} title={r.docs_sent_at ? `Pack sent ${String(r.docs_sent_at).slice(0, 10)} — send again` : "Email guide + agreement + T&C to the salon"} data-testid={`settlement-senddocs-${r.slug}`} className="h-7 px-2.5 rounded-lg border border-[#d4af37]/40 text-[#F0D9A5] text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-[#d4af37]/10 disabled:opacity-40">{b("docs") ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} {r.docs_sent_at ? "Resend docs" : "Send docs pack"}</button>
        {open && <>
          <button onClick={() => onRemind(r, "email")} disabled={!!busy || !r.email} data-testid={`settlement-remind-email-${r.slug}`} className="h-7 px-2.5 rounded-lg border border-sky-400/40 text-sky-200 text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-sky-500/10 disabled:opacity-40">{b("email") ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />} Mira email nudge</button>
          <button onClick={() => onRemind(r, "whatsapp")} disabled={!!busy || !r.phone} data-testid={`settlement-remind-wa-${r.slug}`} className="h-7 px-2.5 rounded-lg border border-emerald-400/40 text-emerald-200 text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-emerald-500/10 disabled:opacity-40">{b("whatsapp") ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageCircle className="w-3 h-3" />} WhatsApp nudge</button>
          <button onClick={() => onAction(r, "mark-paid")} disabled={!!busy} data-testid={`settlement-paid-${r.slug}`} className="h-7 px-2.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-[11px] font-bold inline-flex items-center gap-1 hover:bg-emerald-500/30 disabled:opacity-40">{b("mark-paid") ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Mark paid</button>
          <button onClick={() => onAction(r, "waive")} disabled={!!busy} data-testid={`settlement-waive-${r.slug}`} className="h-7 px-2.5 rounded-lg border border-white/15 text-slate-400 text-[11px] inline-flex items-center gap-1 hover:text-slate-200 disabled:opacity-40">Waive</button>
        </>}
        {(r.status === "paid" || r.status === "waived") && <button onClick={() => onAction(r, "reopen")} disabled={!!busy} data-testid={`settlement-reopen-${r.slug}`} className="h-7 px-2.5 rounded-lg border border-white/15 text-slate-400 text-[11px] inline-flex items-center gap-1 hover:text-slate-200 disabled:opacity-40"><RotateCcw className="w-3 h-3" /> Reopen</button>}
        {r.pay_url && open && (
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-400" data-testid={`settlement-paylink-${r.slug}`}>
            <Link2 className="w-3 h-3 text-emerald-300" /> <a href={r.pay_url} target="_blank" rel="noreferrer" className="text-emerald-200 hover:underline font-mono">{r.pay_url.replace(/^https?:\/\//, "")}</a>
            <button onClick={() => { navigator.clipboard?.writeText(r.pay_url); toast.success("Payment link copied"); }} className="p-0.5 text-slate-400 hover:text-slate-200" title="Copy link" data-testid={`settlement-copylink-${r.slug}`}><Copy className="w-3 h-3" /></button>
          </span>
        )}
        {r.reminders.length > 0 && <span className="text-[10px] text-slate-500 ml-auto" data-testid={`settlement-reminders-${r.slug}`}>{r.reminders.length} nudge{r.reminders.length === 1 ? "" : "s"} · last {last.channel} {String(last.at).slice(0, 10)}</span>}
      </div>
    </div>
  );
}

export function SettlementTracker() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const [payBox, setPayBox] = useState(null);
  const [earnRow, setEarnRow] = useState(null);
  const load = useCallback(() => api.get("/super-admin/rewards-campaign/settlements").then(r => setData(r.data)).catch(() => setData({ rows: [], summary: {} })), []);
  useEffect(() => { load(); }, [load]);
  if (!data) return null;
  const { rows, summary: s } = data;
  const err = (e, fb) => toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : fb);

  const onSave = async (r, body) => {
    setBusy(`${r.tenant_id}:save`);
    try { const { data: d } = await api.put(`/super-admin/rewards-campaign/settlements/${r.tenant_id}`, body); toast.success(`${r.name}: settlement saved${d.pay_url ? " · Razorpay link ready" : ""}`); await load(); }
    catch (e) { err(e, "Couldn't save"); }
    setBusy("");
  };
  const onAction = async (r, kind) => {
    if (kind === "mark-paid") { setPayBox({ r, method: "upi", ref: "" }); return; }
    setBusy(`${r.tenant_id}:${kind}`);
    try { await api.post(`/super-admin/rewards-campaign/settlements/${r.tenant_id}/${kind}`); toast.success(`${r.name}: ${kind.replace("-", " ")}`); await load(); }
    catch (e) { err(e, "Action failed"); }
    setBusy("");
  };
  const confirmPaid = async () => {
    const { r, method, ref } = payBox;
    setBusy(`${r.tenant_id}:mark-paid`);
    try { await api.post(`/super-admin/rewards-campaign/settlements/${r.tenant_id}/mark-paid`, { method, ref }); toast.success(`${r.name} marked paid`); setPayBox(null); await load(); }
    catch (e) { err(e, "Couldn't mark paid"); }
    setBusy("");
  };
  const onSendDocs = async (r) => {
    setBusy(`${r.tenant_id}:docs`);
    try { const { data: d } = await api.post(`/super-admin/rewards-campaign/docs/send/${r.tenant_id}`); toast.success(`Guide + Agreement + T&C emailed to ${d.to}`); await load(); }
    catch (e) { err(e, "Couldn't send the documents"); }
    setBusy("");
  };
  const sendAll = async () => {
    setBusy("sendall");
    try { const { data: d } = await api.post("/super-admin/rewards-campaign/docs/send-all"); toast.success(`Pack sent to ${d.sent.length} salon(s)${d.skipped.length ? ` · skipped ${d.skipped.length} (no email / already accepted)` : ""}`); await load(); }
    catch (e) { err(e, "Couldn't send"); }
    setBusy("");
  };
  const onRemind = async (r, channel) => {
    setBusy(`${r.tenant_id}:${channel}`);
    try {
      const { data: d } = await api.post(`/super-admin/rewards-campaign/settlements/${r.tenant_id}/remind`, { channel });
      if (channel === "whatsapp") { window.open(d.whatsapp_url, "_blank", "noopener"); toast.success("Mira's WhatsApp nudge opened — tap send"); }
      else toast.success(`Mira's reminder emailed to ${d.to}`);
      await load();
    } catch (e) { err(e, "Couldn't send the nudge"); }
    setBusy("");
  };

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[.02] p-4" data-testid="settlement-tracker">
      <div className="flex items-center gap-2 flex-wrap">
        <Wallet className="w-4 h-4 text-[#d4af37]" />
        <div className="text-sm font-bold text-slate-100">Settlement tracker</div>
        <span className="text-[11px] text-slate-500">Miracurl's {data.salon_share_pct ?? 10}% share of each salon's campaign earnings · Razorpay link per salon · Mira nudges unpaid salons · paid = Trusted badge</span>
        {data.rzp_enabled
          ? <span className="text-[10px] text-emerald-300 inline-flex items-center gap-1 ml-auto" data-testid="settlement-rzp-on"><CheckCircle2 className="w-3 h-3" /> Razorpay connected ({data.rzp_key}…) — links auto-generated</span>
          : <span className="text-[10px] text-amber-300 inline-flex items-center gap-1 ml-auto" data-testid="settlement-no-link"><AlertTriangle className="w-3 h-3" /> {data.payment_link ? "using the fallback payment link" : "add Razorpay keys (or a fallback link above) so nudges include a pay link"}</span>}
      </div>
      <div className="flex gap-2 flex-wrap">
        <Chip label="Campaign earnings (all salons)" value={inr(s.campaign_revenue)} tone="text-slate-100" testId="settlement-sum-revenue" />
        <Chip label={`Miracurl share ${data.salon_share_pct ?? 10}%`} value={inr(s.suggested_total)} testId="settlement-sum-share" />
        <Chip label="Outstanding" value={inr(s.outstanding)} tone="text-amber-200" testId="settlement-sum-outstanding" />
        <Chip label="Collected" value={inr(s.collected)} tone="text-emerald-300" testId="settlement-sum-collected" />
        <Chip label="Pending salons" value={s.pending_count} testId="settlement-sum-pending" />
        <Chip label="Overdue" value={s.overdue_count} tone={s.overdue_count ? "text-rose-300" : "text-slate-300"} testId="settlement-sum-overdue" />
        <Chip label="Amount not set" value={s.not_set_count} tone="text-slate-300" testId="settlement-sum-notset" />
      </div>
      <div className="flex items-center gap-2 flex-wrap text-[11px]" data-testid="settlement-docs-bar">
        <FileText className="w-3.5 h-3.5 text-[#d4af37]" /><span className="text-slate-400">Campaign documents (v{data.agreement_version}):</span>
        <button onClick={() => dlDoc("/super-admin/rewards-campaign/docs/guide.pdf", "Miracurl-Brand-Model-Campaign-Guide.pdf")} className="px-2.5 py-1 rounded-full border border-white/15 text-slate-200 hover:border-[#d4af37]/60" data-testid="settlement-dl-guide">Salon guide PDF</button>
        <button onClick={() => dlDoc("/super-admin/rewards-campaign/docs/agreement.pdf", "Miracurl-Participation-Agreement-Template.pdf")} className="px-2.5 py-1 rounded-full border border-white/15 text-slate-200 hover:border-[#d4af37]/60" data-testid="settlement-dl-agreement">Agreement template PDF</button>
        <button onClick={sendAll} disabled={!!busy} className="px-2.5 py-1 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] font-bold inline-flex items-center gap-1 disabled:opacity-50" data-testid="settlement-sendall">{busy === "sendall" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Send pack to all pending salons</button>
      </div>
      <EarningsWatch onViewBills={setEarnRow} />
      <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
        {rows.length === 0 && <p className="text-xs text-slate-500 italic" data-testid="settlement-empty">No participating salons yet — turn salons on above and their settlements appear here.</p>}
        {rows.map(r => <Row key={r.tenant_id} r={r} busy={busy} onSave={onSave} onAction={onAction} onRemind={onRemind} onSendDocs={onSendDocs} onEarnings={setEarnRow} />)}
      </div>
      {earnRow && <EarningsModal r={earnRow} onClose={() => setEarnRow(null)} />}
      {payBox && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4" onClick={() => setPayBox(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-[#1c1c22] border border-[#d4af37]/40 p-5 space-y-3" onClick={e => e.stopPropagation()} data-testid="settlement-paid-modal">
            <div className="text-sm font-bold text-slate-100 flex items-center gap-2"><IndianRupee className="w-4 h-4 text-[#d4af37]" /> Record payment · {payBox.r.name}</div>
            <div className="text-xs text-slate-400">{inr(payBox.r.amount)} received via</div>
            <select value={payBox.method} onChange={e => setPayBox({ ...payBox, method: e.target.value })} className={inp + " w-full"} data-testid="settlement-paid-method">
              {["upi", "razorpay", "bank_transfer", "cash", "cheque", "other"].map(m => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
            </select>
            <input value={payBox.ref} onChange={e => setPayBox({ ...payBox, ref: e.target.value })} placeholder="Reference / UTR (optional)" className={inp + " w-full"} data-testid="settlement-paid-ref" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setPayBox(null)} className="h-8 px-3 rounded-full border border-white/15 text-slate-300 text-xs">Cancel</button>
              <button onClick={confirmPaid} disabled={!!busy} data-testid="settlement-paid-confirm" className="h-8 px-4 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] text-xs font-bold disabled:opacity-50">{busy ? "Saving…" : "Mark as paid"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
