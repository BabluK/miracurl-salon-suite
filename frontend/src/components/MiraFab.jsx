// Floating Mira AI agent — visible on every portal section, opens the AI Assistant.
import { useNavigate, useLocation } from "react-router-dom";
import { Sparkles } from "lucide-react";

export const MiraFab = () => {
  const nav = useNavigate();
  const loc = useLocation();
  if (loc.pathname.startsWith("/assistant")) return null;

  return (
    <button
      data-testid="mira-fab"
      onClick={() => nav("/assistant")}
      title="Ask Mira — your AI assistant"
      aria-label="Open Mira AI Assistant"
      className="fixed z-40 right-4 sm:right-6 group"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)" }}
    >
      <div className="relative">
        <span className="absolute inset-0 rounded-full bg-gold/40 blur-md opacity-60 group-hover:opacity-100 transition-opacity animate-pulse" />
        <img
          src="/mira-bot.png"
          alt="Mira AI"
          className="relative w-14 h-14 rounded-full object-cover border-2 border-gold/70 shadow-[0_4px_20px_rgba(0,0,0,0.45)] transition-transform duration-200 group-hover:scale-110"
        />
        <Sparkles className="sparkle-twinkle absolute -top-1.5 -right-1 w-4 h-4 text-amber-300" />
        <Sparkles className="sparkle-twinkle absolute -bottom-0.5 -left-1.5 w-3 h-3 text-amber-200" style={{ animationDelay: "0.9s" }} />
        <Sparkles className="sparkle-twinkle absolute top-1 -left-2.5 w-2.5 h-2.5 text-white/80" style={{ animationDelay: "1.7s" }} />
      </div>
      <span className="absolute right-full top-1/2 -translate-y-1/2 mr-3 px-3 py-1.5 rounded-full bg-[#121212] border border-gold/30 text-gold text-xs font-medium whitespace-nowrap opacity-0 translate-x-2 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 shadow-lg">
        Ask Mira ✦
      </span>
    </button>
  );
};

export default MiraFab;
