import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { TrendingUp, Mail, MessageCircle, Lightbulb, Loader2, ChevronDown, Star, Clock } from "lucide-react";
import { LeadSourceBadges } from "@/components/superadmin/LeadSourceBadges";

const COL_TONE = {
  NEW: "border-sky-200 bg-sky-50/60 text-sky-700",
  CONTACTED: "border-amber-200 bg-amber-50/60 text-amber-700",
  INTERESTED: "border-fuchsia-200 bg-fuchsia-50/60 text-fuchsia-700",
  CONVERTED: "border-emerald-200 bg-emerald-50/60 text-emerald-700",
};
const STAGE_OPTIONS = [
  { v: "researched", label: "New" },
  { v: "sent", label: "Contacted" },
  { v: "replied", label: "Interested" },
  { v: "customer", label: "Converted" },
];
const VERTICALS = [["all", "All leads"], ["salon", "💇 Salons"], ["restaurant", "🍽️ Restaurants"]];

const daysAgo = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : null);

function LeadCard({ l, busy, onMove, onWhatsApp, onEmail }) {
  const since = daysAgo(l.last_followup_at || l.sent_at);
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow" data-testid={`pipeline-lead-${l.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-800 truncate flex items-center gap-1.5">
            <span title={l.vertical === "restaurant" ? "Restaurant" : "Salon"} data-testid={`pipeline-vertical-${l.id}`}>{l.vertical === "restaurant" ? "🍽️" : "💇"}</span>
            <span className="truncate">{l.name}</span>
          </p>
          <p className="text-[10px] text-slate-400 truncate flex items-center gap-1">
            {l.city}{l.rating ? <> · <Star className="w-2.5 h-2.5 text-amber-400" /> {l.rating}</> : null}{l.reviews ? ` (${l.reviews})` : ""}
          </p>
        </div>
        <div className="relative shrink-0">
          <select value="" onChange={e => e.target.value && onMove(l, e.target.value)} disabled={busy}
            data-testid={`pipeline-move-${l.id}`}
            className="appearance-none text-[10px] border border-slate-200 rounded-lg pl-2 pr-5 py-1 text-slate-500 bg-slate-50 cursor-pointer">
            <option value="">Move…</option>
            {STAGE_OPTIONS.filter(s => (l.status || "") !== s.v).map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
          <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
        <span className="truncate max-w-[160px]" title={l.email || ""}>{l.email || <span className="text-slate-300">no email</span>}</span>
        {l.phone && <span className="text-slate-400">· {l.phone}</span>}
        <LeadSourceBadges lead={l} />
        {since !== null && (l.status === "sent" || l.status === "emailed" || l.status === "followup_sent") && (
          <span className="inline-flex items-center gap-0.5 text-slate-400" data-testid={`pipeline-since-${l.id}`}><Clock className="w-2.5 h-2.5" /> {since === 0 ? "today" : `${since}d ago`}{l.sent_via === "whatsapp" ? " · WA" : ""}</span>
        )}
      </div>
      <div className="mt-2 flex items-start gap-1.5 bg-fuchsia-50/70 border border-fuchsia-100 rounded-lg px-2 py-1.5">
        <Lightbulb className="w-3 h-3 text-fuchsia-500 mt-0.5 shrink-0" />
        <p className="text-[10px] text-fuchsia-800 leading-snug">{l.suggestion}</p>
      </div>
      <div className="flex gap-1.5 mt-2">
        {l.email ? (
          <button onClick={onEmail} data-testid={`pipeline-email-${l.id}`}
            className="flex-1 text-[10px] font-semibold px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center gap-1">
            <Mail className="w-3 h-3" /> Email
          </button>
        ) : <span className="flex-1 text-[10px] text-slate-300 px-2 py-1.5 text-center">No email</span>}
        {l.wa_link ? (
          <button onClick={() => onWhatsApp(l)} data-testid={`pipeline-wa-${l.id}`} title="Opens WhatsApp with Bablu's 30-days-free intro pre-filled"
            className="flex-1 text-[10px] font-semibold px-2 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center gap-1">
            <MessageCircle className="w-3 h-3" /> WhatsApp
          </button>
        ) : <span className="flex-1 text-[10px] text-slate-300 px-2 py-1.5 text-center">No phone</span>}
      </div>
    </div>
  );
}

