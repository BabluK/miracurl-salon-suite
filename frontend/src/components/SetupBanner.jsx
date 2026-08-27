import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Rocket, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export function SetupBanner() {
  const { tenant } = useAuth();
  const resto = tenant?.business_type === "restaurant";
  const [status, setStatus] = useState(null);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem("setup_banner_dismissed") === "1");
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/setup/status").then(r => setStatus(r.data)).catch(() => {});
  }, []);

  if (dismissed || !status || status.done) return null;
  const doneSteps = 5 - status.remaining;

  return (
    <div data-testid="setup-banner" className="bg-slate-900 rounded-2xl p-4 text-white flex items-center gap-3 flex-wrap shadow-md">
      <Rocket className="w-5 h-5 text-fuchsia-400 shrink-0" />
      <div className="flex-1 min-w-[200px]">
        <p className="text-sm font-semibold">Finish setting up your {resto ? "restaurant" : "salon"}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <div className="h-1.5 w-40 bg-white/15 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-fuchsia-500 to-pink-500 rounded-full transition-all" style={{ width: `${(doneSteps / 5) * 100}%` }} />
          </div>
          <span className="text-[11px] text-white/60">{doneSteps} of 5 steps done</span>
        </div>
      </div>
      <button data-testid="setup-banner-cta" onClick={() => navigate("/setup")}
        className="text-xs px-4 py-2 rounded-lg bg-white text-slate-900 font-bold hover:bg-fuchsia-50">
        Continue setup →
      </button>
      <button data-testid="setup-banner-dismiss" aria-label="Dismiss"
        onClick={() => { setDismissed(true); sessionStorage.setItem("setup_banner_dismissed", "1"); }}
        className="p-1 rounded hover:bg-white/15"><X className="w-4 h-4" /></button>
    </div>
  );
}
