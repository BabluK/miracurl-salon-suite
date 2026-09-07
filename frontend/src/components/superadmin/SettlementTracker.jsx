import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, IndianRupee, Loader2, Mail, MessageCircle, RotateCcw, Save, Wallet } from "lucide-react";
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

function Row({ r, busy, onSave, onAction, onRemind }) {
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
          <div className="text-[10px] text-slate-500">{r.participants} applicant{r.participants === 1 ? "" : "s"} · {r.winners} winner{r.winners === 1 ? "" : "s"} · {r.email || "no email"} · {r.phone || "no phone"}</div>
        </div>
        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${STATUS[r.status]}`} data-testid={`settlement-status-${r.slug}`}>{r.status.replace("_", " ")}</span>
        {r.status === "paid" && <span className="text-[10px] text-emerald-300/80">{r.paid_method}{r.paid_ref ? ` · ${r.paid_ref}` : ""} · {String(r.paid_at || "").slice(0, 10)}</span>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-1 text-[10px] text-slate-500">₹<input type="number" min="0" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} placeholder="amount" className={inp + " w-24"} data-testid={`settlement-amount-${r.slug}`} /></label>
        <input type="date" value={f.due_date} onChange={e => setF({ ...f, due_date: e.target.value })} className={inp} data-testid={`settlement-due-${r.slug}`} />
        <input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="note e.g. 2 Gold memberships redeemed" className={inp + " flex-1 min-w-[160px]"} data-testid={`settlement-note-${r.slug}`} />
        <button onClick={() => onSave(r, { amount: Number(f.amount || 0), due_date: f.due_date, note: f.note })} disabled={!dirty || !!busy} data-testid={`settlement-save-${r.slug}`}
          className="h-7 px-2.5 rounded-lg bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-40">{b("save") ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save</button>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {open && <>
          <button onClick={() => onRemind(r, "email")} disabled={!!busy || !r.email} data-testid={`settlement-remind-email-${r.slug}`} className="h-7 px-2.5 rounded-lg border border-sky-400/40 text-sky-200 text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-sky-500/10 disabled:opacity-40">{b("email") ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />} Mira email nudge</button>
          <button onClick={() => onRemind(r, "whatsapp")} disabled={!!busy || !r.phone} data-testid={`settlement-remind-wa-${r.slug}`} className="h-7 px-2.5 rounded-lg border border-emerald-400/40 text-emerald-200 text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-emerald-500/10 disabled:opacity-40">{b("whatsapp") ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageCircle className="w-3 h-3" />} WhatsApp nudge</button>
          <button onClick={() => onAction(r, "mark-paid")} disabled={!!busy} data-testid={`settlement-paid-${r.slug}`} className="h-7 px-2.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-[11px] font-bold inline-flex items-center gap-1 hover:bg-emerald-500/30 disabled:opacity-40">{b("mark-paid") ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Mark paid</button>
          <button onClick={() => onAction(r, "waive")} disabled={!!busy} data-testid={`settlement-waive-${r.slug}`} className="h-7 px-2.5 rounded-lg border border-white/15 text-slate-400 text-[11px] inline-flex items-center gap-1 hover:text-slate-200 disabled:opacity-40">Waive</button>
        </>}
        {(r.status === "paid" || r.status === "waived") && <button onClick={() => onAction(r, "reopen")} disabled={!!busy} data-testid={`settlement-reopen-${r.slug}`} className="h-7 px-2.5 rounded-lg border border-white/15 text-slate-400 text-[11px] inline-flex items-center gap-1 hover:text-slate-200 disabled:opacity-40"><RotateCcw className="w-3 h-3" /> Reopen</button>}
        {r.reminders.length > 0 && <span className="text-[10px] text-slate-500 ml-auto" data-testid={`settlement-reminders-${r.slug}`}>{r.reminders.length} nudge{r.reminders.length === 1 ? "" : "s"} · last {last.channel} {String(last.at).slice(0, 10)}</span>}
      </div>
    </div>
  );
}

export function SettlementTracker() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const [payBox, setPayBox] = useState(null);
  const load = useCallback(() => api.get("/super-admin/rewards-campaign/settlements").then(r => setData(r.data)).catch(() => setData({ rows: [], summary: {} })), []);
  useEffect(() => { load(); }, [load]);
  if (!data) return null;
  const { rows, summary: s } = data;
  const err = (e, fb) => toast.error(typeof e.response?.data?.detail === "string" ? e.response.data.detail : fb);

  const onSave = async (r, body) => {
    setBusy(`${r.tenant_id}:save`);
    try { await api.put(`/super-admin/rewards-campaign/settlements/${r.tenant_id}`, body); toast.success(`${r.name}: settlement saved`); await load(); }
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
        <span className="text-[11px] text-slate-500">each salon's share of winner memberships · Mira nudges unpaid salons</span>
        {!data.payment_link && <span className="text-[10px] text-amber-300 inline-flex items-center gap-1 ml-auto" data-testid="settlement-no-link"><AlertTriangle className="w-3 h-3" /> add the payment link above so nudges include it</span>}
      </div>
      <div className="flex gap-2 flex-wrap">
        <Chip label="Outstanding" value={inr(s.outstanding)} tone="text-amber-200" testId="settlement-sum-outstanding" />
        <Chip label="Collected" value={inr(s.collected)} tone="text-emerald-300" testId="settlement-sum-collected" />
        <Chip label="Pending salons" value={s.pending_count} testId="settlement-sum-pending" />
        <Chip label="Overdue" value={s.overdue_count} tone={s.overdue_count ? "text-rose-300" : "text-slate-300"} testId="settlement-sum-overdue" />
        <Chip label="Amount not set" value={s.not_set_count} tone="text-slate-300" testId="settlement-sum-notset" />
      </div>
      <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
        {rows.length === 0 && <p className="text-xs text-slate-500 italic" data-testid="settlement-empty">No participating salons yet — turn salons on above and their settlements appear here.</p>}
        {rows.map(r => <Row key={r.tenant_id} r={r} busy={busy} onSave={onSave} onAction={onAction} onRemind={onRemind} />)}
      </div>
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
