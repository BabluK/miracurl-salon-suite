import { useEffect, useState } from "react";
import { MessageCircle, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

const STATUS_HINT = {
  APPROVED: "Meta approved · ready to send",
  PENDING: "Template awaiting Meta approval — intros start automatically once approved",
  REJECTED: "Meta rejected the template — edit & resubmit",
  MISSING: "Template not found on the WhatsApp Business Account",
  UNKNOWN: "Couldn't reach Meta to check the template",
};

// Replaces the retired auto-dialer: Mira sends a WhatsApp intro to fresh hot leads in their business hours.
export function AutoWaToggle() {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get("/super-admin/mira-leads/auto-wa").then(r => setS(r.data)).catch(() => {}); }, []);
  if (!s) return null;
  const approved = s.template_status === "APPROVED";
  const toggle = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/super-admin/mira-leads/auto-wa", { enabled: !s.enabled, daily_limit: s.daily_limit });
      setS(prev => ({ ...prev, ...data }));
      toast.success(data.enabled
        ? `💬 Auto WhatsApp intro ON — fresh hot leads get Mira's intro 10 AM–7 PM local time (max ${data.daily_limit}/day)${data.template_status !== "APPROVED" ? " · waits for Meta template approval" : ""}`
        : "Auto WhatsApp intro paused");
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't save"); }
    finally { setSaving(false); }
  };
  return (
    <label data-testid="lead-auto-wa-toggle" title={STATUS_HINT[s.template_status] || s.template_status}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold cursor-pointer transition-colors ${s.enabled ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500 hover:border-emerald-300"}`}>
      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <input type="checkbox" checked={s.enabled} onChange={toggle} className="accent-emerald-600 w-4 h-4" />}
      <MessageCircle className="w-4 h-4" /> Auto WhatsApp intro to new hot leads
      <span data-testid="lead-auto-wa-status" className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${approved ? "bg-emerald-600 text-white" : "bg-amber-100 text-amber-700"}`}>
        {approved ? `${s.sent_today} sent today · ${s.replied_total} replies` : s.template_status === "PENDING" ? "awaiting Meta approval" : s.template_status}
      </span>
    </label>
  );
}
