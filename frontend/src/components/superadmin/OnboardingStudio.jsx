import { useEffect, useRef, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Sparkles, Download, ImagePlus, Loader2, LayoutTemplate } from "lucide-react";

const VIBES = [
  { id: "luxury", label: "Luxury gold" },
  { id: "festive", label: "Festive confetti" },
  { id: "minimal", label: "Minimal elegant" },
  { id: "floral", label: "Soft floral" },
];
const TEMPLATES = [
  { id: "classic", label: "Classic Center" },
  { id: "royal", label: "Royal Frame" },
  { id: "modern", label: "Modern Bold" },
  { id: "badge", label: "Golden Badge" },
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

// Shrinks the font until the longest word fits — fixes overflow for long hyphenated names.
function fitFont(ctx, text, maxW, startPx, minPx, styleFn) {
  let px = startPx;
  ctx.font = styleFn(px);
  const words = String(text).split(" ");
  const longest = words.reduce((a, b) => (ctx.measureText(b).width > ctx.measureText(a).width ? b : a), "");
  while (px > minPx && ctx.measureText(longest).width > maxW) {
    px -= 4;
    ctx.font = styleFn(px);
  }
  return px;
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

function drawLogo(ctx, logoImg, cx, ly, lr, accent, initial) {
  if (logoImg) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, ly, lr, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(logoImg, cx - lr, ly - lr, lr * 2, lr * 2);
    ctx.restore();
  } else {
    ctx.beginPath(); ctx.arc(cx, ly, lr, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fill();
    ctx.fillStyle = accent; ctx.font = `bold ${Math.round(lr * 0.9)}px Georgia`;
    ctx.textAlign = "center";
    ctx.fillText(initial, cx, ly + lr * 0.32);
  }
  ctx.beginPath(); ctx.arc(cx, ly, lr + 8, 0, Math.PI * 2);
  ctx.lineWidth = 6; ctx.strokeStyle = accent; ctx.stroke();
}

function drawFooter(ctx, w, h) {
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, h - 150, w, 150);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px Georgia";
  ctx.fillText("Miracurl — Salon Management Suite", w / 2, h - 85);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "28px Arial";
  ctx.fillText("Grow your salon with us ✦", w / 2, h - 42);
}

function tplClassic(ctx, { w, h, cx, accent, name, location, logoImg }) {
  ctx.textAlign = "center";
  ctx.fillStyle = accent; ctx.font = "44px Georgia";
  ctx.fillText("✦   ✦   ✦", cx, h * 0.14);
  drawLogo(ctx, logoImg, cx, h * 0.26, 130, accent, name[0].toUpperCase());
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "italic 52px Georgia";
  ctx.fillText("Welcome Onboard", cx, h * 0.44);
  ctx.fillStyle = "#ffffff";
  const px = fitFont(ctx, name, w * 0.86, 88, 40, p => `bold ${p}px Georgia`);
  const endY = wrap(ctx, name, cx, h * 0.51, w * 0.86, px * 1.1);
  if (location) {
    ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.font = "38px Arial";
    ctx.fillText(`📍 ${location}`, cx, endY + 90);
  }
  ctx.strokeStyle = accent; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx - 180, h * 0.66); ctx.lineTo(cx + 180, h * 0.66); ctx.stroke();
  ctx.fillStyle = accent; ctx.font = "bold 42px Arial";
  ctx.fillText("Now part of the Miracurl family", cx, h * 0.71);
  ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.font = "34px Arial";
  wrap(ctx, "Online bookings · AI beauty assistant · Smart billing", cx, h * 0.755, w * 0.8, 44);
}

function tplRoyal(ctx, { w, h, cx, accent, name, location, logoImg }) {
  ctx.strokeStyle = accent; ctx.lineWidth = 4;
  ctx.strokeRect(56, 56, w - 112, h - 112 - 150);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(76, 76, w - 152, h - 152 - 150);
  ctx.textAlign = "center";
  ctx.fillStyle = accent; ctx.font = "60px Georgia";
  [[76, 96], [w - 76, 96], [76, h - 190], [w - 76, h - 190]].forEach(([x, y]) => ctx.fillText("❖", x, y));
  drawLogo(ctx, logoImg, cx, h * 0.24, 120, accent, name[0].toUpperCase());
  ctx.fillStyle = accent; ctx.font = "bold 34px Arial";
  ctx.fillText("W E L C O M E   O N B O A R D", cx, h * 0.4);
  ctx.fillStyle = "#ffffff";
  const px = fitFont(ctx, name, w * 0.74, 84, 38, p => `bold ${p}px Georgia`);
  const endY = wrap(ctx, name, cx, h * 0.475, w * 0.74, px * 1.1);
  if (location) {
    ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.font = "36px Arial";
    ctx.fillText(`📍 ${location}`, cx, endY + 84);
  }
  ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.font = "italic 44px Georgia";
  ctx.fillText("A royal addition to the", cx, h * 0.66);
  ctx.fillStyle = accent; ctx.font = "italic bold 48px Georgia";
  ctx.fillText("Miracurl family", cx, h * 0.695);
  ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.font = "32px Arial";
  wrap(ctx, "Online bookings · AI beauty assistant · Smart billing", cx, h * 0.75, w * 0.7, 42);
}

