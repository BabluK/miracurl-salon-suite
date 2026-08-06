import { useEffect, useState } from "react";
import api from "@/lib/api";
import { ArrowRightLeft } from "lucide-react";

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const STATUS_STYLE = {
  active: "bg-sky-50 border-sky-200 text-sky-700",
  scheduled: "bg-violet-50 border-violet-200 text-violet-700",
  returned: "bg-emerald-50 border-emerald-200 text-emerald-700",
};
const STATUS_LABEL = { active: "On duty there", scheduled: "Upcoming", returned: "Returned" };

export function TempDutyLog() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api.get("/staff/temp-transfers/log").then(r => setRows(r.data.rows || [])).catch(() => {});
  }, []);
  if (!rows.length) return null;

  return (
    <div className="card-light" data-testid="temp-duty-log">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center">
          <ArrowRightLeft className="w-4 h-4" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-800 text-sm">Temporary duty log</h3>
          <p className="text-[11px] text-slate-500">Who worked at which salon — and the business they billed there (admin only)</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <th className="py-2 pr-3">Staff</th>
              <th className="py-2 pr-3">Worked at</th>
              <th className="py-2 pr-3">Dates</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 text-right">Business billed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-50" data-testid={`temp-duty-row-${i}`}>
                <td className="py-2 pr-3 font-medium text-slate-700">{r.staff_name}</td>
                <td className="py-2 pr-3 text-slate-600">{r.target_name}</td>
                <td className="py-2 pr-3 text-slate-500">{r.from_date === r.to_date ? r.from_date : `${r.from_date} → ${r.to_date}`}</td>
                <td className="py-2 pr-3">
                  <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${STATUS_STYLE[r.status] || ""}`}>
                    {STATUS_LABEL[r.status] || r.status}
                  </span>
                </td>
                <td className="py-2 text-right font-semibold text-emerald-700">
                  {inr(r.billed)} <span className="text-slate-400 font-normal">· {r.bills} bill{r.bills === 1 ? "" : "s"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
