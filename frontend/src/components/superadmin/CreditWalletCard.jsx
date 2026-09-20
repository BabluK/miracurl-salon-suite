import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Wallet, RefreshCw, MessageCircle, MessageSquare, IndianRupee, AlertTriangle, SearchCheck, Trash2, Stethoscope, CheckCircle2, XCircle, Loader2 } from "lucide-react";

function WaHealth() {
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = () => { setBusy(true); api.get("/super-admin/whatsapp-health").then(r => { setRes(r.data); toast[r.data.ok ? "success" : "error"](r.data.ok ? "HQ WhatsApp connection healthy ✓" : "WhatsApp connection has a problem — see details"); }).catch(e => toast.error(e.response?.data?.detail || "Health check failed")).finally(() => setBusy(false)); };
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid="hq-wa-health">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs text-slate-600"><b className="text-slate-800">HQ WhatsApp connection</b> — validates the Meta token, phone-number ID, business account and templates on <i>this</i> server.</div>
        <button onClick={run} disabled={busy} data-testid="hq-wa-health-run" className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800 disabled:opacity-60">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Stethoscope className="w-3.5 h-3.5" />} Test HQ WhatsApp connection</button>
      </div>
      {res && (
        <ul className="mt-2 space-y-1" data-testid="hq-wa-health-results">
          {res.checks.map(c => (
            <li key={c.name} className="flex items-start gap-2 text-xs">
              {c.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-rose-600 mt-0.5 shrink-0" />}
              <span><b className="text-slate-800">{c.name}:</b> <span className={c.ok ? "text-slate-600" : "text-rose-700 font-medium"}>{c.detail}</span></span>
            </li>
          ))}
          <li className="text-[10px] text-slate-400 pl-5">phone_number_id {res.phone_number_id} · Graph {res.graph_version}</li>
        </ul>
      )}
    </div>
  );
}

const inr = (p) => `₹${Math.round((p || 0) / 100).toLocaleString("en-IN")}`;

export default function CreditWalletCard() {
  const [w, setW] = useState(null);
  const [busy, setBusy] = useState("");
  const [audit, setAudit] = useState(null);
  const [meta, setMeta] = useState(null);
  const loadMeta = (refresh = false) => api.get(`/super-admin/meta-usage${refresh ? "?refresh=1" : ""}`).then(r => setMeta(r.data)).catch(() => setMeta({ available: false, reason: "Couldn't reach server" }));
  useEffect(() => { loadMeta(); }, []);
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
      <WaHealth />
      {w.mira_note && (
        <div className="flex items-start gap-2 rounded-xl border-2 border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800" data-testid="hq-wallet-low-alert">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span><b>Mira:</b> {w.mira_note}</span>
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className={`rounded-xl border p-4 ${w.low_stock?.sms ? "border-rose-300 bg-rose-50" : "border-slate-200"}`} data-testid="hq-sms-stock">
          <div className="text-xs text-slate-500 flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" /> SMS stock to assign (MSG91)</div>
          <div className={`text-3xl font-bold ${w.low_stock?.sms ? "text-rose-700" : "text-slate-800"}`}>{w.sms_stock?.toLocaleString("en-IN")}</div>
          <div className="text-[11px] text-slate-500 mt-1">Alert below {w.low_threshold} · Revenue {inr(w.sms_revenue_paise)} · <span className="text-emerald-700 font-semibold" data-testid="hq-sms-margin">Margin {inr(w.margin?.sms?.margin_paise)}</span> <span className="text-slate-400">({w.margin?.sms?.sold ?? 0} sold @ {w.margin?.sms?.unit_cost_paise}p cost)</span></div>
          <button onClick={() => topup("sms")} className="mt-2 text-xs text-[#b58a2c] font-semibold hover:underline">+ Add stock manually</button>
        </div>
        <div className={`rounded-xl border p-4 ${w.low_stock?.whatsapp ? "border-rose-300 bg-rose-50" : "border-slate-200"}`} data-testid="hq-wa-stock">
          <div className="text-xs text-slate-500 flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp credits to assign (Meta postpaid)</div>
          <div className={`text-3xl font-bold ${w.low_stock?.whatsapp ? "text-rose-700" : "text-slate-800"}`}>{w.whatsapp_stock?.toLocaleString("en-IN")}</div>
          <div className="text-[11px] text-slate-500 mt-1">Revenue {inr(w.whatsapp_revenue_paise)} · <span className="text-emerald-700 font-semibold" data-testid="hq-wa-margin">Margin {inr(w.margin?.whatsapp?.margin_paise)}</span> <span className="text-slate-400">({w.margin?.whatsapp?.sold ?? 0} sold @ {w.margin?.whatsapp?.unit_cost_paise}p Meta cost)</span></div>
          <button onClick={() => topup("whatsapp")} className="mt-2 text-xs text-[#b58a2c] font-semibold hover:underline">+ Set budget stock</button>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 p-4 bg-gradient-to-br from-emerald-50/60 to-white" data-testid="hq-meta-usage">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs text-slate-500 flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5 text-emerald-600" /> Meta WhatsApp · {meta?.month || "this month"} · {meta?.phone?.display_phone_number || "HQ number"}</div>
          <button onClick={() => loadMeta(true)} data-testid="hq-meta-refresh" className="text-[11px] text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Refresh</button>
        </div>
        {!meta ? <div className="text-xs text-slate-400 mt-2">Loading Meta usage…</div>
          : !meta.available ? <div className="text-xs text-amber-700 mt-2" data-testid="hq-meta-unavailable">Meta usage unavailable — {meta.reason}</div>
          : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              <div><div className="text-2xl font-bold text-slate-800" data-testid="hq-meta-messages">{meta.messages_total.toLocaleString("en-IN")}</div><div className="text-[11px] text-slate-500">billable messages sent</div></div>
              <div><div className="text-2xl font-bold text-emerald-700" data-testid="hq-meta-cost">₹{Number(meta.cost_inr).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div><div className="text-[11px] text-slate-500">Meta spend month-to-date</div></div>
              <div><div className="text-2xl font-bold text-slate-800">{meta.free_service.toLocaleString("en-IN")}</div><div className="text-[11px] text-slate-500">free guest conversations</div></div>
              <div><div className="text-sm font-semibold text-slate-800 mt-1">{meta.phone?.status || "—"} · Q {meta.phone?.quality_rating || "—"}</div><div className="text-[11px] text-slate-500">number status · quality {meta.phone?.messaging_limit_tier ? `· ${meta.phone.messaging_limit_tier.replace("TIER_", "")}/day` : ""}</div></div>
            </div>
          )}
        {meta?.available && Object.keys(meta.messages_by_category || {}).length > 0 && (
          <div className="text-[11px] text-slate-500 mt-2">{Object.entries(meta.messages_by_category).map(([k, v]) => `${k.toLowerCase()} ${v}`).join(" · ")}</div>
        )}
        <div className="text-[11px] text-slate-400 mt-2">Pay-as-you-go: Meta charges the card on file monthly. Service (guest-first) chats are free; marketing ≈ ₹0.78, utility ≈ ₹0.115 per message.</div>
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
