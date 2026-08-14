import { useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

/** Global confirm service: <ConfirmHost/> is mounted once in App.js.
 * Call askConfirm({ title, message, confirmLabel, danger, inputLabel, inputPlaceholder, defaultValue, action(value?) })
 * from anywhere — replaces window.confirm/window.prompt which are blocked in installed PWAs. */
let _globalSetAsk = null;

export function askConfirm(opts) {
  if (_globalSetAsk) _globalSetAsk(opts);
}

export function ConfirmHost() {
  const [ask, setAsk] = useState(null);
  _globalSetAsk = setAsk;
  if (!ask) return null;
  return (
    <ConfirmDialog open key={ask.title} title={ask.title} message={ask.message}
      confirmLabel={ask.confirmLabel} danger={ask.danger}
      inputLabel={ask.inputLabel} inputPlaceholder={ask.inputPlaceholder} defaultValue={ask.defaultValue}
      onConfirm={(v) => { const a = ask.action; setAsk(null); a(typeof v === "string" ? v.trim() : v); }}
      onClose={() => { const c = ask.onCancel; setAsk(null); if (c) c(); }} />
  );
}

/** Drop-in async replacement for window.confirm — resolves true/false. */
export function confirmAsync(message, opts = {}) {
  return new Promise((resolve) => {
    askConfirm({
      title: opts.title || "Please confirm", message,
      confirmLabel: opts.confirmLabel || "Confirm", danger: opts.danger,
      action: () => resolve(true), onCancel: () => resolve(false),
    });
  });
}

/** Drop-in async replacement for window.prompt — resolves the string, or null on cancel. */
export function promptAsync(message, defaultValue = "", opts = {}) {
  return new Promise((resolve) => {
    askConfirm({
      title: opts.title || "Input needed", message,
      inputLabel: opts.inputLabel || " ", inputPlaceholder: opts.inputPlaceholder || "",
      defaultValue: String(defaultValue ?? ""), confirmLabel: opts.confirmLabel || "OK",
      action: (v) => resolve(v ?? ""), onCancel: () => resolve(null),
    });
  });
}

export function ConfirmDialog({ open, title, message, inputLabel, inputPlaceholder = "", defaultValue = "",
  confirmLabel = "Confirm", danger = false, busy = false, onConfirm, onClose }) {
  const [note, setNote] = useState(defaultValue);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      data-testid="confirm-dialog" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-fade-up" onClick={e => e.stopPropagation()}>
        <div className={`px-5 py-4 flex items-center justify-between ${danger ? "bg-rose-600" : "bg-slate-900"}`}>
          <div className="flex items-center gap-2 text-white">
            {danger ? <AlertTriangle className="w-4 h-4 text-amber-300" /> : <CheckCircle2 className="w-4 h-4 text-emerald-300" />}
            <span className="font-bold text-sm" data-testid="confirm-dialog-title">{title}</span>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white" data-testid="confirm-dialog-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {message && <p className="text-sm text-slate-600" data-testid="confirm-dialog-message">{message}</p>}
          {inputLabel !== undefined && (
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">{inputLabel}</label>
              <input autoFocus value={note} onChange={e => setNote(e.target.value)} maxLength={200}
                placeholder={inputPlaceholder} data-testid="confirm-dialog-input"
                className="w-full mt-1 px-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-200"
                onKeyDown={e => { if (e.key === "Enter") onConfirm(note); }} />
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={onClose} data-testid="confirm-dialog-cancel"
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50">
              Cancel
            </button>
            <button onClick={() => onConfirm(note)} disabled={busy} data-testid="confirm-dialog-confirm"
              className={`px-5 py-2 text-xs font-bold rounded-xl text-white disabled:opacity-50 ${danger ? "bg-rose-600 hover:bg-rose-500" : "bg-slate-900 hover:bg-slate-700"}`}>
              {busy ? "Working…" : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
