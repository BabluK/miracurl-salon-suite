import { Sparkles } from "lucide-react";

// Miracurl master brand — shown to every tenant (salon or restaurant) above their own brand mark.
export function SidebarMiracurlLogo() {
  return (
    <div className="flex items-center gap-2.5 select-none" data-testid="sidebar-miracurl-logo-block">
      <img src="/assets/ms-logo-ring.png" alt="Miracurl Suite" draggable="false" className="ms-brand-ring w-10 h-10 object-contain shrink-0" />
      <div className="leading-none min-w-0">
        <div className="font-playfair text-[15px] tracking-[0.05em] font-semibold gold-shine-text whitespace-nowrap">MIRACURL <span className="tracking-[0.12em]">SUITE</span></div>
        <div className="text-[7.5px] tracking-[0.26em] uppercase text-white/40 mt-1">AI-Powered Business Platform</div>
      </div>
    </div>
  );
}

export function PoweredByMiracurl({ testid, className = "" }) {
  return (
    <a href="https://miracurl-suite.com" target="_blank" rel="noreferrer" data-testid={testid}
      className={`powered-pill inline-flex items-center gap-1.5 rounded-full border border-[#d4af37]/30 bg-[#d4af37]/10 text-[#e8c56a] px-2.5 py-1 text-[10.5px] font-medium tracking-wide whitespace-nowrap ${className}`}>
      <Sparkles className="w-3 h-3" strokeWidth={2} />
      <span>Powered by <span className="font-semibold">Miracurl</span></span>
    </a>
  );
}
