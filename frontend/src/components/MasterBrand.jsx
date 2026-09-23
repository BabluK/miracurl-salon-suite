// Miracurl master brand — shown to every tenant (salon or restaurant) at the top of the sidebar.
export function SidebarMiracurlLogo() {
  return (
    <div className="flex flex-col items-center select-none w-full" data-testid="sidebar-miracurl-logo-block">
      <img src="/assets/brand/ms-suite-banner.png" alt="Miracurl Suite — Smart Salon & Restaurant Management Software" draggable="false"
        className="w-full h-auto object-contain drop-shadow-[0_8px_26px_rgba(212,175,55,0.35)]" />
    </div>
  );
}

export function SidebarScriptTagline({ resto = false }) {
  return (
    <div className="relative px-3 pt-4 pb-1" data-testid="sidebar-script-tagline">
      <span className="tagline-swirl" aria-hidden="true" />
      <div className="relative font-playfair italic text-[22px] leading-[1.15] text-[#e8c56a] sidebar-tagline">
        {resto ? <>Serve<br />Smarter<br />Everyday ♡</> : <>Salon<br />Smarter<br />Everyday ♡</>}
      </div>
    </div>
  );
}
