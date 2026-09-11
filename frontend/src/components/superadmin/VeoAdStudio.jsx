import { useEffect, useState, useRef, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Clapperboard, Loader2, Trash2, Download, Sparkles, KeyRound, Upload, X, Contact, FileText, ChevronDown } from "lucide-react";
import { confirmAsync } from "@/components/ConfirmDialog";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const DURATIONS = [{ s: 30, scenes: 4 }, { s: 40, scenes: 5 }, { s: 60, scenes: 8 }];
const DEFAULT_CONCEPT = "Full Miracurl Salon Suite ad — online booking, WhatsApp automation, staff payroll, GST billing and the 12-agent AI team, for Indian salon owners";

function BrandContactsEditor() {
  const [open, setOpen] = useState(false);
  const [c, setC] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get("/super/brand-contacts").then(r => setC(r.data)).catch(() => {}); }, []);
  if (!c) return null;
  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/super/brand-contacts", { phone: c.phone, instagram: c.instagram, email: c.email, website: c.website, tagline: c.tagline });
      setC(data); toast.success("Brand end card updated ✦");
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't save"); }
    finally { setSaving(false); }
  };
  const F = ({ k, label, ph }) => (
    <label className="text-[11px] text-slate-500 font-semibold">{label}
      <input value={c[k] || ""} onChange={e => setC({ ...c, [k]: e.target.value })} placeholder={ph} data-testid={`brand-contact-${k}`}
        className="block w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm mt-0.5 text-slate-800" />
    </label>
  );
  return (
    <div className="border border-amber-200 bg-amber-50/40 rounded-xl" data-testid="brand-contacts-card">
      <button type="button" onClick={() => setOpen(o => !o)} data-testid="brand-contacts-toggle"
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold text-amber-800">
        <span className="inline-flex items-center gap-2"><Contact className="w-4 h-4" /> Brand end card · {c.phone || "no phone yet"} · {c.instagram || "no Instagram yet"}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 grid sm:grid-cols-2 gap-3">
          <F k="phone" label="Call / WhatsApp" ph="+91 98765 43210" />
          <F k="instagram" label="Instagram" ph="@miracurl.suite" />
          <F k="email" label="Email" ph="support@miracurl-suite.com" />
          <F k="website" label="Website" ph="miracurl-suite.com" />
          <F k="tagline" label="Tagline" ph="Smart Salon Management Software" />
          <div className="flex items-end">
            <button onClick={save} disabled={saving} data-testid="brand-contacts-save"
              className="px-4 py-2 rounded-lg bg-amber-600 text-white text-xs font-bold disabled:opacity-50">{saving ? "Saving…" : "Save end card"}</button>
          </div>
          <p className="sm:col-span-2 text-[11px] text-amber-700">These details are burned into the last 4 seconds of every video (gold MS logo · MIRACURL SUITE · email · call · Instagram · website) — and the MS watermark sits on every frame.</p>
        </div>
      )}
    </div>
  );
}

