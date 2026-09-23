import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Sparkles, X } from "lucide-react";

export function MiraSocialNudge({ variant = "dashboard", onSuggest }) {
  const [ctx, setCtx] = useState(null);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem("mira_social_nudge_dismissed") === "1");
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/mira-studio/social/context").then(r => setCtx(r.data)).catch(() => {});
  }, []);

  if (dismissed || !ctx?.nudge) return null;
  const dismiss = () => { setDismissed(true); sessionStorage.setItem("mira_social_nudge_dismissed", "1"); };

  return (
    <div data-testid="mira-social-nudge" className="dash-cream-card rounded-3xl p-4 sm:p-5 text-slate-800">
      <div className="flex items-start gap-3">
        <Sparkles className="w-5 h-5 shrink-0 text-fuchsia-100 mt-0.5" />
        <p className="text-sm flex-1"><b>Mira:</b> {ctx.nudge}</p>
        <button data-testid="mira-nudge-dismiss" aria-label="Dismiss" onClick={dismiss}
          className="p-1 rounded hover:bg-amber-50"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex flex-wrap gap-2 mt-3 ml-8">
        {variant === "dashboard" ? (
          <button data-testid="mira-nudge-suggest-btn" onClick={() => navigate("/mira-studio")}
            className="text-xs px-3 py-2 rounded-lg bg-gradient-to-r from-[#e8c56a] to-[#c99a2e] text-[#1a1408] font-bold hover:brightness-110">
            Ask Mira for ideas ✦
          </button>
        ) : (
          <>
            <button data-testid="mira-nudge-suggest-btn" onClick={() => onSuggest?.("offer")}
              className="text-xs px-3 py-2 rounded-lg bg-gradient-to-r from-[#e8c56a] to-[#c99a2e] text-[#1a1408] font-bold hover:brightness-110">
              Suggest an offer ✦
            </button>
            <button data-testid="mira-nudge-suggest-package" onClick={() => onSuggest?.("package")}
              className="text-xs px-3 py-2 rounded-lg bg-white/80 border border-amber-200 text-[#6b4f12] font-semibold hover:bg-amber-50">
              Suggest a package
            </button>
            <button data-testid="mira-nudge-suggest-specific" onClick={() => onSuggest?.("specific")}
              className="text-xs px-3 py-2 rounded-lg bg-white/80 border border-amber-200 text-[#6b4f12] font-semibold hover:bg-amber-50">
              Something specific…
            </button>
          </>
        )}
      </div>
    </div>
  );
}
