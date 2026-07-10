import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import ImageUploader from "@/components/ImageUploader";
import { Clapperboard, Loader2, Download, Sparkles, Trash2 } from "lucide-react";

const BASE = process.env.REACT_APP_BACKEND_URL;

export const PromoVideoStudio = () => {
  const [photo, setPhoto] = useState("");
  const [greeting, setGreeting] = useState("");
  const [mode, setMode] = useState("feature_tour");
  const [focus, setFocus] = useState("Staff Verification Portal — hire trusted, verified staff");
  const [language, setLanguage] = useState("en");
  const [size, setSize] = useState("reel");
  const [express, setExpress] = useState(true);
  const [job, setJob] = useState(null);
  const [videos, setVideos] = useState([]);
  const [now, setNow] = useState(Date.now());
  const pollRef = useRef(null);

  const loadHistory = () => api.get("/super/promo-videos").then(r => setVideos(r.data.videos)).catch(() => {});
  useEffect(() => { loadHistory(); return () => clearInterval(pollRef.current); }, []);

  const generate = async () => {
    try {
      const { data } = await api.post("/super/promo-video", { photo_url: photo || null, mode, focus, language, size, express, greeting });
      setJob({ id: data.job_id, status: "generating", progress: "Mira is writing the script…" });
      pollRef.current = setInterval(async () => {
        const { data: st } = await api.get(`/super/promo-video/${data.job_id}`);
        setJob(st);
        if (st.status !== "generating") {
          clearInterval(pollRef.current);
          if (st.status === "done") { toast.success("Your promo reel is ready 🎬"); loadHistory(); }
          else toast.error(st.error || "Video generation failed");
        }
      }, 4000);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't start generation");
    }
  };

  const busy = job?.status === "generating";

  useEffect(() => {
    if (!busy) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const fmtDur = (s) => `${Math.floor(s / 60)}m ${String(Math.floor(s % 60)).padStart(2, "0")}s`;
  const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
  const elapsedSec = job?.created_at ? Math.max(0, (now - new Date(job.created_at).getTime()) / 1000) : 0;

  async function delVideo(id) {
    if (!window.confirm("Delete this video permanently?")) return;
    try { await api.delete(`/super/promo-video/${id}`); toast.success("Video deleted"); loadHistory(); }
    catch (e) { toast.error(e.response?.data?.detail || "Delete failed"); }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6" data-testid="promo-video-studio">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-900 text-amber-300 flex items-center justify-center"><Clapperboard className="w-5 h-5" /></div>
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Promo Video Studio</h2>
          <p className="text-xs text-slate-500 mt-0.5">Mira generates an HD promo video with your logo — script, voiceover, visuals & captions. Pick size & speed, download and post to get software leads.</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-5">
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-1.5">Video type</p>
          <div className="flex gap-2 mb-4">
            <button data-testid="promo-mode-tour" onClick={() => setMode("feature_tour")}
              className={`text-xs px-3 py-2 rounded-xl border font-medium ${mode === "feature_tour" ? "border-fuchsia-400 bg-fuchsia-50 text-fuchsia-700" : "border-slate-200 text-slate-500"}`}>
              ✦ Mira presents — full feature tour
            </button>
            <button data-testid="promo-mode-custom" onClick={() => setMode("custom")}
              className={`text-xs px-3 py-2 rounded-xl border font-medium ${mode === "custom" ? "border-fuchsia-400 bg-fuchsia-50 text-fuchsia-700" : "border-slate-200 text-slate-500"}`}>
              Custom focus
            </button>
          </div>
          {mode === "feature_tour" && (
            <p className="text-[11px] text-slate-400 -mt-2 mb-3">Mira appears as the host, introduces herself in her own voice, and tours every feature — bookings, POS, CRM, Staff Verification Portal, AI marketing &amp; more. No photo needed.</p>
          )}
          <p className="text-xs font-semibold text-slate-600 mb-1.5">Your photo / salon photo (optional — becomes scene 2)</p>
          <ImageUploader value={photo} onChange={setPhoto} kind="promo" />
          {photo && <>
            <p className="text-xs font-semibold text-slate-600 mt-3 mb-1.5">Greeting line (Mira introduces you in the voiceover)</p>
            <input value={greeting} onChange={e => setGreeting(e.target.value)} data-testid="promo-greeting-input"
              placeholder='e.g. "Meet Bablu, founder of Miracurl"'
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400" />
          </>}
          {mode === "custom" && <>
          <p className="text-xs font-semibold text-slate-600 mt-4 mb-1.5">What should the video focus on?</p>
          <input value={focus} onChange={e => setFocus(e.target.value)} data-testid="promo-focus-input"
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400" />
          </>}
          <p className="text-xs font-semibold text-slate-600 mt-4 mb-1.5">Video size</p>
          <div className="flex gap-2">
            {[["reel", "Reel 9:16", "Instagram / Shorts"], ["square", "Square 1:1", "Feed post"], ["landscape", "Wide 16:9", "YouTube / site"]].map(([id, label, hint]) => (
              <button key={id} data-testid={`promo-size-${id}`} onClick={() => setSize(id)}
                className={`text-xs px-3 py-2 rounded-xl border font-medium text-left ${size === id ? "border-fuchsia-400 bg-fuchsia-50 text-fuchsia-700" : "border-slate-200 text-slate-500"}`}>
                <span className="block">{label}</span>
                <span className="block text-[10px] opacity-70">{hint}</span>
              </button>
            ))}
          </div>
          <p className="text-xs font-semibold text-slate-600 mt-4 mb-1.5">Speed</p>
          <div className="flex gap-2">
            <button data-testid="promo-speed-express" onClick={() => setExpress(true)}
              className={`text-xs px-3 py-2 rounded-xl border font-medium text-left ${express ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500"}`}>
              <span className="block">⚡ Express — ~1 min</span>
              <span className="block text-[10px] opacity-70">Real app screenshots</span>
            </button>
            <button data-testid="promo-speed-ai" onClick={() => setExpress(false)}
              className={`text-xs px-3 py-2 rounded-xl border font-medium text-left ${!express ? "border-fuchsia-400 bg-fuchsia-50 text-fuchsia-700" : "border-slate-200 text-slate-500"}`}>
              <span className="block">✨ AI Scenes — 2–4 min</span>
              <span className="block text-[10px] opacity-70">HD AI-generated visuals</span>
            </button>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <select value={language} onChange={e => setLanguage(e.target.value)} data-testid="promo-lang-select"
              className="text-sm px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 min-w-[160px]">
              <option value="en">English voiceover</option>
              <option value="hi">Hindi voiceover</option>
            </select>
            <button data-testid="promo-generate-btn" onClick={generate} disabled={busy}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-600 text-white text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {busy ? "Generating…" : "Generate reel ✦"}
            </button>
          </div>
          {busy && (
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4" data-testid="promo-progress">
              <p className="text-sm text-slate-700 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-fuchsia-500" /> {job.progress}</p>
              <p className="text-xs font-semibold text-slate-600 mt-2" data-testid="promo-elapsed">
                🕐 Started at {fmtTime(job.created_at)} · running for {fmtDur(elapsedSec)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {express ? "Express usually takes ~1 minute — script → voiceover → render." : "Usually takes 2–4 minutes — script → voiceover → HD AI scenes → render."}
                {" "}Safe to leave this tab open — the finished video also appears under &ldquo;Previous reels&rdquo;.
              </p>
            </div>
          )}
          {job?.status === "failed" && (
            <div className="mt-4 bg-rose-50 border border-rose-200 rounded-xl p-4" data-testid="promo-failed">
              <p className="text-sm font-semibold text-rose-700">Generation failed{job.duration_sec ? ` after ${fmtDur(job.duration_sec)}` : ""}</p>
              <p className="text-xs text-rose-600 mt-1">{job.error}</p>
              <p className="text-[11px] text-slate-500 mt-2">Tip: <b>⚡ Express mode</b> is the most reliable on the live server — it skips heavy AI scene generation. Click &ldquo;Generate reel&rdquo; to retry.</p>
            </div>
          )}
        </div>

        <div>
          {job?.status === "done" && (
            <div className="bg-slate-900 rounded-2xl p-4" data-testid="promo-result">
              <video src={`${BASE}${job.video_url}`} controls className="w-full max-h-[420px] rounded-xl mx-auto" />
              <p className="text-xs text-emerald-300 mt-2 font-semibold" data-testid="promo-finished-time">
                ✅ Finished at {fmtTime(job.finished_at)}{job.duration_sec ? ` — took ${fmtDur(job.duration_sec)}` : ""}
              </p>
              <a href={`${BASE}${job.video_url}`} download="miracurl-promo-reel.mp4" data-testid="promo-download-btn"
                className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-400 text-slate-900 text-sm font-bold">
                <Download className="w-4 h-4" /> Download MP4 ({job.size_mb} MB) — post it on Instagram!
              </a>
            </div>
          )}
          {!job?.video_url && videos.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-2">Previous reels</p>
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {videos.map(v => (
                  <div key={v.id} className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    <span className="text-xs text-slate-600 min-w-0 truncate">
                      {(v.created_at || "").slice(0, 16).replace("T", " ")} · {v.size_mb} MB{v.duration_sec ? ` · made in ${Math.floor(v.duration_sec / 60)}m ${v.duration_sec % 60}s` : ""}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <a href={`${BASE}${v.video_url}`} download className="text-xs font-semibold text-fuchsia-600 inline-flex items-center gap-1" data-testid={`video-download-${v.id}`}><Download className="w-3 h-3" /> Download</a>
                      <button onClick={() => delVideo(v.id)} data-testid={`video-delete-${v.id}`}
                        className="w-6 h-6 rounded-md bg-rose-50 text-rose-500 hover:bg-rose-100 flex items-center justify-center" title="Delete video">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
