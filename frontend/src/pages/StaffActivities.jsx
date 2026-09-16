import { useEffect, useRef, useState } from "react";
import pinApi from "@/lib/ownerPin";
import { toast } from "sonner";
import { Activity, Lock, RefreshCw } from "lucide-react";

const badge = (action) => {
  if (action.startsWith("unlocked")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (action.startsWith("denied")) return "bg-rose-50 text-rose-700 border-rose-200";
  if (action.startsWith("attempted")) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
};

export default function StaffActivities() {
  const [logs, setLogs] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await pinApi.get("/manager/activity-logs");
      setLogs(data.logs);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't load activity logs");
    } finally { setLoading(false); }
  };
  const bootRef = useRef(false);
  useEffect(() => { if (!bootRef.current) { bootRef.current = true; load(); } }, []);

  return (
    <div className="space-y-6" data-testid="staff-activities-page">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-playfair text-4xl sm:text-5xl text-slate-900 leading-[1.05] flex items-center gap-3"><Activity className="w-7 h-7 text-amber-500" /> Staff Activities</h1>
          <p className="text-slate-500 text-sm mt-1 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> PIN-protected audit — every time a manager opens or tries to open a protected section, it's recorded here.
          </p>
        </div>
        <button onClick={load} disabled={loading} data-testid="activities-refresh-btn"
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {logs === null ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-400 text-sm">
          {loading ? "Loading…" : "Enter the Admin PIN to view staff activity."}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Who</th>
                <th className="px-4 py-3">Section</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50/60" data-testid={`activity-row-${l.id}`}>
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {new Date(l.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{l.name}</div>
                    <div className="text-[11px] text-slate-400">{l.role} · {l.email}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{l.section}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2.5 py-1 rounded-full border font-medium ${badge(l.action)}`}>{l.action}</span>
                  </td>
                </tr>
              ))}
              {!logs.length && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400 text-sm">No activity yet — logs appear when a manager opens a protected section.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
