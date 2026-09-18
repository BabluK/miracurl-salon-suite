import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Wallet, RefreshCw, MessageCircle, MessageSquare, IndianRupee, AlertTriangle, SearchCheck, Trash2 } from "lucide-react";

const inr = (p) => `₹${Math.round((p || 0) / 100).toLocaleString("en-IN")}`;

export default function CreditWalletCard() {
  const [w, setW] = useState(null);
  const [busy, setBusy] = useState("");
  const [audit, setAudit] = useState(null);
  const runAudit = async () => {
    setBusy("audit");
    try { const { data } = await api.get("/super-admin/credit-wallet/audit"); setAudit(data); if (!data.dummy_count) toast.success("All tenant credits are legit — nothing to remove"); }
    catch (e) { toast.error(e.response?.data?.detail || "Audit failed"); } finally { setBusy(""); }
  };
  const removeDummy = async () => {
    if (!window.confirm(`Remove dummy credits from ${audit.dummy_count} tenant(s)? Only credits never sold/granted from HQ stock are zeroed.`)) return;
    setBusy("remove");
    try { const { data } = await api.post("/super-admin/credit-wallet/audit/remove-dummy"); toast.success(`Removed dummy credits from ${data.removed.length} tenant(s)`); setAudit(null); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); } finally { setBusy(""); }
  };
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
  // MSG91 keeps money (₹) not messages — convert wallet ₹ ÷ price per SMS into assignable SMS stock.
  const recordMsg91 = async () => {
    const rupees = Number(window.prompt("MSG91 wallet balance in ₹ (top-right of control.msg91.com):", ""));
    if (!rupees) return;
    const price = Number(window.prompt("Your MSG91 price per SMS in ₹ (DLT transactional, e.g. 0.25):", "0.25"));
    if (!price) return;
    const points = Math.floor(rupees / price);
    if (!window.confirm(`₹${rupees} ÷ ₹${price} = ${points.toLocaleString("en-IN")} SMS. Set HQ SMS stock to this?`)) return;
    try { await api.post("/super-admin/credit-wallet/topup", { channel: "sms", points, mode: "set", cost_paise: Math.round(rupees * 100), note: `MSG91 wallet ₹${rupees} @ ₹${price}/SMS` }); toast.success(`HQ SMS stock set to ${points.toLocaleString("en-IN")}`); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  if (!w) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4" data-testid="hq-credit-wallet">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2"><Wallet className="w-5 h-5 text-[#b58a2c]" /><h3 className="font-semibold text-slate-800">HQ Credit Wallet</h3></div>
        <div className="flex items-center gap-2">
          <button onClick={recordMsg91} data-testid="hq-wallet-record-msg91" className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#b58a2c] text-white font-semibold hover:bg-[#9a7423]"><IndianRupee className="w-3.5 h-3.5" /> Record MSG91 wallet</button>
          <button onClick={sync} disabled={!!busy} data-testid="hq-wallet-sync" className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"><RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} /> Sync MSG91 route</button>
        </div>
      </div>
      {w.mira_note && (
        <div className="flex items-start gap-2 rounded-xl border-2 border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800" data-testid="hq-wallet-low-alert">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span><b>Mira:</b> {w.mira_note}</span>
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className={`rounded-xl border p-4 ${w.low_stock?.sms ? "border-rose-300 bg-rose-50" : "border-slate-200"}`} data-testid="hq-sms-stock">
          <div className="text-xs text-slate-500 flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" /> SMS stock to assign (MSG91)</div>
          <div className={`text-3xl font-bold ${w.low_stock?.sms ? "text-rose-700" : "text-slate-800"}`}>{w.sms_stock?.toLocaleString("en-IN")}</div>
          <div className="text-[11px] text-slate-500 mt-1">Alert below {w.low_threshold} · Revenue from tenants {inr(w.sms_revenue_paise)}</div>
          <button onClick={() => topup("sms")} className="mt-2 text-xs text-[#b58a2c] font-semibold hover:underline">+ Add stock manually</button>
        </div>
        <div className={`rounded-xl border p-4 ${w.low_stock?.whatsapp ? "border-rose-300 bg-rose-50" : "border-slate-200"}`} data-testid="hq-wa-stock">
          <div className="text-xs text-slate-500 flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp credits to assign (Meta postpaid)</div>
          <div className={`text-3xl font-bold ${w.low_stock?.whatsapp ? "text-rose-700" : "text-slate-800"}`}>{w.whatsapp_stock?.toLocaleString("en-IN")}</div>
          <div className="text-[11px] text-slate-500 mt-1">Meta bills ≈₹0.93/marketing · ₹0.14/utility msg to your card · Revenue {inr(w.whatsapp_revenue_paise)}</div>
          <button onClick={() => topup("whatsapp")} className="mt-2 text-xs text-[#b58a2c] font-semibold hover:underline">+ Set budget stock</button>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={runAudit} disabled={!!busy} data-testid="hq-wallet-audit" className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"><SearchCheck className="w-3.5 h-3.5" /> Audit tenant credits</button>
        {audit?.dummy_count > 0 && <button onClick={removeDummy} disabled={!!busy} data-testid="hq-wallet-remove-dummy" className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700"><Trash2 className="w-3.5 h-3.5" /> Remove dummy credits ({audit.dummy_count})</button>}
      </div>
      {audit?.tenants?.length > 0 && (
        <ul className="divide-y divide-slate-100 text-xs" data-testid="hq-wallet-audit-list">
          {audit.tenants.map(r => (
            <li key={r.tenant_id} className="py-1.5 flex items-center gap-3">
              <span className="text-slate-800 font-medium flex-1 truncate">{r.name}</span>
              <span className={r.dummy.sms ? "text-rose-600 font-semibold" : "text-slate-600"}>SMS {r.sms_points}{r.dummy.sms ? " · dummy" : ` · legit ${r.legit_sms}`}</span>
              <span className={r.dummy.whatsapp ? "text-rose-600 font-semibold" : "text-slate-600"}>WA {r.wa_points}{r.dummy.whatsapp ? " · dummy" : ` · legit ${r.legit_whatsapp}`}</span>
            </li>
          ))}
        </ul>
      )}
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
