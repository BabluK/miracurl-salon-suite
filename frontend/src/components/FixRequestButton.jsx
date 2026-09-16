import { useState } from "react";
import { useLocation } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { Wrench, X, Loader2, Send } from "lucide-react";

const TITLES = { "/dashboard": "Dashboard", "/appointments": "Appointments", "/customers": "CRM", "/pos": "POS / Billing", "/inventory": "Inventory", "/services": "Services", "/staff": "Staff", "/reports": "Reports", "/settings": "Settings", "/plans": "Plans & Memberships", "/reviews": "Reviews", "/attendance": "Attendance" };

export function FixRequestButton() {
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [issue, setIssue] = useState("");
  const [busy, setBusy] = useState(false);
  const page = loc.pathname;
  const title = TITLES[Object.keys(TITLES).find(k => page.startsWith(k))] || page;

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post("/support/fix-request", { issue, page, page_title: title });
      toast.success(`Ticket #${r.data.ticket_no} sent — Miracurl will fix it in your workspace and notify you`);
      setOpen(false); setIssue("");
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't send the request"); } finally { setBusy(false); }
  };

  return (
    <>
      <button data-testid="fix-request-btn" onClick={() => setOpen(true)} title="Ask Miracurl to fix this page for you"
        className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-[#d4af37]/40 text-[#d4af37] text-xs font-semibold hover:bg-[#d4af37]/10 transition-colors">
        <Wrench className="w-3.5 h-3.5" /> Ask Miracurl to fix this
      </button>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setOpen(false)} data-testid="fix-request-modal">
          <div className="relative w-full max-w-lg rounded-3xl bg-white shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <button onClick={() => setOpen(false)} className="absolute top-4 right-4 w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center" data-testid="fix-request-close"><X className="w-4 h-4" /></button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center"><Wrench className="w-5 h-5" /></div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Ask Miracurl to fix this</h3>
                <p className="text-xs text-slate-500">Page: <b data-testid="fix-request-page">{title}</b> · no call needed — HQ opens your workspace, fixes it and notifies you.</p>
              </div>
            </div>
            <textarea value={issue} onChange={e => setIssue(e.target.value)} rows={5} autoFocus data-testid="fix-request-issue"
              placeholder="What's wrong or what should be changed? e.g. 'Haircut price shows ₹400, should be ₹450' or 'Branch address is wrong'"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-300" />
            <p className="text-[11px] text-slate-500">Every change HQ makes is listed in Settings → Audit log as “Miracurl Support”. You can switch off support access any time in Settings.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="h-10 px-4 rounded-full border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              {issue.trim().length < 5 && <span className="text-xs text-amber-700 mr-auto self-center" data-testid="fix-request-hint">Type what's wrong above (a few words) to enable Send</span>}
              <button onClick={submit} disabled={busy || issue.trim().length < 5} data-testid="fix-request-submit"
                className="h-10 px-5 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-40 inline-flex items-center gap-2">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send to Miracurl
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
