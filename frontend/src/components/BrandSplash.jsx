export function BrandSplash() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg-base gap-5" data-testid="brand-splash">
      <div className="relative">
        <div className="absolute -inset-6 rounded-full bg-[#DFB78C]/15 blur-2xl animate-pulse" />
        <img src="/assets/ms-logo-emblem.png" alt="Miracurl Suite"
          className="relative w-24 h-24 object-contain drop-shadow-[0_8px_30px_rgba(223,183,140,0.45)]" />
      </div>
      <div className="text-center">
        <div className="font-playfair text-2xl tracking-[0.1em] font-semibold gold-shine-text">
          MIRACURL <span className="tracking-[0.3em]">SUITE</span>
        </div>
        <div className="text-[9px] uppercase tracking-[0.35em] text-white/40 mt-2">Smart Salon Management Software</div>
      </div>
      <div className="w-32 h-[3px] rounded-full bg-white/10 overflow-hidden">
        <div className="h-full w-full origin-left animate-pulse bg-gradient-to-r from-[#C89B52] via-[#F0D9A5] to-[#C89B52]" />
      </div>
    </div>
  );
}
