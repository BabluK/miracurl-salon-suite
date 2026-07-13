import { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { X, Wallet, Plus, Trash2, IndianRupee } from "lucide-react";

export const WalletDialog = ({ customer, onClose, onChanged }) => {
  const [data, setData] = useState(null);
  const [plans, setPlans] = useState([]);
  const [method, setMethod] = useState("cash");
  const [busy, setBusy] = useState(false);
  const [newPlan, setNewPlan] = useState({ label: "", pay_amount: "", credit_amount: "" });
  const [showPlanForm, setShowPlanForm] = useState(false);

  const load = useCallback(() => {
    api.get(`/wallet/customer/${customer.id}`).then(r => setData(r.data)).catch(() => {});
    api.get("/wallet/plans").then(r => setPlans(r.data)).catch(() => {});
  }, [customer.id]);
  useEffect(() => { load(); }, [load]);

  const topup = async (planId) => {
    setBusy(true);
    try {
      const { data: res } = await api.post("/wallet/topup", { customer_id: customer.id, plan_id: planId, method });
      toast.success(`₹${res.txn.credit} credit added — balance ₹${res.wallet_balance}`);
      load(); onChanged?.();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Top-up failed"); }
    finally { setBusy(false); }
  };

  const addPlan = async (e) => {
    e.preventDefault();
    try {
      await api.post("/wallet/plans", {
        label: newPlan.label || `Pay ₹${newPlan.pay_amount} get ₹${newPlan.credit_amount}`,
        pay_amount: Number(newPlan.pay_amount), credit_amount: Number(newPlan.credit_amount),
      });
      toast.success("Wallet plan added");
      setNewPlan({ label: "", pay_amount: "", credit_amount: "" }); setShowPlanForm(false); load();
    } catch (e2) { toast.error(formatApiError(e2.response?.data?.detail) || "Couldn't add plan"); }
  };

  const removePlan = async (pid) => {
    if (!window.confirm("Delete this wallet plan?")) return;
    try { await api.delete(`/wallet/plans/${pid}`); load(); } catch { toast.error("Delete failed"); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card-light w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid="wallet-dialog">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-600" />
            <h3 className="font-playfair text-2xl">{customer.name}&apos;s Wallet</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
          <span className="text-sm text-emerald-800 font-medium">Current balance</span>
          <span className="font-playfair text-3xl text-emerald-700" data-testid="wallet-balance-value">₹{(data?.balance ?? 0).toLocaleString("en-IN")}</span>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <div className="label-light">Top-up plans</div>
            <div className="flex items-center gap-2">
              <select value={method} onChange={e => setMethod(e.target.value)} className="input-light !w-auto text-xs py-1.5" data-testid="wallet-method-select">
                <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option>
              </select>
              <button onClick={() => setShowPlanForm(v => !v)} className="text-xs text-sky-600 font-semibold inline-flex items-center gap-1" data-testid="wallet-add-plan-toggle">
                <Plus className="w-3 h-3" /> New plan
              </button>
            </div>
          </div>

          {showPlanForm && (
            <form onSubmit={addPlan} className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3 grid grid-cols-3 gap-2">
              <input required type="number" min="1" placeholder="Pay ₹" className="input-light text-sm" value={newPlan.pay_amount} onChange={e => setNewPlan({ ...newPlan, pay_amount: e.target.value })} data-testid="wallet-plan-pay-input" />
              <input required type="number" min="1" placeholder="Get ₹ credit" className="input-light text-sm" value={newPlan.credit_amount} onChange={e => setNewPlan({ ...newPlan, credit_amount: e.target.value })} data-testid="wallet-plan-credit-input" />
              <button type="submit" className="btn-blue text-xs" data-testid="wallet-plan-save-btn">Save plan</button>
            </form>
          )}

          <div className="space-y-2">
            {plans.map(p => (
              <div key={p.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3" data-testid={`wallet-plan-${p.id}`}>
                <div className="flex-1">
                  <div className="text-sm font-semibold">{p.label}</div>
                  <div className="text-xs text-slate-500">Pay ₹{p.pay_amount.toLocaleString("en-IN")} → get <b className="text-emerald-600">₹{p.credit_amount.toLocaleString("en-IN")}</b> credit
                    <span className="ml-1 text-emerald-600">(+₹{(p.credit_amount - p.pay_amount).toLocaleString("en-IN")} free)</span></div>
                </div>
                <button disabled={busy} onClick={() => topup(p.id)} className="btn-blue text-xs px-3 py-1.5" data-testid={`wallet-topup-${p.id}`}>Top up</button>
                <button onClick={() => removePlan(p.id)} className="p-1.5 text-slate-300 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            {plans.length === 0 && !showPlanForm && (
              <p className="text-xs text-slate-400 text-center py-3">No wallet plans yet — click &ldquo;New plan&rdquo; to create one (e.g., pay ₹5,000 get ₹6,000).</p>
            )}
          </div>
        </div>

        {data?.txns?.length > 0 && (
          <div className="mt-5">
            <div className="label-light mb-2">Recent activity</div>
            <div className="space-y-1.5 max-h-44 overflow-y-auto">
              {data.txns.map(tx => (
                <div key={tx.id} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-2">
                  <span className="text-slate-600">{tx.label}{tx.method ? ` · ${tx.method}` : ""}</span>
                  <span className={`font-semibold inline-flex items-center ${tx.credit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    <IndianRupee className="w-3 h-3" />{Math.abs(tx.credit).toLocaleString("en-IN")}{tx.credit >= 0 ? " added" : " used"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="text-[10px] text-slate-400 mt-4">Redeem at POS — choose &ldquo;Salon Wallet&rdquo; as the payment method while billing.</p>
      </div>
    </div>
  );
};
