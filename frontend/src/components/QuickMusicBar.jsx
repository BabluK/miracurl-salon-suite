import { Link } from "react-router-dom";
import { usePlayer } from "@/context/PlayerContext";
import { MUSIC_CHANNELS, playPayload } from "@/constants/musicChannels";
import { Music, ArrowRight } from "lucide-react";

// One-tap salon music from the Dashboard — plays in the floating mini-player.
export function QuickMusicBar() {
  const player = usePlayer();
  const nowId = player?.track?.id;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 flex flex-wrap items-center gap-2 shadow-sm" data-testid="quick-music-bar">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 mr-1">
        <Music className="w-4 h-4 text-amber-500" /> Salon music
      </span>
      {MUSIC_CHANNELS.map(c => {
        const Icon = c.icon;
        const on = nowId === c.id;
        return (
          <button key={c.id} data-testid={`quick-music-${c.id}`} onClick={() => player.play(playPayload(c))}
            className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-full border transition ${on ? "bg-slate-900 border-slate-900 text-white" : `${c.tint} hover:shadow-sm`}`}>
            <Icon className="w-3 h-3" /> {c.label} {on && "▶"}
          </button>
        );
      })}
      <Link to="/entertainment" data-testid="quick-music-more" className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700 ml-auto">
        My playlists & timer <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
