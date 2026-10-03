import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail, Eye, RefreshCw, TrendingDown, ShieldCheck, AlertTriangle } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { confirmAsync } from "@/components/ConfirmDialog";

const usd = (n) => (n == null ? "—" : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`);

// HQ → Billing: tell international subscribers about the lower prices + one-click switch to annual.
export function PriceAlertCard() {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState("");
  const [sample, setSample] = useState(null);
  const load = useCallback(() => api.get("/super-admin/price-alerts/preview").then(r => setD(r.data)).catch(() => setD({ rows: [], pending: 0, already_sent: 0 })), []);
  useEffect(() => { load(); }, [load]);
  if (!d) return null;
  const send = async () => {
    if (!await confirmAsync(`Email ${d.pending} international subscriber${d.pending === 1 ? "" : "s"} about the new lower prices (with a one-click switch to annual)?`)) return;
    setBusy("send");
    try { const { data } = await api.post("/super-admin/price-alerts/send", {}); toast.success(`💌 Sent to ${data.sent}${data.failed.length ? ` · ${data.failed.length} failed` : ""}`); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Send failed"); } finally { setBusy(""); }
  };
  const preview = async () => {
    setBusy("sample");
    try { const { data } = await api.get("/super-admin/price-alerts/sample"); setSample(data); }
    catch (e) { toast.error(e.response?.data?.detail || "No sample yet"); } finally { setBusy(""); }
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5" data-testid="price-alert-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">International subscribers</div>
          <h3 className="font-semibold text-slate-800 flex items-center gap-2"><TrendingDown className="w-4 h-4 text-emerald-600" /> Price-drop alert · switch to annual</h3>
          <p className="text-xs text-slate-500 mt-1">Every USD subscriber gets their new monthly & annual price and a one-click Stripe link to move to annual (2 months free).</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={preview} disabled={!!busy || !d.rows.length} data-testid="price-alert-preview" className="btn-slate !h-9 !px-3 text-xs inline-flex items-center gap-1.5">{busy === "sample" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />} Preview e-mail</button>
          <button onClick={send} disabled={!!busy || !d.pending} data-testid="price-alert-send" className="btn-blue !h-9 !px-4 text-xs inline-flex items-center gap-1.5">{busy === "send" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />} Send to {d.pending}</button>
        </div>
      </div>
      <div className="text-xs text-slate-500 mt-3" data-testid="price-alert-counts">{d.rows.length} international · {d.pending} pending · {d.already_sent} already notified</div>
      {d.rows.length > 0 && (
        <div className="overflow-x-auto"><table className="luxe-table-light w-full text-xs mt-3"><thead><tr><th>Business</th><th>Current plan</th><th className="text-right">Paying ≈/mo</th><th className="text-right">New monthly</th><th className="text-right">Annual (save)</th><th></th></tr></thead>
          <tbody>{d.rows.slice(0, 30).map(r => (
            <tr key={r.id} data-testid={`price-alert-row-${r.id}`}><td className="font-semibold">{r.name}<div className="text-[10px] text-slate-400 font-normal">{r.owner_email}</div></td><td>{r.plan_label}</td>
              <td className="text-right">{usd(r.paying_monthly_equiv)}</td><td className="text-right font-semibold">{usd(r.new_monthly)}</td>
              <td className="text-right">{usd(r.new_annual)} <span className="text-emerald-600 font-bold">−{usd(r.annual_saving)}</span></td>
              <td className="text-right">{r.already_sent ? <span className="text-[10px] font-bold text-emerald-600">sent ✓</span> : <span className="text-[10px] text-slate-400">pending</span>}</td></tr>))}</tbody></table></div>
      )}
      {sample && (
        <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden" data-testid="price-alert-sample">
          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 text-xs"><span>Preview → {sample.to}</span><button onClick={() => setSample(null)} className="text-slate-400 hover:text-slate-800">close</button></div>
          <iframe title="price alert preview" srcDoc={`<body style="background:#fff;margin:16px">${sample.html}</body>`} className="w-full h-[520px]" style={{ background: "#fff" }} />
        </div>
      )}
    </div>
  );
}

// HQ → Billing: Mira's monthly competitor price check.
export function CompetitorWatchCard() {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get("/super-admin/competitor-watch").then(r => setD(r.data)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  if (!d) return null;
  const run = async () => {
    setBusy(true);
    try { const { data } = await api.post("/super-admin/competitor-watch/run"); setD(data); toast.success("Competitor prices re-checked"); }
    catch (e) { toast.error(e.response?.data?.detail || "Check failed"); } finally { setBusy(false); }
  };
  const v = d.verdicts || {};
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5" data-testid="competitor-watch-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">US price benchmark · monthly</div>
          <h3 className="font-semibold text-slate-800">Competitor price watch</h3>
          <p className="text-xs text-slate-500 mt-1">Mira re-checks Fresha, Vagaro, GlossGenius, Square and Toast on the 1st of every month and flags when we're no longer the cheapest.</p>
        </div>
        <button onClick={run} disabled={busy} data-testid="competitor-watch-run" className="btn-slate !h-9 !px-3 text-xs inline-flex items-center gap-1.5">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Re-check now</button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 mt-4">
        {["salon", "restaurant"].map(seg => { const x = v[seg]; return (
          <div key={seg} data-testid={`competitor-verdict-${seg}`} className={`rounded-xl border p-3 ${!x ? "border-slate-200 bg-slate-50" : x.cheapest ? "border-emerald-300 bg-emerald-50" : "border-rose-300 bg-rose-50"}`}>
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{seg === "salon" ? "Salons · Starter" : "Restaurants · Monthly"}</div>
            {!x ? <div className="text-xs text-slate-500 mt-1">Not checked yet</div> : (
              <div className="mt-1 text-sm font-semibold flex items-center gap-1.5">{x.cheapest ? <ShieldCheck className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
                Ours {usd(x.our_monthly)}/mo {x.cheapest ? `· cheapest (${x.closest_rival} ${usd(x.rival_monthly)})` : `· undercut by ${x.closest_rival} at ${usd(x.rival_monthly)}`}</div>)}
          </div>); })}
      </div>
      <table className="luxe-table-light w-full text-xs mt-3"><thead><tr><th>Competitor</th><th>Segment</th><th className="text-right">Lowest monthly</th><th>Source</th></tr></thead>
        <tbody>{(d.rows || []).map(r => (
          <tr key={r.name} data-testid={`competitor-row-${r.name.replace(/\s+/g, "-").toLowerCase()}`}><td className="font-semibold"><a href={r.url} target="_blank" rel="noreferrer" className="hover:underline">{r.name}</a></td><td className="capitalize">{r.segment}</td>
            <td className="text-right font-semibold">{usd(r.lowest_monthly ?? r.benchmark)}</td><td className="text-[10px] text-slate-500">{r.source === "live" ? "live page" : r.checked_at ? "benchmark (page unreadable)" : "benchmark · Oct 2026"}</td></tr>))}</tbody></table>
      <div className="text-[10px] text-slate-400 mt-2" data-testid="competitor-watch-ran">{d.ran_at ? `Last checked ${new Date(d.ran_at).toLocaleString()}` : "Runs automatically on the 1st of each month"}</div>
    </div>
  );
}
