import { useEffect, useState, useRef, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Clapperboard, Loader2, Trash2, Download, Sparkles, KeyRound } from "lucide-react";

export const VeoAdStudio = () => {
  const [concept, setConcept] = useState("Full Miracurl Salon Suite ad — online booking, WhatsApp automation, staff payroll, GST billing and the 12-agent AI team, for Indian salon owners");
  const [scenes, setScenes] = useState(2);
  const [aspect, setAspect] = useState("9:16");
  const [mode, setMode] = useState("cinematic");
  const [job, setJob] = useState(null);
  const [videos, setVideos] = useState([]);
  const [configured, setConfigured] = useState(true);
  const pollRef = useRef(null);

  const loadList = useCallback(() => {
    api.get("/super/veo-ads").then(r => {
      setVideos(r.data.videos);
      setConfigured(r.data.configured);
      if (r.data.active) { setJob(r.data.active); poll(r.data.active.id); }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { loadList(); return () => clearInterval(pollRef.current); }, [loadList]);

  const poll = (id) => {
    clearInterval(pollRef.current);
    let misses = 0;
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/super/veo-ad/${id}`);
        misses = 0;
        setJob(data);
        if (data.status !== "generating") {
          clearInterval(pollRef.current);
          if (data.status === "done") { toast.success("Cinematic ad is ready 🎬"); loadList(); }
          else toast.error(data.error || "Generation failed");
        }
      } catch {
        misses += 1;
        if (misses >= 10) clearInterval(pollRef.current);
      }
    }, 6000);
  };

  const generate = async () => {
    try {
      const { data } = await api.post("/super/veo-ad", { concept, scenes: Number(scenes), aspect_ratio: aspect, mode });
      setJob({ id: data.job_id, status: "generating", progress: "Starting…" });
      poll(data.job_id);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't start");
    }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this ad video?")) return;
    await api.delete(`/super/veo-ad/${id}`).catch(() => {});
    loadList();
  };

  const generating = job?.status === "generating";

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5" data-testid="veo-ad-studio">
      <div>
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Clapperboard className="w-5 h-5 text-fuchsia-600" /> Veo Cinematic Ad <span className="text-[10px] bg-fuchsia-100 text-fuchsia-700 px-2 py-0.5 rounded-full font-bold">TRUE AI VIDEO</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">Google Veo 3.1 films real cinematic scenes with voice & sound — Mira writes the script, Veo shoots each 8s scene, ffmpeg stitches the final ad ({scenes * 8}s).</p>
      </div>

      {!configured && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 flex items-start gap-2" data-testid="veo-key-missing">
          <KeyRound className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Needs your <b>Google Gemini API key</b> (with billing) — get one at <b>aistudio.google.com</b> → API Keys, then ask Mira's developer to add it as GEMINI_API_KEY. Each 8s scene costs ~$2–6 on your Google billing.</span>
        </div>
      )}

      <div className="flex gap-3" data-testid="veo-mode-toggle">
        <button onClick={() => setMode("cinematic")} data-testid="veo-mode-cinematic"
          className={`flex-1 rounded-xl border-2 p-3 text-left transition-colors ${mode === "cinematic" ? "border-fuchsia-500 bg-fuchsia-50" : "border-slate-200 hover:border-slate-300"}`}>
          <p className="text-sm font-bold text-slate-800">🎥 Cinematic Scenes</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Story-style ad — salon scenes, customers, voiceover</p>
        </button>
        <button onClick={() => setMode("avatar")} data-testid="veo-mode-avatar"
          className={`flex-1 rounded-xl border-2 p-3 text-left transition-colors flex items-center gap-3 ${mode === "avatar" ? "border-fuchsia-500 bg-fuchsia-50" : "border-slate-200 hover:border-slate-300"}`}>
          <img src="/assets/mira-avatar.png" alt="Mira avatar" className="w-11 h-11 rounded-full object-cover object-top border-2 border-amber-300" />
          <span>
            <p className="text-sm font-bold text-slate-800">👩 Mira Avatar Presenter</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Mira speaks your ad to camera — her own AI avatar, no selfie needed</p>
          </span>
        </button>
      </div>

      <textarea value={concept} onChange={e => setConcept(e.target.value)} rows={3} maxLength={600}
        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" data-testid="veo-concept-input" />
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-slate-500 font-semibold">Scenes
          <select value={scenes} onChange={e => setScenes(e.target.value)} data-testid="veo-scenes-select"
            className="block border border-slate-200 rounded-xl px-3 py-2 text-sm mt-1">
            {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} × 8s = {n * 8}s</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500 font-semibold">Format
          <select value={aspect} onChange={e => setAspect(e.target.value)} data-testid="veo-aspect-select"
            className="block border border-slate-200 rounded-xl px-3 py-2 text-sm mt-1">
            <option value="9:16">Reel 9:16</option>
            <option value="16:9">Landscape 16:9</option>
          </select>
        </label>
        <button onClick={generate} disabled={generating || !configured} data-testid="veo-generate-btn"
          className="ml-auto px-5 py-2.5 rounded-xl bg-fuchsia-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-2">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? "Filming…" : "Generate Cinematic Ad"}
        </button>
      </div>

      {generating && (
        <div className="bg-slate-900 rounded-xl p-4 text-xs text-fuchsia-300 font-mono" data-testid="veo-progress">
          {job.progress || "Working…"} <span className="text-slate-500">(takes 2–10 min — safe to leave this page)</span>
        </div>
      )}
      {job?.status === "failed" && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-700" data-testid="veo-error">{job.error}</div>
      )}

      {videos.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map(v => (
            <div key={v.id} className="border border-slate-200 rounded-xl overflow-hidden" data-testid={`veo-video-${v.id}`}>
              <video src={`${process.env.REACT_APP_BACKEND_URL}${v.video_url}`} controls className="w-full bg-black" style={{ maxHeight: 260 }} />
              <div className="p-2.5 flex items-center justify-between text-[11px] text-slate-500">
                <span>{v.duration_sec}s · {v.size_mb}MB · {v.aspect_ratio}</span>
                <span className="flex gap-1">
                  <a href={`${process.env.REACT_APP_BACKEND_URL}${v.video_url}`} download data-testid={`veo-download-${v.id}`}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"><Download className="w-3.5 h-3.5" /></a>
                  <button onClick={() => del(v.id)} data-testid={`veo-delete-${v.id}`}
                    className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
