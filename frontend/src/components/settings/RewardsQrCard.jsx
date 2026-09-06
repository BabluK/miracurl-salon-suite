import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Gift, Download, Loader2, ExternalLink } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export function RewardsQrCard() {
  const [d, setD] = useState(null);
  const [dl, setDl] = useState(false);
  useEffect(() => { api.get("/settings/rewards-campaign").then(r => setD(r.data)).catch(() => {}); }, []);
  if (!d || !d.enabled) return null;
  const src = `${BACKEND_URL}/api/settings/rewards-qr-poster.png?origin=${encodeURIComponent(window.location.origin)}`;
  const download = async () => {
    setDl(true);
    try {
      const { data } = await api.get("/settings/rewards-qr-poster.png", { params: { origin: window.location.origin }, responseType: "blob" });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url; a.download = "rewards-campaign-qr.jpg"; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Couldn't generate the rewards poster"); }
    setDl(false);
  };
  const c = d.campaign;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 mt-6" data-testid="rewards-qr-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><Gift className="w-5 h-5 text-amber-500" /> {c.name}</h2>
          <p className="text-xs text-slate-500 mt-1">Customers who spend ₹{Number(c.min_transaction).toLocaleString("en-IN")}+ scan this QR to enrol. {c.start_date} → {c.end_date}. Winners: {c.rewards.map(r => `${r.tier} ×${r.winners}`).join(" · ")}.</p>
        </div>
        <span data-testid="rewards-qr-status" className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${d.eligible ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {d.eligible ? "🟢 Live for your salon" : d.plan_ok ? "🟡 Campaign starts " + c.start_date : "⚪ Needs an eligible plan (" + c.eligible_plans.join(", ") + ")"}
        </span>
      </div>
      <div className="grid sm:grid-cols-[220px_1fr] gap-5 mt-4 items-start">
        <img src={src} alt="Rewards campaign QR poster" data-testid="rewards-qr-preview" className="w-full rounded-xl border border-slate-200 shadow" loading="lazy" />
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <button onClick={download} disabled={dl} data-testid="rewards-qr-download-btn"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-50">
              {dl ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download print poster
            </button>
            <a href={`/rewards/${d.slug}`} target="_blank" rel="noreferrer" data-testid="rewards-qr-open-page"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border-2 border-amber-400 text-amber-700 text-sm font-semibold hover:bg-amber-50">
              <ExternalLink className="w-4 h-4" /> Open campaign page
            </a>
          </div>
          <div className="text-xs text-slate-600" data-testid="rewards-qr-participants-count">{d.participants.length} customer{d.participants.length === 1 ? "" : "s"} enrolled from your salon</div>
          {d.participants.length > 0 && (
            <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl" data-testid="rewards-qr-participants">
              {d.participants.map(p => (
                <div key={p.id} className="flex items-center justify-between px-3 py-2 text-xs">
                  <div className="min-w-0"><div className="font-medium text-slate-800 truncate">{p.name}{p.winner_tier ? <span className="ml-1 text-amber-600">🏆 {p.winner_tier}</span> : null}</div><div className="text-slate-400">{p.phone} · {p.entries.purchases} bill{p.entries.purchases === 1 ? "" : "s"} · {p.entries.referred} referred</div></div>
                  <div className="font-bold text-amber-600 shrink-0">{p.entries.total} <span className="text-[10px] text-slate-400 font-normal">entries</span></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