function tplModern(ctx, { w, h, accent, name, location, logoImg }) {
  ctx.fillStyle = accent;
  ctx.fillRect(72, h * 0.12, 12, h * 0.56);
  drawLogo(ctx, logoImg, 190, h * 0.19, 96, accent, name[0].toUpperCase());
  ctx.textAlign = "left";
  ctx.fillStyle = accent; ctx.font = "bold 38px Arial";
  ctx.fillText("WELCOME ONBOARD ✦", 130, h * 0.34);
  ctx.fillStyle = "#ffffff";
  const px = fitFont(ctx, name, w - 260, 96, 42, p => `bold ${p}px Georgia`);
  const endY = wrap(ctx, name, 130, h * 0.41, w - 260, px * 1.1);
  if (location) {
    ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = "36px Arial";
    ctx.fillText(`📍 ${location}`, 130, endY + 80);
  }
  const feats = ["Online bookings, 24/7", "Mira — AI beauty assistant", "Smart billing & inventory", "Marketing on auto-pilot"];
  let fy = h * 0.62;
  feats.forEach(f => {
    ctx.fillStyle = accent; ctx.font = "bold 36px Georgia";
    ctx.fillText("✦", 130, fy);
    ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.font = "36px Arial";
    ctx.fillText(f, 185, fy);
    fy += 66;
  });
}

function tplBadge(ctx, { w, h, cx, accent, name, location, logoImg }) {
  ctx.textAlign = "center";
  const cy = h * 0.42, R = w * 0.36;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fill();
  ctx.lineWidth = 8; ctx.strokeStyle = accent; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R - 22, 0, Math.PI * 2);
  ctx.lineWidth = 2; ctx.stroke();
  drawLogo(ctx, logoImg, cx, cy - R * 0.45, 95, accent, name[0].toUpperCase());
  ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.font = "italic 40px Georgia";
  ctx.fillText("Welcome Onboard", cx, cy + 10);
  ctx.fillStyle = "#ffffff";
  const px = fitFont(ctx, name, R * 1.55, 64, 30, p => `bold ${p}px Georgia`);
  wrap(ctx, name, cx, cy + 84, R * 1.55, px * 1.12);
  if (location) {
    ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = "30px Arial";
    ctx.fillText(`📍 ${location}`, cx, cy + R * 0.78);
  }
  // ribbon
  const ry = h * 0.75;
  ctx.fillStyle = accent;
  ctx.fillRect(cx - 400, ry - 46, 800, 92);
  ctx.beginPath(); ctx.moveTo(cx - 400, ry - 46); ctx.lineTo(cx - 460, ry); ctx.lineTo(cx - 400, ry + 46); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx + 400, ry - 46); ctx.lineTo(cx + 460, ry); ctx.lineTo(cx + 400, ry + 46); ctx.fill();
  ctx.fillStyle = "#1a1423"; ctx.font = "bold 38px Georgia";
  ctx.fillText("Now part of the Miracurl family", cx, ry + 13);
  ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.font = "32px Arial";
  ctx.fillText("Online bookings · AI assistant · Smart billing", cx, ry + 110);
}

const TPL_FNS = { classic: tplClassic, royal: tplRoyal, modern: tplModern, badge: tplBadge };

export function OnboardingStudio({ tenants }) {
  const canvasRef = useRef(null);
  const [tenantId, setTenantId] = useState("");
  const [vibe, setVibe] = useState("luxury");
  const [template, setTemplate] = useState("classic");
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
    const rg = ctx.createRadialGradient(cx, h * 0.5, 100, cx, h * 0.5, 800);
    rg.addColorStop(0, "rgba(0,0,0,0.35)"); rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);

    const opts = { w, h, cx, accent, name: tenant?.name || "Select a salon", location: tenant?.location, logoImg };
    (TPL_FNS[template] || tplClassic)(ctx, opts);
    drawFooter(ctx, w, h);
  }, [bgImg, logoImg, tenant, gradIdx, template]);
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
      link.download = `welcome-${tenant.slug || tenant.id}-${template}.png`;
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
            <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1"><LayoutTemplate className="w-3 h-3" /> Template</label>
            <div className="grid grid-cols-2 gap-1.5">
              {TEMPLATES.map(t => (
                <button key={t.id} data-testid={`onboard-template-${t.id}`} onClick={() => setTemplate(t.id)}
                  className={`text-xs px-3 py-2 rounded-lg border transition font-medium ${template === t.id ? "bg-slate-900 text-amber-300 border-slate-900" : "border-slate-300 text-slate-500 hover:border-slate-500"}`}>
                  {t.label}
                </button>
              ))}
            </div>
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
          <p className="text-[11px] text-slate-400">Tip: without AI it uses an elegant gradient — you can download instantly. Each AI generation uses your Emergent key budget. Switch templates any time — the same AI background is reused.</p>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-center" data-testid="onboard-preview">
        <canvas ref={canvasRef} className="rounded-lg shadow max-h-[72vh]" style={{ aspectRatio: "9/16", width: "auto", height: "72vh" }} />
      </div>
    </div>
  );
}
