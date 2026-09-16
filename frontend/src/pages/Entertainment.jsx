import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { usePlayer } from "@/context/PlayerContext";
import { MUSIC_CHANNELS, orderedChannels, playPayload, isBhaktiTime } from "@/constants/musicChannels";
import { Music, Timer, Plus, Trash2, Youtube, ListMusic, Play } from "lucide-react";

const TIMER_CHOICES = [15, 30, 60];

export default function Entertainment() {
  const player = usePlayer();
  const [params] = useSearchParams();
  const [source, setSource] = useState("youtube");
  const [custom, setCustom] = useState([]);
  const [form, setForm] = useState({ label: "", url: "" });
  const [adding, setAdding] = useState(false);

  const loadCustom = () => api.get("/entertainment/playlists").then(r => setCustom(r.data)).catch(() => {});
  useEffect(() => { loadCustom(); }, []);

  function playBuiltIn(c, src = source) {
    player.play(playPayload(c, src));
  }

  useEffect(() => {
    const want = params.get("play");
    const c = MUSIC_CHANNELS.find(x => x.id === want);
    if (c) {
      playBuiltIn(c, "youtube");
      const m = parseInt(params.get("timer"), 10);
      if (m > 0) player.setTimer(m);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addPlaylist(e) {
    e.preventDefault();
    setAdding(true);
    try {
      const { data } = await api.post("/entertainment/playlists", form);
      setCustom(list => [data, ...list]);
      setForm({ label: "", url: "" });
      toast.success(`"${data.label}" added to your playlists`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't add that link");
    } finally { setAdding(false); }
  }

  async function removePlaylist(p) {
    try {
      await api.delete(`/entertainment/playlists/${p.id}`);
      setCustom(list => list.filter(x => x.id !== p.id));
    } catch (err) { toast.error(err.response?.data?.detail || "Couldn't delete"); }
  }

  const nowPlaying = player.track;

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)]" data-testid="entertainment-page">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center"><Music className="w-5 h-5" /></div>
          <div className="flex-1">
            <h1 className="font-playfair text-4xl sm:text-5xl text-slate-900 leading-[1.05]">Entertainment</h1>
            <p className="text-xs text-slate-500 mt-0.5">Pick a mood — music plays in a movable mini-window on every page ✦</p>
          </div>
          {nowPlaying && (
            <span className="text-xs px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium" data-testid="now-playing-chip">
              ▶ Now playing: {nowPlaying.label}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-5">
          <div className="inline-flex rounded-full border border-slate-300 overflow-hidden" data-testid="source-toggle">
            {["youtube", "spotify"].map(s => (
              <button key={s} data-testid={`source-${s}`} onClick={() => setSource(s)}
                className={`text-xs px-3.5 py-1.5 font-medium capitalize ${source === s ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{s}</button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 ml-auto" data-testid="timer-controls">
            <Timer className="w-4 h-4 text-slate-400" />
            {TIMER_CHOICES.map(m => (
              <button key={m} data-testid={`timer-${m}`} onClick={() => { player.setTimer(m); toast.success(`Music will pause after ${m} minutes`); }}
                className="text-[11px] px-2.5 py-1 rounded-full border font-medium border-slate-300 text-slate-600 hover:bg-slate-100">
                {m}m
              </button>
            ))}
            <button data-testid="timer-off" onClick={() => player.setTimer(0)}
              className="text-[11px] px-2.5 py-1 rounded-full border font-medium border-slate-300 text-slate-600 hover:bg-slate-100">
              Non-stop
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
          {isBhaktiTime() && (
            <div data-testid="bhakti-morning-banner" className="col-span-2 lg:col-span-3 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-800">
              🌅 <b>Morning Bhakti hours (6–11 AM)</b> — start the day on a divine note. Bhakti channel is featured first; tap any other channel anytime.
            </div>
          )}
          {orderedChannels().map(c => {
            const Icon = c.icon;
            const on = nowPlaying?.id === c.id;
            const featured = isBhaktiTime() && c.id === "bhakti" && !on;
            return (
              <button key={c.id} data-testid={`channel-${c.id}`} onClick={() => playBuiltIn(c)}
                className={`text-left rounded-2xl border p-4 transition shadow-sm hover:shadow-md ${on ? "border-slate-800 bg-slate-900 text-white" : "bg-white border-slate-200"} ${featured ? "ring-2 ring-amber-300" : ""}`}>
                <span className={`inline-flex w-9 h-9 rounded-lg items-center justify-center border ${c.tint}`}><Icon className="w-4.5 h-4.5" /></span>
                <div className={`font-semibold text-sm mt-3 ${on ? "text-white" : "text-slate-800"}`}>{c.label}</div>
                <div className={`text-[11px] mt-1 leading-snug ${on ? "text-slate-300" : "text-slate-500"}`}>{c.desc}</div>
              </button>
            );
          })}
        </div>

        {/* My playlists — paste your own YouTube / Spotify links */}
        <div className="mt-8 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm" data-testid="my-playlists-card">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <ListMusic className="w-4 h-4 text-violet-500" /> My playlists
            <span className="text-[11px] text-slate-400 font-normal">— paste any YouTube video/playlist or Spotify playlist link</span>
          </h2>
          <form onSubmit={addPlaylist} className="flex flex-col sm:flex-row gap-2 mt-3">
            <input data-testid="playlist-label-input" required minLength={2} maxLength={60} value={form.label}
              onChange={e => setForm({ ...form, label: e.target.value })} placeholder="Name (e.g. Owner's favourites)"
              className="sm:w-56 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
            <input data-testid="playlist-url-input" required value={form.url}
              onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://www.youtube.com/watch?v=…  or  https://open.spotify.com/playlist/…"
              className="flex-1 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
            <button data-testid="playlist-add-btn" disabled={adding}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-violet-500 hover:bg-violet-600 text-white text-sm font-semibold disabled:opacity-50">
              <Plus className="w-4 h-4" /> Add
            </button>
          </form>
          {custom.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
              {custom.map(p => (
                <div key={p.id} data-testid={`custom-playlist-${p.id}`}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${nowPlaying?.id === p.id ? "border-slate-800 bg-slate-900 text-white" : "border-slate-200 bg-slate-50/60"}`}>
                  {p.kind === "youtube" ? <Youtube className="w-4 h-4 text-red-500 flex-shrink-0" /> : <Music className="w-4 h-4 text-green-500 flex-shrink-0" />}
                  <span className={`text-xs font-medium truncate flex-1 ${nowPlaying?.id === p.id ? "text-white" : "text-slate-700"}`}>{p.label}</span>
                  <button data-testid={`play-playlist-${p.id}`} onClick={() => player.play({ id: p.id, label: p.label, kind: p.kind, media_type: p.media_type, media_id: p.media_id })}
                    className="p-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white" title="Play"><Play className="w-3 h-3" /></button>
                  <button data-testid={`delete-playlist-${p.id}`} onClick={() => removePlaylist(p)}
                    className={`p-1.5 rounded-lg ${nowPlaying?.id === p.id ? "text-slate-400 hover:text-red-400" : "text-slate-400 hover:text-red-500 hover:bg-red-50"}`} title="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
          {custom.length === 0 && <p className="text-[11px] text-slate-400 mt-3">No playlists yet — add your salon's own music above. If this browser is logged into YouTube/Spotify, playback uses that account automatically.</p>}
        </div>

        <p className="text-[11px] text-slate-400 mt-4">🎵 Music plays via official YouTube/Spotify embeds in a draggable mini-window — move it anywhere, resize it, and keep billing while it plays. Spotify plays full songs when this browser is logged into a Spotify account.</p>
      </div>
    </div>
  );
}
