import { X, Crown } from "lucide-react";
import { DashboardAurora } from "@/components/DashboardAurora";

// Shared gold-night header for every HQ dialog (Control Centre, Edit tenant, Pay link, Grant credits…).
export function HqDialogHeader({ kicker = "HQ control centre", title, subtitle, onClose, closeTestId = "hq-dialog-close", icon: Icon = Crown, vertical = "salon", children }) {
  return (
    <div className="gold-night-canvas relative isolate overflow-hidden text-white px-6 pt-6 pb-6 border-b border-[#d4af37]/30 shrink-0" data-vertical={vertical} data-testid="hq-dialog-header">
      <DashboardAurora />
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Close"
          className="absolute z-30 top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-[#d4af37]/30 ring-1 ring-white/20 hover:ring-[#d4af37]/60 flex items-center justify-center transition-colors"
          data-testid={closeTestId}><X className="w-4 h-4" /></button>
      )}
      <div className="relative z-10 pr-12 su-stagger">
        <div className="text-[10px] uppercase tracking-[0.35em] text-[#d4af37] font-semibold inline-flex items-center gap-2"><Icon className="w-3.5 h-3.5" /> {kicker}</div>
        <h3 className="font-playfair text-2xl sm:text-3xl mt-1 leading-tight break-words"><span className="su-gold-word" data-text={title}>{title}</span></h3>
        {subtitle && <p className="text-xs text-white/60 mt-1.5">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

export function HqChip({ on, children }) {
  return (
    <span className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold tracking-wide backdrop-blur-md ${on ? "border-[#d4af37]/60 bg-[#d4af37]/15 text-[#f3e3ae]" : "border-white/15 bg-white/5 text-white/45"}`}>
      {on ? "● " : "○ "}{children}
    </span>
  );
}
