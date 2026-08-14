import { AlertTriangle } from "lucide-react";

export function DuplicateBillModal({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid="pos-duplicate-bill-modal">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-7 text-center animate-fade-up">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-red-100 border border-red-300 flex items-center justify-center mb-4">
          <AlertTriangle className="w-7 h-7 text-red-600" />
        </div>
        <h2 className="font-playfair text-2xl text-slate-900" data-testid="duplicate-bill-title">Possible duplicate bill</h2>
        <p className="text-sm text-slate-600 mt-3 leading-relaxed" data-testid="duplicate-bill-message">{message}</p>
        <p className="text-xs text-slate-400 mt-2">Are you sure you want to create this bill again?</p>
        <div className="flex gap-3 mt-6">
          <button
            data-testid="duplicate-bill-cancel-btn"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-200 transition"
          >
            Cancel
          </button>
          <button
            data-testid="duplicate-bill-confirm-btn"
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold text-sm hover:bg-red-600 shadow-md transition"
          >
            Yes, bill again
          </button>
        </div>
      </div>
    </div>
  );
}
