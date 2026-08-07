import { ClipboardList } from "lucide-react";

export function PendingBillModal({ info, sym = "₹", onContinue, onDiscard }) {
  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid="pos-pending-bill-modal">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-7 text-center animate-fade-up">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center mb-4">
          <ClipboardList className="w-7 h-7 text-amber-600" />
        </div>
        <h2 className="font-playfair text-2xl text-slate-900" data-testid="pending-bill-title">Pending bill</h2>
        <p className="text-sm text-slate-500 mt-2" data-testid="pending-bill-message">
          You have an unfinished bill with <b className="text-slate-800">{info.items} item{info.items === 1 ? "" : "s"}</b> worth{" "}
          <b className="text-slate-800">{sym}{Number(info.total).toLocaleString("en-IN")}</b>.
          <br />Continue where you left off, or discard it and start fresh.
        </p>
        <button onClick={onContinue} data-testid="pending-bill-continue-btn"
          className="mt-5 w-full bg-slate-900 text-white font-semibold py-3 rounded-xl hover:bg-slate-800 transition">
          Continue this bill
        </button>
        <button onClick={onDiscard} data-testid="pending-bill-discard-btn"
          className="mt-2.5 w-full border border-rose-200 text-rose-600 font-semibold py-2.5 rounded-xl hover:bg-rose-50 transition">
          Discard & start new
        </button>
      </div>
    </div>
  );
}
