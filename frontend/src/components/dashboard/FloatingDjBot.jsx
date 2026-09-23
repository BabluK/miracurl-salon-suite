import { useEffect, useRef, useState } from "react";
import { Lock, Unlock, X } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";

const POSE = {
  relaxing: { src: "/assets/dashboard/mira-dj.png", dance: "mira-dance-sway" },
  spa: { src: "/assets/dashboard/mira-spa.png", dance: "mira-dance-float" },
  positive: { src: "/assets/dashboard/mira-energy.png", dance: "mira-dance-jump" },
};
const KEY = "mira.djbot.pos";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };

// Draggable, lockable dancing Mira that floats over the dashboard while any track plays.
export function FloatingDjBot() {
  const player = usePlayer();
  const saved = load();
  const [pos, setPos] = useState(saved?.pos || { x: 290, y: window.innerHeight - 250 });
  const [locked, setLocked] = useState(saved?.locked ?? false);
  const [hidden, setHidden] = useState(false);
  const drag = useRef(null);
  const playing = !!player.track;
  const pose = POSE[player.track?.id] || POSE.relaxing;

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify({ pos, locked })); }, [pos, locked]);
  useEffect(() => { if (playing) setHidden(false); }, [playing, player.track?.id]);

  const onDown = (e) => {
    if (locked) return;
    const p = e.touches ? e.touches[0] : e;
    drag.current = { dx: p.clientX - pos.x, dy: p.clientY - pos.y };
    e.preventDefault();
  };
  useEffect(() => {
    const move = (e) => {
      if (!drag.current) return;
      const p = e.touches ? e.touches[0] : e;
      const x = Math.min(Math.max(8, p.clientX - drag.current.dx), window.innerWidth - 150);
      const y = Math.min(Math.max(8, p.clientY - drag.current.dy), window.innerHeight - 190);
      setPos({ x, y });
    };
    const up = () => { drag.current = null; };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", move, { passive: false }); window.addEventListener("touchend", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); window.removeEventListener("touchmove", move); window.removeEventListener("touchend", up); };
  }, []);

  if (!playing || hidden) return null;
  return (
    <div className={`floating-dj ${locked ? "is-locked" : "is-free"}`} style={{ left: pos.x, top: pos.y }} data-testid="floating-dj-bot" data-locked={locked ? "true" : "false"}>
      <div className="floating-dj__tools">
        <button onClick={() => setLocked(l => !l)} title={locked ? "Unlock to move" : "Lock in place"} data-testid="floating-dj-lock-btn">
          {locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
        </button>
        <button onClick={() => setHidden(true)} title="Hide until next song" data-testid="floating-dj-hide-btn"><X className="w-3.5 h-3.5" /></button>
      </div>
      <div className={`floating-dj__stage mira-dancing ${pose.dance}`} onMouseDown={onDown} onTouchStart={onDown}>
        <span className="floating-dj__spot" />
        <span className="mira-glow" />
        <span className="mira-note n1">♪</span><span className="mira-note n2">♫</span><span className="mira-note n3">♪</span>
        <span className="mira-note n4">♬</span><span className="mira-note n5">♪</span>
        <img key={pose.src} src={pose.src} alt="Mira dancing" draggable="false" data-testid="floating-dj-pose" data-pose={player.track?.id || ""} />
      </div>
      <div className="floating-dj__track" data-testid="floating-dj-track">♪ {player.track?.title || player.track?.label || "Now playing"}</div>
    </div>
  );
}
