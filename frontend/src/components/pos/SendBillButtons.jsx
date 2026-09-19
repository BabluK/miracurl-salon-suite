import { useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { MessageCircle, MessageSquare, Mail, Loader2, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const CH = {
  whatsapp: { label: "WhatsApp", Icon: MessageCircle, cls: "bg-emerald-600 hover:bg-emerald-700 text-white" },
  sms: { label: "SMS", Icon: MessageSquare, cls: "bg-slate-800 hover:bg-slate-900 text-white" },
  email: { label: "Email", Icon: Mail, cls: "bg-sky-600 hover:bg-sky-700 text-white" },
};

const ERR = { no_phone: "no mobile on file", no_email: "no email on file", no_sms_points: "no SMS credits", no_wa_points: "no WhatsApp credits",
  whatsapp_disabled: "WhatsApp is off for this salon", template_pending: "WhatsApp receipt template awaiting Meta approval — opened wa.me instead", sms_disabled: "SMS is off for this salon" };

export function SendBillButtons({ invoice, customer, compact = false, onSent }) {
  const { user } = useAuth() || {};
  const isAdmin = ["admin", "super_admin", "manager"].includes(user?.role);
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState(() => Object.fromEntries(Object.keys(CH).map(k => [k, !!invoice?.receipts?.[k]?.sent])));
  const channels = isAdmin ? ["whatsapp", "sms", "email"] : ["sms", "email"];
  if (!invoice || invoice.status === "open") return null;

  const send = async (ch) => {
    setBusy(ch);
    try {
      const { data } = await api.post(`/invoices/${invoice.id}/send-receipt`, { channels: [ch] });
      const r = data.results?.[ch] || {};
      if (r.sent) { setDone(d => ({ ...d, [ch]: true })); toast.success(`Bill sent on ${CH[ch].label} ✦`); onSent?.(ch, r); }
      else if (r.whatsapp_url) { window.open(r.whatsapp_url, "_blank", "noopener"); toast(ERR[r.error] || r.error); }
      else toast.error(`${CH[ch].label}: ${ERR[r.error] || r.error || "couldn't send"}`);
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't send the bill"); }
    finally { setBusy(""); }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? "" : "mt-3"}`} data-testid={`send-bill-${invoice.id}`}>
      {!compact && <span className="text-xs font-semibold text-slate-600 mr-1">Send bill:</span>}
      {channels.map(ch => {
        const { label, Icon, cls } = CH[ch];
        const disabled = (ch === "email" && !customer?.email && !invoice.customer_email) || ((ch === "sms" || ch === "whatsapp") && !customer?.phone && !invoice.customer_phone);
        return (
          <button key={ch} type="button" onClick={() => send(ch)} disabled={!!busy || disabled} data-testid={`send-bill-${ch}-${invoice.id}`}
            title={disabled ? (ch === "email" ? "No email on file" : "No mobile on file") : `Send the bill on ${label}`}
            className={`inline-flex items-center gap-1.5 rounded-lg font-semibold disabled:opacity-40 ${compact ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"} ${done[ch] ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : cls}`}>
            {busy === ch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : done[ch] ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
            {done[ch] ? `${label} sent` : label}
          </button>
        );
      })}
      {!isAdmin && !compact && <span className="text-[10px] text-slate-400">WhatsApp sending is for admins</span>}
    </div>
  );
}
