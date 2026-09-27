import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Coins, Loader2, MessageSquare, Bot } from "lucide-react";
import { HqDialogHeader, HqChip } from "@/components/superadmin/HqDialogHeader";

const QUICK = [50, 100, 300, 500];

export function GrantCreditsModal({ tenant, channel = "sms", onClose, onDone }) {
  const label = channel === "sms" ? "SMS" : "WhatsApp";
  const bal = channel === "sms" ? tenant.sms_points || 0 : tenant.wa_points || 0;
  const [stock, setStock] = useState(null);
  const [points, setPoints] = useState("100");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get("/super-admin/credit-wallet").then(({ data }) => setStock(channel === "sms" ? data.sms_stock : data.whatsapp_stock)).catch(() => {});
  }, [channel]);

  const grant = async () => {
    const n = parseInt(points, 10);
    if (!n || n < 1) { toast.error("Enter a positive number of credits"); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/super-admin/tenants/${tenant.id}/sms-points?channel=${channel}`, { points: n });
      toast.success(`${tenant.name} now has ${data.balance} ${label} credits ✦`);
      onDone?.(); onClose();
    } catch (e) { toast.error(e.response?.data?.detail || `Couldn't grant ${label} credits`); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6" onClick={onClose} data-testid="grant-credits-modal">
      <div className="relative w-full max-w-md rounded-[28px] bg-[#f7f5f0] su-cream shadow-[0_40px_80px_-30px_rgba(0,0,0,.7)] overflow-hidden ring-1 ring-[#d4af37]/40" onClick={e => e.stopPropagation()}>
        <HqDialogHeader kicker={`Grant ${label} credits`} title={tenant.name} icon={channel === "sms" ? MessageSquare : Bot} onClose={onClose} closeTestId="grant-credits-close"
          subtitle={`/${tenant.slug} · 1 credit = 1 ${label} message`} vertical={tenant.business_type === "restaurant" ? "restaurant" : "salon"}>
          <div className="flex flex-wrap gap-2 mt-4">
            <HqChip on>Balance {bal.toLocaleString("en-IN")}</HqChip>
            {stock !== null && <HqChip on={stock > 0}>HQ stock {Number(stock).toLocaleString("en-IN")}</HqChip>}
          </div>
        </HqDialogHeader>
        <div className="p-6 space-y-4 su-stagger">
          <p className="text-xs text-slate-500">The grant is deducted from HQ&apos;s {label} stock and written to the credit ledger — the owner sees the new balance instantly.</p>
          <div className="flex gap-2 flex-wrap">
            {QUICK.map(q => (
              <button key={q} type="button" onClick={() => setPoints(String(q))} data-testid={`grant-quick-${q}`}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${points === String(q) ? "bg-[#15151b] text-[#f3e3ae] border-[#15151b]" : "bg-white border-slate-200 text-slate-600 hover:border-[#d4af37]"}`}>+{q}</button>
            ))}
          </div>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Credits to grant</span>
            <input type="number" min="1" value={points} onChange={e => setPoints(e.target.value)} data-testid="grant-credits-input"
              className="mt-1 w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#d4af37]/50" />
          </label>
          <button type="button" onClick={grant} disabled={busy} data-testid="grant-credits-confirm"
            className="w-full h-11 rounded-full bg-gradient-to-r from-[#c9962b] via-[#f3d777] to-[#c9962b] text-[#2a1e05] font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 shadow-[0_10px_30px_-10px_rgba(212,175,55,.8)]">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />} Grant {points || 0} {label} credits
          </button>
        </div>
      </div>
    </div>
  );
}
