// Miracurl master brand — shown to every tenant (salon or restaurant) at the top of the sidebar.
export function SidebarMiracurlLogo({ variant = "sidebar" }) {
  const login = variant === "login";
  return (
    <div className={`ms-lockup ${login ? "ms-lockup--login" : ""}`} data-testid="sidebar-miracurl-logo-block">
      <div className="ms-lockup__row">
        <span className="ms-lockup__emblem" aria-hidden="true">
          <img src="/assets/ms-logo-ring.png" alt="" draggable="false" />
          <span className="ms-spark s1">✦</span><span className="ms-spark s2">✦</span><span className="ms-spark s3">✦</span>
        </span>
        <span className="ms-lockup__text">
          <span className="ms-lockup__word" data-text="Miracurl" data-testid="sidebar-miracurl-wordmark">Miracurl</span>
          <span className="ms-lockup__suite"><i /><b>Suite</b><i /></span>
          <span className="ms-lockup__sub">Smart Salon &amp; Restaurant<br />Management Software</span>
        </span>
      </div>
      <span className="ms-lockup__tag">Manage. Automate. Grow.</span>
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
