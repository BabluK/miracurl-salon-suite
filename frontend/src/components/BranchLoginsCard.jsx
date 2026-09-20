import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { CheckCircle2, MapPin, MinusCircle, Smartphone } from "lucide-react";

const ROLE = { admin: "Owner", manager: "Manager", staff: "Staff" };

function fmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }); } catch { return ""; }
}

// Attendance: which login picked which branch today, on which device, GPS-verified or not.
export function BranchLoginsCard({ date }) {
  const [data, setData] = useState(null);
  const load = useCallback(() => {
    api.get("/attendance/branch-logins", { params: { date } }).then(r => setData(r.data)).catch(() => setData({ items: [] }));
  }, [date]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="card-light space-y-3" data-testid="branch-logins-card">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center"><Smartphone className="w-4 h-4 text-indigo-600" /></div>
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">Branch sign-ins</h3>
            <p className="text-xs text-slate-500">Which login opened which branch on this day, from which device.</p>
          </div>
        </div>
        {data && data.total > 0 && (
          <span className="text-xs text-slate-600 bg-slate-100 rounded-full px-2.5 py-1" data-testid="branch-logins-summary">
            {data.total} sign-in{data.total === 1 ? "" : "s"} · <span className="text-emerald-700 font-semibold">{data.gps_verified} GPS ✓</span>
          </span>
        )}
      </div>
      {!data ? <p className="text-xs text-slate-400">Loading…</p> : data.items.length === 0 ? (
        <p className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl py-4 text-center" data-testid="branch-logins-empty">No branch sign-ins recorded for this day.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[560px]">
            <thead><tr className="text-left text-slate-400 uppercase tracking-wider text-[10px]">
              <th className="py-1.5 pr-3">Time</th><th className="pr-3">Who</th><th className="pr-3">Branch</th><th className="pr-3">Device</th><th className="pr-3">GPS</th>
            </tr></thead>
            <tbody>
              {data.items.map(r => (
                <tr key={r.id} className="border-t border-slate-100" data-testid={`branch-login-row-${r.id}`}>
                  <td className="py-2 pr-3 text-slate-600 whitespace-nowrap">{fmtTime(r.at)}</td>
                  <td className="pr-3"><div className="font-medium text-slate-800">{r.name || r.email}</div><div className="text-[10px] text-slate-400">{ROLE[r.role] || r.role} · {r.email}</div></td>
                  <td className="pr-3 text-slate-700"><span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-400" />{r.branch === "__main__" ? "Main salon" : r.branch || "All branches"}</span></td>
                  <td className="pr-3 text-slate-600">{r.device}</td>
                  <td className="pr-3">
                    {r.gps_verified
                      ? <span className="inline-flex items-center gap-1 text-emerald-700 font-medium" title={r.distance_m != null ? `${Math.round(r.distance_m)} m from the pin` : ""}><CheckCircle2 className="w-3.5 h-3.5" /> Verified{r.distance_m != null ? ` · ${Math.round(r.distance_m)} m` : ""}</span>
                      : <span className="inline-flex items-center gap-1 text-slate-400" title="No GPS — branch chosen manually"><MinusCircle className="w-3.5 h-3.5" /> No GPS</span>}
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

export default BranchLoginsCard;
