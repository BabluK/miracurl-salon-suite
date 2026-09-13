import { useEffect, useState } from "react";

// The ONLY loading screen in the app. Waits `delay` ms before painting so a fast
// network shows nothing at all — no skeletons, no spinners, no double "loading" feel.
let _lastShownAt = 0; // a splash that follows another one (auth → page data) continues seamlessly, no blank gap

export function BrandSplash({ delay = 220, fullscreen = false }) {
  const [show, setShow] = useState(() => delay === 0 || Date.now() - _lastShownAt < 1500);
  useEffect(() => {
    if (show) { _lastShownAt = Date.now(); return () => { _lastShownAt = Date.now(); }; }
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay, show]);
  if (!show) return <div className={fullscreen ? "fixed inset-0 z-[90] bg-bg-base" : "min-h-screen bg-bg-base"} data-testid="brand-splash-pending" />;
  return (
    <div className={`${fullscreen ? "fixed inset-0 z-[90]" : "min-h-screen"} flex flex-col items-center justify-center bg-bg-base gap-5`} data-testid="brand-splash">
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