export const VeoAdStudio = () => {
  const [concept, setConcept] = useState(DEFAULT_CONCEPT);
  const [duration, setDuration] = useState(40);
  const [aspect, setAspect] = useState("9:16");
  const [mode, setMode] = useState("cinematic");
  const [photo, setPhoto] = useState(null); // {photo_id, url}
  const [uploading, setUploading] = useState(false);
  const [job, setJob] = useState(null);
  const [videos, setVideos] = useState([]);
  const [configured, setConfigured] = useState(true);
  const [scriptOpen, setScriptOpen] = useState(null);
  const pollRef = useRef(null);
  const fileRef = useRef(null);

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

  const uploadPhoto = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const { data } = await api.post("/super/veo-ad/photo", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setPhoto(data); if (mode === "cinematic") setMode("photo");
      toast.success("Photo ready — Mira will feature it in the video");
    } catch (e) { toast.error(e.response?.data?.detail || "Upload failed"); }
    finally { setUploading(false); }
  };

  const generate = async () => {
    try {
      const { data } = await api.post("/super/veo-ad", {
        concept, duration, aspect_ratio: aspect, mode: mode === "photo" && !photo ? "cinematic" : mode,
        photo_id: photo?.photo_id || null, brand_card: true,
      });
      setJob({ id: data.job_id, status: "generating", progress: "Starting…" });
      poll(data.job_id);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't start");
    }
  };

  const del = async (id) => {
    if (!await confirmAsync("Delete this ad video?")) return;
    await api.delete(`/super/veo-ad/${id}`).catch(() => {});
    loadList();
  };

  const generating = job?.status === "generating";
  const scenes = DURATIONS.find(d => d.s === duration)?.scenes || 5;
  const modeBtn = (key, testid, title, sub, img) => (
    <button onClick={() => setMode(key)} data-testid={testid}
      className={`flex-1 rounded-xl border-2 p-3 text-left transition-colors flex items-center gap-3 ${mode === key ? "border-fuchsia-500 bg-fuchsia-50" : "border-slate-200 hover:border-slate-300"}`}>
      {img}
      <span><p className="text-sm font-bold text-slate-800">{title}</p><p className="text-[11px] text-slate-500 mt-0.5">{sub}</p></span>
    </button>
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5" data-testid="veo-ad-studio">
      <div>
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Clapperboard className="w-5 h-5 text-fuchsia-600" /> Cinematic Promo Video <span className="text-[10px] bg-fuchsia-100 text-fuchsia-700 px-2 py-0.5 rounded-full font-bold">VEO 3.1 · HD 1080p</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">Mira writes the script automatically, Google Veo films each 8s scene with voice & sound, then the Miracurl Suite watermark and a 4s brand end card are burned in. Pick a length, optionally a photo, and press Generate.</p>
      </div>

      {!configured && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 flex items-start gap-2" data-testid="veo-key-missing">
          <KeyRound className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Needs your <b>Google Gemini API key</b> (with billing) — get one at <b>aistudio.google.com</b> → API Keys, then ask Mira's developer to add it as GEMINI_API_KEY. Each 8s scene costs ~$2–6 on your Google billing.</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3" data-testid="veo-mode-toggle">
        {modeBtn("cinematic", "veo-mode-cinematic", "🎥 Cinematic Scenes", "Story-style ad — salon scenes, customers, voiceover")}
        {modeBtn("photo", "veo-mode-photo", "📸 From your photo", photo ? "Your uploaded photo stars in every scene" : "Upload a founder / brand photo below", photo && <img src={`${BACKEND}${photo.url}`} alt="" className="w-11 h-11 rounded-lg object-cover border-2 border-fuchsia-300" />)}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" data-testid="veo-photo-input"
          onChange={e => uploadPhoto(e.target.files?.[0])} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="veo-photo-upload-btn"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:border-fuchsia-300 disabled:opacity-50">
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} {photo ? "Replace photo" : "Upload a photo (optional)"}
        </button>
        {photo && (
          <span className="inline-flex items-center gap-2 text-xs text-slate-600" data-testid="veo-photo-chip">
            <img src={`${BACKEND}${photo.url}`} alt="" className="w-8 h-8 rounded-lg object-cover border" /> Photo attached
            <button type="button" onClick={() => { setPhoto(null); if (mode === "photo") setMode("cinematic"); }} className="p-1 rounded hover:bg-slate-100" data-testid="veo-photo-remove"><X className="w-3.5 h-3.5" /></button>
          </span>
        )}
        <span className="text-[11px] text-slate-400">Veo animates your photo (image-to-video) — founder intro, shop front, or the brand card.</span>
      </div>

      <textarea value={concept} onChange={e => setConcept(e.target.value)} rows={3} maxLength={600}
        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800" data-testid="veo-concept-input" placeholder="One line about the ad — Mira writes the full script" />

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="text-xs text-slate-500 font-semibold mb-1">Length</p>
          <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden" data-testid="veo-duration-picker">
            {DURATIONS.map(d => (
              <button key={d.s} type="button" onClick={() => setDuration(d.s)} data-testid={`veo-duration-${d.s}`}
                className={`px-4 py-2 text-sm font-bold transition-colors ${duration === d.s ? "bg-fuchsia-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                {d.s}s
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">{scenes} scenes × 8s + 4s brand card ≈ {scenes * 8 + 4}s · ~{scenes * 2}–{scenes * 3} min render</p>
        </div>
        <label className="text-xs text-slate-500 font-semibold">Format
          <select value={aspect} onChange={e => setAspect(e.target.value)} data-testid="veo-aspect-select"
            className="block border border-slate-200 rounded-xl px-3 py-2 text-sm mt-1 text-slate-800 bg-white">
            <option value="9:16">Instagram Reel 9:16</option>
            <option value="16:9">YouTube / Landscape 16:9</option>
          </select>
        </label>
        <button onClick={generate} disabled={generating || !configured} data-testid="veo-generate-btn"
          className="ml-auto px-5 py-2.5 rounded-xl bg-fuchsia-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-2">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? "Filming…" : `Generate ${duration}s Cinematic Ad`}
        </button>
      </div>

      <BrandContactsEditor />

      {generating && (
        <div className="bg-slate-900 rounded-xl p-4 text-xs text-fuchsia-300 font-mono" data-testid="veo-progress">
          {job.progress || "Working…"} <span className="text-slate-500">(a {duration}s ad takes {scenes * 2}–{scenes * 3} min — safe to leave this page)</span>
          {job.script?.length > 0 && <p className="mt-2 text-slate-400 font-sans">📝 Script ready: {job.script.length} scenes</p>}
        </div>
      )}
      {job?.status === "failed" && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-700" data-testid="veo-error">
          {job.error}
          {/quota|billing|credit|RESOURCE_EXHAUSTED|depleted/i.test(job.error || "") && (
            <p className="mt-1.5 text-slate-700">💳 Your Google AI Studio prepaid credits are used up — top up at <b>ai.studio/projects</b> (same Google account as the Gemini key) and press Generate again. Meanwhile the <b>Promo Video Studio</b> below renders on Miracurl's own AI credits — no Google billing.</p>
          )}
        </div>
      )}

      {videos.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map(v => (
            <div key={v.id} className="border border-slate-200 rounded-xl overflow-hidden" data-testid={`veo-video-${v.id}`}>
              <video src={`${BACKEND}${v.video_url}`} controls className="w-full bg-black" style={{ maxHeight: 260 }} />
              <div className="p-2.5 flex items-center justify-between text-[11px] text-slate-500">
                <span>{v.duration_sec}s · {v.size_mb}MB · {v.aspect_ratio}{v.branded && <span className="ml-1 text-amber-600 font-semibold">· branded</span>}</span>
                <span className="flex gap-1">
                  {v.script?.length > 0 && (
                    <button onClick={() => setScriptOpen(scriptOpen === v.id ? null : v.id)} data-testid={`veo-script-${v.id}`} title="View script"
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"><FileText className="w-3.5 h-3.5" /></button>
                  )}
                  <a href={`${BACKEND}${v.video_url}`} download data-testid={`veo-download-${v.id}`}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"><Download className="w-3.5 h-3.5" /></a>
                  <button onClick={() => del(v.id)} data-testid={`veo-delete-${v.id}`}
                    className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </span>
              </div>
              {scriptOpen === v.id && (
                <ol className="px-3 pb-3 space-y-1.5 text-[11px] text-slate-600 list-decimal list-inside" data-testid={`veo-script-body-${v.id}`}>
                  {v.script.map((s, i) => <li key={i} className="leading-snug">{s}</li>)}
                  <li className="list-none text-amber-600 font-semibold">✦ Brand end card (4s)</li>
                </ol>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
