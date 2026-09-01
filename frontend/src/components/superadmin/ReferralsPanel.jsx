import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Gift } from "lucide-react";

export function ReferralsPanel() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => { if (open && !data) api.get("/super-admin/referrals").then(r => setData(r.data)).catch(() => {}); }, [open, data]);

  return (
    <div className="mt-4 bg-white rounded-2xl border border-amber-200" data-testid="sa-referrals-panel">
      <button onClick={() => setOpen(o => !o)} data-testid="sa-referrals-toggle"
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700">
        <span className="flex items-center gap-2"><Gift className="w-4 h-4 text-amber-500" /> Refer &amp; Earn — referrals &amp; rewards granted</span>
        <span className="text-slate-400 text-xs">{open ? "▲ hide" : "▼ show"}</span>
      </button>
      {open && data && (
        <div className="px-4 pb-4 grid md:grid-cols-2 gap-4 text-xs">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1.5">Referrals ({data.referrals.length})</div>
            {data.referrals.length === 0 && <p className="text-slate-400">No referrals yet.</p>}
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {data.referrals.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <span className="truncate text-slate-600">{r.referrer} → <b>{r.referred}</b> <span className="text-slate-400">· {r.signed_up}</span></span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${r.status === "converted" ? "bg-fuchsia-50 text-fuchsia-700" : r.qualified_at ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {r.status === "converted" ? "💎 Paid" : r.qualified_at ? "✓ Qualified" : "⏳ Pending"}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1.5">Rewards granted ({data.rewards.length})</div>
            {data.rewards.length === 0 && <p className="text-slate-400">No rewards granted yet.</p>}
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {data.rewards.map((rw, i) => (
                <div key={i} className="text-slate-600">🎁 <b>{rw.referrer_name}</b> — milestone {rw.milestone} → +{rw.days} days <span className="text-slate-400">· {String(rw.granted_at).slice(0, 10)}</span></div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
