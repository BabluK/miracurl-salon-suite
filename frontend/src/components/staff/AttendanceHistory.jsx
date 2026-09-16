import { useState } from "react";
import { API } from "@/lib/api";
import { FileText, Download, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE = 10;
const IST = { timeZone: "Asia/Kolkata" };
const fmt = (iso) => iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", ...IST }) : "—";
const statusOf = (r) => r.no_show ? ["Absent", "bg-rose-500/15 text-rose-300"] : r.half_day ? ["Half day", "bg-amber-500/15 text-amber-300"]
  : r.check_in_at && !r.check_out_at ? ["Not checked out", "bg-amber-500/15 text-amber-300"] : r.check_in_at ? ["Present", "bg-emerald-500/15 text-emerald-300"] : ["—", "text-white/40"];

export function AttendanceHistory({ attendance }) {
  const [page, setPage] = useState(1);
  const recs = attendance.records || [];
  const last = Math.max(1, Math.ceil(recs.length / PAGE));
  const cur = Math.min(page, last);
  const rows = recs.slice((cur - 1) * PAGE, cur * PAGE);
  const monthLabel = new Date(`${attendance.month}-01`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  return (
    <div className="rounded-2xl bg-[#0F0F0F] border border-white/5 p-5 sm:p-6" data-testid="attendance-history-card">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="font-playfair text-lg flex items-center gap-2"><FileText className="w-4 h-4 text-gold" /> Attendance — {monthLabel}</div>
        <a href={`${API}/staff/me/attendance.pdf?month=${attendance.month}`} target="_blank" rel="noreferrer" data-testid="attendance-pdf-btn"
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#e8c56a] to-[#c99a2e] text-[#1a1408] text-xs font-bold hover:brightness-110">
          <Download className="w-3.5 h-3.5" /> Full month PDF
        </a>
      </div>
      {recs.length === 0 ? <div className="text-center py-8 text-white/40 text-sm">No attendance yet this month.</div> : (
        <>
          <div className="divide-y divide-white/5" data-testid="attendance-list">
            {rows.map(r => {
              const [label, tone] = statusOf(r);
              return (
                <div key={r.id || r.date} className="py-2.5 grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1.2fr_1fr_auto_auto] items-center gap-3 text-sm" data-testid={`attendance-row-${r.date}`}>
                  <div className="text-white/85">{new Date(r.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</div>
                  <div className="hidden sm:block text-white/60 text-xs tabular-nums">{fmt(r.check_in_at)} → {fmt(r.check_out_at)}</div>
                  <div className="text-gold text-xs tabular-nums w-12 text-right">{r.hours_worked ? `${r.hours_worked}h` : "—"}</div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${tone}`}>{label}</span>
                </div>
              );
            })}
          </div>
          {last > 1 && (
            <div className="mt-3 flex items-center justify-between text-xs text-white/60" data-testid="attendance-pager">
              <span>Showing {(cur - 1) * PAGE + 1}–{Math.min(cur * PAGE, recs.length)} of {recs.length} days</span>
              <span className="inline-flex items-center gap-1">
                <button data-testid="attendance-prev" disabled={cur === 1} onClick={() => setPage(cur - 1)} className="p-1.5 rounded-lg border border-white/10 disabled:opacity-30 hover:border-gold/50"><ChevronLeft className="w-4 h-4" /></button>
                <span className="px-2 text-white/80">{cur} / {last}</span>
                <button data-testid="attendance-next" disabled={cur === last} onClick={() => setPage(cur + 1)} className="p-1.5 rounded-lg border border-white/10 disabled:opacity-30 hover:border-gold/50"><ChevronRight className="w-4 h-4" /></button>
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
