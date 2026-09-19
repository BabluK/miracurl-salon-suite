import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Receipt } from "lucide-react";

const ROWS = [
  ["whatsapp", "WhatsApp", "Official Meta receipt (1 WhatsApp credit per bill)"],
  ["sms", "SMS", "DLT receipt via MSG91 (1 SMS credit per bill)"],
  ["email", "Email", "GST-ready PDF invoice — free"],
];

export function GuestReceiptsCard() {
  const [auto, setAuto] = useState(null);
  useEffect(() => { api.get("/settings/receipts").then(r => setAuto(r.data.auto)).catch(() => setAuto({ whatsapp: false, sms: false, email: false })); }, []);
  const toggle = (k) => {
    const next = { ...auto, [k]: !auto[k] };
    setAuto(next);
    api.put("/settings/receipts", next).then(() => toast.success(next[k] ? `Bills auto-send on ${k === "sms" ? "SMS" : k[0].toUpperCase() + k.slice(1)}` : "Auto-send off — send bills manually"))
      .catch(e => { setAuto(auto); toast.error(e.response?.data?.detail || "Couldn't save"); });
  };
  if (!auto) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm" data-testid="settings-guest-receipts-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0"><Receipt className="w-5 h-5" /></div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-slate-800">Guest bill delivery</h2>
          <p className="text-xs text-slate-500 mt-1">Off by default — after billing, staff and admins tap <b>Send bill</b> on the receipt (or later from the guest's CRM history) only when the guest asks. Turn a channel on to send every bill automatically. Staff can send SMS &amp; Email; WhatsApp is for admins.</p>
          <div className="mt-4 divide-y divide-slate-100">
            {ROWS.map(([k, label, sub]) => (
              <label key={k} className="flex items-center justify-between gap-3 py-2.5 cursor-pointer" data-testid={`receipt-auto-${k}`}>
                <div><div className="text-sm font-semibold text-slate-800">Auto-send on {label}</div><div className="text-xs text-slate-500">{sub}</div></div>
                <button type="button" role="switch" aria-checked={auto[k]} onClick={() => toggle(k)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${auto[k] ? "bg-emerald-600" : "bg-slate-300"}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${auto[k] ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
