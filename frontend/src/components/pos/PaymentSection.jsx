import { Receipt } from "lucide-react";
import { PAY_LABELS } from "@/components/pos/payLabels";

const PAYMENT_MODES = Object.entries(PAY_LABELS).map(([k, label]) => ({ k, label }));

export function PaymentSection({ orderNotes, setOrderNotes, payment, setPayment, onClear, onCheckout, walletBalance }) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 p-4">
          <label className="text-xs text-slate-500 uppercase tracking-wider font-medium">Add Order Instruction (Optional, Max 500 Characters)</label>
          <textarea
            data-testid="pos-order-notes"
            rows="3"
            maxLength={500}
            value={orderNotes}
            onChange={e => setOrderNotes(e.target.value)}
            className="mt-2 w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
            placeholder="Anything we should remember for this guest…"
          />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">Payment Details</div>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_MODES.map(p => (
              <button
                key={p.k}
                data-testid={`pos-pay-${p.k}`}
                onClick={() => setPayment(p.k)}
                className={`py-2 rounded-lg text-xs font-medium border transition ${
                  payment === p.k
                    ? "bg-sky-50 border-sky-400 text-sky-700"
                    : "bg-white border-slate-200 text-slate-600 hover:border-sky-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {payment === "salon_wallet" && (
            <div className="mt-2 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5" data-testid="pos-wallet-balance">
              Wallet balance: ₹{Number(walletBalance || 0).toLocaleString("en-IN")}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
        <button
          data-testid="pos-clear-btn"
          onClick={onClear}
          className="px-6 py-2.5 rounded-lg bg-sky-100 border border-sky-200 text-sky-700 font-medium text-sm hover:bg-sky-200 transition"
        >
          Clear
        </button>
        <button
          data-testid="pos-create-btn"
          onClick={() => onCheckout(false)}
          className="px-6 py-2.5 rounded-lg bg-sky-400 text-white font-medium text-sm hover:bg-sky-500 shadow-sm transition"
        >
          Create
        </button>
        <button
          data-testid="pos-create-complete-btn"
          onClick={() => onCheckout(true)}
          className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-sky-500 to-blue-500 text-white font-semibold text-sm hover:from-sky-600 hover:to-blue-600 shadow-md transition flex items-center gap-2"
        >
          <Receipt className="w-4 h-4" /> Create & Complete
        </button>
      </div>
    </>
  );
}
