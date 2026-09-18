import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Bot, Zap, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SmsPacksCard } from "@/components/settings/SmsPacksCard";

export const WA_LOW_THRESHOLD = 20;
const snoozeKey = () => `wa-low-credit-snooze-${new Date().toDateString()}`;

export function WaCreditsBanner() {
  const [cfg, setCfg] = useState(null);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => !!localStorage.getItem(snoozeKey()));

  useEffect(() => {
    api.get("/sms-packs?channel=whatsapp").then(r => setCfg(r.data)).catch(() => setCfg(null));
  }, [open]);

  if (!cfg || cfg.own_connected || cfg.balance >= WA_LOW_THRESHOLD) return null;
  const empty = cfg.balance <= 0;
  // At zero the WhatsApp feature flag turns off — still shout if this salon ever used Mira on WhatsApp or guests are being missed.
  if (empty ? !(cfg.wa_ever_used || cfg.wa_missed_24h > 0) : (hidden || (cfg.features && !cfg.features.whatsapp))) return null;
  const tone = empty ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200";

  return (
    <>
      <div data-testid="wa-low-credit-banner" className={`flex flex-wrap items-center gap-3 rounded-2xl border px-5 py-3.5 shadow-sm ${tone} ${empty ? "border-2 animate-[pulse_2.4s_ease-in-out_3]" : ""}`}>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${empty ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"}`}>
          <Bot className="w-4.5 h-4.5" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="text-sm font-semibold text-slate-800" data-testid="wa-low-credit-text">
            {empty ? "🔴 WhatsApp credits are at zero — Mira has gone silent" : `Only ${cfg.balance} WhatsApp credits left`}
          </div>
          <div className="text-xs text-slate-600" data-testid="wa-low-credit-sub">
            {empty ? (cfg.wa_missed_24h > 0
              ? `${cfg.wa_missed_24h} guest message${cfg.wa_missed_24h === 1 ? "" : "s"} went unanswered in the last 24 hours. Top up to resume replies and bookings.`
              : "Guests messaging you on WhatsApp are not getting replies or bookings right now.")
              : "Each Mira WhatsApp reply uses 1 credit. Top up now so auto-replies and bookings never stop."}
          </div>
        </div>
        <button data-testid="wa-low-credit-topup-btn" onClick={() => setOpen(true)}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold text-white transition ${empty ? "bg-red-500 hover:bg-red-600" : "bg-amber-500 hover:bg-amber-600"}`}>
          <Zap className="w-3.5 h-3.5" /> Top up WhatsApp
        </button>
        {!empty && (
          <button data-testid="wa-low-credit-dismiss" onClick={() => { localStorage.setItem(snoozeKey(), "1"); setHidden(true); }}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-white/60" title="Hide for today">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl p-0 bg-transparent border-0 shadow-none" data-testid="wa-topup-dialog">
          <DialogHeader className="sr-only"><DialogTitle>Buy WhatsApp credits</DialogTitle></DialogHeader>
          <div className="[&>div]:mt-0"><SmsPacksCard defaultChannel="whatsapp" /></div>
        </DialogContent>
      </Dialog>
    </>
  );
}
