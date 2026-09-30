import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import api from "@/lib/api";

const CH = { email: ["📧", "bg-fuchsia-50 text-fuchsia-700"], whatsapp: ["💬", "bg-emerald-50 text-emerald-700"], conversion: ["🔥", "bg-orange-50 text-orange-700"] };
const fmt = (iso) => { const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); };
const dayLabel = (day) => {
  const today = new Date().toISOString().slice(0, 10);
  const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  return day === today ? "Today" : day === y ? "Yesterday" : new Date(day).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

// Day-wise totals + the last 100 individual sends / conversions Mira made on her own.
export function OutreachHistory() {
  const [h, setH] = useState(null);
  useEffect(() => { api.get("/super-admin/mira/outreach/history?days=30").then(r => setH(r.data)).catch(() => setH({ days: [], items: [] })); }, []);
  if (!h) return <div className="py-6 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>;
  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-4" data-testid="outreach-history">
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">Day-wise · last 30 days</div>
        {h.days.length === 0 ? <p className="p-4 text-sm text-slate-400" data-testid="outreach-history-empty">No outreach yet — switch Autopilot on and Mira starts today.</p> : (
          <table className="w-full text-xs">
            <thead><tr className="text-slate-400 text-left"><th className="px-3 py-1.5">Day</th><th className="px-2 py-1.5 text-right">📧</th><th className="px-2 py-1.5 text-right">💇</th><th className="px-2 py-1.5 text-right">🍽️</th><th className="px-2 py-1.5 text-right">💬</th><th className="px-2 py-1.5 text-right">🔥</th></tr></thead>
            <tbody>{h.days.map(d => (
              <tr key={d.day} className="border-t border-slate-100" data-testid={`outreach-day-${d.day}`}>
                <td className="px-3 py-1.5 font-semibold text-slate-700">{dayLabel(d.day)}</td>
                <td className="px-2 py-1.5 text-right font-bold">{d.emails}</td><td className="px-2 py-1.5 text-right text-slate-500">{d.salon}</td>
                <td className="px-2 py-1.5 text-right text-slate-500">{d.restaurant}</td><td className="px-2 py-1.5 text-right text-emerald-600">{d.whatsapp}</td>
                <td className="px-2 py-1.5 text-right text-orange-600">{d.conversions}</td>
              </tr>))}</tbody>
          </table>)}
      </div>
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">Recent activity</div>
        <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
          {h.items.length === 0 && <p className="p-4 text-sm text-slate-400">Nothing sent yet.</p>}
          {h.items.map(it => {
            const [ico, tone] = CH[it.channel] || ["•", "bg-slate-50 text-slate-600"];
            return (
              <div key={it.id} className="px-3 py-2 flex items-center gap-2 text-xs" data-testid={`outreach-item-${it.id}`}>
                <span className={`px-1.5 py-0.5 rounded ${tone}`}>{ico}</span>
                <span className="font-semibold text-slate-700 truncate flex-1">{it.name || it.email}
                  <span className="ml-1 text-[10px] text-slate-400 font-normal">{it.vertical === "restaurant" ? "🍽️" : "💇"} {it.city}{it.hot ? " · 🔥 hot" : ""}</span>
                </span>
                <span className="text-slate-400 truncate max-w-[180px] hidden sm:inline">{it.channel === "conversion" ? `${it.kind} → HQ emailed` : it.email || it.phone}</span>
                <span className="text-slate-400 whitespace-nowrap">{fmt(it.created_at)}</span>
              </div>);
          })}
        </div>
      </div>
    </div>
  );
}
