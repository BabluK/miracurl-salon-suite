import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { Sparkles, X, Send, Loader2, Users, Coins, MessageCircle, Check, XCircle, ShieldCheck } from "lucide-react";

export function WinbackBlastModal({ onClose, onDone }) {
  const [p, setP] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => { api.get("/winback/blast/preview?days=30").then(r => setP(r.data)).catch(() => setP({ error: true })); }, []);
  const go = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/winback/blast", { days: 30, limit: 100 });
      setResult(data);
      if (data.sent) toast.success(`Mira sent ${data.sent} win-back message${data.sent === 1 ? "" : "s"} ✦`);
      else toast.info("No messages went out — see details");
      onDone?.(data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Couldn't send"); } finally { setBusy(false); }
  };
  const can = p && !p.error && p.whatsapp_enabled && p.eligible > 0 && p.credits > 0;
  return (
    <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose} data-testid="winback-blast-modal">
      <div className="w-full max-w-lg rounded-3xl bg-[#0f0e0b] text-white border border-[#e8c56a]/25 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-white/10 flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[.22em] text-[#e8c56a] font-semibold">Mira Follow-up Blast</div>
            <h3 className="font-playfair text-2xl mt-1">Win back guests inactive for 30 days</h3>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 inline-flex items-center justify-center" data-testid="winback-blast-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          {!p ? <div className="text-sm text-white/60 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Mira is checking your guest list…</div> : p.error ? <p className="text-sm text-rose-300">Couldn't load the preview.</p> : result ? (
            <div className="rounded-2xl bg-white/[.06] border border-[#e8c56a]/25 p-5" data-testid="winback-blast-result">
              <div className="font-playfair text-xl">Done ✦</div>
              <div className="grid grid-cols-3 gap-3 mt-3 text-center">
                {[["Sent", result.sent, "text-emerald-300"], ["Failed", result.failed, "text-rose-300"], ["No credits", result.skipped_no_credits, "text-amber-300"]].map(([l, v, c]) => (
                  <div key={l} className="rounded-xl bg-black/30 p-3"><div className={`text-2xl font-bold ${c}`}>{v}</div><div className="text-[11px] text-white/60 uppercase tracking-wide">{l}</div></div>
                ))}
              </div>
              {result.errors?.length > 0 && <p className="text-xs text-rose-300/90 mt-3 break-words">{result.errors[0]}</p>}
              {result.hint && <p className="text-xs text-white/50 mt-3">{result.hint}</p>}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/[.06] p-4 flex items-center gap-3"><Users className="w-5 h-5 text-[#e8c56a]" /><div><div className="text-2xl font-bold" data-testid="winback-eligible">{p.eligible}</div><div className="text-[11px] text-white/60">guests with WhatsApp</div></div></div>
                <div className="rounded-2xl bg-white/[.06] p-4 flex items-center gap-3"><Coins className="w-5 h-5 text-[#e8c56a]" /><div><div className="text-2xl font-bold" data-testid="winback-credits">{p.credits}</div><div className="text-[11px] text-white/60">WhatsApp credits (1 each)</div></div></div>
              </div>
              {p.guests?.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap text-xs text-white/70">
                  {p.guests.slice(0, 6).map(g => <span key={g.id} className="px-2.5 py-1 rounded-full bg-white/[.08] border border-white/10">{g.name.split(" ")[0]}</span>)}
                  {p.eligible > 6 && <span className="text-white/50">+{p.eligible - 6} more</span>}
                </div>
              )}
              <div className="rounded-2xl bg-[#075e54]/40 border border-emerald-400/20 p-4 text-sm whitespace-pre-line leading-relaxed" data-testid="winback-sample">{p.sample_message}</div>
              {!p.whatsapp_enabled && <p className="text-xs text-amber-300">WhatsApp isn't enabled for your salon yet — ask Miracurl HQ.</p>}
              {p.whatsapp_enabled && p.credits === 0 && <p className="text-xs text-amber-300">You have 0 WhatsApp credits. <Link to="/settings" className="underline">Top up</Link> first.</p>}
              {!p.template && <p className="text-[11px] text-white/45">Guests who haven't chatted with you in 24h receive it via your approved Meta template once HQ sets it — until then Meta may reject some sends.</p>}
            </>
          )}
        </div>
        {!result && (
          <div className="p-5 border-t border-white/10 flex items-center justify-end gap-3">
            <button onClick={onClose} className="text-sm text-white/60 hover:text-white">Not now</button>
            <button data-testid="winback-blast-send" disabled={!can || busy} onClick={go}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#e8c56a] to-[#c99a2e] text-[#1a1408] text-sm font-bold inline-flex items-center gap-2 hover:brightness-110 disabled:opacity-40">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send to {p?.eligible || 0} guests
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const initials = (n) => (n || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
const TONES = ["bg-rose-100 text-rose-700", "bg-amber-100 text-amber-800", "bg-emerald-100 text-emerald-700", "bg-sky-100 text-sky-700", "bg-violet-100 text-violet-700"];

export function PendingApprovalsTile() {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState("");
  const load = () => api.get("/whatsapp-requests?status=pending").then(r => setItems(r.data || [])).catch(() => setItems([]));
  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, []);
  const act = async (id, what) => {
    setBusy(id + what);
    try {
      const { data } = await api.post(`/whatsapp-requests/${id}/${what}`);
      const link = data?.wa_business_url && /android/i.test(navigator.userAgent) ? data.wa_business_url : data?.wa_url;
      if (what === "approve" && link) window.open(link, "_blank", "noopener");
      toast.success(what === "approve" ? "Approved — WhatsApp opened" : "Request declined");
      load();
    } catch { toast.error("Couldn't update"); } finally { setBusy(""); }
  };
  const approveAll = async () => {
    setBusy("all");
    try { const { data } = await api.post("/whatsapp-requests/approve-all"); toast.success(`Approved ${data?.approved ?? items.length} request${items.length === 1 ? "" : "s"}`); load(); }
    catch { toast.error("Couldn't approve"); } finally { setBusy(""); }
  };
  if (items === null) return null;
  return (
    <section className="rounded-3xl bg-white border border-slate-200/80 p-5 shadow-sm" data-testid="pending-approvals-tile">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 font-playfair text-xl text-slate-900">
          <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><ShieldCheck className="w-4 h-4" /></span>
          Pending Approvals
          {items.length > 0 && <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold" data-testid="pending-approvals-count">{items.length}</span>}
        </div>
        {items.length > 1 && <button data-testid="approvals-approve-all" onClick={approveAll} disabled={busy === "all"} className="text-xs font-semibold text-[#8f6a2a] hover:underline disabled:opacity-50">Approve all</button>}
      </div>
      {items.length === 0 ? (
        <div className="mt-4 flex items-center gap-3 text-sm text-slate-500" data-testid="pending-approvals-empty">
          <div className="flex -space-x-2">{["MS", "PK", "AR"].map((t, i) => <span key={t} className={`w-8 h-8 rounded-full border-2 border-white text-[10px] font-bold flex items-center justify-center ${TONES[i]}`}>{t}</span>)}</div>
          All clear — no staff WhatsApp requests waiting.
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {items.slice(0, 4).map((r, i) => (
            <div key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5" data-testid={`approval-row-${r.id}`}>
              <span className={`w-9 h-9 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${TONES[i % TONES.length]}`}>{initials(r.requested_by_name)}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-800 truncate">{r.requested_by_name} <span className="text-slate-400 font-normal">→</span> {r.client_name}</div>
                <div className="text-xs text-slate-500 truncate flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {r.kind?.replace(/_/g, " ")} · {r.message}</div>
              </div>
              <button data-testid={`approval-approve-${r.id}`} onClick={() => act(r.id, "approve")} disabled={!!busy} className="w-8 h-8 rounded-full bg-emerald-500 text-white inline-flex items-center justify-center hover:brightness-110 disabled:opacity-50" title="Approve & send"><Check className="w-4 h-4" /></button>
              <button data-testid={`approval-reject-${r.id}`} onClick={() => act(r.id, "reject")} disabled={!!busy} className="w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-500 inline-flex items-center justify-center hover:text-rose-600 hover:border-rose-200 disabled:opacity-50" title="Decline"><XCircle className="w-4 h-4" /></button>
            </div>
          ))}
          {items.length > 4 && <p className="text-xs text-slate-500 text-center">+{items.length - 4} more below in WhatsApp approvals</p>}
        </div>
      )}
      <p className="mt-3 text-[11px] text-slate-400 flex items-center gap-1"><Sparkles className="w-3 h-3 text-[#b8893a]" /> Staff messages go out only after your tap — or switch to Direct mode on the Appointments page.</p>
    </section>
  );
}
