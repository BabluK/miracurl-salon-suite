import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { MessageCircle, Loader2, X, Sparkles, SkipForward, CheckCircle2, Zap, Smartphone, PhoneOff, ShieldCheck, AlertTriangle } from "lucide-react";

const CHECK_TONE = { on_whatsapp: "bg-emerald-100 text-emerald-700 border-emerald-200", not_on_whatsapp: "bg-rose-100 text-rose-700 border-rose-200" };
function PhoneCheckBadge({ check }) {
  if (!check) return null;
  const tone = CHECK_TONE[check.known] || (check.wa_likely ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-100 text-amber-800 border-amber-200");
  const Icon = check.known === "not_on_whatsapp" || !check.wa_likely ? PhoneOff : ShieldCheck;
  return (
    <span data-testid="wa-blast-phone-check" data-likely={check.wa_likely ? "1" : "0"} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${tone}`}>
      <Icon className="w-3 h-3" /> {check.label}{check.country ? ` · ${check.country}` : ""}
    </span>
  );
}

export function WaBlastModal({ vertical, runId, onClose, onRefresh }) {
  const [posters, setPosters] = useState(null);
  const [scope, setScope] = useState(vertical || "");
  const [latestOnly, setLatestOnly] = useState(false);
  const [phase, setPhase] = useState("setup"); // setup | composing | queue | done
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(0);
  const [sentMeta, setSentMeta] = useState(0);
  const [sending, setSending] = useState(false);
  const [channel, setChannel] = useState(null);   // { meta_ready, platform_number, template_status }
  const [mode, setMode] = useState("meta");       // meta (one-click from platform number) | manual (wa.me from my phone)
  const pollRef = useRef(null);

  const loadPosters = () => api.get("/super-admin/wa-posters").then(r => setPosters(r.data)).catch(() => {});
  useEffect(() => {
    loadPosters();
    api.get("/super-admin/wa-outreach/channel").then(r => { setChannel(r.data); if (!r.data.meta_ready) setMode("manual"); }).catch(() => setMode("manual"));
    return () => clearInterval(pollRef.current);
  }, []);

  const generatePosters = async () => {
    try {
      await api.post("/super-admin/wa-posters/generate");
      toast.success("Mira is painting the quote posters — ~2 min 🎨");
      setPosters(p => ({ ...p, generating: true }));
      pollRef.current = setInterval(async () => {
        const { data } = await api.get("/super-admin/wa-posters");
        setPosters(data);
        if (!data.generating) { clearInterval(pollRef.current); toast.success("Quote posters ready ✨"); }
      }, 6000);
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't start"); }
  };

  const compose = async () => {
    setPhase("composing");
    try {
      const { data } = await api.post("/super-admin/wa-blast/prepare",
        { vertical: scope, run_id: latestOnly ? (runId || "") : "", limit: 30 });
      if (!data.queue.length) {
        toast.info("No uncontacted leads with phone numbers found for this scope.");
        setPhase("setup");
        return;
      }
      setQueue(data.queue); setIdx(0); setMsg(data.queue[0].message); setPhase("queue");
    } catch (e) { toast.error(e.response?.data?.detail || "Mira couldn't compose"); setPhase("setup"); }
  };

  const advance = (nextIdx) => {
    if (nextIdx >= queue.length) { setPhase("done"); onRefresh?.(); return; }
    setIdx(nextIdx); setMsg(queue[nextIdx].message);
  };

  const sendManual = async () => {
    const lead = queue[idx];
    window.open(`https://wa.me/${lead.phone}?text=${encodeURIComponent(msg)}`, "_blank");
    api.post(`/super-admin/wa-outreach/${lead.id}/manual-sent`).catch(() => {});
    setSent(s => s + 1);
    advance(idx + 1);
  };

  const sendMeta = async (force = false) => {
    const lead = queue[idx];
    setSending(true);
    try {
      await api.post(`/super-admin/wa-outreach/${lead.id}/send-meta`, { force });
      toast.success(`Sent to ${lead.name} from +${channel?.platform_number} ✦`);
      setSent(s => s + 1); setSentMeta(s => s + 1);
      advance(idx + 1);
    } catch (e) {
      const d = e.response?.data?.detail || "Meta send failed";
      if (e.response?.status === 409 && /force/.test(d) && window.confirm(`${d}\n\nSend anyway?`)) { setSending(false); return sendMeta(true); }
      toast.error(d);
    } finally { setSending(false); }
  };

  const lead = queue[idx];
  const ready = (posters?.posters || []).filter(p => p.url);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" data-testid="wa-blast-modal">
      <div className="bg-white rounded-2xl w-full max-w-2xl p-6 max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-emerald-500" /> WhatsApp Blast — Mira composes, you tap send
          </h2>
          <button onClick={onClose} data-testid="wa-blast-close" className="p-1.5 rounded hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>

        {phase === "setup" && (
          <>
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Quote posters (linked in every message)</div>
                {posters && !posters.generating && ready.length < (posters.posters || []).length && (
                  <button onClick={generatePosters} data-testid="wa-posters-generate-btn"
                    className="text-xs px-3 py-1.5 rounded-lg bg-fuchsia-600 text-white font-bold inline-flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Mira, paint the posters
                  </button>
                )}
                {posters?.generating && <span className="text-xs text-fuchsia-600 inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Mira is painting…</span>}
              </div>
              <div className="grid grid-cols-4 gap-2 mt-2" data-testid="wa-posters-grid">
                {(posters?.posters || []).map(p => (
                  <div key={p.id} className="relative rounded-xl overflow-hidden border border-slate-200 aspect-square bg-slate-50">
                    {p.url ? (
                      <img src={`${p.url}?w=320`} alt={p.quote} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400 text-center p-2">{p.quote.slice(0, 60)}…</div>
                    )}
                    <span className="absolute bottom-1 right-1 text-[9px] px-1.5 py-0.5 rounded bg-black/60 text-white">{p.vertical === "restaurant" ? "🍽️" : "💇"}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-end gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-wide text-slate-400">Who to invite</label>
                <div className="flex gap-1 mt-1 p-1 rounded-xl bg-slate-100 border border-slate-200">
                  {[["", "All"], ["salon", "💇 Salons"], ["restaurant", "🍽️ Restaurants"]].map(([k, l]) => (
                    <button key={k} onClick={() => setScope(k)} data-testid={`wa-blast-scope-${k || "all"}`}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${scope === k ? "bg-white shadow text-emerald-600" : "text-slate-500"}`}>{l}</button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600 pb-2.5 cursor-pointer">
                <input type="checkbox" checked={latestOnly} onChange={e => setLatestOnly(e.target.checked)} data-testid="wa-blast-latest-only" />
                Latest city run only
              </label>
              <button onClick={compose} data-testid="wa-blast-compose-btn"
                className="ml-auto px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold inline-flex items-center gap-2 hover:bg-emerald-700">
                <Sparkles className="w-4 h-4" /> Compose with Mira ✦
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-3" data-testid="wa-blast-setup-hint">
              Mira writes a fresh, personalized message for every uncontacted lead with a phone number (max 30 per blast) and checks each number first (landline vs mobile, past "not on WhatsApp" receipts).
              {channel?.meta_ready
                ? <> Then one click sends from the Meta business number <b>+{channel.platform_number}</b> — or switch to manual to send from your own WhatsApp.</>
                : <> Meta one-click is unavailable right now ({channel?.template_status || "checking…"}) — sends open in your own WhatsApp.</>}
            </p>
          </>
        )}

        {phase === "composing" && (
          <div className="flex flex-col items-center gap-3 py-14 text-sm text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
            Mira is writing a personal message for each lead… (~20 sec)
          </div>
        )}

        {phase === "queue" && lead && (
          <>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(idx / queue.length) * 100}%` }} />
              </div>
              <span className="text-xs font-bold text-slate-500" data-testid="wa-blast-progress">{idx + 1} / {queue.length}</span>
            </div>
            <div className="mt-3 rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800" data-testid="wa-blast-lead-name">
                  {lead.vertical === "restaurant" ? "🍽️" : "💇"} {lead.name}
                  <span className="text-slate-400 font-normal"> · {lead.city} · +{lead.phone}</span>
                </p>
                <PhoneCheckBadge check={lead.check} />
              </div>
              {lead.check && !lead.check.wa_likely && (
                <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 inline-flex items-start gap-1.5" data-testid="wa-blast-phone-warning">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> This looks like a {lead.check.type.replace("_", " ")} — WhatsApp will likely say "no WhatsApp on this number". Skip, or try anyway.
                </p>
              )}
              <div className="mt-3 flex gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200 w-fit" data-testid="wa-blast-mode">
                <button onClick={() => setMode("meta")} disabled={!channel?.meta_ready} data-testid="wa-blast-mode-meta"
                  title={channel?.meta_ready ? `One click — sent from the Meta business number +${channel.platform_number}` : `Meta template ${channel?.template_status || "not ready"}`}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-40 ${mode === "meta" ? "bg-white shadow text-emerald-600" : "text-slate-500"}`}>
                  <Zap className="w-3.5 h-3.5" /> Meta number · one click{channel?.platform_number ? ` (+${channel.platform_number})` : ""}
                </button>
                <button onClick={() => setMode("manual")} data-testid="wa-blast-mode-manual"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${mode === "manual" ? "bg-white shadow text-emerald-600" : "text-slate-500"}`}>
                  <Smartphone className="w-3.5 h-3.5" /> My WhatsApp · manual
                </button>
              </div>
              {mode === "meta" ? (
                <>
                  <pre data-testid="wa-blast-meta-preview" className="w-full mt-2 border border-emerald-200 bg-emerald-50/40 rounded-xl p-3 text-xs leading-relaxed whitespace-pre-wrap font-sans text-slate-700 max-h-56 overflow-y-auto">{lead.meta_message || "Approved Meta template miracurl_lead_intro"}</pre>
                  <p className="text-[10px] text-slate-400 mt-1">First contact via the Meta API must use the approved template above (Meta rule). Delivery / read / "not on WhatsApp" receipts land in the outreach history automatically.</p>
                </>
              ) : (
                <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={9} data-testid="wa-blast-message"
                  className="w-full mt-2 border border-slate-200 rounded-xl p-3 text-xs leading-relaxed focus:outline-none focus:border-emerald-400" />
              )}
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button onClick={() => advance(idx + 1)} data-testid="wa-blast-skip-btn"
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-500 inline-flex items-center gap-1.5 hover:bg-slate-50">
                <SkipForward className="w-4 h-4" /> Skip
              </button>
              {mode === "meta" ? (
                <button onClick={() => sendMeta(false)} disabled={sending} data-testid="wa-blast-send-meta-btn"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold inline-flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-60">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Send now via Meta →
                </button>
              ) : (
                <button onClick={sendManual} data-testid="wa-blast-send-btn"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold inline-flex items-center gap-2 hover:bg-emerald-700">
                  <MessageCircle className="w-4 h-4" /> Open WhatsApp & mark sent →
                </button>
              )}
            </div>
          </>
        )}

        {phase === "done" && (
          <div className="flex flex-col items-center gap-3 py-12" data-testid="wa-blast-done">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            <p className="text-sm font-semibold text-slate-800">Blast complete — {sent} of {queue.length} invites sent 💬</p>
            <p className="text-xs text-slate-500" data-testid="wa-blast-done-breakdown">{sentMeta} via Meta number · {sent - sentMeta} manual · {queue.length - sent} skipped — every send is in the WhatsApp outreach history with live delivery status.</p>
            <button onClick={onClose} className="mt-2 px-5 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-bold">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
