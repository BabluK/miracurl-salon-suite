import { ChevronLeft, ChevronRight } from "lucide-react";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MonthGrid({ month, items, onShift, onOpenDay }) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(y, m, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);
  const byDay = {};
  for (const a of items) {
    const k = a.scheduled_at.slice(0, 10);
    (byDay[k] ||= { n: 0, rev: 0, pending: 0 });
    byDay[k].n += 1; byDay[k].rev += a.total || 0; if (a.status === "scheduled") byDay[k].pending += 1;
  }
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  return (
    <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm overflow-hidden" data-testid="appt-month-grid">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <button data-testid="appt-month-prev" onClick={() => onShift(-1)} className="w-9 h-9 rounded-lg border border-slate-200 hover:bg-slate-50 inline-flex items-center justify-center"><ChevronLeft className="w-4 h-4" /></button>
        <div className="font-playfair text-2xl text-slate-900">{first.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</div>
        <button data-testid="appt-month-next" onClick={() => onShift(1)} className="w-9 h-9 rounded-lg border border-slate-200 hover:bg-slate-50 inline-flex items-center justify-center"><ChevronRight className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-7 text-[11px] uppercase tracking-[.14em] text-slate-500 font-semibold bg-slate-50/60">
        {DOW.map(d => <div key={d} className="px-3 py-2.5 text-center">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => d ? (
          <button key={d} data-testid={`appt-month-day-${d}`} onClick={() => onOpenDay(d)}
            className={`min-h-[92px] p-2.5 text-left border-t border-l border-slate-100 hover:bg-amber-50/40 transition ${d === today ? "bg-amber-50/60" : ""}`}>
            <div className={`text-sm font-semibold ${d === today ? "text-[#8f6a2a]" : "text-slate-700"}`}>{Number(d.slice(-2))}</div>
            {byDay[d] && (
              <div className="mt-1.5 space-y-1">
                <div className="text-[11px] px-2 py-0.5 rounded-md bg-gradient-to-r from-[#b8893a] to-[#8f6a2a] text-white font-semibold inline-block">{byDay[d].n} booking{byDay[d].n > 1 ? "s" : ""}</div>
                {byDay[d].pending > 0 && <div className="text-[10px] text-sky-700">{byDay[d].pending} to confirm</div>}
                {byDay[d].rev > 0 && <div className="text-[10px] text-slate-500">₹{byDay[d].rev.toLocaleString("en-IN")}</div>}
              </div>
            )}
          </button>
        ) : <div key={`e${i}`} className="min-h-[92px] border-t border-l border-slate-100 bg-slate-50/30" />)}
      </div>
    </div>
  );
}
