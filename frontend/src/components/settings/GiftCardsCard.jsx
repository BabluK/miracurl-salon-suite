import { useEffect, useState, useCallback } from "react";
import { Gift, Loader2, Copy, History, X } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
import { confirmAsync, promptAsync } from "@/components/ConfirmDialog";

const monthLabel = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short" });

const STATUS_STYLE = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  scheduled: "bg-sky-50 text-sky-700 border-sky-200",
  awaiting_confirmation: "bg-amber-50 text-amber-700 border-amber-300",
  redeemed: "bg-slate-100 text-slate-500 border-slate-200",
  expired: "bg-rose-50 text-rose-600 border-rose-200",
  cancelled: "bg-slate-100 text-slate-400 border-slate-200",
};

export const GiftCardsCard = () => {
  const [s, setS] = useState(null);
  const [list, setList] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [analytics, setAnalytics] = useState(null);
  const [hist, setHist] = useState(null); // null | "loading" | {card, history}

  const openHistory = async (gc) => {
    setHist("loading");
    try {
      const { data } = await api.get(`/gift-cards/${gc.id}/history`);
      setHist(data);
    } catch { toast.error("Couldn't load the card history"); setHist(null); }
  };

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([api.get("/gift-cards/settings"), api.get("/gift-cards"), api.get("/tenants/current")]);
    setS(a.data);
    setList(b.data);
    setTenant(c.data);
    api.get("/gift-cards/analytics").then(r => setAnalytics(r.data)).catch(() => {});
  }, []);

  async function deleteHistory() {
    if (!await confirmAsync("Clear all finished gift cards (cancelled, expired, fully redeemed)? Active cards stay. This can't be undone.")) return;
    const doDelete = async (pin) => api.post("/gift-cards/delete-history", { pin });
    try {
      const { data } = await doDelete("");
      toast.success(`Cleared ${data.deleted} finished gift card(s)`);
      load();
    } catch (e) {
      if (e.response?.status === 403) {
        const pin = await promptAsync("Enter your Owner PIN to clear gift card history:") || "";
        if (!pin) return;
        try {
          const { data } = await doDelete(pin);
          toast.success(`Cleared ${data.deleted} finished gift card(s)`);
          load();
        } catch (e2) { toast.error(e2.response?.data?.detail || "Incorrect Owner PIN"); }
      } else { toast.error(e.response?.data?.detail || "Couldn't clear history"); }
    }
  }
  useEffect(() => { load().catch(() => {}); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/gift-cards/settings", { ...s, amounts: s.amounts });
      toast.success("Gift card settings saved ✦");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't save"); }
    finally { setSaving(false); }
  };

  const confirm = async (gc) => {
    if (!await confirmAsync(`Confirm you received ₹${gc.amount} from ${gc.buyer_name}? The gift card will be emailed to ${gc.recipient_email}.`)) return;
    setBusyId(gc.id);
    try {
      const { data } = await api.post(`/gift-cards/${gc.id}/confirm`);
      toast.success(`Gift card ${data.code || ""} issued & emailed 🎁`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't confirm"); }
    finally { setBusyId(""); }
  };

  const cancel = async (gc) => {
    if (!await confirmAsync(`Cancel this ₹${gc.amount} gift card order?`)) return;
    setBusyId(gc.id);
    try { await api.post(`/gift-cards/${gc.id}/cancel`); toast.success("Cancelled"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Couldn't cancel"); }
    finally { setBusyId(""); }
  };

  if (!s) return null;
  const giftUrl = `${window.location.origin}/gift/${tenant?.slug || ""}`;
  const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fuchsia-400";

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 mt-6" data-testid="gift-cards-card">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-fuchsia-500 to-amber-500 flex items-center justify-center"><Gift className="w-5 h-5 text-white" /></div>
          <div>
            <h3 className="font-bold text-slate-800">Gift Cards 🎁</h3>
            <p className="text-[11px] text-slate-500">Customers buy occasion gift cards online — redeemed at your POS</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={s.enabled} onChange={(e) => setS(v => ({ ...v, enabled: e.target.checked }))} data-testid="gift-settings-enabled" className="accent-fuchsia-500 w-4 h-4" />
          Enabled
        </label>
      </div>

      <div className="mt-3 flex items-center gap-2 bg-fuchsia-50 border border-fuchsia-100 rounded-lg px-3 py-2">
        <span className="text-[11px] text-fuchsia-700 font-mono truncate" data-testid="gift-page-url">{giftUrl}</span>
        <button onClick={() => { navigator.clipboard.writeText(giftUrl); toast.success("Gift page link copied"); }} data-testid="gift-url-copy"
          className="ml-auto text-fuchsia-600 hover:text-fuchsia-800"><Copy className="w-3.5 h-3.5" /></button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mt-4">
        <div>
          <label className="text-[11px] font-semibold text-slate-500">Your Razorpay Key ID {s.hq_gateway && !s.razorpay_key_id && <span className="text-emerald-600">(using Miracurl gateway ✓)</span>}</label>
          <input value={s.razorpay_key_id} onChange={(e) => setS(v => ({ ...v, razorpay_key_id: e.target.value }))} placeholder="rzp_live_…" data-testid="gift-settings-rzp-id" className={inputCls} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-slate-500">Razorpay Key Secret</label>
          <input type="password" value={s.razorpay_key_secret} onChange={(e) => setS(v => ({ ...v, razorpay_key_secret: e.target.value }))} placeholder="secret" data-testid="gift-settings-rzp-secret" className={inputCls} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-slate-500">Company UPI ID (GPay / PhonePe / any UPI)</label>
          <input value={s.upi_id} onChange={(e) => setS(v => ({ ...v, upi_id: e.target.value }))} placeholder="yoursalon@okhdfcbank" data-testid="gift-settings-upi" className={inputCls} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-slate-500">Validity</label>
          <select value={s.validity_days} onChange={(e) => setS(v => ({ ...v, validity_days: Number(e.target.value) }))} data-testid="gift-settings-validity" className={inputCls}>
            {[[15, "15 days"], [30, "1 month"], [90, "3 months"], [180, "6 months (recommended)"], [365, "1 year"]].map(([d, l]) => <option key={d} value={d}>{l}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="text-[11px] font-semibold text-slate-500">Preset amounts (comma separated ₹)</label>
          <input value={(s.amounts || []).join(", ")} onChange={(e) => setS(v => ({ ...v, amounts: e.target.value.split(",").map(x => Number(x.trim())).filter(Boolean) }))}
            data-testid="gift-settings-amounts" className={inputCls} />
        </div>
        <label className="sm:col-span-2 flex items-center gap-2 text-xs text-slate-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 cursor-pointer">
          <input type="checkbox" checked={s.occasion_campaigns !== false} onChange={(e) => setS(v => ({ ...v, occasion_campaigns: e.target.checked }))}
            data-testid="gift-settings-campaigns" className="accent-amber-500 w-4 h-4" />
          <span><b>Occasion auto-promotion</b> — 7 days before Diwali, Valentine's, Mother's/Father's Day, Christmas &amp; New Year, email your customer list a themed "send a gift card" invite (once per occasion)</span>
        </label>
      </div>
      {!s.payment_ready && !s.razorpay_key_id && !s.upi_id && (
        <p className="text-[11px] text-amber-600 mt-2" data-testid="gift-payment-warning">⚠ Add your Razorpay keys OR your UPI ID so customers can pay you.</p>
      )}
      <button onClick={save} disabled={saving} data-testid="gift-settings-save"
        className="mt-3 bg-slate-900 text-white text-xs font-bold rounded-lg px-5 py-2.5 hover:bg-slate-700 disabled:opacity-50">
        {saving ? "Saving…" : "Save gift card settings"}
      </button>

      {analytics && analytics.months.some(m => m.sold_amount || m.redeemed_amount) && (
        <div className="mt-5 border-t border-slate-100 pt-4" data-testid="gift-analytics">
          <h4 className="text-xs font-bold text-slate-600 mb-2">📊 Last 6 months — sales vs redemptions (₹)</h4>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.months.map(m => ({ ...m, name: monthLabel(m.month) }))} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v, n) => [`₹${v}`, n === "sold_amount" ? "Sold" : "Redeemed"]} labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 11, borderRadius: 10 }} />
                <Legend formatter={(v) => <span style={{ fontSize: 10 }}>{v === "sold_amount" ? "Sold ₹" : "Redeemed ₹"}</span>} />
                <Bar dataKey="sold_amount" fill="#d946ef" radius={[4, 4, 0, 0]} />
                <Bar dataKey="redeemed_amount" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {analytics.expiring.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5 items-center" data-testid="gift-expiring">
              <span className="text-[11px] font-semibold text-slate-500">⏳ Balances expiring:</span>
              {analytics.expiring.map(e => (
                <span key={e.month} className="text-[10px] px-2 py-1 rounded-full bg-rose-50 border border-rose-100 text-rose-600 font-semibold">
                  {monthLabel(e.month)} · ₹{e.balance}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {list && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap gap-4 text-xs text-slate-600 mb-3" data-testid="gift-stats">
            <span>🎁 Sold: <b>{list.stats.sold}</b></span>
            <span>💰 Revenue: <b>₹{list.stats.revenue}</b></span>
            <span>🪙 Unredeemed balance: <b>₹{list.stats.outstanding}</b></span>
            {list.stats.awaiting > 0 && <span className="text-amber-600 font-bold">⏳ {list.stats.awaiting} awaiting your payment confirmation</span>}
            <button onClick={deleteHistory} data-testid="gift-delete-history-btn"
              className="ml-auto text-[11px] font-bold text-rose-600 hover:text-rose-800 border border-rose-200 bg-rose-50 rounded-full px-3 py-1">
              🗑 Clear finished history
            </button>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {list.items.length === 0 && <p className="text-xs text-slate-400">No gift cards yet — share your gift page link above 💛</p>}
            {list.items.map((gc) => (
              <div key={gc.id} className="flex items-center gap-3 border border-slate-100 rounded-xl px-3 py-2" data-testid={`gift-row-${gc.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-700 truncate">
                    ₹{gc.amount} · {gc.occasion} · {gc.buyer_name} → {gc.recipient_name}
                    {gc.code && <span className="font-mono text-fuchsia-600 ml-2">{gc.code}</span>}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {gc.recipient_email} · {gc.pay_method === "upi" ? `UPI${gc.upi_ref ? ` ref ${gc.upi_ref}` : ""}` : "Razorpay"} · bal ₹{gc.balance}
                    {gc.expires_at ? ` · till ${gc.expires_at}` : ""}
                  </div>
                </div>
                <span className={`text-[9px] uppercase font-bold px-2 py-1 rounded-full border ${STATUS_STYLE[gc.status] || STATUS_STYLE.cancelled}`}>
                  {gc.status.replace("_", " ")}
                </span>
                {gc.payment_proof_url && (
                  <a href={`${process.env.REACT_APP_BACKEND_URL}${gc.payment_proof_url}`} target="_blank" rel="noreferrer"
                    data-testid={`gift-proof-${gc.id}`} title="Open full payment screenshot"
                    className="block border border-sky-200 rounded-lg overflow-hidden hover:border-sky-400 transition">
                    <img src={`${process.env.REACT_APP_BACKEND_URL}${gc.payment_proof_url}`} alt="Payment proof"
                      className="w-12 h-16 object-cover" loading="lazy" />
                    <span className="block text-[8px] text-center font-bold text-sky-600 bg-sky-50 py-0.5">📎 PROOF</span>
                  </a>
                )}
                {gc.status === "awaiting_confirmation" && (
                  <button onClick={() => confirm(gc)} disabled={busyId === gc.id} data-testid={`gift-confirm-${gc.id}`}
                    className="bg-emerald-500 text-white text-[10px] font-bold rounded-lg px-2.5 py-1.5 hover:bg-emerald-600 disabled:opacity-50">
                    {busyId === gc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "✓ Money received — send card"}
                  </button>
                )}
                {gc.code && (
                  <button onClick={() => openHistory(gc)} data-testid={`gift-history-${gc.id}`} title="Full redemption history"
                    className="text-[10px] text-sky-600 hover:text-sky-800 font-semibold inline-flex items-center gap-1 border border-sky-200 bg-sky-50 rounded-full px-2 py-1">
                    <History className="w-3 h-3" /> History
                  </button>
                )}
                {["awaiting_confirmation", "active", "scheduled"].includes(gc.status) && (
                  <button onClick={() => cancel(gc)} disabled={busyId === gc.id} data-testid={`gift-cancel-${gc.id}`}
                    className="text-[10px] text-rose-500 hover:text-rose-700 font-semibold">Cancel</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {hist && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" data-testid="gift-history-modal" onClick={() => setHist(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {hist === "loading" ? (
              <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 text-gold animate-spin" /></div>
            ) : (
              <>
                <div className="bg-gradient-to-r from-amber-400 to-yellow-600 px-5 py-4 flex items-center justify-between">
                  <div className="text-black">
                    <div className="font-bold text-sm font-mono">{hist.card.code}</div>
                    <div className="text-[11px] opacity-80">
                      ₹{hist.card.amount} · {hist.card.occasion} · {hist.card.buyer_name} → {hist.card.recipient_name}
                    </div>
                  </div>
                  <button onClick={() => setHist(null)} className="text-black/60 hover:text-black" data-testid="gift-history-close"><X className="w-5 h-5" /></button>
                </div>
                <div className="px-5 py-4">
                  <div className="grid grid-cols-3 gap-2 text-center mb-4">
                    {[["Taken on", hist.card.purchased_on || "—"], ["Balance", `₹${hist.card.balance}`], ["Valid till", hist.card.expires_at || "—"]].map(([l, v]) => (
                      <div key={l} className="bg-slate-50 rounded-xl py-2.5">
                        <div className="text-[10px] uppercase tracking-wider text-slate-400">{l}</div>
                        <div className="text-sm font-bold text-slate-800 mt-0.5">{v}</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">Redemption history</div>
                  {hist.history.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4 text-center" data-testid="gift-history-empty">Never redeemed yet — full ₹{hist.card.balance} available.</p>
                  ) : (
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-100" data-testid="gift-history-rows">
                      {hist.history.map((h, i) => (
                        <div key={i} className="py-2.5 flex items-center justify-between gap-3" data-testid={`gift-history-row-${i}`}>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-700">
                              {h.at ? new Date(h.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                              {h.invoice_no && <span className="font-mono text-sky-600 ml-2">{h.invoice_no}</span>}
                            </div>
                            {h.customer_name && <div className="text-[10px] text-slate-400 truncate">Guest: {h.customer_name}</div>}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-bold text-rose-600">−₹{Number(h.amount).toFixed(0)}</div>
                            <div className="text-[10px] text-slate-400">bal ₹{Number(h.balance_after).toFixed(0)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
