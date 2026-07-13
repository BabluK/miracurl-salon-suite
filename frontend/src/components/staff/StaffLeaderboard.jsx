import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Trophy, Target, CheckCircle2 } from "lucide-react";

export const StaffLeaderboard = () => {
  const [data, setData] = useState(null);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  useEffect(() => {
    api.get(`/staff/leaderboard?month=${month}`).then(r => setData(r.data)).catch(() => setData({ rows: [] }));
  }, [month]);

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="card-light" data-testid="staff-leaderboard">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500" />
          <h3 className="font-playfair text-xl">Performance Leaderboard</h3>
        </div>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="input-light !w-auto text-xs py-1.5" data-testid="leaderboard-month-input" />
      </div>
      <p className="text-xs text-slate-400 mb-4">Monthly business per team member. Hit the target → the commission % applies on their <b>full business</b> and is auto-added to the salary slip.</p>
      <div className="overflow-x-auto">
        <table className="luxe-table-light min-w-[680px] w-full">
          <thead>
            <tr><th>Rank</th><th>Staff</th><th>Business</th><th>Services</th><th>Target</th><th>Progress</th><th>Target Bonus</th></tr>
          </thead>
          <tbody>
            {(data?.rows || []).map(r => (
              <tr key={r.staff_id} data-testid={`leaderboard-row-${r.staff_id}`}>
                <td className="text-lg">{medals[r.rank - 1] || `#${r.rank}`}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <img src={r.image_url || `https://ui-avatars.com/api/?background=e0e7ff&color=3730a3&name=${encodeURIComponent(r.name)}`} alt="" className="w-8 h-8 rounded-full object-cover" />
                    <div>
                      <div className="text-sm font-medium">{r.name}</div>
                      <div className="text-[11px] text-slate-400">{r.role}</div>
                    </div>
                  </div>
                </td>
                <td className="font-semibold text-sm">₹{r.business.toLocaleString("en-IN")}</td>
                <td className="text-sm">{r.service_count}</td>
                <td className="text-sm">{r.monthly_target > 0 ? `₹${r.monthly_target.toLocaleString("en-IN")} @ ${r.target_commission_pct}%` : <span className="text-slate-300">—</span>}</td>
                <td>
                  {r.monthly_target > 0 ? (
                    <div className="w-28">
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${r.target_achieved ? "bg-emerald-500" : "bg-sky-400"}`} style={{ width: `${Math.min(100, r.achieved_pct || 0)}%` }} />
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{r.achieved_pct}%{r.target_achieved && " 🎯"}</div>
                    </div>
                  ) : <span className="text-slate-300 text-xs flex items-center gap-1"><Target className="w-3 h-3" /> not set</span>}
                </td>
                <td>
                  {r.target_bonus > 0
                    ? <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" /> ₹{r.target_bonus.toLocaleString("en-IN")}</span>
                    : <span className="text-slate-300 text-xs">₹0</span>}
                </td>
              </tr>
            ))}
            {(!data || data.rows.length === 0) && <tr><td colSpan="7" className="text-center text-slate-400 py-8">No staff data for this month yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};
