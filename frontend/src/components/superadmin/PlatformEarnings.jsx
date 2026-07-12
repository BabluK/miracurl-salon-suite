import { useEffect, useState } from "react";
import api from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Landmark } from "lucide-react";

export function PlatformEarnings() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/super-admin/earnings").then(r => setData(r.data)).catch(() => {}); }, []);
  if (!data) return null;
  const t = data.totals;
  const fmt = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm" data-testid="platform-earnings-card">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Landmark className="w-4 h-4 text-emerald-600" /> Platform earnings (6 months)</h3>
        <p className="text-xs text-slate-500">
          Subscriptions <b className="text-slate-700">{fmt(t.subscriptions)}</b> · Placement fees <b className="text-slate-700">{fmt(t.placement_fees)}</b>
          {t.placement_fees_due > 0 && <span className="text-amber-600"> · {fmt(t.placement_fees_due)} due</span>}
          {" "}· Combined <b className="text-emerald-700">{fmt(t.combined)}</b>
        </p>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.series} barGap={2}>
            <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} width={44} />
            <Tooltip formatter={(v, n) => [fmt(v), n === "subscriptions" ? "Subscriptions" : "Placement fees"]} />
            <Legend formatter={(v) => v === "subscriptions" ? "Subscriptions" : "Placement fees"} wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="subscriptions" stackId="a" fill="#0f172a" radius={[0, 0, 0, 0]} />
            <Bar dataKey="placement_fees" stackId="a" fill="#d4af37" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
