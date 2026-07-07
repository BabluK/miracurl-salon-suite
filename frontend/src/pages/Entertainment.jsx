import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Music, Play, Pause, Timer, Sunrise, Coffee, Flame, PartyPopper } from "lucide-react";

const CHANNELS = [
  { id: "bhakti", label: "Morning Bhakti", desc: "Devotional bhajans to open the day on a divine note", yt: "APnZiLPtpS8", spotify: "1osTTfhMyThJE1AqNRjZSw", icon: Sunrise, tint: "bg-amber-100 text-amber-700 border-amber-200" },
  { id: "chill", label: "Bollywood & Chill", desc: "Easy-going evergreen melodies for a calm salon vibe", yt: "CX8fatp6Axc", spotify: "37i9dQZF1DWX76Z8XDsZzF", icon: Coffee, tint: "bg-sky-100 text-sky-700 border-sky-200" },
  { id: "hits", label: "Hot Hits Hindi", desc: "Today's trending Bollywood chartbusters", yt: "I0b88L53Gbg", spotify: "37i9dQZF1DX0XUfTFmNBRM", icon: Flame, tint: "bg-rose-100 text-rose-700 border-rose-200" },
  { id: "party", label: "Party / Dance", desc: "High-energy jukebox for busy weekend hours", yt: "CbPZ0ittAxg", spotify: "4nNVfQ9eWidZXkBKZN5li4", icon: PartyPopper, tint: "bg-violet-100 text-violet-700 border-violet-200" },
];
const TIMER_CHOICES = [15, 30, 60];

function fmt(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function Entertainment() {
  const [params] = useSearchParams();
  const [activeId, setActiveId] = useState(() => (CHANNELS.some(c => c.id === params.get("play")) ? params.get("play") : "bhakti"));
  const [source, setSource] = useState("youtube");
  const [playing, setPlaying] = useState(() => !!params.get("play"));
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const m = parseInt(params.get("timer"), 10);
    return m > 0 ? m * 60 : 0;
  });

  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      setSecondsLeft(s => {
        if (s === 0) return 0; // non-stop mode
        if (s <= 1) {
          setPlaying(false);
          toast.info("⏰ Mira paused the music — your listening timer is done ✦");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [playing]);

  const ch = CHANNELS.find(c => c.id === activeId);

  function pick(c) {
    setActiveId(c.id);
    setPlaying(true);
  }

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)]" data-testid="entertainment-page">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center"><Music className="w-5 h-5" /></div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Entertainment</h1>
            <p className="text-xs text-slate-500 mt-0.5">Free in-salon music — pick a mood, Mira handles the rest ✦</p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
          {CHANNELS.map(c => {
            const Icon = c.icon;
            const on = c.id === activeId;
            return (
              <button key={c.id} data-testid={`channel-${c.id}`} onClick={() => pick(c)}
                className={`text-left rounded-2xl border p-4 transition shadow-sm hover:shadow-md ${on ? "border-slate-800 bg-slate-900 text-white" : "bg-white border-slate-200"}`}>
                <span className={`inline-flex w-9 h-9 rounded-lg items-center justify-center border ${c.tint}`}><Icon className="w-4.5 h-4.5" /></span>
                <div className={`font-semibold text-sm mt-3 ${on ? "text-white" : "text-slate-800"}`}>{c.label}</div>
                <div className={`text-[11px] mt-1 leading-snug ${on ? "text-slate-300" : "text-slate-500"}`}>{c.desc}</div>
              </button>
            );
          })}
        </div>

        <div className="mt-6 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-slate-300 overflow-hidden" data-testid="source-toggle">
              {["youtube", "spotify"].map(s => (
                <button key={s} data-testid={`source-${s}`} onClick={() => setSource(s)}
                  className={`text-xs px-3.5 py-1.5 font-medium capitalize ${source === s ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{s}</button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 ml-auto" data-testid="timer-controls">
              <Timer className="w-4 h-4 text-slate-400" />
              {TIMER_CHOICES.map(m => (
                <button key={m} data-testid={`timer-${m}`} onClick={() => { setSecondsLeft(m * 60); toast.success(`Music will pause after ${m} minutes`); }}
                  className={`text-[11px] px-2.5 py-1 rounded-full border font-medium ${secondsLeft > 0 && Math.ceil(secondsLeft / 60) <= m && Math.ceil(secondsLeft / 60) > (TIMER_CHOICES[TIMER_CHOICES.indexOf(m) - 1] || 0) ? "bg-amber-500 border-amber-500 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}>
                  {m}m
                </button>
              ))}
              <button data-testid="timer-off" onClick={() => setSecondsLeft(0)}
                className={`text-[11px] px-2.5 py-1 rounded-full border font-medium ${secondsLeft === 0 ? "bg-slate-800 border-slate-800 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}>
                Non-stop
              </button>
              {secondsLeft > 0 && playing && (
                <span className="text-[11px] font-mono text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-1" data-testid="timer-countdown">⏳ {fmt(secondsLeft)}</span>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-xl overflow-hidden border border-slate-200 bg-slate-950" data-testid="player-area">
            {playing ? (
              source === "youtube" ? (
                <iframe key={`yt-${ch.id}`} title={ch.label} data-testid="yt-player" className="w-full aspect-video"
                  src={`https://www.youtube.com/embed/${ch.yt}?autoplay=1&rel=0`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              ) : (
                <iframe key={`sp-${ch.id}`} title={ch.label} data-testid="spotify-player" className="w-full" style={{ height: 420 }}
                  src={`https://open.spotify.com/embed/playlist/${ch.spotify}?utm_source=generator`}
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" />
              )
            ) : (
              <div className="aspect-video flex flex-col items-center justify-center gap-3 text-slate-400">
                <button data-testid="play-btn" onClick={() => setPlaying(true)}
                  className="w-16 h-16 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center transition shadow-lg shadow-amber-500/20">
                  <Play className="w-7 h-7 ml-1" />
                </button>
                <div className="text-sm">Play <b className="text-slate-200">{ch.label}</b></div>
              </div>
            )}
          </div>

          {playing && (
            <div className="flex justify-end mt-3">
              <button data-testid="pause-btn" onClick={() => setPlaying(false)}
                className="inline-flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 font-medium">
                <Pause className="w-3.5 h-3.5" /> Stop music
              </button>
            </div>
          )}
        </div>

        <p className="text-[11px] text-slate-400 mt-4">🎵 Streams play via official YouTube / Spotify embeds — free for every salon. Tip: connect your reception speaker to this device.</p>
      </div>
    </div>
  );
}
