import { useEffect, useRef, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Sparkles, Download, ImagePlus, Loader2, LayoutTemplate, Copy, Upload, Instagram } from "lucide-react";
import { FORMATS, BACKGROUNDS, TEMPLATES, loadImg, paintPoster, buildCaption, igHandle } from "./onboardingCanvas";

const BRAND_HANDLE = "@miracurl.suite";
const SITE = "miracurl-suite.com";

function Chip({ active, onClick, children, testid, className = "" }) {
  return (
    <button data-testid={testid} onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full border transition ${active ? "bg-slate-900 text-amber-300 border-slate-900" : "border-slate-300 text-slate-500 hover:border-slate-500"} ${className}`}>
      {children}
    </button>
  );
}

function BackgroundPicker({ bgId, onPick, onUpload }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">Background — pick one, or upload your own</label>
      <div className="grid grid-cols-4 gap-1.5" data-testid="onboard-bg-grid">
        {BACKGROUNDS.map(b => (
          <button key={b.id} data-testid={`onboard-bg-${b.id}`} onClick={() => onPick(b.id)} title={b.label}
            className={`relative aspect-[3/4] rounded-lg overflow-hidden border-2 transition ${bgId === b.id ? "border-amber-400 ring-2 ring-amber-300/50" : "border-transparent hover:border-slate-300"}`}>
            <img src={`/assets/onboarding/${b.id}.jpg`} alt={b.label} className="w-full h-full object-cover" loading="lazy" />
            <span className="absolute inset-x-0 bottom-0 bg-black/55 text-[9px] text-white px-1 py-0.5 truncate">{b.label}</span>
          </button>
        ))}
        <label data-testid="onboard-bg-upload" className={`aspect-[3/4] rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer text-slate-400 hover:border-slate-500 ${bgId === "custom" ? "border-amber-400 text-amber-500" : "border-slate-300"}`}>
          <Upload className="w-4 h-4" /><span className="text-[9px]">Upload</span>
          <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && onUpload(e.target.files[0])} />
        </label>
      </div>
    </div>
  );
}

export function OnboardingStudio({ tenants }) {
  const canvasRef = useRef(null);
  const [tenantId, setTenantId] = useState("");
  const [formatId, setFormatId] = useState("story");
  const [template, setTemplate] = useState("classic");
  const [bgId, setBgId] = useState("luxury-gold");
  const [bgImg, setBgImg] = useState(null);
  const [logoImg, setLogoImg] = useState(null);
  const [emblem, setEmblem] = useState(null);
  const [sparkles, setSparkles] = useState(true);
  const [generating, setGenerating] = useState(false);
  const tenant = tenants.find(t => t.id === tenantId);
  const format = FORMATS.find(f => f.id === formatId) || FORMATS[0];
  const accent = (BACKGROUNDS.find(b => b.id === bgId) || BACKGROUNDS[0]).accent;

  useEffect(() => { loadImg("/assets/ms-logo-emblem.png").then(setEmblem); }, []);
  useEffect(() => { loadImg(tenant?.logo_url).then(setLogoImg); }, [tenant?.logo_url]);
  useEffect(() => {
    if (bgId !== "custom" && bgId !== "ai") loadImg(`/assets/onboarding/${bgId}.jpg`).then(setBgImg);
  }, [bgId]);
  useEffect(() => {
    if (tenant?.business_type === "restaurant" && bgId === "salon-interior") setBgId("restaurant-candle");
  }, [tenant?.business_type]); // eslint-disable-line react-hooks/exhaustive-deps

  const render = useCallback(() => {
    if (!canvasRef.current) return;
    paintPoster(canvasRef.current, { format, template, bgImg, logoImg, emblem, accent, sparkles, tenant, brandHandle: BRAND_HANDLE, site: SITE });
  }, [format, template, bgImg, logoImg, emblem, accent, sparkles, tenant]);
  useEffect(() => { render(); }, [render]);

  async function generateBg() {
    if (!tenantId) { toast.info("Pick a business first"); return; }
    setGenerating(true);
    try {
      const { data } = await api.post("/super-admin/onboarding-image", { tenant_id: tenantId, vibe: "luxury" });
      const img = await loadImg(data.url);
      if (!img) throw new Error("load failed");
      setBgImg(img); setBgId("ai");
      toast.success("AI background ready ✦");
    } catch (e) { toast.error(e.response?.data?.detail || "Background generation failed"); }
    finally { setGenerating(false); }
  }

  function onUpload(file) {
    const url = URL.createObjectURL(file);
    loadImg(url).then(img => { if (img) { setBgImg(img); setBgId("custom"); } else toast.error("Could not read that image"); });
  }

  function download() {
    if (!tenant) { toast.info("Pick a business first"); return; }
    try {
      const a = document.createElement("a");
      a.download = `welcome-${tenant.slug || tenant.id}-${formatId}-${template}.png`;
      a.href = canvasRef.current.toDataURL("image/png"); a.click();
      toast.success(`Downloaded ${format.label} ✦`);
    } catch { toast.error("Download blocked by the logo image — retry after re-selecting the business."); }
  }

  async function copyCaption() {
    if (!tenant) { toast.info("Pick a business first"); return; }
    try { await navigator.clipboard.writeText(buildCaption(tenant, BRAND_HANDLE)); toast.success("Caption with tags copied — paste in Instagram"); }
    catch { toast.error("Clipboard blocked — select the caption text manually"); }
  }

  const handle = igHandle(tenant?.instagram_url);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6" data-testid="onboarding-studio">
      <div className="space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div>
            <h3 className="font-semibold text-slate-800 flex items-center gap-2"><ImagePlus className="w-4 h-4 text-amber-500" /> Welcome & Congratulations Poster</h3>
            <p className="text-xs text-slate-500 mt-1">A polished “Congratulations · Welcome to the Miracurl family” image for every new business — download for WhatsApp status & Instagram, tag them, and celebrate the partnership.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Business</label>
            <select data-testid="onboard-tenant-select" className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" value={tenantId} onChange={e => setTenantId(e.target.value)}>
              <option value="">Choose a salon / restaurant…</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name} ({t.status})</option>)}
            </select>
            {tenant && (
              <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1" data-testid="onboard-ig-hint">
                <Instagram className="w-3 h-3" /> {handle ? <>Tags <b>{handle}</b> on the poster & caption</> : <>No Instagram saved for this business — add it in their Settings → Public site to auto-tag</>}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Format</label>
            <div className="flex flex-wrap gap-1.5">{FORMATS.map(f => <Chip key={f.id} testid={`onboard-format-${f.id}`} active={formatId === f.id} onClick={() => setFormatId(f.id)}>{f.label}</Chip>)}</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1"><LayoutTemplate className="w-3 h-3" /> Layout</label>
            <div className="grid grid-cols-4 gap-1.5">{TEMPLATES.map(t => <Chip key={t.id} testid={`onboard-template-${t.id}`} active={template === t.id} onClick={() => setTemplate(t.id)} className="!rounded-lg">{t.label}</Chip>)}</div>
          </div>
          <BackgroundPicker bgId={bgId} onPick={setBgId} onUpload={onUpload} />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={sparkles} onChange={e => setSparkles(e.target.checked)} data-testid="onboard-sparkles" className="accent-amber-500" /> Gold sparkles
            </label>
            <button data-testid="onboard-generate-btn" onClick={generateBg} disabled={generating || !tenantId}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-fuchsia-300 text-fuchsia-700 text-xs font-medium hover:bg-fuchsia-50 disabled:opacity-50">
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {generating ? "Painting… ~20s" : "AI background (uses credits)"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button data-testid="onboard-download-btn" onClick={download} disabled={!tenantId}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-black text-amber-300 rounded-md text-sm font-medium disabled:opacity-50">
              <Download className="w-4 h-4" /> Download PNG
            </button>
            <button data-testid="onboard-caption-btn" onClick={copyCaption} disabled={!tenantId}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-md text-sm font-medium disabled:opacity-50">
              <Copy className="w-4 h-4" /> Copy Insta caption
            </button>
          </div>
          <p className="text-[11px] text-slate-400">Library backgrounds are free & instant. Download the 9:16 for WhatsApp / Insta Story, the 4:5 for the feed. The caption includes their handle, ours and hashtags.</p>
        </div>
      </div>
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-center" data-testid="onboard-preview">
        <canvas ref={canvasRef} className="rounded-lg shadow-2xl shadow-amber-900/30 max-h-[76vh] max-w-full" style={{ aspectRatio: `${format.w}/${format.h}`, width: "auto", height: "76vh" }} />
      </div>
    </div>
  );
}
