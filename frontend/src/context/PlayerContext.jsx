import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const PlayerCtx = createContext(null);

export function buildEmbedSrc(ch) {
  if (ch.kind === "spotify") {
    return `https://open.spotify.com/embed/${ch.media_type || "playlist"}/${ch.media_id}?utm_source=generator`;
  }
  // No autoplay: YouTube blocks autoplaying embeds of label music ("Video unavailable").
  // One tap on the mini-player starts playback reliably for every video.
  // Instrumental/royalty-free channels opt in via ch.autoplay so the tap starts the music straight away.
  const auto = ch.autoplay ? "&autoplay=1&playsinline=1" : "";
  if ((ch.media_type || "video") === "playlist") {
    return `https://www.youtube.com/embed/videoseries?list=${ch.media_id}&rel=0${auto}`;
  }
  return `https://www.youtube.com/embed/${ch.media_id}?rel=0${auto}`;
}

// Global music state: the floating player keeps playing across every page.
export function PlayerProvider({ children }) {
  const [track, setTrack] = useState(null); // {id,label,kind,media_type,media_id,src}
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!track) return undefined;
    const id = setInterval(() => {
      setSecondsLeft(s => {
        if (s === 0) return 0; // non-stop
        if (s <= 1) {
          setTrack(null);
          toast.info("⏰ Mira paused the music — your listening timer is done ✦");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [track]);

  const value = useMemo(() => ({
    track,
    secondsLeft,
    play: (ch) => setTrack({ ...ch, src: buildEmbedSrc(ch) }),
    stop: () => setTrack(null),
    setTimer: (mins) => setSecondsLeft(mins > 0 ? mins * 60 : 0),
  }), [track, secondsLeft]);

  return <PlayerCtx.Provider value={value}>{children}</PlayerCtx.Provider>;
}

export const usePlayer = () => useContext(PlayerCtx);
