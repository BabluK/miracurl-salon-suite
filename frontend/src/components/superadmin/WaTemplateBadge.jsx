import { useState } from "react";
import { MessageCircle, RefreshCw, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

export const WA_STATUS = {
  APPROVED: { label: "WhatsApp template approved", cls: "bg-emerald-50 border-emerald-300 text-emerald-700", dot: "bg-emerald-500" },
  PENDING: { label: "WhatsApp template pending Meta approval", cls: "bg-amber-50 border-amber-300 text-amber-700", dot: "bg-amber-400 animate-pulse" },
  REJECTED: { label: "WhatsApp template rejected by Meta", cls: "bg-rose-50 border-rose-300 text-rose-700", dot: "bg-rose-500" },
  MISSING: { label: "WhatsApp template not submitted", cls: "bg-slate-50 border-slate-300 text-slate-600", dot: "bg-slate-400" },
  UNKNOWN: { label: "Couldn't reach Meta to check the template", cls: "bg-slate-50 border-slate-300 text-slate-500", dot: "bg-slate-300" },
};

// Header badge: is the Meta template `miracurl_lead_intro` approved, so phone-only leads can get Mira's WA pitch?
export function WaTemplateBadge({ wa, onRefresh }) {
  const [checking, setChecking] = useState(false);
  if (!wa) return null;
  const st = WA_STATUS[wa.template_status] || WA_STATUS.UNKNOWN;
  const check = async () => {
    setChecking(true);
    try {
      const { data } = await api.get("/super-admin/mira-leads/auto-wa", { params: { refresh: 1 } });
      onRefresh?.(data);
      toast.success(`Meta says: ${WA_STATUS[data.template_status]?.label || data.template_status}`);
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't check the template"); }
    finally { setChecking(false); }
  };
  return (
    <div data-testid="wa-template-badge" data-status={wa.template_status} title={`Meta template "${wa.template}" · ${wa.phone_only_total} phone-only leads (${wa.phone_only_pitched} already pitched on WhatsApp)`}
      className={`inline-flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-full border text-xs font-semibold ${st.cls}`}>
      <span className={`w-2 h-2 rounded-full ${st.dot}`} />
      <MessageCircle className="w-3.5 h-3.5" />
      <span data-testid="wa-template-status-label">{st.label}</span>
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/70 border border-current/20" data-testid="wa-template-phone-only">
        📱 {wa.phone_only_total} phone-only
      </span>
      <button onClick={check} disabled={checking} data-testid="wa-template-recheck" title="Ask Meta again"
        className="w-6 h-6 rounded-full hover:bg-white/80 inline-flex items-center justify-center disabled:opacity-50">
        {checking ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
      </button>
    </div>
  );
}
