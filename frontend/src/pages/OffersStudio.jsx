import { useEffect, useRef, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Download, Palette, Sparkles } from "lucide-react";

// 10 seasonal themes × 4 palettes × 3 layouts = 120 templates
const THEMES = [
  { id: "diwali", name: "Diwali", palettes: [["#2a0a4a", "#7b2ff7", "#ffd166"], ["#3d0b0b", "#b31217", "#ffd166"], ["#1a1a2e", "#e94560", "#ffd166"], ["#4a148c", "#ff6f00", "#fff3b0"]] },
  { id: "holi", name: "Holi", palettes: [["#ff5d8f", "#ffd166", "#4cc9f0"], ["#7209b7", "#f72585", "#ffd60a"], ["#06d6a0", "#ef476f", "#ffd166"], ["#4361ee", "#f72585", "#4cc9f0"]] },
  { id: "christmas", name: "Christmas / New Year", palettes: [["#0b3d2e", "#c1121f", "#ffd166"], ["#14213d", "#fca311", "#e5e5e5"], ["#1b4332", "#d8f3dc", "#c1121f"], ["#03045e", "#caf0f8", "#ffd166"]] },
  { id: "valentine", name: "Valentine", palettes: [["#590d22", "#ff4d6d", "#fff0f3"], ["#3c096c", "#ff5d8f", "#ffe5ec"], ["#800f2f", "#ffb3c1", "#fff0f3"], ["#240046", "#ff758f", "#fde2e4"]] },
  { id: "monsoon", name: "Monsoon", palettes: [["#03045e", "#0077b6", "#caf0f8"], ["#1d3557", "#457b9d", "#f1faee"], ["#013a63", "#61a5c2", "#e0fbfc"], ["#22223b", "#4ea8de", "#f2e9e4"]] },
  { id: "summer", name: "Summer", palettes: [["#ff9e00", "#ff5400", "#fff3b0"], ["#f77f00", "#fcbf49", "#eae2b7"], ["#e36414", "#ffb703", "#fdf0d5"], ["#9e2a2b", "#e09f3e", "#fff3b0"]] },
  { id: "wedding", name: "Wedding Season", palettes: [["#4a0e2e", "#b76e79", "#f7e7ce"], ["#2b2d42", "#d4af37", "#fdf6e3"], ["#6d213c", "#e8b4bc", "#faf3ef"], ["#1a1423", "#b49286", "#f5e6ca"]] },
  { id: "rakhi", name: "Raksha Bandhan", palettes: [["#6a040f", "#ffba08", "#fff3b0"], ["#370617", "#f48c06", "#ffe8d6"], ["#03071e", "#dc2f02", "#ffd166"], ["#582f0e", "#ffc971", "#fefae0"]] },
  { id: "eid", name: "Eid", palettes: [["#064e3b", "#34d399", "#fef9c3"], ["#022c22", "#a7f3d0", "#fde68a"], ["#134e4a", "#5eead4", "#fefce8"], ["#0f172a", "#2dd4bf", "#fde68a"]] },
  { id: "independence", name: "Independence Day", palettes: [["#0b3d0b", "#ff9933", "#ffffff"], ["#00204a", "#ff9933", "#e8f5e9"], ["#1b263b", "#ff9933", "#ffffff"], ["#14532d", "#fb923c", "#f0fdf4"]] },
];
const LAYOUTS = [
  { id: "classic", name: "Classic centre" },
  { id: "band", name: "Top band" },
  { id: "badge", name: "Big badge" },
];

