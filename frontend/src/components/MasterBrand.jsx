// Miracurl master brand — shown to every tenant (salon or restaurant) at the top of the sidebar.
export function SidebarMiracurlLogo({ resto = false }) {
  return (
    <div className="flex flex-col items-center select-none w-full" data-testid="sidebar-miracurl-logo-block">
      <img src="/assets/brand/gold-lockup-stacked.png" alt="Miracurl Suite — Smart Salon Management Software" draggable="false"
        className="w-full max-w-[210px] h-auto object-contain drop-shadow-[0_8px_26px_rgba(212,175,55,0.35)]" />
      {resto && <div className="text-[8px] tracking-[0.28em] uppercase text-[#e8c56a]/80 mt-1" data-testid="sidebar-miracurl-tagline">Restaurant Edition</div>}
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
