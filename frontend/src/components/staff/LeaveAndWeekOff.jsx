import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import * as L from "lucide-react";

const LEAVE_BADGE = {
  pending: "bg-amber-500/15 border-amber-500/30 text-amber-300",
  approved: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
  rejected: "bg-red-500/15 border-red-500/30 text-red-300",
};

const { Calendar, Plus, X, Clock, CheckCircle2, XCircle, Eye, Sparkles, RefreshCw, Info, Palmtree, Sun } = L;

export function LeaveSection() {
  const [reqs, setReqs] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/staff/me/leave-requests").then(r => setReqs(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  async function submit() {
    if (!from || !to) { toast.error("Pick both dates"); return; }
    setBusy(true);
    try {
      await api.post("/staff/me/leave-requests", { from_date: from, to_date: to, reason });
      toast.success("Leave request sent to your salon admin 🌴");
      setShowForm(false); setFrom(""); setTo(""); setReason("");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't send request");
    } finally { setBusy(false); }
  }

  async function cancel(rid) {
    try { await api.delete(`/staff/me/leave-requests/${rid}`); toast.success("Request cancelled"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Couldn't cancel"); }
  }

  return (
    <div className="rounded-2xl bg-[#0F0F0F] border border-white/5 p-5 sm:p-6" data-testid="leave-card">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="font-playfair text-lg flex items-center gap-2">🌴 Leave</div>
        <button data-testid="apply-leave-btn" onClick={() => setShowForm(f => !f)}
          className="text-xs px-4 py-2 rounded-full bg-gold/15 border border-gold/40 text-gold hover:bg-gold/25 transition">
          {showForm ? "Close" : "Apply for leave"}
        </button>
      </div>
      {showForm && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4 bg-white/5 border border-white/10 rounded-xl p-4">
          <div><label className="text-[10px] uppercase tracking-widest text-white/40 block mb-1">From</label>
            <input data-testid="leave-from-input" type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90" /></div>
          <div><label className="text-[10px] uppercase tracking-widest text-white/40 block mb-1">To</label>
            <input data-testid="leave-to-input" type="date" value={to} onChange={e => setTo(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90" /></div>
          <div><label className="text-[10px] uppercase tracking-widest text-white/40 block mb-1">Reason</label>
            <input data-testid="leave-reason-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Optional" className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90" /></div>
          <div className="flex items-end">
            <button data-testid="leave-submit-btn" onClick={submit} disabled={busy}
              className="w-full py-2 rounded-md bg-gold text-black text-sm font-semibold hover:bg-gold/90 disabled:opacity-50">
              {busy ? "Sending…" : "Send request"}
            </button>
          </div>
        </div>
      )}
      {reqs.length === 0 ? (
        <p className="text-white/40 text-sm">No leave requests yet. Your approved leaves show "On leave" on the salon board automatically.</p>
      ) : (
        <div className="space-y-2">
          {reqs.slice(0, 6).map(r => (
            <div key={r.id} className="flex items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-lg px-3 py-2" data-testid={`leave-req-${r.id}`}>
              <div className="text-sm text-white/80">
                {r.from_date} → {r.to_date} <span className="text-white/40">· {r.days} day{r.days > 1 ? "s" : ""}</span>
                {r.reason && <span className="text-white/40 text-xs"> · {r.reason}</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full border ${LEAVE_BADGE[r.status] || ""}`}>{r.status}</span>
                {r.status === "pending" && (
                  <button onClick={() => cancel(r.id)} className="text-[10px] text-white/40 hover:text-red-300 underline" data-testid={`cancel-leave-${r.id}`}>Cancel</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const WEEK_OFF_DAYS = ["monday", "tuesday", "wednesday", "thursday"];


export function WeekOffSection({ profile }) {
  const [reqs, setReqs] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [day, setDay] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const todayName = new Date().toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  const currentDay = (profile?.week_off_day || "").toLowerCase();
  const options = WEEK_OFF_DAYS.filter(d => d !== todayName && d !== currentDay);
  const load = () => api.get("/staff/me/week-off-requests").then(r => setReqs(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  async function submit() {
    if (!day) { toast.error("Pick your new week-off day"); return; }
    setBusy(true);
    try {
      await api.post("/staff/me/week-off-requests", { requested_day: day, reason });
      toast.success("Week-off change request sent to your owner 📅 The request time is now locked.");
      setShowForm(false); setDay(""); setReason("");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't send request");
    } finally { setBusy(false); }
  }

  const fmtReqTime = (iso) => iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";

  const formVisible = showForm && !profile?.always_on_time;
  return (
    <div className="rounded-2xl bg-[#0F0F0F] border border-white/5 p-5 sm:p-6" data-testid="week-off-card">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="font-playfair text-lg flex items-center gap-2">📅 Week-off day</div>
        {profile?.always_on_time ? (
          <span data-testid="week-off-locked" className="text-[11px] px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/60">🔒 Set by owner (Always on time) — changes disabled</span>
        ) : (
          <button data-testid="request-week-off-btn" onClick={() => setShowForm(f => !f)}
            className="text-xs px-4 py-2 rounded-full bg-gold/15 border border-gold/40 text-gold hover:bg-gold/25 transition">
            {showForm ? "Close" : "Request change"}
          </button>
        )}
      </div>
      <p className="text-xs text-white/45 mb-4" data-testid="current-week-off">
        Current week-off: <b className="text-white/80">{currentDay ? currentDay[0].toUpperCase() + currentDay.slice(1) : "Not set"}</b>
        {profile?.week_off_swap_date && profile?.week_off_original && (
          <span className="text-gold/90" data-testid="week-off-swap-note"> · one-time swap for {new Date(profile.week_off_swap_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} — back to {profile.week_off_original[0].toUpperCase() + profile.week_off_original.slice(1)} after that</span>
        )}
        {" "}· Allowed days: Mon–Thu only (Fri/Sat/Sun are peak days) · Can't pick today
      </p>
      {formVisible && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 bg-white/5 border border-white/10 rounded-xl p-4">
          <div><label className="text-[10px] uppercase tracking-widest text-white/40 block mb-1">New day</label>
            <select data-testid="week-off-day-select" value={day} onChange={e => setDay(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90">
              <option value="">Choose day…</option>
              {options.map(d => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}
            </select></div>
          <div><label className="text-[10px] uppercase tracking-widest text-white/40 block mb-1">Reason</label>
            <input data-testid="week-off-reason-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Optional"
              className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90" /></div>
          <div className="flex items-end">
            <button data-testid="week-off-submit-btn" onClick={submit} disabled={busy}
              className="w-full py-2 rounded-md bg-gold text-black text-sm font-semibold hover:bg-gold/90 disabled:opacity-50">
              {busy ? "Sending…" : "Send request"}
            </button>
          </div>
        </div>
      )}
      {reqs.length === 0 ? (
        <p className="text-white/40 text-sm">No change requests yet. Once your owner approves, the new week-off starts from the next day.</p>
      ) : (
        <div className="space-y-2">
          {reqs.slice(0, 5).map(r => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2" data-testid={`week-off-req-${r.id}`}>
              <div className="text-sm text-white/80">
                {(r.current_day || "—")} → <b className="text-gold">{r.requested_day}</b>
                <span className="text-white/40 text-xs"> · requested {fmtReqTime(r.requested_at)} 🔒</span>
                {r.status === "approved" && r.effective_from && (
                  <span className="text-emerald-300/80 text-xs"> · effective from {r.effective_from}</span>
                )}
              </div>
              <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full border ${LEAVE_BADGE[r.status] || ""}`}>{r.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
