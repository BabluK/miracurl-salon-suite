import { useState, useRef } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Sparkles, Upload, Check, RefreshCw, Trash2 } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const STYLES = ["Luxury Gold Minimal", "Modern Geometric", "Elegant Floral", "Classic Barber", "Chic Monogram"];

const fullUrl = (u) => (u?.startsWith("/api/") ? `${BACKEND_URL}${u}` : u);

export const LogoStudio = () => {
  const { tenant } = useAuth();
  const [style, setStyle] = useState(STYLES[0]);
  const [preview, setPreview] = useState("");
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const fileRef = useRef(null);
  const currentLogo = tenant?.logo_url || "";

  async function generate() {
    setGenerating(true);
    try {
      const { data } = await api.post("/branding/logo/generate", { style: style.toLowerCase() });
      setPreview(data.url);
      toast.success("Logo generated ✦ Apply it if you love it, or regenerate");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Generation failed");
    } finally { setGenerating(false); }
  }

  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/uploads/image?kind=misc", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setPreview(data.url);
      toast.success("Uploaded ✦ Click Apply to set it as your logo");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Upload failed");
    }
  }

  async function apply(url) {
    setApplying(true);
    try {
      await api.post("/branding/logo/apply", { url });
      toast.success(url ? "Logo applied ✦ Refreshing…" : "Logo removed ✦ Refreshing…");
      setTimeout(() => window.location.reload(), 900);
    } catch { toast.error("Couldn't apply logo"); setApplying(false); }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-[#1b1533] via-[#241a45] to-[#141126] p-6 text-white" data-testid="logo-studio">
      {/* sparkle field */}
      {[["8%", "18%", "0s"], ["22%", "70%", "0.7s"], ["45%", "12%", "1.3s"], ["68%", "80%", "0.4s"], ["85%", "30%", "1.8s"], ["60%", "50%", "2.3s"]].map(([l, t, d], i) => (
        <Sparkles key={i} className="sparkle-twinkle absolute w-4 h-4 text-amber-300/80 pointer-events-none" style={{ left: l, top: t, animationDelay: d }} />
      ))}
      <div className="relative flex flex-col lg:flex-row lg:items-center gap-6">
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-[0.3em] text-amber-300 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" /> AI Brand Studio
          </div>
          <h2 className="font-playfair text-2xl mt-1">Create your salon logo</h2>
          <p className="text-sm text-white/60 mt-1 max-w-md">Generate a signature logo with AI or upload your own — it appears in your dashboard header and on your public booking page.</p>
          <div className="flex flex-wrap gap-2 mt-4">
            {STYLES.map(s => (
              <button key={s} data-testid={`logo-style-${s.split(" ")[0].toLowerCase()}`} onClick={() => setStyle(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${style === s ? "bg-amber-300 text-slate-900 border-amber-300" : "bg-white/5 border-white/20 text-white/70 hover:border-amber-300/60"}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2.5 mt-4">
            <button data-testid="logo-generate-btn" onClick={generate} disabled={generating}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-amber-300 text-slate-900 text-sm font-semibold hover:bg-amber-200 transition disabled:opacity-60">
              {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating ? "Designing… ~20s" : preview ? "Regenerate" : "Generate with AI"}
            </button>
            <button data-testid="logo-upload-btn" onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 border border-white/20 text-sm hover:bg-white/20 transition">
              <Upload className="w-4 h-4" /> Upload own
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={upload} />
          </div>
        </div>
        <div className="flex items-center gap-5 shrink-0">
          {currentLogo && !preview && (
            <div className="text-center">
              <img src={fullUrl(currentLogo)} alt="Current logo" className="w-28 h-28 rounded-2xl object-cover border-2 border-amber-300/50 mx-auto" data-testid="logo-current-img" />
              <div className="text-[10px] uppercase tracking-widest text-white/50 mt-2">Current logo</div>
              <button data-testid="logo-remove-btn" onClick={() => apply("")} className="mt-1 text-[11px] text-red-300 hover:text-red-200 inline-flex items-center gap-1"><Trash2 className="w-3 h-3" /> Remove</button>
            </div>
          )}
          {preview && (
            <div className="text-center">
              <img src={fullUrl(preview)} alt="Logo preview" className="w-36 h-36 rounded-2xl object-cover border-2 border-amber-300 shadow-[0_0_30px_rgba(252,211,77,0.35)] mx-auto" data-testid="logo-preview-img" />
              <button data-testid="logo-apply-btn" onClick={() => apply(preview)} disabled={applying}
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-400 text-slate-900 text-xs font-bold hover:bg-emerald-300 transition disabled:opacity-60">
                <Check className="w-3.5 h-3.5" /> {applying ? "Applying…" : "Apply as my logo"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