export function FollowUpPipeline({ onGoTab }) {
  const [data, setData] = useState(null);
  const [vertical, setVertical] = useState("all");
  const [busyId, setBusyId] = useState("");

  const load = useCallback((v = vertical) => {
    api.get("/super-admin/mira/pipeline", { params: v === "all" ? {} : { vertical: v } }).then(r => setData(r.data)).catch(() => {});
  }, [vertical]);
  useEffect(() => { load(vertical); }, [load, vertical]);

  async function moveStage(lead, stage) {
    setBusyId(lead.id);
    try {
      await api.post(`/super-admin/mira-leads/${lead.id}/stage`, { stage });
      toast.success(`${lead.name} moved ✦`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't move lead"); }
    finally { setBusyId(""); }
  }

  async function openWhatsApp(lead) {
    window.open(lead.wa_link, "_blank");
    try { await api.post(`/super-admin/mira-leads/${lead.id}/whatsapp-sent`); load(); } catch { /* optional */ }
  }

  async function runFollowups() {
    try {
      const { data: d } = await api.post("/super-admin/mira-leads/followups/run");
      toast.success(`Follow-up emails sent: ${d?.sent ?? 0} ✦`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Follow-up run failed"); }
  }

  if (!data) return <div className="flex items-center gap-2 text-slate-400 text-sm p-8"><Loader2 className="w-4 h-4 animate-spin" /> Loading pipeline…</div>;
  const totals = data.totals || {};

  return (
    <div className="space-y-5" data-testid="followup-pipeline">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-playfair text-3xl flex items-center gap-3"><TrendingUp className="w-7 h-7 text-fuchsia-500" /> Follow-up Pipeline</h1>
          <p className="text-slate-500 text-sm mt-1">Every lead's journey — Mira's next-action advice, one-tap Email &amp; WhatsApp (Bablu's 30-days-free intro, salon or restaurant version).</p>
        </div>
        <button onClick={runFollowups} data-testid="pipeline-run-followups"
          className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-700 flex items-center gap-2">
          <Mail className="w-3.5 h-3.5" /> Send due email follow-ups
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2" data-testid="pipeline-vertical-filter">
        {VERTICALS.map(([v, label]) => (
          <button key={v} type="button" onClick={() => setVertical(v)} data-testid={`pipeline-vertical-${v}`}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${vertical === v ? "bg-[#1c1c22] text-[#e8c37f] border-[#1c1c22]" : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"}`}>
            {label}
            {v !== "all" && totals[v] !== undefined && vertical === "all" && <span className="ml-1.5 opacity-70">{totals[v]}</span>}
          </button>
        ))}
        {vertical === "all" && <span className="text-[11px] text-slate-400 ml-1">{totals.salon ?? 0} salon · {totals.restaurant ?? 0} restaurant leads</span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {data.columns.map(col => (
          <div key={col.key} className="min-w-0" data-testid={`pipeline-col-${col.key}`}>
            <div className={`rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-wider flex items-center justify-between ${COL_TONE[col.key]}`}>
              {col.label} <span className="text-sm" data-testid={`pipeline-count-${col.key}`}>{data.counts[col.key]}</span>
            </div>
            <div className="space-y-2.5 mt-2.5 max-h-[62vh] overflow-y-auto pr-1">
              {col.leads.length === 0 && <p className="text-[11px] text-slate-300 text-center py-6">No {vertical === "all" ? "" : vertical + " "}leads here yet</p>}
              {col.leads.map(l => (
                <LeadCard key={l.id} l={l} busy={busyId === l.id} onMove={moveStage} onWhatsApp={openWhatsApp} onEmail={() => onGoTab?.("mira-leads")} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
