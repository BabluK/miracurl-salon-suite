import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { MessageCircle, Loader2, X, Sparkles, SkipForward, CheckCircle2 } from "lucide-react";

export function WaBlastModal({ vertical, runId, onClose, onRefresh }) {
  const [posters, setPosters] = useState(null);
  const [scope, setScope] = useState(vertical || "");
  const [latestOnly, setLatestOnly] = useState(false);
  const [phase, setPhase] = useState("setup"); // setup | composing | queue | done
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(0);
  const pollRef = useRef(null);

  const loadPosters = () => api.get("/super-admin/wa-posters").then(r => setPosters(r.data)).catch(() => {});
  useEffect(() => { loadPosters(); return () => clearInterval(pollRef.current); }, []);

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

  const sendCurrent = async () => {
    const lead = queue[idx];
    window.open(`https://wa.me/${lead.phone}?text=${encodeURIComponent(msg)}`, "_blank");
    api.post(`/super-admin/mira-leads/${lead.id}/whatsapp-sent`).catch(() => {});
    setSent(s => s + 1);
    advance(idx + 1);
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
            <p className="text-[11px] text-slate-400 mt-3">Mira writes a fresh, personalized message for every uncontacted lead with a phone number (max 30 per blast) — then you tap through them, one WhatsApp tab per lead.</p>
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
              <p className="text-sm font-semibold text-slate-800" data-testid="wa-blast-lead-name">
                {lead.vertical === "restaurant" ? "🍽️" : "💇"} {lead.name}
                <span className="text-slate-400 font-normal"> · {lead.city} · +{lead.phone}</span>
              </p>
              <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={9} data-testid="wa-blast-message"
                className="w-full mt-2 border border-slate-200 rounded-xl p-3 text-xs leading-relaxed focus:outline-none focus:border-emerald-400" />
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button onClick={() => advance(idx + 1)} data-testid="wa-blast-skip-btn"
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-500 inline-flex items-center gap-1.5 hover:bg-slate-50">
                <SkipForward className="w-4 h-4" /> Skip
              </button>
              <button onClick={sendCurrent} data-testid="wa-blast-send-btn"
                className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold inline-flex items-center gap-2 hover:bg-emerald-700">
                <MessageCircle className="w-4 h-4" /> Open WhatsApp & mark sent →
              </button>
            </div>
          </>
        )}

        {phase === "done" && (
          <div className="flex flex-col items-center gap-3 py-12" data-testid="wa-blast-done">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            <p className="text-sm font-semibold text-slate-800">Blast complete — {sent} of {queue.length} invites sent 💬</p>
            <p className="text-xs text-slate-500">Every invited lead is marked "sent via WhatsApp" — replies & demos get tracked on their cards.</p>
            <button onClick={onClose} className="mt-2 px-5 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-bold">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
