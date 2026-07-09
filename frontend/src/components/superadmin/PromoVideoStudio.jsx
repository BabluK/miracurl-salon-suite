import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import ImageUploader from "@/components/ImageUploader";
import { Clapperboard, Loader2, Download, Sparkles } from "lucide-react";

const BASE = process.env.REACT_APP_BACKEND_URL;

export const PromoVideoStudio = () => {
  const [photo, setPhoto] = useState("");
  const [focus, setFocus] = useState("Staff Verification Portal — hire trusted, verified staff");
  const [language, setLanguage] = useState("en");
  const [job, setJob] = useState(null);
  const [videos, setVideos] = useState([]);
  const pollRef = useRef(null);

  const loadHistory = () => api.get("/super/promo-videos").then(r => setVideos(r.data.videos)).catch(() => {});
  useEffect(() => { loadHistory(); return () => clearInterval(pollRef.current); }, []);

  const generate = async () => {
    try {
      const { data } = await api.post("/super/promo-video", { photo_url: photo || null, focus, language });
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

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6" data-testid="promo-video-studio">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-900 text-amber-300 flex items-center justify-center"><Clapperboard className="w-5 h-5" /></div>
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Promo Video Studio</h2>
          <p className="text-xs text-slate-500 mt-0.5">Mira generates an HD Instagram reel (1080×1920) promoting Miracurl Suite — script, voiceover, visuals & captions. Download & post to get software leads.</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-5">
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-1.5">Your photo / salon photo (optional — becomes the opening scene)</p>
          <ImageUploader value={photo} onChange={setPhoto} kind="promo" />
          <p className="text-xs font-semibold text-slate-600 mt-4 mb-1.5">What should the video focus on?</p>
          <input value={focus} onChange={e => setFocus(e.target.value)} data-testid="promo-focus-input"
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400" />
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
              <p className="text-[11px] text-slate-400 mt-1">Takes 2–4 minutes — script → voiceover → 4 HD scenes → render.</p>
            </div>
          )}
        </div>

        <div>
          {job?.status === "done" && (
            <div className="bg-slate-900 rounded-2xl p-4" data-testid="promo-result">
              <video src={`${BASE}${job.video_url}`} controls className="w-full max-h-[420px] rounded-xl mx-auto" />
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
                  <div key={v.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    <span className="text-xs text-slate-600">{(v.created_at || "").slice(0, 10)} · {v.focus?.slice(0, 34)} · {v.size_mb} MB</span>
                    <a href={`${BASE}${v.video_url}`} download className="text-xs font-semibold text-fuchsia-600 inline-flex items-center gap-1"><Download className="w-3 h-3" /> Download</a>
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
