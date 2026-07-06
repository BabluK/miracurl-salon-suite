import { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { CalendarCheck2, Check, X } from "lucide-react";

const STATUS_CHIP = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-100 text-rose-700 border-rose-200",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200",
};

function fmtRange(f, t) {
  const opt = { day: "numeric", month: "short" };
  return `${new Date(f).toLocaleDateString("en-IN", opt)} → ${new Date(t).toLocaleDateString("en-IN", { ...opt, year: "numeric" })}`;
}

export function LeaveApprovalsPanel() {
  const [tab, setTab] = useState("pending");
  const [list, setList] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const [l, c] = await Promise.all([
        api.get("/leave-requests", { params: { status: tab } }),
        api.get("/leave-requests/pending-count"),
      ]);
      setList(l.data);
      setPendingCount(c.data.count);
    } catch { /* non-admin */ }
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  async function decide(r, action) {
    let note = "";
    if (action === "reject") {
      note = window.prompt(`Reject ${r.staff_name}'s leave (${fmtRange(r.from_date, r.to_date)})? Add a short reason:`, "");
      if (note === null) return;
    }
    try {
      await api.post(`/leave-requests/${r.id}/${action}`, { note });
      toast.success(action === "approve"
        ? `Leave approved for ${r.staff_name} ✦ They'll show "On leave" in attendance`
        : `Leave rejected for ${r.staff_name}`);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Action failed");
    }
  }

  return (
    <div className="card-light" data-testid="leave-approvals-panel">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarCheck2 className="w-4 h-4 text-violet-600" />
            <h3 className="font-playfair text-xl">Requested Staff Leave</h3>
            {pendingCount > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-amber-700 font-medium"
                data-testid="leave-pending-badge">
                {pendingCount} pending
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Staff can take leave only after you approve it. Approved days show as &ldquo;On leave&rdquo; in Attendance.</p>
        </div>
        <div className="flex gap-1.5">
          {["pending", "approved", "rejected", "all"].map(s => (
            <button key={s} onClick={() => setTab(s)}
              data-testid={`leave-tab-${s}`}
              className={`text-xs px-3 py-1.5 rounded-full border capitalize ${tab === s ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm" data-testid="leave-empty">
          No {tab === "all" ? "" : tab + " "}leave requests.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="luxe-table-light min-w-[680px] w-full">
            <thead>
              <tr>
                <th className="text-left">Staff</th>
                <th className="text-left">Dates</th>
                <th>Days</th>
                <th className="text-left">Reason</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map(r => (
                <tr key={r.id} data-testid={`leave-req-row-${r.id}`}>
                  <td className="font-medium">{r.staff_name}</td>
                  <td className="text-sm">{fmtRange(r.from_date, r.to_date)}</td>
                  <td className="text-center tabular-nums">{r.days}</td>
                  <td className="text-xs text-slate-500 max-w-[220px]">
                    <div className="truncate" title={r.reason}>{r.reason || "—"}</div>
                    {r.admin_note && <div className="text-rose-500 truncate" title={r.admin_note}>Note: {r.admin_note}</div>}
                  </td>
                  <td className="text-center">
                    <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full border capitalize ${STATUS_CHIP[r.status] || STATUS_CHIP.cancelled}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>
                    {r.status === "pending" && (
                      <div className="flex gap-1.5 justify-end">
                        <button onClick={() => decide(r, "approve")}
                          data-testid={`leave-approve-${r.id}`}
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium">
                          <Check className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button onClick={() => decide(r, "reject")}
                          data-testid={`leave-reject-${r.id}`}
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 font-medium">
                          <X className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
