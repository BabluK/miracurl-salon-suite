import { useRef, useState } from "react";

// Miracurl master brand — animated gold reveal (silent). Plays ONCE per login, then rests on the final frame;
// later page visits in the same session show the still poster. Browser overlays are disabled.
const PLAYED_KEY = "ms_logo_played";
const alreadyPlayed = () => { try { return sessionStorage.getItem(PLAYED_KEY) === "1"; } catch { return false; } };

export function SidebarMiracurlLogo() {
  const [still] = useState(alreadyPlayed);
  const ref = useRef(null);
  const onEnded = () => {
    try { sessionStorage.setItem(PLAYED_KEY, "1"); } catch { /* private mode */ }
    if (ref.current) ref.current.pause();
  };
  return (
    <div className="ms-hd" data-testid="sidebar-miracurl-logo-block">
      {still ? (
        <img src="/assets/brand/ms-reveal-poster.jpg" alt="Miracurl Suite" className="ms-hd__video" data-testid="sidebar-miracurl-logo-still" />
      ) : (
        <video
          ref={ref}
          className="ms-hd__video"
          autoPlay
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          controls={false}
          controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
          poster="/assets/brand/ms-reveal-poster.jpg"
          aria-label="Miracurl Suite"
          onEnded={onEnded}
          data-testid="sidebar-miracurl-logo-video"
        >
          <source src="/assets/brand/ms-reveal.webm" type="video/webm" />
          <source src="/assets/brand/ms-reveal.mp4" type="video/mp4" />
          <img src="/assets/brand/ms-reveal-poster.jpg" alt="Miracurl Suite" />
        </video>
      )}
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
