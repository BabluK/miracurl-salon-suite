import { useEffect, useRef, useState } from "react";
import { Lock, Unlock, X, Minimize2, Volume2, VolumeX } from "lucide-react";
import { playCheerSound, cheerSoundOn, setCheerSound } from "@/lib/cheerSound";
import { usePlayer } from "@/context/PlayerContext";

const POSE = {
  relaxing: { src: "/assets/dashboard/mira-dj.png", dance: "mira-dance-sway" },
  spa: { src: "/assets/dashboard/mira-spa.png", dance: "mira-dance-float" },
  positive: { src: "/assets/dashboard/mira-energy.png", dance: "mira-dance-jump" },
  bhakti: { src: "/assets/dashboard/mira-pranam.png", dance: "mira-dance-pranam", still: true },
};
const MOVES = ["groove", "spin", "moonwalk", "wave", "bounce"];
const KEY = "mira.djbot.pos";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const CONFETTI = Array.from({ length: 18 }, (_, i) => ({ id: i, left: `${(i * 53) % 100}%`, delay: `${(i % 6) * 0.07}s`, hue: [45, 340, 160, 200, 25][i % 5], rot: (i * 47) % 360 }));

/** Fire from anywhere: window.dispatchEvent(new CustomEvent("mira:cheer", { detail: { kind: "bill" | "booking" } })) */
export const miraCheer = (kind) => window.dispatchEvent(new CustomEvent("mira:cheer", { detail: { kind } }));

// Draggable, lockable, shrinkable dancing Mira that floats over every admin page while any track plays.
export function FloatingDjBot() {
  const player = usePlayer();
  const saved = load();
  const [pos, setPos] = useState(saved?.pos || { x: 290, y: window.innerHeight - 250 });
  const [locked, setLocked] = useState(saved?.locked ?? false);
  const [mini, setMini] = useState(saved?.mini ?? false);
  const [hidden, setHidden] = useState(false);
  const [cheer, setCheer] = useState(null);
  const [sound, setSound] = useState(cheerSoundOn());
  const drag = useRef(null);
  const playing = !!player.track;
  const pose = POSE[player.track?.id] || POSE.relaxing;
  const [move, setMove] = useState(0);
  useEffect(() => {
    if (!playing || pose.still) return;
    const t = setInterval(() => setMove(m => (m + 1) % MOVES.length), 4200);
    return () => clearInterval(t);
  }, [playing, pose.still]);

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify({ pos, locked, mini })); }, [pos, locked, mini]);
  useEffect(() => { if (playing) setHidden(false); }, [playing, player.track?.id]);
  useEffect(() => {
    const on = (e) => { setCheer(e.detail?.kind || "bill"); playCheerSound(); setTimeout(() => setCheer(null), 2600); };
    window.addEventListener("mira:cheer", on); return () => window.removeEventListener("mira:cheer", on);
  }, []);

  const size = mini ? 64 : 150;
  const onDown = (e) => {
    if (locked) return;
    const p = e.touches ? e.touches[0] : e;
    drag.current = { dx: p.clientX - pos.x, dy: p.clientY - pos.y, moved: false };
    e.preventDefault();
  };
  useEffect(() => {
    const mv = (e) => {
      if (!drag.current) return;
      const p = e.touches ? e.touches[0] : e;
      drag.current.moved = true;
      const x = Math.min(Math.max(8, p.clientX - drag.current.dx), window.innerWidth - size);
      const y = Math.min(Math.max(8, p.clientY - drag.current.dy), window.innerHeight - size - 40);
      setPos({ x, y });
    };
    const up = () => { drag.current = null; };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", mv, { passive: false }); window.addEventListener("touchend", up);
    return () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); window.removeEventListener("touchmove", mv); window.removeEventListener("touchend", up); };
  }, [size]);

  if (!playing || hidden) return null;
  const moveCls = pose.still ? "move-pranam" : cheer ? "move-cheer" : `move-${MOVES[move]}`;
  return (
    <div className={`floating-dj ${locked ? "is-locked" : "is-free"} ${mini ? "is-mini" : ""} ${cheer ? "is-cheering" : ""}`} style={{ left: pos.x, top: pos.y }}
      data-testid="floating-dj-bot" data-locked={locked ? "true" : "false"} data-mini={mini ? "true" : "false"} data-cheer={cheer || ""}>
      <div className="floating-dj__tools">
        {!mini && <button onClick={() => { setCheerSound(!sound); setSound(!sound); if (!sound) playCheerSound(); }} title={sound ? "Cheer sound on — click to mute" : "Cheer sound muted — click to enable"} data-testid="floating-dj-sound-btn" data-on={sound ? "true" : "false"}>
          {sound ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
        </button>}
        {!mini && <button onClick={() => setMini(true)} title="Mini mode" data-testid="floating-dj-mini-btn"><Minimize2 className="w-3.5 h-3.5" /></button>}
        <button onClick={() => setLocked(l => !l)} title={locked ? "Unlock to move" : "Lock in place"} data-testid="floating-dj-lock-btn">
          {locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
        </button>
        <button onClick={() => setHidden(true)} title="Hide until next song" data-testid="floating-dj-hide-btn"><X className="w-3.5 h-3.5" /></button>
      </div>
      <div className={`floating-dj__stage mira-dancing ${pose.dance} ${moveCls}`} data-move={pose.still ? "pranam" : cheer ? "cheer" : MOVES[move]} data-testid="floating-dj-stage"
        onMouseDown={onDown} onTouchStart={onDown} onClick={() => { if (mini && !drag.current?.moved) setMini(false); }} title={mini ? "Tap to expand" : ""}>
        <span className="floating-dj__spot" />
        <span className="mira-glow" />
        {!pose.still && <><span className="mira-note n1">♪</span><span className="mira-note n2">♫</span><span className="mira-note n3">♪</span>
          <span className="mira-note n4">♬</span><span className="mira-note n5">♪</span></>}
        {pose.still && <><span className="mira-diya d1">🪔</span><span className="mira-diya d2">✿</span><span className="mira-diya d3">✿</span></>}
        {cheer && <span className="floating-dj__confetti" data-testid="floating-dj-confetti" aria-hidden="true">
          {CONFETTI.map(c => <i key={c.id} style={{ left: c.left, animationDelay: c.delay, "--h": c.hue, "--r": `${c.rot}deg` }} />)}
        </span>}
        <img key={pose.src} src={pose.src} alt="Mira dancing" draggable="false" data-testid="floating-dj-pose" data-pose={player.track?.id || ""} />
      </div>
      {!mini && <div className="floating-dj__track" data-testid="floating-dj-track">
        {cheer ? (cheer === "booking" ? "🎉 New booking!" : "🎉 Bill done!") : `♪ ${player.track?.title || player.track?.label || "Now playing"}`}
      </div>}
    </div>
  );
}
