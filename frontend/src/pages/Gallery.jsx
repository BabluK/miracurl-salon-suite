import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Image as ImageIcon, Upload, Sparkles, Trash2, Copy, ExternalLink, Loader2, Video, Send } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function ShareRow({ m }) {
  const [posting, setPosting] = useState(null);
  const caption = m.post_caption || m.caption || "Fresh from our salon ✂️✨ Book your slot today!";

  const postGoogle = async () => {
    setPosting("google");
    try {
      let { data } = await api.post("/mira-studio/google/post", {
        topic: m.caption || "salon offer", caption, image_url: m.url, with_image: false,
      });
      if (data.needs_confirmation) {
        if (!window.confirm(data.question)) { setPosting(null); return; }
        ({ data } = await api.post("/mira-studio/google/post", {
          topic: m.caption || "salon offer", caption, image_url: m.url, with_image: false, confirm: true,
        }));
      }
      if (data.posted) toast.success("Posted to Google Business 🎉");
      else {
        navigator.clipboard?.writeText(caption);
        toast.info("Auto-post not available yet — caption copied, paste it on Google");
        window.open("https://business.google.com/posts", "_blank", "noopener");
      }
    } catch (e) { toast.error(e.response?.data?.detail || "Google post failed"); }
    finally { setPosting(null); }
  };

  const postInsta = async () => {
    setPosting("insta");
    try {
      const ctx = await api.get("/mira-studio/social/context").catch(() => null);
      const today = ctx?.data?.posted_today || {};
      const dup = ["instagram", "facebook"].filter(p => today[p]);
      if (dup.length && !window.confirm(`We already posted on ${dup.join(" & ")} today. Post this as well?`)) { setPosting(null); return; }
      const { data } = await api.post("/social/publish", { caption, image_url: m.url, platforms: ["instagram", "facebook"] });
      const ok = Object.entries(data.results).filter(([, v]) => v.ok).map(([k]) => k);
      if (ok.length) toast.success(`Posted to ${ok.join(" + ")} 🎉`);
      else {
        navigator.clipboard?.writeText(caption);
        toast.info("Instagram not connected — caption copied, paste it in the app");
        window.open("https://www.instagram.com/", "_blank", "noopener");
      }
    } catch (e) { toast.error(e.response?.data?.detail || "Publish failed"); }
    finally { setPosting(null); }
  };

  const shareWA = () => {
    const text = `${caption}\n\n${BACKEND_URL}${m.url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  return (
    <div className="px-2.5 pb-2.5 flex gap-1.5" data-testid={`gallery-share-row-${m.id}`}>
      <button onClick={postGoogle} disabled={!!posting} data-testid={`gallery-post-google-${m.id}`}
        className="flex-1 text-[10px] font-semibold px-2 py-1.5 rounded-lg bg-slate-900 text-white disabled:opacity-50 inline-flex items-center justify-center gap-1">
        {posting === "google" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Google
      </button>
      <button onClick={postInsta} disabled={!!posting} data-testid={`gallery-post-insta-${m.id}`}
        className="flex-1 text-[10px] font-semibold px-2 py-1.5 rounded-lg bg-gradient-to-r from-fuchsia-500 to-pink-600 text-white disabled:opacity-50 inline-flex items-center justify-center gap-1">
        {posting === "insta" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Insta
      </button>
      <button onClick={shareWA} disabled={!!posting} data-testid={`gallery-post-wa-${m.id}`}
        className="flex-1 text-[10px] font-semibold px-2 py-1.5 rounded-lg bg-emerald-600 text-white disabled:opacity-50 inline-flex items-center justify-center gap-1">
        <Send className="w-3 h-3" /> WhatsApp
      </button>
    </div>
  );
}

export default function Gallery() {
  const [list, setList] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState("");
  const fileRef = useRef(null);

  const load = useCallback(async () => { const { data } = await api.get("/gallery"); setList(data); }, []);
  useEffect(() => { load(); }, [load]);

  async function handleUpload(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", f);
    try {
      await api.post("/gallery/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Uploaded ✦ Now post it to your Google page!");
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Upload failed"); }
    finally { setUploading(false); e.target.value = ""; }
  }

  async function generate() {
    if (prompt.trim().length < 5) { toast.error("Describe the promo you want"); return; }
    setGenerating(true);
    try {
      await api.post("/gallery/generate", { prompt }, { timeout: 240000 });
      toast.success("Promo image ready ✦");
      setPrompt("");
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Generation failed — try again"); }
    finally { setGenerating(false); }
  }

  function copyLink(url) {
    navigator.clipboard.writeText(`${BACKEND_URL}${url}`);
    toast.success("Link copied");
  }

  async function remove(id) {
    if (!window.confirm("Delete this media?")) return;
    try { await api.delete(`/gallery/${id}`); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Delete failed"); }
  }

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 flex items-center gap-2"><ImageIcon className="w-6 h-6 text-emerald-600" /> Gallery</h1>
          <p className="text-sm text-slate-500 mt-1">Photos &amp; videos for your Google Business page, Instagram and website.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href="https://business.google.com/"
            target="_blank"
            rel="noreferrer"
            data-testid="open-google-business-btn"
            className="btn-slate flex items-center gap-2"
          >
            <ExternalLink className="w-4 h-4" /> Open Google Business
          </a>
          <input ref={fileRef} type="file" accept="image/*,video/mp4,video/quicktime,video/webm" className="hidden" onChange={handleUpload} data-testid="gallery-upload-input" />
          <button data-testid="gallery-upload-btn" onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-blue flex items-center gap-2 disabled:opacity-60">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload photo / video
          </button>
        </div>
      </div>

      {/* AI promo generator */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm" data-testid="promo-generator-card">
        <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-3"><Sparkles className="w-4 h-4 text-violet-600" /> AI Promo Generator</h2>
        <div className="flex gap-2 flex-col sm:flex-row">
          <input
            data-testid="promo-prompt-input"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => e.key === "Enter" && generate()}
            placeholder='e.g. "Monsoon offer — 20% off all pedicures this week"'
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
          <button data-testid="promo-generate-btn" onClick={generate} disabled={generating} className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
            {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating (~30s)…</> : <><Sparkles className="w-4 h-4" /> Generate promo</>}
          </button>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">Describe your offer — Mira designs a ready-to-post promo image. Uses your Universal Key balance.</p>
      </div>

      {/* Media grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="gallery-grid">
        {list.length === 0 && (
          <div className="col-span-full bg-white border border-slate-200 rounded-2xl p-12 text-center text-sm text-slate-400">
            No media yet — upload salon photos or generate your first AI promo!
          </div>
        )}
        {list.map(m => (
          <div key={m.id} data-testid={`gallery-item-${m.id}`} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm group">
            <div className="relative aspect-square bg-slate-100">
              {m.kind === "video" ? (
                <video src={`${BACKEND_URL}${m.url}`} controls className="w-full h-full object-cover" />
              ) : (
                <img src={`${BACKEND_URL}${m.url}`} alt={m.caption || "salon media"} className="w-full h-full object-cover" loading="lazy" />
              )}
              {m.source === "ai" && <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-violet-600 text-white text-[9px] font-semibold flex items-center gap-1"><Sparkles className="w-2.5 h-2.5" /> AI</span>}
              {m.kind === "video" && <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[9px] font-semibold flex items-center gap-1"><Video className="w-2.5 h-2.5" /> Video</span>}
            </div>
            <div className="p-2.5 flex items-center justify-between gap-2">
              <div className="text-[11px] text-slate-500 truncate flex-1">{m.caption || new Date(m.created_at).toLocaleDateString()}</div>
              <button onClick={() => copyLink(m.url)} className="p-1.5 text-slate-400 hover:text-sky-600 rounded" title="Copy link" data-testid={`gallery-copy-${m.id}`}><Copy className="w-3.5 h-3.5" /></button>
              <a href={`${BACKEND_URL}${m.url}`} download className="p-1.5 text-slate-400 hover:text-emerald-600 rounded" title="Download" data-testid={`gallery-download-${m.id}`}><Upload className="w-3.5 h-3.5 rotate-180" /></a>
              <button onClick={() => remove(m.id)} className="p-1.5 text-slate-400 hover:text-rose-500 rounded" title="Delete" data-testid={`gallery-delete-${m.id}`}><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            {m.kind === "image" && <ShareRow m={m} />}
          </div>
        ))}
      </div>

      <p className="text-[11px] text-slate-400">Tip: Google doesn&apos;t allow apps to auto-post — tap &quot;Open Google Business&quot;, then add the downloaded photo/video to your profile. Fresh media weekly boosts your ranking 📈</p>
    </div>
  );
}
