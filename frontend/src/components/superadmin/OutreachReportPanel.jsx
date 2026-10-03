import { useCallback, useEffect, useState } from "react";
import { Mail, Loader2, MapPin, Send } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

const Check = ({ on }) => <span className={on ? "text-emerald-600 font-bold" : "text-slate-300"}>{on ? "✓" : "–"}</span>;
const RANGES = [[1, "Today"], [7, "7 days"], [30, "30 days"]];

// Per-vertical outreach report — sent by location + each lead's journey (seen → replied → picker → demo → won).
export function OutreachReportPanel() {
  const [vert, setVert] = useState("restaurant");
  const [days, setDays] = useState(1);
  const [rep, setRep] = useState(null);
  const [busy, setBusy] = useState("");
  const load = useCallback(() => api.get("/super-admin/mira/outreach/report", { params: { vertical: vert, days } }).then(r => setRep(r.data)).catch(() => {}), [vert, days]);
  useEffect(() => { setRep(null); load(); }, [load]);

  const email = async (all) => {
    setBusy(all ? "all" : "one");
    try {
      const { data } = await api.post("/super-admin/mira/outreach/report/send", null, { params: all ? { days } : { vertical: vert, days } });
      toast.success(`📬 ${data.reports.filter(r => r.sent).length} report email${data.reports.length > 1 ? "s" : ""} sent to HQ inbox`);
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't send the report"); }
    finally { setBusy(""); }
  };
  const j = rep?.journey || {};
  const noun = vert === "restaurant" ? "restaurants" : "salons";
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-3" data-testid="outreach-report-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase tracking-wide"><Mail className="w-3.5 h-3.5 text-[#b8932e]" /> Outreach report · by location & lead history</div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => email(false)} disabled={!!busy} data-testid="outreach-report-email-one" className="px-2.5 py-1 rounded-full border border-slate-200 bg-white text-slate-600 text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50">
            {busy === "one" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Email me this report
          </button>
          <button onClick={() => email(true)} disabled={!!busy} data-testid="outreach-report-email-all" className="px-2.5 py-1 rounded-full bg-[#1c1c22] text-[#e8c37f] text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-50">
            {busy === "all" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Email both (salon + restaurant)
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {[["salon", "💇 Salons"], ["restaurant", "🍽️ Restaurants"]].map(([v, l]) => (
          <button key={v} type="button" onClick={() => setVert(v)} data-testid={`outreach-report-vert-${v}`}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${vert === v ? "bg-[#1c1c22] text-[#e8c37f] border-[#1c1c22]" : "bg-white text-slate-500 border-slate-200"}`}>{l}</button>
        ))}
        <span className="mx-1 text-slate-300">|</span>
        {RANGES.map(([d, l]) => (
          <button key={d} type="button" onClick={() => setDays(d)} data-testid={`outreach-report-days-${d}`}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${days === d ? "bg-fuchsia-600 text-white border-fuchsia-600" : "bg-white text-slate-500 border-slate-200"}`}>{l}</button>
        ))}
        <span className="text-[10px] text-slate-400 ml-1">Auto-emailed daily at 7 PM IST — one email per business type</span>
      </div>
      {!rep && <p className="text-xs text-slate-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> building report…</p>}
      {rep && (
        <div className="grid lg:grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-3" data-testid="outreach-report-locations">
            <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-2"><MapPin className="w-3.5 h-3.5 text-sky-500" /> Sent to {noun} by location <span className="text-slate-400 font-normal">· {rep.sent_today} email{rep.sent_today === 1 ? "" : "s"} ({rep.new_sends} new · {rep.reminders} reminders)</span></div>
            {rep.by_country.length === 0 && <p className="text-xs text-slate-400">No {noun} emailed in this period.</p>}
            {rep.by_country.map(([c, n]) => (
              <div key={c} className="flex items-start justify-between py-1.5 border-b border-slate-100 last:border-0" data-testid={`outreach-report-country-${c}`}>
                <div>
                  <div className="text-sm font-semibold text-slate-800">{c}</div>
                  <div className="text-[11px] text-slate-400">{(rep.by_city[c] || []).map(([city, k]) => `${city} ${k}`).join(" · ")}</div>
                </div>
                <div className="text-lg font-bold text-slate-800">{n}</div>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3" data-testid="outreach-report-journey">
            <div className="text-xs font-bold text-slate-700 mb-2">🧭 Journey — all {noun} ever emailed</div>
            <div className="grid grid-cols-6 gap-1 text-center">
              {[["Sent", j.sent, "text-slate-800"], ["Seen", j.opened, "text-sky-700"], ["Replied", j.replied, "text-orange-700"], ["Picker", j.picker, "text-violet-700"], ["Demo", j.demo, "text-fuchsia-700"], ["Won", j.customer, "text-emerald-700"]].map(([l, v, c]) => (
                <div key={l}><div className={`text-xl font-bold ${c}`}>{v || 0}</div><div className="text-[9px] uppercase tracking-wider text-slate-400">{l}</div></div>
              ))}
            </div>
            <div className="mt-3 max-h-56 overflow-y-auto" data-testid="outreach-report-leads">
              <table className="w-full text-[11px]">
                <thead><tr className="text-[9px] uppercase tracking-wider text-slate-400"><th className="text-left py-1">Lead</th><th>Seen</th><th>Replied</th><th>Picker</th><th>Demo</th><th>Won</th></tr></thead>
                <tbody>
                  {rep.recent_leads.map((l, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="py-1.5 pr-2"><div className="font-semibold text-slate-800 truncate max-w-[180px]">{l.name}</div><div className="text-[10px] text-slate-400 truncate max-w-[180px]">{l.city} · {(l.sent_at || "").slice(0, 10)}{l.subject_variant ? ` · ${l.subject_variant}` : ""}</div></td>
                      <td className="text-center"><Check on={l.opened_at} /></td>
                      <td className="text-center"><Check on={l.replied_at || l.wa_intro_replied_at} /></td>
                      <td className="text-center"><Check on={l.slot_picker_sent_at || l.demo_invite_sent_at} /></td>
                      <td className="text-center"><Check on={l.demo_slot || ["demo", "customer"].includes(l.status)} /></td>
                      <td className="text-center"><Check on={l.status === "customer" || l.converted_at} /></td>
                    </tr>
                  ))}
                  {rep.recent_leads.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-slate-400">No {noun} emailed yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
