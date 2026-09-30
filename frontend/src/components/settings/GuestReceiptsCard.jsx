import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Receipt, MessageSquare, MessageCircle, Mail, CheckCircle2, Lock } from "lucide-react";

// Tinted channel tiles in the style of the HQ feature cards (SMS blush / WhatsApp mint / Email gold).
const CHANNELS = [
  { k: "whatsapp", label: "WhatsApp", Icon: MessageCircle, sub: "Official Meta receipt · 1 WhatsApp credit per bill", chips: ["Meta template", "Admins only", "PDF-free"],
    tile: "from-emerald-50 via-white to-emerald-50/70 border-emerald-200", icon: "bg-emerald-100 text-emerald-700", chip: "bg-emerald-50 text-emerald-800 border-emerald-200", on: "bg-emerald-600" },
  { k: "sms", label: "SMS", Icon: MessageSquare, sub: "DLT receipt via MSG91 · 1 SMS credit per bill", chips: ["DLT verified", "Staff can send", "Instant"],
    tile: "from-rose-50 via-white to-rose-50/70 border-rose-200", icon: "bg-rose-100 text-rose-700", chip: "bg-rose-50 text-rose-800 border-rose-200", on: "bg-rose-600" },
  { k: "email", label: "Email", Icon: Mail, sub: "GST-ready PDF invoice · free", chips: ["GST PDF", "Staff can send", "Free"],
    tile: "from-amber-50 via-white to-amber-50/70 border-amber-200", icon: "bg-amber-100 text-amber-700", chip: "bg-amber-50 text-amber-800 border-amber-200", on: "bg-amber-600" },
];

function PillSwitch({ on, disabled, onClick, testid, color }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={onClick} data-testid={testid}
      className={`relative shrink-0 h-9 w-[92px] rounded-full font-bold text-[13px] tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed
        ${on ? `${color} text-white` : "bg-slate-200 text-slate-500"}`}>
      <span className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow transition-all ${on ? "right-1" : "left-1"}`} />
      <span className={`absolute inset-y-0 flex items-center ${on ? "left-4" : "right-4"}`}>{on ? "ON" : "OFF"}</span>
    </button>
  );
}

export function GuestReceiptsCard() {
  const { tenant } = useAuth() || {};
  const feat = tenant?.features || {};
  const [auto, setAuto] = useState(null);
  useEffect(() => { api.get("/settings/receipts").then(r => setAuto(r.data.auto)).catch(() => setAuto({ whatsapp: false, sms: false, email: false })); }, []);
  const toggle = (k) => {
    const next = { ...auto, [k]: !auto[k] };
    setAuto(next);
    api.put("/settings/receipts", next).then(() => toast.success(next[k] ? `Every bill now goes out on ${k === "sms" ? "SMS" : k[0].toUpperCase() + k.slice(1)}` : "Auto-send off — send bills manually when the guest asks"))
      .catch(e => { setAuto(auto); toast.error(e.response?.data?.detail || "Couldn't save"); });
  };
  if (!auto) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 mt-6 shadow-sm" data-testid="settings-guest-receipts-card">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0"><Receipt className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-800">Guest bill delivery</h2>
          <p className="text-xs text-slate-500 mt-1">Off by default — staff tap <b>Send bill</b> on the receipt only when the guest asks. Switch a channel ON to send every bill automatically.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3">
        {CHANNELS.map(c => {
          const enabled = c.k === "email" || !!feat[c.k];
          const on = enabled && !!auto[c.k];
          return (
            <div key={c.k} className={`relative overflow-hidden rounded-2xl border bg-gradient-to-r ${c.tile} p-4 sm:p-5 ${enabled ? "" : "opacity-80"}`} data-testid={`receipt-auto-${c.k}`}>
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl ${c.icon} flex items-center justify-center shrink-0`}><c.Icon className="w-7 h-7" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-base sm:text-lg font-bold text-slate-800 leading-tight">Auto-send on {c.label}</div>
                  <div className="text-xs sm:text-sm text-slate-500 mt-0.5">{c.sub}</div>
                </div>
                <PillSwitch on={on} disabled={!enabled} onClick={() => toggle(c.k)} testid={`receipt-auto-${c.k}-switch`} color={c.on} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {enabled ? c.chips.map(t => (
                  <span key={t} className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${c.chip}`}><CheckCircle2 className="w-3 h-3" /> {t}</span>
                )) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-slate-100 text-slate-600 border-slate-200" data-testid={`receipt-channel-off-${c.k}`}>
                    <Lock className="w-3 h-3" /> {c.label} is switched off for this {tenant?.business_type === "restaurant" ? "restaurant" : "salon"} — ask Miracurl HQ to enable it. Send bill won't offer it either.
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
