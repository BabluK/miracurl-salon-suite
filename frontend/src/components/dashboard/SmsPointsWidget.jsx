import { useEffect, useState } from "react";
import api from "@/lib/api";
import { MessageSquare, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SmsPacksCard } from "@/components/settings/SmsPacksCard";

export function SmsPointsWidget() {
  const [cfg, setCfg] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.get("/sms-packs").then(r => setCfg(r.data)).catch(() => setCfg(null));
  }, [open]);

  if (!cfg || (cfg.features && !cfg.features.sms)) return null;
  const low = cfg.balance < 50;

  return (
    <>
      <div
        data-testid="sms-points-widget"
        className={`flex flex-wrap items-center gap-3 rounded-2xl border px-5 py-3.5 shadow-sm ${
          low ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"
        }`}
      >
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${low ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"}`}>
          <MessageSquare className="w-4.5 h-4.5" />
        </div>
        <div className="flex-1 min-w-[180px]">
          <div className="text-sm font-semibold text-slate-800" data-testid="sms-points-balance">
            {cfg.balance} SMS points left
          </div>
          <div className="text-xs text-slate-500">
            {low ? "Running low — guest receipts & reminders will stop at 0" : "Used for guest billing SMS & appointment reminders"}
          </div>
        </div>
        <button
          data-testid="buy-sms-points-btn"
          onClick={() => setOpen(true)}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition ${
            low ? "bg-amber-500 hover:bg-amber-600 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"
          }`}
        >
          <Zap className="w-3.5 h-3.5" /> Buy SMS points
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl p-0 bg-transparent border-0 shadow-none" data-testid="sms-topup-dialog">
          <DialogHeader className="sr-only">
            <DialogTitle>Buy SMS points</DialogTitle>
          </DialogHeader>
          <div className="[&>div]:mt-0">
            <SmsPacksCard />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
