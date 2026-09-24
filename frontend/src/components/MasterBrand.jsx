import { useRef } from "react";

// Miracurl master brand — animated gold reveal (silent). Plays once on load, holds the final
// "MIRACURL SUITE" frame, and replays on hover / click.
export function SidebarMiracurlLogo() {
  const ref = useRef(null);
  const replay = () => {
    const v = ref.current;
    if (!v || !v.ended) return;
    v.currentTime = 0;
    v.play().catch(() => {});
  };
  return (
    <div className="ms-hd" onMouseEnter={replay} onClick={replay} data-testid="sidebar-miracurl-logo-block">
      <video
        ref={ref}
        className="ms-hd__video"
        autoPlay
        muted
        playsInline
        preload="auto"
        poster="/assets/brand/ms-reveal-poster.jpg"
        aria-label="Miracurl Suite"
        data-testid="sidebar-miracurl-logo-video"
      >
        <source src="/assets/brand/ms-reveal.webm" type="video/webm" />
        <source src="/assets/brand/ms-reveal.mp4" type="video/mp4" />
        <img src="/assets/brand/ms-reveal-poster.jpg" alt="Miracurl Suite" />
      </video>
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
