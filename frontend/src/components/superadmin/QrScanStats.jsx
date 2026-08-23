import { useEffect, useState } from "react";
import api from "@/lib/api";
import { QrCode } from "lucide-react";
import { LABEL_PRODUCT_NAMES } from "@/components/superadmin/LabelGenerator";

export const QrScanStats = () => {
  const [stats, setStats] = useState({ products: [], total_scans: 0 });

  useEffect(() => {
    api.get("/super-admin/qr-scans").then(({ data }) => setStats(data)).catch(() => {});
  }, []);

  return (
    <div className="mt-5 border-t border-slate-100 pt-4" data-testid="qr-scan-stats">
      <h4 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
        <QrCode className="w-4 h-4 text-rose-500" /> Bottle QR Scans
        <span className="text-slate-400 font-normal">({stats.total_scans} total)</span>
      </h4>
      <p className="text-[11px] text-slate-400 mt-0.5">Every "Scan to Reorder" QR on your bottle labels is tracked — see which product drives reorders.</p>
      {stats.products.length === 0 && (
        <p className="text-xs text-slate-400 mt-2" data-testid="qr-scan-empty">No scans yet — new labels printed from the generator below carry the tracked QR.</p>
      )}
      <div className="mt-2 space-y-1.5">
        {stats.products.map(p => (
          <div key={p.product_id} data-testid={`qr-scan-row-${p.product_id}`}
            className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
            <div>
              <p className="text-xs font-semibold text-slate-800">{LABEL_PRODUCT_NAMES[p.product_id] || p.product_id}</p>
              <p className="text-[10px] text-slate-400">Last scan: {(p.last_scan || "").slice(0, 16).replace("T", " ") || "—"}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-extrabold text-slate-900">{p.total}</p>
              <p className="text-[10px] text-emerald-600 font-bold">{p.last_7_days} in last 7d</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
