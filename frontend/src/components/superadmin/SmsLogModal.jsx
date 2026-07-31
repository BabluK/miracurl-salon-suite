import { useEffect, useState } from "react";
import api from "@/lib/api";
import { X, MessageSquareText } from "lucide-react";

const KIND_ICON = { booking: "📅", billing: "🧾", reminder: "⏰", cancellation: "❌", general: "💬" };

export default function SmsLogModal({ tenant, onClose }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/super-admin/sms-log?tenant_id=${tenant.id}`).then(r => setData(r.data)).catch(() => setData({ items: [], sent: 0, failed: 0 }));
  }, [tenant.id]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid="sms-log-modal" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-playfair text-xl flex items-center gap-2"><MessageSquareText className="w-5 h-5 text-sky-600" /> SMS Delivery Log</h2>
            <p className="text-xs text-slate-500 mt-0.5">{tenant.name} · balance {tenant.sms_points || 0} points</p>
          </div>
          <button onClick={onClose} data-testid="sms-log-close" className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>
        {!data ? <div className="py-8 text-center text-slate-400 text-sm">Loading…</div> : (
          <>
            <div className="flex gap-3 mt-4">
              <div className="flex-1 rounded-xl border border-emerald-200 bg-emerald-50/40 p-2.5 text-center">
                <div className="text-xl font-bold text-emerald-600" data-testid="sms-sent-count">{data.sent}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Delivered to carrier</div>
              </div>
              <div className="flex-1 rounded-xl border border-rose-200 bg-rose-50/40 p-2.5 text-center">
                <div className="text-xl font-bold text-rose-600" data-testid="sms-failed-count">{data.failed}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">Failed / skipped</div>
              </div>
            </div>
            <div className="mt-4 space-y-2 overflow-y-auto" data-testid="sms-log-list">
              {data.items.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No SMS attempts yet for this salon.</p>}
              {data.items.map(r => (
                <div key={r.id} className="border border-slate-100 rounded-xl px-3 py-2 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>{KIND_ICON[r.kind] || "💬"}</span>
                    <span className="font-semibold text-slate-700 capitalize">{r.kind}</span>
                    <span className="text-slate-400 font-mono">{r.phone}</span>
                    <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold ${r.sent ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>
                      {r.sent ? "SENT" : (r.error === "no_sms_points" ? "NO POINTS" : "FAILED")}
                    </span>
                  </div>
                  <div className="text-slate-500 mt-1 truncate">{r.preview}</div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                    <span>{(r.created_at || "").slice(0, 16).replace("T", " ")}</span>
                    {!r.sent && r.error && r.error !== "no_sms_points" && <span className="text-rose-400">· {r.error}</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
