// Miracurl master brand — shown to every tenant (salon or restaurant) at the top of the sidebar.
export function SidebarMiracurlLogo() {
  // HD user-supplied lockup; light-sweep + twinkles are masked to the logo pixels so the sparkle plays over "MIRACURL SUITE".
  return (
    <div className="ms-hd" style={{ "--ms-mask": "url(/assets/brand/ms-hd-lockup.png)" }} data-testid="sidebar-miracurl-logo-block">
      <img src="/assets/brand/ms-hd-lockup.png" alt="Miracurl Suite" draggable="false" className="ms-hd__img" />
      <span className="ms-hd__sweep" aria-hidden="true" />
      <span className="ms-hd__glint g1" aria-hidden="true" /><span className="ms-hd__glint g2" aria-hidden="true" /><span className="ms-hd__glint g3" aria-hidden="true" />
      <span className="ms-spark s1">✦</span><span className="ms-spark s2">✦</span><span className="ms-spark s3">✦</span>
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
