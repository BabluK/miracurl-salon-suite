import { useEffect, useRef, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Sparkles, Download, ImagePlus, Loader2 } from "lucide-react";

const VIBES = [
  { id: "luxury", label: "Luxury gold" },
  { id: "festive", label: "Festive confetti" },
  { id: "minimal", label: "Minimal elegant" },
  { id: "floral", label: "Soft floral" },
];
const FALLBACK_GRADS = [
  ["#241b4d", "#3b2a73", "#d4af37"],
  ["#3d0b0b", "#7a1f24", "#ffd166"],
  ["#0b3d2e", "#14532d", "#fde68a"],
  ["#1a1423", "#463f5e", "#e0aaff"],
];

function loadImg(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrap(ctx, text, x, y, maxW, lineH) {
  const words = String(text).split(" ");
  let line = "", yy = y;
  for (const wd of words) {
    const t = line ? `${line} ${wd}` : wd;
    if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, yy); line = wd; yy += lineH; }
    else line = t;
  }
  ctx.fillText(line, x, yy);
  return yy;
}

export function OnboardingStudio({ tenants }) {
  const canvasRef = useRef(null);
  const [tenantId, setTenantId] = useState("");
  const [vibe, setVibe] = useState("luxury");
  const [bgImg, setBgImg] = useState(null);
  const [logoImg, setLogoImg] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [gradIdx, setGradIdx] = useState(0);
  const tenant = tenants.find(t => t.id === tenantId);

  useEffect(() => {
    setBgImg(null);
    setGradIdx(Math.floor(Math.random() * FALLBACK_GRADS.length));
    loadImg(tenant?.logo_url).then(setLogoImg);
  }, [tenantId, tenant?.logo_url]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = 1080, h = 1920;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    const cx = w / 2;

    if (bgImg) {
      const s = Math.max(w / bgImg.width, h / bgImg.height);
      ctx.drawImage(bgImg, (w - bgImg.width * s) / 2, (h - bgImg.height * s) / 2, bgImg.width * s, bgImg.height * s);
      ctx.fillStyle = "rgba(8,6,14,0.45)";
      ctx.fillRect(0, 0, w, h);
    } else {
      const [c1, c2] = FALLBACK_GRADS[gradIdx];
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, c1); g.addColorStop(1, c2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 30; i++) {
        ctx.beginPath();
        ctx.arc((i * 211) % w, (i * 353) % h, 14 + (i * 37) % 90, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.02 + (i % 5) * 0.012})`;
        ctx.fill();
      }
    }
    const accent = FALLBACK_GRADS[gradIdx][2];
    // readable center panel glow
    const rg = ctx.createRadialGradient(cx, h * 0.5, 100, cx, h * 0.5, 800);
    rg.addColorStop(0, "rgba(0,0,0,0.35)"); rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);

    ctx.textAlign = "center";
    // decorative top
    ctx.fillStyle = accent; ctx.font = "44px Georgia";
    ctx.fillText("✦   ✦   ✦", cx, h * 0.14);

    // logo circle
    const lr = 130, ly = h * 0.26;
    if (logoImg) {
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, ly, lr, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(logoImg, cx - lr, ly - lr, lr * 2, lr * 2);
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(cx, ly, lr, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fill();
      ctx.fillStyle = accent; ctx.font = "bold 120px Georgia";
      ctx.fillText((tenant?.name || "S")[0].toUpperCase(), cx, ly + 42);
    }
    ctx.beginPath(); ctx.arc(cx, ly, lr + 8, 0, Math.PI * 2);
    ctx.lineWidth = 6; ctx.strokeStyle = accent; ctx.stroke();

    // welcome text
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "italic 52px Georgia";
    ctx.fillText("Welcome Onboard", cx, h * 0.44);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 88px Georgia";
    const endY = wrap(ctx, tenant?.name || "Select a salon", cx, h * 0.51, w * 0.86, 96);
    if (tenant?.location) {
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "38px Arial";
      ctx.fillText(`📍 ${tenant.location}`, cx, endY + 90);
    }
    // divider
    ctx.strokeStyle = accent; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - 180, h * 0.66); ctx.lineTo(cx + 180, h * 0.66); ctx.stroke();
    ctx.fillStyle = accent;
    ctx.font = "bold 42px Arial";
    ctx.fillText("Now part of the Miracurl family", cx, h * 0.71);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "34px Arial";
    wrap(ctx, "Online bookings · AI beauty assistant · Smart billing", cx, h * 0.755, w * 0.8, 44);

    // footer
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, h - 150, w, 150);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 36px Georgia";
    ctx.fillText("Miracurl — Salon Management Suite", cx, h - 85);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "28px Arial";
    ctx.fillText("Grow your salon with us ✦", cx, h - 42);
  }, [bgImg, logoImg, tenant, gradIdx]);
  useEffect(() => { render(); }, [render]);

  async function generateBg() {
    if (!tenantId) { toast.info("Pick a salon first"); return; }
    setGenerating(true);
    try {
      const { data } = await api.post("/super-admin/onboarding-image", { tenant_id: tenantId, vibe });
      const img = await loadImg(data.url);
      if (!img) throw new Error("load failed");
      setBgImg(img);
      toast.success("AI background ready ✦");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Background generation failed");
    } finally { setGenerating(false); }
  }

  function download() {
    if (!tenant) { toast.info("Pick a salon first"); return; }
    try {
      const link = document.createElement("a");
      link.download = `welcome-${tenant.slug || tenant.id}.png`;
      link.href = canvasRef.current.toDataURL("image/png");
      link.click();
      toast.success("Poster downloaded — perfect for WhatsApp status ✦");
    } catch {
      toast.error("Download blocked by the logo image — regenerate and retry.");
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-testid="onboarding-studio">
      <div className="space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div>
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <ImagePlus className="w-4 h-4 text-fuchsia-500" /> Onboarding AI Image
            </h3>
            <p className="text-xs text-slate-500 mt-1">Create a “Welcome Onboard” status image for a newly onboarded salon — their logo + an AI background, sized for WhatsApp status (9:16).</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Salon</label>
            <select data-testid="onboard-tenant-select" className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" value={tenantId} onChange={e => setTenantId(e.target.value)}>
              <option value="">Choose a salon…</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name} ({t.status})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Background vibe</label>
            <div className="flex flex-wrap gap-1.5">
              {VIBES.map(v => (
                <button key={v.id} data-testid={`onboard-vibe-${v.id}`} onClick={() => setVibe(v.id)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition ${vibe === v.id ? "bg-fuchsia-600 text-white border-fuchsia-600" : "border-slate-300 text-slate-500 hover:border-fuchsia-400"}`}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          <button data-testid="onboard-generate-btn" onClick={generateBg} disabled={generating || !tenantId}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-md text-sm font-medium disabled:opacity-50">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? "Generating AI background… (~20s)" : "Generate AI background"}
          </button>
          <button data-testid="onboard-download-btn" onClick={download} disabled={!tenantId}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-md text-sm font-medium disabled:opacity-50">
            <Download className="w-4 h-4" /> Download for WhatsApp status
          </button>
          <p className="text-[11px] text-slate-400">Tip: without AI it uses an elegant gradient — you can download instantly. Each AI generation uses your Emergent key budget.</p>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-center" data-testid="onboard-preview">
        <canvas ref={canvasRef} className="rounded-lg shadow max-h-[72vh]" style={{ aspectRatio: "9/16", width: "auto", height: "72vh" }} />
      </div>
    </div>
  );
}
