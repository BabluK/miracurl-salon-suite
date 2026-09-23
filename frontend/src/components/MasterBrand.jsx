// Miracurl master brand — shown to every tenant (salon or restaurant) at the top of the sidebar.
export function SidebarMiracurlLogo() {
  return (
    <div className="flex flex-col items-center select-none w-full" data-testid="sidebar-miracurl-logo-block">
      <img src="/assets/brand/ms-suite-banner.jpg" alt="Miracurl Suite — Smart Salon & Restaurant Management Software" draggable="false"
        className="w-full h-auto object-contain rounded-xl drop-shadow-[0_8px_26px_rgba(212,175,55,0.35)]"
        style={{ maskImage: "radial-gradient(120% 120% at 50% 50%, #000 62%, transparent 100%)", WebkitMaskImage: "radial-gradient(120% 120% at 50% 50%, #000 62%, transparent 100%)" }} />
    </div>
  );
}

export function SidebarScriptTagline({ resto = false }) {
  return (
    <div className="sidebar-tagline text-[22px] leading-[1.05] text-center select-none" data-testid="sidebar-script-tagline">
      {resto ? <>Serve Smarter<br />Everyday ♡</> : <>Salon Smarter<br />Everyday ♡</>}
    </div>
  );
}
