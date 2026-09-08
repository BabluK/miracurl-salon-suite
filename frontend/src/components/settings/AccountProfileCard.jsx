import { useState } from "react";
import { Download, IdCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

export function AccountProfileCard({ tenant }) {
  const [busy, setBusy] = useState(false);
  const noun = tenant?.business_type === "restaurant" ? "restaurant" : "salon";
  const dl = async () => {
    setBusy(true);
    try {
      const r = await api.get("/billing/account-profile.pdf", { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = Object.assign(document.createElement("a"), { href: url, download: `Miracurl-Account-Profile-${tenant?.slug || "my-business"}.pdf` });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success("Account profile downloaded");
    } catch { toast.error("Couldn't build the PDF — please try again"); }
    finally { setBusy(false); }
  };
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm" data-testid="settings-account-profile-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-slate-900 text-[#d4af37] flex items-center justify-center shrink-0"><IdCard className="w-5 h-5" /></div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-slate-800">Account profile</h2>
          <p className="text-xs text-slate-500 mt-1">A one-page branded PDF with everything on file for your {noun}: your logo, owner &amp; business contacts, free-trial and subscription dates, active plan, and how to reach Miracurl HQ (contact@ · support@ · admin@miracurl-suite.com). Handy for your records, your accountant or your bank.</p>
          <button onClick={dl} disabled={busy} data-testid="account-profile-download-btn"
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-[#F0D9A5] text-xs font-semibold hover:bg-slate-800 disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} {busy ? "Preparing…" : "Download Account Profile (PDF)"}
          </button>
          <p className="text-[11px] text-slate-400 mt-2">Details out of date? Update them in the {noun} profile above — the PDF always reflects what's saved.</p>
        </div>
      </div>
    </div>
  );
}
