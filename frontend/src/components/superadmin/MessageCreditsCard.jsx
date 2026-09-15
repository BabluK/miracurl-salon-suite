import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { MessageSquare, Send, Save, Loader2 } from "lucide-react";

const fmt = (n) => Number(n || 0).toLocaleString("en-IN");

function PoolRow({ label, d, testid }) {
  const pct = d.pool_total ? Math.min(100, Math.round((d.distributed / d.pool_total) * 100)) : 0;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid={testid}>
      <div className="flex items-center justify-between text-xs"><span className="font-semibold text-slate-800">{label}</span><span className="text-slate-500">{pct}% handed out</span></div>
      <div className="mt-2 h-1.5 rounded-full bg-slate-200 overflow-hidden"><div className="h-full bg-gradient-to-r from-[#C89B52] to-[#F0D9A5]" style={{ width: `${pct}%` }} /></div>
      <div className="grid grid-cols-4 gap-2 mt-2 text-[11px]">
        <div><div className="text-slate-500">Pool bought</div><div className="text-slate-800 font-bold">{fmt(d.pool_total)}</div></div>
        <div><div className="text-slate-500">Distributed</div><div className="text-slate-800 font-bold">{fmt(d.distributed)}</div></div>
        <div><div className="text-slate-500">Remaining</div><div className={`font-bold ${d.remaining < 500 ? "text-amber-600" : "text-emerald-600"}`}>{fmt(d.remaining)}</div></div>
        <div><div className="text-slate-500">Tenants hold</div><div className="text-slate-800 font-bold">{fmt(d.tenants_hold)}</div></div>
      </div>
      <div className="text-[10px] text-slate-500 mt-1">Sold online: {fmt(d.sold_points)} credits · ₹{fmt(d.sold_amount)}</div>
    </div>
  );
}

export function MessageCreditsCard({ tenants = [] }) {
  const [data, setData] = useState(null);
  const [pool, setPool] = useState({ sms_total: 0, wa_total: 0, note: "" });
  const [give, setGive] = useState({ tenant_id: "", channel: "whatsapp", points: 100 });
  const [busy, setBusy] = useState("");

  const load = () => api.get("/super-admin/message-pool").then(r => {
    setData(r.data);
    setPool({ sms_total: r.data.pool.sms.pool_total, wa_total: r.data.pool.whatsapp.pool_total, note: r.data.note || "" });
  }).catch(() => setData({ pool: { sms: {}, whatsapp: {} } }));
  useEffect(() => { load(); }, []);

  async function savePool() {
    setBusy("pool");
    try { const { data: d } = await api.put("/super-admin/message-pool", pool); setData(d); toast.success("Pool totals saved"); }
    catch (e) { toast.error(e.response?.data?.detail || "Save failed"); } finally { setBusy(""); }
  }
  async function distribute() {
    if (!give.tenant_id) { toast.info("Pick a tenant"); return; }
    setBusy("give");
    try {
      const { data: d } = await api.post(`/super-admin/tenants/${give.tenant_id}/sms-points?channel=${give.channel}`, { points: Number(give.points) });
      toast.success(`Credited — tenant now holds ${d.balance} ${give.channel === "sms" ? "SMS" : "WhatsApp"} credits`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Credit failed"); } finally { setBusy(""); }
  }

  if (!data) return null;
  const inp = "border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#d4af37]/50";
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white shadow-sm p-4" data-testid="message-credits-card">
      <div className="flex items-center gap-2 flex-wrap">
        <MessageSquare className="w-4 h-4 text-[#d4af37]" />
        <div className="text-sm font-bold text-slate-800">Message credits · SMS & WhatsApp</div>
        <span className="text-[11px] text-slate-500">Pool = what HQ bought from MSG91 / Meta · distribute to tenants · tenants can also buy packs (Razorpay → HQ gets an email)</span>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <PoolRow label="SMS (MSG91)" d={data.pool.sms} testid="pool-sms" />
        <PoolRow label="WhatsApp (Meta Cloud API)" d={data.pool.whatsapp} testid="pool-whatsapp" />
      </div>
      <div className="grid lg:grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 p-3 space-y-2">
          <div className="text-[11px] font-semibold text-slate-700">Update pool totals (after you recharge MSG91 / Meta)</div>
          <div className="flex gap-2 flex-wrap items-center">
            <label className="text-[10px] text-slate-500">SMS<input type="number" min="0" value={pool.sms_total} onChange={e => setPool({ ...pool, sms_total: Number(e.target.value) })} data-testid="pool-sms-input" className={`${inp} w-28 block`} /></label>
            <label className="text-[10px] text-slate-500">WhatsApp<input type="number" min="0" value={pool.wa_total} onChange={e => setPool({ ...pool, wa_total: Number(e.target.value) })} data-testid="pool-wa-input" className={`${inp} w-28 block`} /></label>
            <input value={pool.note} onChange={e => setPool({ ...pool, note: e.target.value })} placeholder="note e.g. MSG91 recharge 12 Sep" data-testid="pool-note-input" className={`${inp} flex-1 min-w-[140px] self-end`} />
            <button onClick={savePool} disabled={busy === "pool"} data-testid="pool-save-btn" className="self-end inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#d4af37] text-[#15151b] text-xs font-semibold disabled:opacity-50">
              {busy === "pool" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 p-3 space-y-2">
          <div className="text-[11px] font-semibold text-slate-700">Distribute credits to a tenant</div>
          <div className="flex gap-2 flex-wrap items-center">
            <select value={give.tenant_id} onChange={e => setGive({ ...give, tenant_id: e.target.value })} data-testid="give-tenant-select" className={`${inp} flex-1 min-w-[160px]`}>
              <option value="">Choose tenant…</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name} · SMS {t.sms_points || 0} · WA {t.wa_points || 0}</option>)}
            </select>
            <select value={give.channel} onChange={e => setGive({ ...give, channel: e.target.value })} data-testid="give-channel-select" className={inp}>
              <option value="whatsapp">WhatsApp</option><option value="sms">SMS</option>
            </select>
            <input type="number" min="1" value={give.points} onChange={e => setGive({ ...give, points: e.target.value })} data-testid="give-points-input" className={`${inp} w-24`} />
            <button onClick={distribute} disabled={busy === "give"} data-testid="give-submit-btn" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50">
              {busy === "give" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Credit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