function drawPoster(canvas, opts) {
  const { w, h, palette, layoutId, themeName, salon, offerTitle, offerDetails, location, phone, validity, logoImg } = opts;
  const [c1, c2, accent] = palette;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // bokeh decorations
  for (let i = 0; i < 26; i++) {
    ctx.beginPath();
    const r = 14 + (i * 37) % 90;
    ctx.arc((i * 211) % w, (i * 353) % h, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${0.03 + (i % 5) * 0.012})`;
    ctx.fill();
  }
  // accent corner ribbons
  ctx.fillStyle = accent + "33";
  ctx.beginPath(); ctx.arc(0, 0, w * 0.28, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(w, h, w * 0.34, 0, Math.PI * 2); ctx.fill();

  const cx = w / 2;
  const scale = w / 1080;
  const F = (px, weight = 600, fam = "Georgia, serif") => `${weight === "bold" ? "bold " : ""}${px * scale}px ${fam}`;
  ctx.textAlign = "center";

  let y = (layoutId === "band" ? 0.10 : 0.12) * h;
  // top band
  if (layoutId === "band") {
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, w, 0.16 * h);
    ctx.fillStyle = c1;
  } else {
    ctx.fillStyle = "#ffffff";
  }
  // logo circle
  const logoR = 62 * scale;
  const logoY = layoutId === "band" ? 0.08 * h : y;
  if (logoImg) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, logoY, logoR, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(logoImg, cx - logoR, logoY - logoR, logoR * 2, logoR * 2);
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, logoY, logoR, 0, Math.PI * 2);
    ctx.lineWidth = 5 * scale; ctx.strokeStyle = accent; ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(cx, logoY, logoR, 0, Math.PI * 2);
    ctx.fillStyle = accent; ctx.fill();
    ctx.fillStyle = c1; ctx.font = F(64, "bold");
    ctx.fillText((salon || "M")[0].toUpperCase(), cx, logoY + 22 * scale);
  }
  y = logoY + logoR + 70 * scale;
  // salon name
  ctx.fillStyle = layoutId === "band" ? "#ffffff" : accent;
  ctx.font = F(56, "bold");
  ctx.fillText(salon || "Your Salon", cx, y);
  y += 44 * scale;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = F(26, 400, "Arial");
  ctx.fillText(`✦ ${themeName} Special ✦`, cx, y);

  // offer headline
  if (layoutId === "badge") {
    const br = 210 * scale;
    const by = h * 0.46;
    ctx.beginPath(); ctx.arc(cx, by, br, 0, Math.PI * 2);
    ctx.fillStyle = accent; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, by, br - 10 * scale, 0, Math.PI * 2);
    ctx.lineWidth = 3 * scale; ctx.strokeStyle = c1 + "66"; ctx.stroke();
    ctx.fillStyle = c1; ctx.font = F(72, "bold");
    wrapText(ctx, offerTitle || "20% OFF", cx, by - 10 * scale, br * 1.6, 80 * scale);
    y = by + br + 70 * scale;
  } else {
    y = h * (layoutId === "band" ? 0.42 : 0.44);
    ctx.fillStyle = "#ffffff"; ctx.font = F(96, "bold");
    wrapText(ctx, offerTitle || "20% OFF", cx, y, w * 0.85, 104 * scale);
    y += 130 * scale;
  }
  // details
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = F(34, 400, "Arial");
  wrapText(ctx, offerDetails || "On all hair & beauty services", cx, y, w * 0.8, 46 * scale);
  y += 110 * scale;
  if (validity) {
    ctx.fillStyle = accent; ctx.font = F(28, "bold", "Arial");
    ctx.fillText(`Valid till ${validity}`, cx, y);
  }
  // footer bar
  const fh = 0.10 * h;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, h - fh, w, fh);
  ctx.fillStyle = "#ffffff"; ctx.font = F(28, 400, "Arial");
  ctx.fillText([location, phone && `📞 ${phone}`].filter(Boolean).join("   ·   "), cx, h - fh / 2 + 10 * scale);
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = String(text).split(" ");
  let line = "", yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy); line = word; yy += lineH;
    } else line = test;
  }
  ctx.fillText(line, x, yy);
}

export default function OffersStudio() {
  const canvasRef = useRef(null);
  const [tenant, setTenant] = useState(null);
  const [logoImg, setLogoImg] = useState(null);
  const [theme, setTheme] = useState(THEMES[0]);
  const [paletteIdx, setPaletteIdx] = useState(0);
  const [layout, setLayout] = useState(LAYOUTS[0]);
  const [format, setFormat] = useState("post"); // post 1080x1080 | status 1080x1920
  const [f, setF] = useState({ offerTitle: "FLAT 30% OFF", offerDetails: "On all hair, beauty & bridal services", validity: "", location: "", phone: "" });

  useEffect(() => {
    api.get("/tenants/current").then(r => {
      setTenant(r.data);
      setF(prev => ({ ...prev, location: r.data.location || "", phone: r.data.phone || "" }));
      if (r.data.logo_url) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => setLogoImg(img);
        img.onerror = () => setLogoImg(null);
        img.src = r.data.logo_url;
      }
    }).catch(() => {});
  }, []);

  const render = useCallback(() => {
    if (!canvasRef.current) return;
    const w = 1080, h = format === "post" ? 1080 : 1920;
    drawPoster(canvasRef.current, {
      w, h, palette: theme.palettes[paletteIdx], layoutId: layout.id, themeName: theme.name,
      salon: tenant?.name, logoImg, ...f,
    });
  }, [theme, paletteIdx, layout, format, tenant, logoImg, f]);
  useEffect(() => { render(); }, [render]);

  function download() {
    try {
      const link = document.createElement("a");
      link.download = `offer-${theme.id}-${format}.png`;
      link.href = canvasRef.current.toDataURL("image/png");
      link.click();
      toast.success("Poster downloaded — post it on Instagram / Facebook / WhatsApp status ✦");
    } catch {
      toast.error("Download blocked by the logo image — remove logo or upload it via Logo Studio and retry.");
    }
  }

  const templateNo = THEMES.indexOf(theme) * 12 + paletteIdx * 3 + LAYOUTS.indexOf(layout) + 1;

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800 space-y-6" data-testid="offers-studio-page">
      <div>
        <h1 className="font-playfair text-2xl sm:text-3xl flex items-center gap-2"><Sparkles className="w-6 h-6 text-violet-500" /> Offer Maker</h1>
        <p className="text-slate-500 text-sm mt-1">120 seasonal templates — your logo, location & number auto-placed. Download ready-to-post images for Instagram, Facebook & WhatsApp status.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Controls */}
        <div className="space-y-4">
          <div className="card-light space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1"><Palette className="w-3.5 h-3.5" /> Template #{templateNo} of 120</div>
            <div>
              <label className="label-light block mb-1">Season / occasion</label>
              <div className="flex flex-wrap gap-1.5">
                {THEMES.map(t => (
                  <button key={t.id} data-testid={`theme-${t.id}`} onClick={() => setTheme(t)}
                    className={`text-xs px-2.5 py-1.5 rounded-full border transition ${theme.id === t.id ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}>
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-light block mb-1">Colour style</label>
                <div className="flex gap-1.5">
                  {theme.palettes.map((p, i) => (
                    <button key={p.join("-")} data-testid={`palette-${i}`} onClick={() => setPaletteIdx(i)}
                      className={`w-9 h-9 rounded-full border-2 ${paletteIdx === i ? "border-slate-800" : "border-transparent"}`}
                      style={{ background: `linear-gradient(135deg, ${p[0]}, ${p[1]} 60%, ${p[2]})` }} />
                  ))}
                </div>
              </div>
              <div>
                <label className="label-light block mb-1">Layout</label>
                <select className="input-light" value={layout.id} onChange={e => setLayout(LAYOUTS.find(l => l.id === e.target.value))}>
                  {LAYOUTS.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label-light block mb-1">Format</label>
              <div className="flex gap-2">
                <button data-testid="format-post" onClick={() => setFormat("post")} className={`text-xs px-3 py-1.5 rounded-lg border ${format === "post" ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 text-slate-500"}`}>Instagram post (1:1)</button>
                <button data-testid="format-status" onClick={() => setFormat("status")} className={`text-xs px-3 py-1.5 rounded-lg border ${format === "status" ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 text-slate-500"}`}>WhatsApp / FB status (9:16)</button>
              </div>
            </div>
          </div>

          <div className="card-light space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Offer details</div>
            <div><label className="label-light block mb-1">Headline</label>
              <input data-testid="offer-title-input" className="input-light" value={f.offerTitle} onChange={e => setF({ ...f, offerTitle: e.target.value })} placeholder="FLAT 30% OFF" maxLength={40} /></div>
            <div><label className="label-light block mb-1">Details</label>
              <input data-testid="offer-details-input" className="input-light" value={f.offerDetails} onChange={e => setF({ ...f, offerDetails: e.target.value })} placeholder="On all hair & beauty services" maxLength={90} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="label-light block mb-1">Valid till</label>
                <input className="input-light" value={f.validity} onChange={e => setF({ ...f, validity: e.target.value })} placeholder="31 Oct" maxLength={20} /></div>
              <div><label className="label-light block mb-1">Location</label>
                <input className="input-light" value={f.location} onChange={e => setF({ ...f, location: e.target.value })} maxLength={40} /></div>
              <div><label className="label-light block mb-1">Phone</label>
                <input className="input-light" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} maxLength={16} /></div>
            </div>
            <button data-testid="download-poster-btn" onClick={download} className="btn-blue w-full flex items-center justify-center gap-2">
              <Download className="w-4 h-4" /> Download poster
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="card-light flex items-center justify-center p-4" data-testid="poster-preview">
          <canvas ref={canvasRef} className="max-w-full rounded-xl shadow-lg" style={{ maxHeight: "70vh" }} />
        </div>
      </div>
    </div>
  );
}
