import { useState } from "react";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function monthCells(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export function DemoCalendar({ dates, value, onChange }) {
  const avail = new Set(dates);
  const firstAvail = new Date((dates[0] || iso(new Date())) + "T00:00:00");
  const [view, setView] = useState({ y: firstAvail.getFullYear(), m: firstAvail.getMonth() });
  const cells = monthCells(view.y, view.m);
  const shift = (n) => setView(v => { const d = new Date(v.y, v.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const label = new Date(view.y, view.m, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <div data-testid="demo-calendar">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => shift(-1)} data-testid="demo-cal-prev" className="w-8 h-8 rounded-full hover:bg-pink-50 flex items-center justify-center text-slate-600"><ChevronLeft className="w-4 h-4" /></button>
        <span className="text-sm font-bold text-slate-800" data-testid="demo-cal-month">{label}</span>
        <button onClick={() => shift(1)} data-testid="demo-cal-next" className="w-8 h-8 rounded-full hover:bg-pink-50 flex items-center justify-center text-slate-600"><ChevronRight className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-slate-400 mb-1">
        {DOW.map(d => <span key={d} className="py-1">{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {cells.map(d => {
          const k = iso(d);
          const inMonth = d.getMonth() === view.m;
          const ok = avail.has(k);
          const sel = value === k;
          return (
            <button key={k} disabled={!ok} onClick={() => onChange(k)} data-testid={ok ? `demo-date-${k}` : undefined}
              className={`mx-auto w-9 h-9 rounded-full text-sm transition-colors ${
                sel ? "bg-gradient-to-br from-pink-500 to-rose-500 text-white font-bold shadow-md"
                  : ok ? "text-slate-800 font-semibold hover:bg-pink-50 ring-1 ring-pink-200"
                  : inMonth ? "text-slate-500 cursor-not-allowed" : "text-slate-300 cursor-not-allowed"}`}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DemoTimes({ times, value, onChange }) {
  return (
    <div data-testid="demo-times">
      <p className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3"><Clock className="w-4 h-4 text-pink-500" /> Select Time (IST)</p>
      <div className="grid grid-cols-4 gap-2">
        {times.map(t => (
          <button key={t} onClick={() => onChange(t)} data-testid={`demo-time-${t}`}
            className={`py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              value === t ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-md"
                : "bg-white border border-slate-200 text-slate-700 hover:border-pink-300"}`}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
