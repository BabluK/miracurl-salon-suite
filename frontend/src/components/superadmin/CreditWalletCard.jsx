import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Wallet, RefreshCw, MessageCircle, MessageSquare } from "lucide-react";

const inr = (p) => `₹${Math.round((p || 0) / 100).toLocaleString("en-IN")}`;

export default function CreditWalletCard() {
  const [w, setW] = useState(null);
  const [busy, setBusy] = useState("");
  const load = () => api.get("/super-admin/credit-wallet").then(r => setW(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  const sync = async () => {
    setBusy("sync");
    try { const { data } = await api.post("/super-admin/credit-wallet/sync"); toast.success(`MSG91 balance synced: ${data.sms_stock} SMS`); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Sync failed"); } finally { setBusy(""); }
  };
  const topup = async (channel) => {
    const v = window.prompt(`Add ${channel === "sms" ? "SMS" : "WhatsApp"} credits to HQ stock (what you bought from ${channel === "sms" ? "MSG91" : "Meta"}):`);
    const n = Number(v); if (!n) return;
    try { await api.post("/super-admin/credit-wallet/topup", { channel, points: n, note: "manual" }); toast.success("Stock updated"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  if (!w) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4" data-testid="hq-credit-wallet">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2"><Wallet className="w-5 h-5 text-[#b58a2c]" /><h3 className="font-semibold text-slate-800">HQ Credit Wallet</h3></div>
        <button onClick={sync} disabled={!!busy} data-testid="hq-wallet-sync" className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"><RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} /> Sync MSG91 balance</button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className={`rounded-xl border p-4 ${w.low_stock?.sms ? "border-amber-300 bg-amber-50" : "border-slate-200"}`} data-testid="hq-sms-stock">
          <div className="text-xs text-slate-500 flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" /> SMS stock (MSG91 prepaid)</div>
          <div className="text-3xl font-bold text-slate-800">{w.sms_stock?.toLocaleString("en-IN")}</div>
          <div className="text-[11px] text-slate-500 mt-1">Live MSG91: {w.msg91_balance ?? "—"} · Revenue from tenants {inr(w.sms_revenue_paise)}</div>
          <button onClick={() => topup("sms")} className="mt-2 text-xs text-[#b58a2c] font-semibold hover:underline">+ Add stock manually</button>
        </div>
        <div className="rounded-xl border border-slate-200 p-4" data-testid="hq-wa-stock">
          <div className="text-xs text-slate-500 flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp credits issued (Meta postpaid)</div>
          <div className="text-3xl font-bold text-slate-800">{w.whatsapp_stock?.toLocaleString("en-IN")}</div>
          <div className="text-[11px] text-slate-500 mt-1">Meta bills ≈₹0.93/marketing · ₹0.14/utility msg to your card · Revenue {inr(w.whatsapp_revenue_paise)}</div>
          <button onClick={() => topup("whatsapp")} className="mt-2 text-xs text-[#b58a2c] font-semibold hover:underline">+ Set budget stock</button>
        </div>
      </div>
      {w.ledger?.length > 0 && (
        <ul className="divide-y divide-slate-100 text-xs max-h-48 overflow-y-auto" data-testid="hq-wallet-ledger">
          {w.ledger.slice(0, 12).map(r => (
            <li key={r.id} className="py-1.5 flex items-center gap-2">
              <span className={`font-mono font-semibold ${r.delta < 0 ? "text-rose-600" : "text-emerald-600"}`}>{r.delta > 0 ? "+" : ""}{r.delta}</span>
              <span className="uppercase text-[10px] text-slate-400">{r.channel}</span>
              <span className="text-slate-700 flex-1 truncate">{r.kind.replace("_", " ")}{r.tenant_name ? ` · ${r.tenant_name}` : ""}{r.amount_paise ? ` · ${inr(r.amount_paise)}` : ""}</span>
              <span className="text-slate-400">{new Date(r.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
