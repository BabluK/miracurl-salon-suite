import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Tags, Save, TrendingUp } from "lucide-react";

const rs = (paise) => `₹${(paise / 100).toFixed(2)}`;

// Module-level (not inside the card) so inputs keep focus while typing.
const NumCell = ({ value, onChange, testid, min = 1 }) => (
  <input type="number" min={min} value={value} onChange={e => onChange(Number(e.target.value))} data-testid={testid}
    className="w-24 rounded-lg border border-slate-200 bg-white text-slate-900 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#b8860b]/40" />
);

const ChannelTable = ({ ch, rows, cost, floor, onCost, onRow }) => (
  <div className="rounded-xl border border-slate-200 overflow-hidden" data-testid={`pack-pricing-${ch}`}>
    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200 flex-wrap">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-700">{ch === "sms" ? "SMS (MSG91)" : "WhatsApp (Meta)"}</span>
      <label className="text-xs text-slate-600 inline-flex items-center gap-2">HQ cost / msg (paise)
        <NumCell value={cost} onChange={onCost} testid={`pack-cost-${ch}`} />
        <span className="text-slate-400">· floor +{floor}p</span>
      </label>
    </div>
    <table className="w-full text-xs">
      <thead><tr className="text-slate-500 text-left"><th className="px-3 py-1.5">Pack</th><th className="px-3 py-1.5 text-right">Messages</th><th className="px-3 py-1.5 text-right">Price ₹</th><th className="px-3 py-1.5 text-right">Tenant pays / msg</th><th className="px-3 py-1.5 text-right">HQ margin / msg</th><th className="px-3 py-1.5 text-right">Margin / pack</th></tr></thead>
      <tbody>
        {rows.map((r, i) => {
          const per = Math.round(r.price * 100 / r.points), m = per - cost;
          return (
            <tr key={r.key} className="border-t border-slate-100">
              <td className="px-3 py-1.5 font-medium text-slate-800">{r.label}</td>
              <td className="px-3 py-1.5 text-right"><NumCell value={r.points} onChange={v => onRow(i, { points: v })} testid={`pack-points-${r.key}`} /></td>
              <td className="px-3 py-1.5 text-right"><NumCell value={r.price} onChange={v => onRow(i, { price: v })} testid={`pack-price-${r.key}`} /></td>
              <td className="px-3 py-1.5 text-right text-slate-700">{rs(per)}</td>
              <td className={`px-3 py-1.5 text-right font-semibold ${m < floor ? "text-rose-600" : "text-emerald-700"}`} data-testid={`pack-margin-${r.key}`}>{m < 0 ? "−" : "+"}{rs(Math.abs(m))}{m < floor ? " ⚠" : ""}</td>
              <td className="px-3 py-1.5 text-right text-slate-700">₹{Math.round(m * r.points / 100).toLocaleString("en-IN")}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export const PackPricingCard = () => {
  const [p, setP] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/super-admin/pack-pricing").then(r => setP(r.data)).catch(() => toast.error("Couldn't load pack pricing")); }, []);
  if (!p) return null;
  const setRow = (ch) => (i, patch) => setP(x => ({ ...x, packs: { ...x.packs, [ch]: x.packs[ch].map((r, j) => (j === i ? { ...r, ...patch } : r)) } }));
  const save = async () => {
    setBusy(true);
    try {
      const body = { sms_cost_paise: p.sms_cost_paise, whatsapp_cost_paise: p.whatsapp_cost_paise,
        sms: p.packs.sms.map(({ key, label, price, points }) => ({ key, label, price, points })),
        whatsapp: p.packs.whatsapp.map(({ key, label, price, points }) => ({ key, label, price, points })) };
      const { data } = await api.put("/super-admin/pack-pricing", body); setP(data); toast.success("Pack pricing saved — tenants see the new prices instantly");
    } catch (e) { toast.error(e.response?.data?.detail || "Save failed"); }
    finally { setBusy(false); }
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5" data-testid="pack-pricing-card">
      <div className="flex items-center gap-2 mb-1"><Tags className="w-5 h-5 text-[#b8860b]" /><h3 className="font-semibold text-slate-900">Tenant Pack Prices & HQ Margin</h3></div>
      <p className="text-xs text-slate-500 mb-4">What salons pay per SMS / WhatsApp pack vs. what MSG91 / Meta charge HQ. Every pack must earn at least <b>+10p per SMS</b> and <b>+15p per WhatsApp</b> message — saving is blocked below that floor.</p>
      <div className="space-y-4">
        <ChannelTable ch="sms" rows={p.packs.sms} cost={p.sms_cost_paise} floor={p.min_margin_paise.sms} onCost={v => setP({ ...p, sms_cost_paise: v })} onRow={setRow("sms")} />
        <ChannelTable ch="whatsapp" rows={p.packs.whatsapp} cost={p.whatsapp_cost_paise} floor={p.min_margin_paise.whatsapp} onCost={v => setP({ ...p, whatsapp_cost_paise: v })} onRow={setRow("whatsapp")} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-slate-500 inline-flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> Tip: DLT SMS costs HQ ≈25p; Meta marketing WhatsApp ≈93p (utility ≈14p). Prices are GST-exclusive; GST is added at checkout.</p>
        <button onClick={save} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold disabled:opacity-60" data-testid="pack-pricing-save"><Save className="w-4 h-4" /> {busy ? "Saving…" : "Save prices"}</button>
      </div>
    </div>
  );
};
