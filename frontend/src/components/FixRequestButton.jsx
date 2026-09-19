import { createPortal } from "react-dom";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Wrench, X, Loader2, Send, Info, Headset, Heart, ArrowRight } from "lucide-react";

const TITLES = { "/dashboard": "Dashboard", "/appointments": "Appointments", "/customers": "CRM", "/pos": "POS / Billing", "/inventory": "Inventory", "/services": "Services", "/staff": "Staff", "/reports": "Reports", "/settings": "Settings", "/plans": "Plans & Memberships", "/reviews": "Reviews", "/attendance": "Attendance" };
const MAX = 500;

export function FixRequestButton() {
  const loc = useLocation();
  const { tenant } = useAuth();
  const suite = tenant?.business_type === "restaurant" ? "RESTAURANT SUITE" : "SALON SUITE";
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
        className="inline-flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-full border border-[#d4af37]/40 text-[#d4af37] text-xs font-semibold hover:bg-[#d4af37]/10 transition-colors">
        <Wrench className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Ask Miracurl to fix this</span><span className="sm:hidden">Fix</span>
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center bg-[#0b0a08]/75 backdrop-blur-md p-3 sm:p-4 overflow-y-auto" onClick={() => setOpen(false)} data-testid="fix-request-modal">
          <div className="relative w-full max-w-xl my-4 sm:my-auto max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[26px] bg-white shadow-[0_40px_90px_-30px_rgba(0,0,0,.85)] ring-1 ring-white/10" onClick={e => e.stopPropagation()}>
            <div className="relative bg-[#15130f] text-white px-6 sm:px-8 pt-7 pb-8 overflow-hidden rounded-t-[26px]">
              <div className="absolute -top-24 -left-16 w-72 h-72 rounded-full bg-[#d4af37]/15 blur-3xl" />
              <div className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(circle_at_20%_20%,#fff_1px,transparent_1px)] bg-[length:14px_14px]" />
              <button onClick={() => setOpen(false)} className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors" data-testid="fix-request-close"><X className="w-4 h-4" /></button>
              <div className="relative flex items-start gap-4 pr-10">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#f6e7b0] via-[#d4af37] to-[#9a7418] text-[#15130f] flex items-center justify-center shadow-[0_10px_30px_-8px_rgba(212,175,55,.8)] shrink-0"><Wrench className="w-7 h-7" /></div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.35em] text-[#d4af37] font-semibold">Miracurl concierge</div>
                  <h3 className="font-playfair text-[26px] sm:text-[30px] leading-tight mt-1">Ask Miracurl to fix this</h3>
                  <p className="text-xs text-white/60 mt-1.5">No calls needed — our HQ team will check and fix it for you. Page: <b className="text-white/90" data-testid="fix-request-page">{title}</b></p>
                </div>
              </div>
              <div className="absolute right-6 bottom-4 -rotate-12 text-right text-[#e6c766] leading-[0.95] select-none pointer-events-none hidden sm:block" style={{ fontFamily: "'Caveat', cursive" }}>
                <div className="text-2xl">We're</div>
                <div className="text-2xl">Here for You</div>
                <Heart className="w-4 h-4 ml-auto mt-1 fill-[#e6c766]" />
              </div>
            </div>

            <div className="px-6 sm:px-8 pt-6 pb-5 space-y-4">
              <div className="flex items-end justify-between gap-3">
                <h4 className="font-semibold text-slate-900 text-base">What's wrong?</h4>
                <span className="text-[11px] text-slate-400">Describe the issue so we can fix it quickly.</span>
              </div>
              <div className="relative">
                <textarea value={issue} onChange={e => setIssue(e.target.value.slice(0, MAX))} rows={5} autoFocus data-testid="fix-request-issue"
                  placeholder="e.g. 'Haircut price shows ₹400, should be ₹450' or 'Branch address is wrong'"
                  className="w-full rounded-2xl border-2 border-[#d4af37]/70 bg-white px-4 py-3 pb-7 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-[#d4af37]/15 focus:border-[#d4af37] resize-none" />
                <span className="absolute right-4 bottom-3 text-[10px] text-slate-400 tabular-nums" data-testid="fix-request-count">{issue.length}/{MAX}</span>
              </div>
              <div className="flex items-start gap-3 rounded-2xl bg-[#faf7ef] border border-[#eee4c8] px-4 py-3.5">
                <span className="w-8 h-8 rounded-full bg-[#15130f] text-[#f3e5ab] flex items-center justify-center shrink-0"><Info className="w-4 h-4" /></span>
                <div className="text-[12px] text-slate-600 leading-relaxed">
                  <div className="font-semibold text-slate-900">Your request becomes a numbered ticket in Miracurl HQ Inbox</div>
                  You'll get a reply here and by email. Every change we make is listed in Settings → Audit Logs as “Miracurl Support”.
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 pt-1">
                {issue.trim().length < 5 && <span className="mr-auto text-[11px] text-[#8a7340]" data-testid="fix-request-hint">Type a few words above to enable Send</span>}
                <button onClick={() => setOpen(false)} className="h-11 px-6 rounded-full border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 transition-colors" data-testid="fix-request-cancel">Cancel</button>
                <button onClick={submit} disabled={busy || issue.trim().length < 5} data-testid="fix-request-submit"
                  className="h-11 px-6 rounded-full bg-[#15130f] text-[#f3e5ab] text-sm font-semibold ring-2 ring-[#d4af37]/60 hover:bg-[#2a2620] disabled:opacity-40 inline-flex items-center gap-2 shadow-[0_10px_25px_-10px_rgba(212,175,55,.7)] transition-colors">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send to Miracurl
                </button>
              </div>
            </div>

            <div className="px-6 sm:px-8 py-3.5 bg-[#faf7ef] border-t border-[#eee4c8] flex items-center justify-between gap-3 rounded-b-[26px]">
              <a href="mailto:support@miracurl-suite.com" className="inline-flex items-center gap-2 text-[11px] text-slate-500 hover:text-slate-800 transition-colors" data-testid="fix-request-support-link">
                <Headset className="w-4 h-4" /> Need immediate help? Contact <span className="text-[#b8860b] font-semibold">Miracurl Support</span> <ArrowRight className="w-3 h-3" />
              </a>
              <div className="text-right leading-none shrink-0">
                <div className="font-playfair font-semibold tracking-[0.25em] text-[13px] text-[#15130f]">MIRACURL<sup className="text-[7px] ml-0.5">™</sup></div>
                <div className="text-[7px] tracking-[0.35em] text-slate-400 mt-1">{suite}</div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
