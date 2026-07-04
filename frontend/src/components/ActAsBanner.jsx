// Sticky banner shown while the super-admin is browsing a salon's workspace.
import { useNavigate } from "react-router-dom";
import { clearActAsSalon } from "@/lib/api";
import { ShieldCheck, LogOut } from "lucide-react";

export const ActAsBanner = ({ tenant }) => {
  const nav = useNavigate();
  return (
    <div
      data-testid="act-as-banner"
      className="fixed top-0 left-0 right-0 z-[70] bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs sm:text-sm px-4 py-2 flex items-center justify-center gap-3 shadow-lg"
    >
      <ShieldCheck className="w-4 h-4 shrink-0" />
      <span className="truncate">
        Super-Admin mode — viewing <b>{tenant?.name || "salon"}</b>. You can correct &amp; update data; deleting is disabled.
      </span>
      <button
        data-testid="act-as-exit-btn"
        onClick={() => { clearActAsSalon(); nav("/super-admin"); window.location.reload(); }}
        className="shrink-0 inline-flex items-center gap-1.5 bg-white/20 hover:bg-white/30 border border-white/40 rounded-full px-3 py-1 font-semibold transition"
      >
        <LogOut className="w-3.5 h-3.5" /> Exit
      </button>
    </div>
  );
};

export default ActAsBanner;
