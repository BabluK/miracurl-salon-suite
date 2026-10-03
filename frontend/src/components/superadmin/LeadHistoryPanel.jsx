import { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2, Send, History, Clock } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { confirmAsync } from "@/components/ConfirmDialog";

const FLAG = { IN: "🇮🇳", US: "🇺🇸", GB: "🇬🇧", AE: "🇦🇪", AU: "🇦🇺", CA: "🇨🇦", SG: "🇸🇬", DE: "🇩🇪", FR: "🇫🇷", NL: "🇳🇱", IE: "🇮🇪", NZ: "🇳🇿", ZA: "🇿🇦", SA: "🇸🇦", QA: "🇶🇦" };

function CountryTable({ v, vkey }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4" data-testid={`lead-history-${vkey}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800 text-sm">{vkey === "salon" ? "💇" : "🍽️"} {v.label}</h3>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600" data-testid={`lead-history-${vkey}-total`}>{v.total} leads</span>
      </div>
      {v.countries.length === 0 ? <p className="text-xs text-slate-400 mt-3">No leads yet.</p> : (
        <table className="luxe-table-light w-full text-xs mt-3"><thead><tr><th>Country</th><th className="text-right">Found</th><th className="text-right">Pitched</th><th className="text-right">Replied</th><th className="text-right">Demo</th><th className="text-right">Customers</th><th className="text-right">Stale</th></tr></thead>
          <tbody>{v.countries.map(c => (
            <tr key={c.code} data-testid={`lead-history-${vkey}-${c.code}`}>
              <td className="font-semibold">{FLAG[c.code] || "🌍"} {c.country}<div className="text-[10px] text-slate-400 font-normal">{c.cities.map(([n, k]) => `${n} ${k}`).join(" · ")}</div></td>
              <td className="text-right font-semibold">{c.found}</td><td className="text-right">{c.pitched}</td><td className="text-right">{c.replied}</td>
              <td className="text-right">{c.demo}</td><td className="text-right text-emerald-600 font-bold">{c.customers}</td>
              <td className="text-right">{c.stale ? <span className="text-amber-600 font-bold">{c.stale}</span> : <span className="text-slate-300">0</span>}</td>
            </tr>))}</tbody></table>
      )}
    </div>
  );
}

function StaleRow({ s, onChanged }) {
  const [busy, setBusy] = useState("");
  const [tl, setTl] = useState(null);
  const act = async (kind) => {
    if (kind === "delete" && !await confirmAsync(`Delete "${s.name}" from Mira's leads? ${s.days_silent} days with no reply.`)) return;
    if (kind === "resend" && !await confirmAsync(`Re-send Mira's pitch to ${s.name} (${s.email || s.phone})?`)) return;
    setBusy(kind);
    try {
      if (kind === "delete") { await api.delete(`/super-admin/mira-leads/${s.id}`); toast.success(`${s.name} removed`); }
      else { await api.post(`/super-admin/mira-leads/${s.id}/resend`); toast.success(`📧 Pitch re-sent to ${s.name}`); }
      onChanged();
    } catch (e) { toast.error(e.response?.data?.detail || "Action failed"); } finally { setBusy(""); }
  };
  const showTl = async () => { if (tl) return setTl(null); const { data } = await api.get(`/super-admin/mira-leads/${s.id}/timeline`); setTl(data.events); };
  return (
    <div className="border border-slate-200 rounded-xl p-3" data-testid={`stale-lead-${s.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[180px]">
          <div className="font-semibold text-sm text-slate-800">{s.vertical === "restaurant" ? "🍽️" : "💇"} {s.name}</div>
          <div className="text-[11px] text-slate-500">{s.city} · {s.country} · {s.email || s.phone}</div>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 inline-flex items-center gap-1" data-testid={`stale-days-${s.id}`}><Clock className="w-3 h-3" /> {s.days_silent} days silent</span>
        <button onClick={showTl} className="btn-slate !h-8 !px-2.5 text-[11px] inline-flex items-center gap-1" data-testid={`stale-timeline-${s.id}`}><History className="w-3 h-3" /> History</button>
        {s.email && <button onClick={() => act("resend")} disabled={!!busy} className="btn-blue !h-8 !px-3 text-[11px] inline-flex items-center gap-1" data-testid={`stale-resend-${s.id}`}>{busy === "resend" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Re-send</button>}
        <button onClick={() => act("delete")} disabled={!!busy} className="h-8 px-3 rounded-lg border border-rose-200 text-rose-600 text-[11px] font-semibold hover:bg-rose-50 inline-flex items-center gap-1" data-testid={`stale-delete-${s.id}`}>{busy === "delete" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Delete</button>
      </div>
      {tl && <ol className="mt-2 pl-3 border-l border-slate-200 space-y-1" data-testid={`stale-timeline-list-${s.id}`}>{tl.map((e, i) => <li key={i} className="text-[11px] text-slate-600"><span className="text-slate-400">{new Date(e.at).toLocaleDateString()}</span> · {e.label}</li>)}</ol>}
    </div>
  );
}

// Boss view: every lead Mira ever found — by vertical × country — plus the stale list (15+ days, no reply) with Delete / Re-send.
export function LeadHistoryPanel() {
  const [d, setD] = useState(null);
  const load = useCallback(() => api.get("/super-admin/mira-leads/history").then(r => setD(r.data)).catch(() => setD({ verticals: {}, stale: [], total: 0, stale_days: 15 })), []);
  useEffect(() => { load(); }, [load]);
  if (!d) return null;
  return (
    <div className="space-y-4" data-testid="lead-history-panel">
      <div className="grid lg:grid-cols-2 gap-4">
        {Object.entries(d.verticals).map(([k, v]) => <CountryTable key={k} vkey={k} v={v} />)}
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-4" data-testid="stale-leads-card">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 text-sm">⏳ Silent for {d.stale_days}+ days</h3>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700" data-testid="stale-count">{d.stale.length}</span>
        </div>
        <p className="text-xs text-slate-500 mt-1">Pitched by Mira, no reply in {d.stale_days} days. Re-send the pitch (fresh PDFs attached) or delete to keep the list clean.</p>
        <div className="mt-3 space-y-2">
          {d.stale.length === 0 ? <p className="text-xs text-slate-400">Nothing stale — Mira's pipeline is fresh.</p> : d.stale.map(s => <StaleRow key={s.id} s={s} onChanged={load} />)}
        </div>
      </div>
    </div>
  );
}
