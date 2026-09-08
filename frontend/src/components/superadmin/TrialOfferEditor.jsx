import { useEffect, useState } from "react";
import { Gift, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

const inp = "px-3 py-2 rounded-lg border border-emerald-300 text-sm text-slate-800 bg-white text-center font-bold";

export function TrialOfferEditor() {
  const [o, setO] = useState(null);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState(null);
  const [range, setRange] = useState(90);
  useEffect(() => { api.get("/super-admin/trial-offer").then(r => { setO(r.data); setSaved(r.data); }).catch(() => {}); }, []);
  useEffect(() => { api.get(`/super-admin/trial-offer/stats?days=${range}`).then(r => setStats(r.data)).catch(() => {}); }, [range]);
  if (!o) return null;
  const set = (k, v) => setO(x => ({ ...x, [k]: v }));
  const dirty = JSON.stringify(o) !== JSON.stringify(saved);
  async function save() {
    setBusy(true);
    try {
      const { data } = await api.put("/super-admin/trial-offer", o);
      setO(data); setSaved(data);
      toast.success(data.enabled ? `Trial upgrade offer saved — ${data.kind === "flat" ? `₹${data.flat}` : `${data.percent}%`} off, valid ${data.valid_hours}h ✦` : "Trial upgrade offer turned off");
    } catch (e) { toast.error(e.response?.data?.detail?.[0]?.msg || e.response?.data?.detail || "Couldn't save"); }
    finally { setBusy(false); }
  }
  return (
    <div className="mt-3 rounded-xl bg-emerald-50/70 border border-emerald-200 px-4 py-3" data-testid="trial-offer-editor">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5"><Gift className="w-4 h-4 text-emerald-600" /> Trial upgrade offer (final-day nudge)</p>
          <p className="text-[11px] text-slate-500">A limited-time discount baked into the one-tap pay link of the last trial-ending email — email only, no dashboard banner.</p>
        </div>
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
          <input type="checkbox" checked={!!o.enabled} onChange={e => set("enabled", e.target.checked)} data-testid="trial-offer-enabled" className="accent-emerald-600 w-4 h-4" /> Enabled
        </label>
      </div>
      <div className={`mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600 ${o.enabled ? "" : "opacity-50"}`}>
        <select value={o.kind} onChange={e => set("kind", e.target.value)} data-testid="trial-offer-kind" className={`${inp} text-slate-800 [&_option]:bg-white [&_option]:text-slate-800`}>
          <option value="percent">% off</option><option value="flat">Flat ₹ off</option>
        </select>
        {o.kind === "percent"
          ? <><input type="number" min={1} max={50} value={o.percent} onChange={e => set("percent", Number(e.target.value))} data-testid="trial-offer-percent" className={`w-20 ${inp}`} /><span>% off the plan</span></>
          : <><span>₹</span><input type="number" min={100} max={20000} step={100} value={o.flat} onChange={e => set("flat", Number(e.target.value))} data-testid="trial-offer-flat" className={`w-24 ${inp}`} /><span>off the plan</span></>}
        <span className="mx-1 text-slate-300">|</span>
        <span>valid for</span>
        <select value={o.valid_hours} onChange={e => set("valid_hours", Number(e.target.value))} data-testid="trial-offer-valid" className={`${inp} text-slate-800 [&_option]:bg-white [&_option]:text-slate-800`}>
          <option value={24}>24 hours</option><option value={48}>48 hours</option><option value={72}>72 hours</option><option value={168}>7 days</option>
        </select>
        <span className="mx-1 text-slate-300">|</span>
        <span>on nudges sent</span>
        <select value={o.max_days} onChange={e => set("max_days", Number(e.target.value))} data-testid="trial-offer-maxdays" className={`${inp} text-slate-800 [&_option]:bg-white [&_option]:text-slate-800`}>
          <option value={1}>≤ 1 day before end</option><option value={7}>≤ 7 days before end</option><option value={15}>every nudge (15/7/1)</option>
        </select>
        <button onClick={save} disabled={busy || !dirty} data-testid="trial-offer-save-btn"
          className="ml-auto px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-40">{busy ? "Saving…" : "Save"}</button>
      </div>
      {stats && <OfferStats stats={stats} range={range} setRange={setRange} />}
    </div>
  );
}


function Funnel({ title, b, tone, testid }) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${tone}`} data-testid={testid}>
      <div className="text-[10px] uppercase tracking-wider font-semibold opacity-70">{title}</div>
      <div className="mt-1 flex items-baseline gap-1.5"><span className="text-xl font-bold">{b.conv_pct}%</span><span className="text-[11px] opacity-70">converted</span></div>
      <div className="text-[11px] mt-1 opacity-80">{b.sent} sent · {b.opened} opened ({b.open_pct}%) · <b>{b.paid} paid</b></div>
      <div className="text-[11px] opacity-80">₹{Number(b.revenue).toLocaleString("en-IN")} collected{b.discount_given ? ` · ₹${Number(b.discount_given).toLocaleString("en-IN")} discount given` : ""}</div>
    </div>
  );
}

function OfferStats({ stats, range, setRange }) {
  const lift = stats.offer.sent && stats.plain.sent ? stats.offer.conv_pct - stats.plain.conv_pct : null;
  return (
    <div className="mt-4 border-t border-emerald-200/70 pt-3" data-testid="trial-offer-stats">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> Nudge → upgrade conversion</div>
        {lift !== null && <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${lift >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`} data-testid="trial-offer-lift">{lift >= 0 ? "+" : ""}{lift} pts vs no-offer</span>}
        <div className="ml-auto flex gap-1">
          {[30, 90, 365].map(d => <button key={d} onClick={() => setRange(d)} data-testid={`trial-offer-range-${d}`} className={`px-2 py-1 rounded-md text-[11px] font-semibold ${range === d ? "bg-slate-800 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>{d === 365 ? "1y" : `${d}d`}</button>)}
        </div>
      </div>
      <div className="mt-2 grid sm:grid-cols-3 gap-2">
        <Funnel title="🎁 With offer (final nudge)" b={stats.offer} tone="bg-white border-emerald-200 text-slate-800" testid="trial-offer-funnel-offer" />
        <Funnel title="⏳ Plain nudges (15 / 7 day)" b={stats.plain} tone="bg-white border-slate-200 text-slate-800" testid="trial-offer-funnel-plain" />
        <Funnel title="All trial nudges" b={stats.all} tone="bg-slate-800 border-slate-800 text-white" testid="trial-offer-funnel-all" />
      </div>
      {stats.recent_paid?.length > 0 && (
        <div className="mt-2 text-[11px] text-slate-600 flex flex-wrap gap-x-3 gap-y-1" data-testid="trial-offer-recent-paid">
          <span className="font-semibold text-slate-500">Recent upgrades:</span>
          {stats.recent_paid.slice(0, 6).map((r, i) => <span key={i}>{r.salon_name} · ₹{Number(r.amount).toLocaleString("en-IN")}{r.discount ? " 🎁" : ""}</span>)}
        </div>
      )}
    </div>
  );
}
