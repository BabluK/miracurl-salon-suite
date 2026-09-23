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
    <div data-testid="mira-social-nudge" className="bg-gradient-to-r from-fuchsia-600 to-pink-600 rounded-2xl p-4 text-white shadow-md">
      <div className="flex items-start gap-3">
        <Sparkles className="w-5 h-5 shrink-0 text-fuchsia-100 mt-0.5" />
        <p className="text-sm flex-1"><b>Mira:</b> {ctx.nudge}</p>
        <button data-testid="mira-nudge-dismiss" aria-label="Dismiss" onClick={dismiss}
          className="p-1 rounded hover:bg-white/20"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex flex-wrap gap-2 mt-3 ml-8">
        {variant === "dashboard" ? (
          <button data-testid="mira-nudge-suggest-btn" onClick={() => navigate("/mira-studio")}
            className="text-xs px-3 py-2 rounded-lg bg-white text-fuchsia-700 font-bold hover:bg-fuchsia-50">
            Ask Mira for ideas ✦
          </button>
        ) : (
          <>
            <button data-testid="mira-nudge-suggest-btn" onClick={() => onSuggest?.("offer")}
              className="text-xs px-3 py-2 rounded-lg bg-white text-fuchsia-700 font-bold hover:bg-fuchsia-50">
              Suggest an offer ✦
            </button>
            <button data-testid="mira-nudge-suggest-package" onClick={() => onSuggest?.("package")}
              className="text-xs px-3 py-2 rounded-lg bg-white/15 border border-white/40 text-white font-semibold hover:bg-white/25">
              Suggest a package
            </button>
            <button data-testid="mira-nudge-suggest-specific" onClick={() => onSuggest?.("specific")}
              className="text-xs px-3 py-2 rounded-lg bg-white/15 border border-white/40 text-white font-semibold hover:bg-white/25">
              Something specific…
            </button>
          </>
        )}
      </div>
    </div>
  );
}
