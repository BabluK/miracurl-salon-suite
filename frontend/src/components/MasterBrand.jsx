// Miracurl master brand — animated gold reveal (silent), loops continuously. Browser overlays
// (picture-in-picture, captions, controls) are disabled so only the animation shows.
export function SidebarMiracurlLogo() {
  return (
    <div className="ms-hd" data-testid="sidebar-miracurl-logo-block">
      <video
        className="ms-hd__video"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
        disableRemotePlayback
        controls={false}
        controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
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
