import { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import {
  Clock, CheckCircle2, CircleAlert, UserCheck, Calendar, ArrowLeft,
} from "lucide-react";

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const STATUS_STYLES = {
  on_shift: { label: "On shift", cls: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  completed: { label: "Completed", cls: "bg-sky-100 text-sky-700 border-sky-200", dot: "bg-sky-500" },
  absent: { label: "Not checked in", cls: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
};

export default function Attendance() {
  const [date, setDate] = useState(today());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // {sid, name} for history modal

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/attendance/today", { params: { date } });
      setData(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="bg-slate-50 -mx-4 sm:-mx-6 -my-6 px-4 sm:px-6 py-6 min-h-[calc(100vh-4rem)] text-slate-800 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-playfair text-2xl sm:text-3xl">Attendance</h1>
          <p className="text-slate-500 text-sm mt-1">See who checked in, who&apos;s still on shift, and download history.</p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-500" />
          <input
            data-testid="attendance-date-input"
            type="date"
            value={date}
            max={today()}
            onChange={e => setDate(e.target.value)}
            className="input-light py-1.5"
          />
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <SummaryTile label="Total staff" value={data?.total_staff ?? 0} icon={UserCheck} tone="slate" testid="sum-total" />
        <SummaryTile label="On shift" value={data?.on_shift ?? 0} icon={Clock} tone="emerald" testid="sum-on-shift" />
        <SummaryTile label="Completed" value={data?.completed ?? 0} icon={CheckCircle2} tone="sky" testid="sum-completed" />
        <SummaryTile label="Absent" value={data?.absent ?? 0} icon={CircleAlert} tone="rose" testid="sum-absent" />
      </div>

      {/* Roster table */}
      <div className="card-light p-0 overflow-x-auto" data-testid="attendance-roster">
        <table className="luxe-table-light min-w-[720px]">
          <thead>
            <tr>
              <th className="text-left">Staff</th>
              <th>Status</th>
              <th>Check-in</th>
              <th>Check-out</th>
              <th>Hours</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="text-center py-6 text-slate-400">Loading…</td></tr>
            )}
            {!loading && data?.roster?.map(r => {
              const st = STATUS_STYLES[r.status] || STATUS_STYLES.absent;
              return (
                <tr key={r.staff_id} data-testid={`roster-row-${r.staff_id}`}>
                  <td>
                    <div className="flex items-center gap-3">
                      <img
                        src={r.image_url || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100"}
                        alt={r.name}
                        className="w-9 h-9 rounded-full object-cover"
                      />
                      <div>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-slate-500">{r.role}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${st.cls}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                      {st.label}
                    </span>
                    {!r.has_login && (
                      <span className="ml-2 text-[10px] text-slate-400 italic">no login</span>
                    )}
                  </td>
                  <td className="tabular-nums">{fmtTime(r.check_in_at)}</td>
                  <td className="tabular-nums">{fmtTime(r.check_out_at)}</td>
                  <td className="tabular-nums font-medium">
                    {r.hours > 0 ? `${r.hours}h` : "—"}
                  </td>
                  <td>
                    <button
                      onClick={() => setSelected({ sid: r.staff_id, name: r.name })}
                      className="text-xs text-sky-600 hover:underline"
                      data-testid={`view-history-${r.staff_id}`}
                    >
                      History
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loading && data?.roster?.length === 0 && (
              <tr><td colSpan={6} className="text-center py-6 text-slate-400">No active staff — add staff first.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <HistoryModal
          sid={selected.sid}
          staffName={selected.name}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function SummaryTile({ label, value, icon: Icon, tone, testid }) {
  const toneMap = {
    slate: "text-slate-600 bg-slate-100",
    emerald: "text-emerald-600 bg-emerald-100",
    sky: "text-sky-600 bg-sky-100",
    rose: "text-rose-600 bg-rose-100",
  };
  return (
    <div className="card-light" data-testid={testid}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${toneMap[tone]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
          <div className="font-playfair text-2xl">{value}</div>
        </div>
      </div>
    </div>
  );
}

function HistoryModal({ sid, staffName, onClose }) {
  const [month, setMonth] = useState(currentMonth());
  const [hist, setHist] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/attendance/staff/${sid}`, { params: { month } });
        if (!cancelled) setHist(data);
      } catch (e) {
        if (!cancelled) toast.error(formatApiError(e.response?.data?.detail) || "Failed");
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [sid, month]);

  const monthOptions = (() => {
    const arr = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      arr.push({
        value: `${y}-${m}`,
        label: d.toLocaleString("en-IN", { month: "long", year: "numeric" }),
      });
    }
    return arr;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3" onClick={onClose}>
      <div className="card-light w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-800">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h3 className="font-playfair text-xl text-center">{staffName}</h3>
            <p className="text-xs text-slate-500 text-center">Attendance history</p>
          </div>
          <div className="w-6" />
        </div>

        <div className="mb-4">
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="input-light w-full"
            data-testid="history-month-select"
          >
            {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {loading || !hist ? (
          <div className="text-center py-8 text-slate-400 text-sm">Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">Days present</div>
                <div className="font-playfair text-2xl text-slate-800">{hist.days_present}</div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">Total hours</div>
                <div className="font-playfair text-2xl text-slate-800">{hist.total_hours}h</div>
              </div>
            </div>

            {hist.records.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-sm">No records this month.</div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {hist.records.map(r => (
                  <div key={r.id || r.date} className="px-3 py-2.5 flex items-center justify-between text-sm">
                    <div className="text-slate-800">
                      {new Date(r.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                    </div>
                    <div className="text-slate-600 text-xs tabular-nums">
                      {fmtTime(r.check_in_at)} → {fmtTime(r.check_out_at)}
                      {r.hours_worked ? <span className="ml-2 text-sky-600 font-medium">{r.hours_worked}h</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
