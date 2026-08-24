import { useEffect, useState } from "react";
import api from "@/lib/api";
import { PhoneCall, CheckCircle2, AlertTriangle } from "lucide-react";

export const NumberHealthCard = () => {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/super-admin/number-health").then(({ data: d }) => setData(d)).catch(() => {});
  }, []);

  if (!data) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6" data-testid="number-health-card">
      <h3 className="font-semibold text-slate-800 flex items-center gap-2">
        <PhoneCall className="w-4 h-4 text-emerald-600" /> Number Health Check
      </h3>
      <p className="text-xs text-slate-500 mt-1">Every public phone / WhatsApp number in one place — a red row means someone could be reaching the wrong number.</p>

      <div className="mt-4 space-y-2">
        {data.platform.map((row, i) => (
          <div key={i} data-testid={`number-health-platform-${i}`}
            className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${row.ok ? "border-emerald-100 bg-emerald-50/50" : "border-rose-200 bg-rose-50"}`}>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-700">{row.label}</p>
              <p className={`text-sm font-mono font-bold ${row.ok ? "text-emerald-700" : "text-rose-700"}`}>{row.value || "— not set —"}</p>
            </div>
            {row.ok
              ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              : <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600 shrink-0"><AlertTriangle className="w-4 h-4" /> expected {row.expected}</span>}
          </div>
        ))}
      </div>

      <div className="mt-5">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Salon (tenant) numbers — these belong to each salon, never to HQ</h4>
        <div className="mt-2 divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
          {data.tenants.map((t) => (
            <div key={t.slug} data-testid={`number-health-tenant-${t.slug}`}
              className="flex items-center justify-between gap-3 px-3 py-2 bg-slate-50/40">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700 truncate">{t.name} <span className="text-slate-400 font-normal">/{t.slug}</span></p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] font-mono text-slate-600">📞 {t.phone || "—"}</p>
                <p className="text-[11px] font-mono text-slate-500">💬 {t.whatsapp_number || "—"}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-2">HQ number is <b className="font-mono">{data.hq_number}</b> — if a salon number appears in any HQ flow, tell Mira and it gets fixed.</p>
      </div>
    </div>
  );
};
