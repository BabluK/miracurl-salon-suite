import { useRef, useState } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { GripHorizontal, Maximize2, Minimize2, X, Music } from "lucide-react";

function fmt(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Movable mini-player — keeps the music running on every page.
export function FloatingPlayer() {
  const player = usePlayer();
  const [pos, setPos] = useState(null); // null = docked bottom-right
  const [big, setBig] = useState(false);
  const boxRef = useRef(null);

  if (!player?.track) return null;
  const { track, secondsLeft } = player;

  const width = big ? 560 : 320;
  const height = track.kind === "spotify" ? (big ? 380 : 232) : Math.round(width * 9 / 16);

  function startDrag(e) {
    e.preventDefault();
    const rect = boxRef.current.getBoundingClientRect();
    const offX = e.clientX - rect.left;
    const offY = e.clientY - rect.top;
    function move(ev) {
      setPos({
        x: Math.max(4, Math.min(window.innerWidth - rect.width - 4, ev.clientX - offX)),
        y: Math.max(4, Math.min(window.innerHeight - 48, ev.clientY - offY)),
      });
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const style = pos
    ? { left: pos.x, top: pos.y, width }
    : { right: 16, bottom: 16, width };

  return (
    <div ref={boxRef} style={style} data-testid="floating-player"
      className="fixed z-[70] rounded-xl overflow-hidden shadow-2xl shadow-black/40 border border-slate-700 bg-slate-950">
      <div onPointerDown={startDrag} data-testid="floating-player-handle"
        className="flex items-center gap-2 px-3 py-2 bg-slate-900 cursor-move select-none touch-none">
        <GripHorizontal className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
        <Music className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
        <span className="text-xs text-slate-200 font-medium truncate flex-1">{track.label}</span>
        {secondsLeft > 0 && (
          <span className="text-[10px] font-mono text-amber-400" data-testid="floating-player-timer">⏳ {fmt(secondsLeft)}</span>
        )}
        <button data-testid="floating-player-size" onPointerDown={e => e.stopPropagation()} onClick={() => setBig(b => !b)}
          className="text-slate-400 hover:text-white p-0.5" title={big ? "Smaller" : "Bigger"}>
          {big ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
        <button data-testid="floating-player-close" onPointerDown={e => e.stopPropagation()} onClick={player.stop}
          className="text-slate-400 hover:text-red-400 p-0.5" title="Stop music">
          <X className="w-4 h-4" />
        </button>
      </div>
      <iframe key={track.src} title={track.label} src={track.src} style={{ width: "100%", height }}
        data-testid="floating-player-iframe"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
    </div>
  );
}
