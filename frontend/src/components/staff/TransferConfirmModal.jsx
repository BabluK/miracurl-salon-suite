import { createPortal } from "react-dom";
import { ArrowRight, Store, CalendarDays, Loader2, ArrowRightLeft, Undo2 } from "lucide-react";

const fmtDate = (d) => {
  try { return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return d; }
};

export function TransferConfirmModal({ staff, fromName, toName, mode, fromDate, toDate, busy, onCancel, onConfirm }) {
  const temp = mode === "temporary";
  const oneDay = temp && fromDate === toDate;
  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()} data-testid="transfer-confirm-modal">
        <div className={`px-6 pt-6 pb-5 text-white ${temp ? "bg-gradient-to-r from-sky-600 to-cyan-500" : "bg-gradient-to-r from-fuchsia-600 to-purple-600"}`}>
          <div className="text-[10px] uppercase tracking-[0.25em] font-semibold text-white/80">
            {temp ? "Temporary transfer" : "Permanent transfer"}
          </div>
          <div className="flex items-center gap-3 mt-3">
            <img src={staff?.image_url || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300"}
              alt="" className="w-12 h-12 rounded-full object-cover border-2 border-white/60" />
            <div>
              <div className="text-lg font-semibold leading-tight">{staff?.name || "Staff member"}</div>
              <div className="text-xs text-white/80">{staff?.role || ""}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 bg-white/15 border border-white/25 rounded-xl px-3 py-2.5">
            <Store className="w-4 h-4 shrink-0" />
            <span className="text-xs font-medium truncate max-w-[38%]">{fromName}</span>
            <ArrowRight className="w-4 h-4 shrink-0 text-white/80" />
            <span className="text-xs font-semibold truncate flex-1">{toName}</span>
          </div>
          {temp && (
            <div className="inline-flex items-center gap-1.5 mt-3 text-xs bg-white/15 border border-white/25 rounded-full px-3 py-1.5" data-testid="transfer-dates-chip">
              <CalendarDays className="w-3.5 h-3.5" />
              {oneDay ? <>Just <b>{fmtDate(fromDate)}</b> (1 day)</> : <><b>{fmtDate(fromDate)}</b>&nbsp;→&nbsp;<b>{fmtDate(toDate)}</b></>}
            </div>
          )}
        </div>

        <div className="px-6 py-5">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2.5">What happens</div>
          <ul className="space-y-2 text-[13px] text-slate-700">
            {temp ? (
              <>
                <li className="flex gap-2"><span>💼</span><span>Works fully at <b>{toName}</b> — bill portal, staff portal login & GPS check-in there</span></li>
                <li className="flex gap-2"><span>🏠</span><span>Shows at {fromName} with an <b>&ldquo;On duty at {toName}&rdquo;</b> badge — not billable here meanwhile</span></li>
                <li className="flex gap-2"><Undo2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600" /><span><b>Returns automatically</b> after {fmtDate(toDate)} — no manual step needed</span></li>
              </>
            ) : (
              <>
                <li className="flex gap-2"><span>💼</span><span>Full profile, portal login & booking visibility move to <b>{toName}</b></span></li>
                <li className="flex gap-2"><span>🚫</span><span>No longer appears in {fromName}&apos;s booking portal or staff list</span></li>
                <li className="flex gap-2"><span>📚</span><span>Billing & attendance history stays with {fromName}</span></li>
              </>
            )}
          </ul>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button data-testid="transfer-confirm-cancel" onClick={onCancel} disabled={busy}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 font-medium">
            Cancel
          </button>
          <button data-testid="transfer-confirm-btn" onClick={onConfirm} disabled={busy}
            className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 ${
              temp ? "bg-sky-600 hover:bg-sky-700" : "bg-fuchsia-600 hover:bg-fuchsia-700"}`}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
            {temp ? "Send temporarily" : "Transfer permanently"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
