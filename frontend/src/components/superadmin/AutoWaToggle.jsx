import { useEffect, useState } from "react";
import { MessageCircle, Loader2, Smartphone } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

const STATUS_HINT = {
  APPROVED: "Meta approved · ready to send",
  PENDING: "Template awaiting Meta approval — intros start automatically once approved",
  REJECTED: "Meta rejected the template — edit & resubmit",
  MISSING: "Template not found on the WhatsApp Business Account",
  UNKNOWN: "Couldn't reach Meta to check the template",
};

// Replaces the retired auto-dialer: Mira sends a WhatsApp intro to fresh hot leads (and every new phone-only lead) in their business hours.
export function AutoWaToggle() {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState("");
  useEffect(() => { api.get("/super-admin/mira-leads/auto-wa").then(r => setS(r.data)).catch(() => {}); }, []);
  if (!s) return null;
  const approved = s.template_status === "APPROVED";
  const save = async (patch, key, msg) => {
    setSaving(key);
    try {
      const { data } = await api.put("/super-admin/mira-leads/auto-wa", { enabled: s.enabled, daily_limit: s.daily_limit, phone_only: s.phone_only, ...patch });
      setS(prev => ({ ...prev, ...data }));
      toast.success(msg(data));
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't save"); }
    finally { setSaving(""); }
  };
  const toggle = () => save({ enabled: !s.enabled }, "main", d => d.enabled
    ? `💬 Auto WhatsApp ON — hot leads${d.phone_only ? " + every new phone-only lead" : ""} get Mira's pitch 10 AM–7 PM local time (max ${d.daily_limit}/day)${d.template_status !== "APPROVED" ? " · waits for Meta template approval" : ""}`
    : "Auto WhatsApp paused");
  const togglePhoneOnly = () => save({ phone_only: !s.phone_only }, "po", d => d.phone_only
    ? `📱 Phone-only cadence ON — ${d.phone_only_queued} lead${d.phone_only_queued === 1 ? "" : "s"} queued for Mira's WA pitch in their business hours`
    : "Phone-only cadence off — only hot leads get the auto pitch");
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="lead-auto-wa">
      <label data-testid="lead-auto-wa-toggle" title={STATUS_HINT[s.template_status] || s.template_status}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold cursor-pointer transition-colors ${s.enabled ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500 hover:border-emerald-300"}`}>
        {saving === "main" ? <Loader2 className="w-4 h-4 animate-spin" /> : <input type="checkbox" checked={s.enabled} onChange={toggle} className="accent-emerald-600 w-4 h-4" />}
        <MessageCircle className="w-4 h-4" /> Auto WhatsApp intro to new hot leads
        <span data-testid="lead-auto-wa-status" className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${approved ? "bg-emerald-600 text-white" : "bg-amber-100 text-amber-700"}`}>
          {approved ? `${s.sent_today} sent today · ${s.replied_total} replies` : s.template_status === "PENDING" ? "awaiting Meta approval" : s.template_status}
        </span>
      </label>
      <label data-testid="lead-auto-wa-phone-only" data-on={s.enabled && s.phone_only}
        title={s.enabled ? "Every lead found without an email (last 7 days) gets Mira's approved WhatsApp pitch in its local business hours — shares the daily cap with hot leads" : "Turn on Auto WhatsApp first"}
        className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${!s.enabled ? "border-slate-200 text-slate-400 opacity-60 cursor-not-allowed" : s.phone_only ? "border-emerald-400 bg-emerald-50 text-emerald-700 cursor-pointer" : "border-slate-200 text-slate-500 hover:border-emerald-300 cursor-pointer"}`}>
        {saving === "po" ? <Loader2 className="w-4 h-4 animate-spin" /> : <input type="checkbox" checked={s.phone_only} disabled={!s.enabled} onChange={togglePhoneOnly} className="accent-emerald-600 w-4 h-4" />}
        <Smartphone className="w-4 h-4" /> Also pitch every new phone-only lead
        <span data-testid="lead-auto-wa-phone-only-queue" className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.enabled && s.phone_only ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"}`}>
          {s.phone_only_queued} queued · {s.phone_only_pitched} pitched
        </span>
      </label>
    </div>
  );
}
