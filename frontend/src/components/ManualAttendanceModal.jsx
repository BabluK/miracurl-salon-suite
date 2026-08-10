import { useState } from "react";
import pinApi from "@/lib/ownerPin";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { X, UserCheck, LogIn, LogOut } from "lucide-react";

function nowIST() {
  return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function minBackfillISO() {
  return new Date(Date.now() - 15 * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function ManualAttendanceModal({ roster, onClose, onDone }) {
  const [action, setAction] = useState("check_in");
  const [staffId, setStaffId] = useState("");
  const [time, setTime] = useState(nowIST());
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const isToday = date === todayISO();
  const eligible = isToday
    ? (roster || []).filter(r => (action === "check_in" ? !r.check_in_at : (r.check_in_at && !r.check_out_at)))
    : (roster || []);

  async function submit() {
    if (!staffId) { toast.error("Select a staff member"); return; }
    setBusy(true);
    try {
      const { data } = await pinApi.post("/attendance/manual", { staff_id: staffId, action, time, note, date });
      const name = (roster || []).find(r => r.staff_id === staffId)?.name || "Staff";
      const dayTxt = isToday ? "" : ` on ${date}`;
      toast.success(action === "check_in"
        ? `✅ ${name} checked in at ${time}${dayTxt}${data?.late_penalty > 0 ? ` · late fine ₹${data.late_penalty}` : ""}${data?.half_day ? " · marked half-day" : ""}`
        : `👋 ${name} checked out at ${time}${dayTxt} · ${data?.hours_worked ?? 0}h worked`);
      onDone();
      onClose();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Couldn't mark attendance");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid="manual-attendance-modal" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-amber-400" />
            <div>
              <div className="font-bold text-sm">Manual Attendance</div>
              <div className="text-[10px] text-white/60">Owner marks on behalf of staff · PIN protected · no GPS needed</div>
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white" data-testid="manual-attendance-close"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {[["check_in", "Check-In", LogIn], ["check_out", "Check-Out", LogOut]].map(([k, l, I]) => (
              <button key={k} onClick={() => { setAction(k); setStaffId(""); }} data-testid={`manual-action-${k}`}
                className={`flex items-center justify-center gap-1.5 text-xs font-bold rounded-xl py-2.5 border transition ${action === k
                  ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                <I className="w-3.5 h-3.5" /> {l}
              </button>
            ))}
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Staff member</label>
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} data-testid="manual-staff-select"
              className="input-light w-full mt-1 py-2.5">
              <option value="">— Select staff —</option>
              {eligible.map(r => (
                <option key={r.staff_id} value={r.staff_id}>{r.name}{r.role ? ` · ${r.role}` : ""}</option>
              ))}
            </select>
            {eligible.length === 0 && (
              <p className="text-[11px] text-amber-600 mt-1" data-testid="manual-no-eligible">
                {action === "check_in" ? "Everyone is already checked in today." : "No one is currently on shift to check out."}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Date</label>
              <input type="date" value={date} min={minBackfillISO()} max={todayISO()}
                onChange={(e) => { setDate(e.target.value); setStaffId(""); }}
                data-testid="manual-date-input" className="input-light w-full mt-1 py-2.5" />
              {!isToday && (
                <p className="text-[10px] text-violet-600 mt-1" data-testid="manual-backfill-hint">
                  Backfilling a past day (up to 15 days) — e.g. staff who joined before their login was created.
                </p>
              )}
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">{action === "check_in" ? "Check-in" : "Check-out"} time (IST)</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} data-testid="manual-time-input"
                className="input-light w-full mt-1 py-2.5" />
              <p className="text-[10px] text-slate-400 mt-1">Late fines & half-day rules still apply based on this time.</p>
            </div>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Note (optional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. GPS not working, staff was present"
              data-testid="manual-note-input" className="input-light w-full mt-1 py-2.5" />
          </div>
          <button onClick={submit} disabled={busy || !staffId} data-testid="manual-attendance-submit"
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold text-sm rounded-xl py-3 transition-colors">
            {busy ? "Marking…" : `🔒 Mark ${action === "check_in" ? "Check-In" : "Check-Out"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
