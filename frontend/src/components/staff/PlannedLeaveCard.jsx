import { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { CalendarDays, Loader2, Trash2 } from "lucide-react";

const STATUS_CHIP = {
  pending: "bg-amber-500/15 border-amber-500/30 text-amber-300",
  approved: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
  rejected: "bg-red-500/15 border-red-500/30 text-red-300",
  cancelled: "bg-white/5 border-white/10 text-white/40",
};

function daysBetween(from, to) {
  if (!from || !to) return 0;
  const d = (new Date(to) - new Date(from)) / 86400000 + 1;
  return d > 0 ? Math.round(d) : 0;
}

function fmtRange(f, t) {
  const opt = { day: "numeric", month: "short" };
  return `${new Date(f).toLocaleDateString("en-IN", opt)} → ${new Date(t).toLocaleDateString("en-IN", { ...opt, year: "numeric" })}`;
}

export function PlannedLeaveCard() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ from_date: "", to_date: "", reason: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/staff/me/leave-requests");
      setList(data);
    } catch { /* portal handles auth errors */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const days = daysBetween(form.from_date, form.to_date);
  const minLongStart = new Date(Date.now() + 30 * 86400000);
  const needsNotice = days > 5 && form.from_date && new Date(form.from_date) < minLongStart;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/staff/me/leave-requests", form);
      toast.success("Leave request sent — waiting for admin approval ✦");
      setForm({ from_date: "", to_date: "", reason: "" });
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Couldn't submit request");
    } finally { setBusy(false); }
  }

  async function cancel(rid) {
    if (!window.confirm("Cancel this leave request?")) return;
    try {
      await api.delete(`/staff/me/leave-requests/${rid}`);
      toast.success("Request cancelled");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Couldn't cancel");
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-2xl bg-[#0F0F0F] border border-white/5 p-5 sm:p-6" data-testid="planned-leave-card">
      <div className="font-playfair text-lg mb-1 flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-gold" /> Request Planned Leave
      </div>
      <p className="text-xs text-white/40 mb-4">
        Leave is valid only after admin approval. Leaves longer than <b className="text-white/60">5 days</b> must be
        requested at least <b className="text-white/60">1 month in advance</b>.
      </p>

      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-[0.2em] text-white/40">From</label>
          <input required type="date" min={todayStr} value={form.from_date}
            onChange={e => setForm({ ...form, from_date: e.target.value })}
            data-testid="leave-from-input"
            className="mt-1 w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-[0.2em] text-white/40">To</label>
          <input required type="date" min={form.from_date || todayStr} value={form.to_date}
            onChange={e => setForm({ ...form, to_date: e.target.value })}
            data-testid="leave-to-input"
            className="mt-1 w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-[10px] uppercase tracking-[0.2em] text-white/40">Reason</label>
          <textarea rows={2} maxLength={500} value={form.reason}
            onChange={e => setForm({ ...form, reason: e.target.value })}
            placeholder="e.g. Family wedding in hometown"
            data-testid="leave-reason-input"
            className="mt-1 w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90" />
        </div>
        {days > 0 && (
          <div className="sm:col-span-2 text-xs" data-testid="leave-days-hint">
            <span className="text-white/60">{days} day{days === 1 ? "" : "s"} of leave.</span>
            {needsNotice && (
              <span className="text-amber-400 ml-1" data-testid="leave-notice-warning">
                ⚠ More than 5 days — start date must be on or after {minLongStart.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.
              </span>
            )}
          </div>
        )}
        <button type="submit" disabled={busy || needsNotice}
          data-testid="leave-submit-btn"
          className="sm:col-span-2 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-md text-sm font-medium bg-gradient-to-r from-gold to-blush text-bg-base hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
          Send leave request
        </button>
      </form>

      {list.length > 0 && (
        <div className="mt-5 divide-y divide-white/5" data-testid="my-leave-list">
          {list.map(r => (
            <div key={r.id} className="py-3 flex items-start justify-between gap-3" data-testid={`leave-row-${r.id}`}>
              <div className="min-w-0">
                <div className="text-sm text-white/85">{fmtRange(r.from_date, r.to_date)} <span className="text-white/40">· {r.days}d</span></div>
                {r.reason && <div className="text-xs text-white/40 mt-0.5 truncate">{r.reason}</div>}
                {r.status === "rejected" && r.admin_note && (
                  <div className="text-xs text-red-300/80 mt-0.5">Admin: {r.admin_note}</div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[11px] px-2 py-0.5 rounded-full border capitalize ${STATUS_CHIP[r.status] || STATUS_CHIP.cancelled}`}
                  data-testid={`leave-status-${r.id}`}>
                  {r.status}
                </span>
                {r.status === "pending" && (
                  <button onClick={() => cancel(r.id)} title="Cancel request"
                    data-testid={`leave-cancel-${r.id}`}
                    className="text-white/30 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
