import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { Camera, Sparkles, Check, Loader2, RotateCcw, ScanFace, CalendarCheck, Share2, Download } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;
const UNDERTONE_COPY = {
  warm: "Warm undertone — golden, caramel, copper and honey shades glow on you.",
  cool: "Cool undertone — ash, mocha, burgundy and rose-brown shades flatter you.",
  neutral: "Neutral undertone — lucky you, both warm and cool families suit you.",
};

// On-device skin read: average the cheek pixels inside the face oval → undertone + depth. Nothing is uploaded.
function analyseSkin(video, canvas) {
  const w = 320, h = Math.round(320 * video.videoHeight / video.videoWidth) || 240;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, w, h);
  const cx = w / 2, cy = h * 0.55, rx = w * 0.16, ry = h * 0.12;
  let r = 0, g = 0, b = 0, n = 0;
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let y = Math.floor(cy - ry); y < cy + ry; y += 2) {
    for (let x = Math.floor(cx - rx); x < cx + rx; x += 2) {
      if (((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2) > 1) continue;
      const i = (y * w + x) * 4;
      const R = data[i], G = data[i + 1], B = data[i + 2];
      if (R > 60 && R > G && G > B * 0.9) { r += R; g += G; b += B; n++; }  // keep skin-like pixels only
    }
  }
  if (n < 40) return null;
  r /= n; g /= n; b /= n;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const yellowness = (r + g) / 2 - b;      // high → golden/olive (warm)
  const redness = r - g;                   // high vs yellowness → pink (cool)
  let undertone = "neutral";
  if (yellowness > 55 && redness < 45) undertone = "warm";
  else if (redness > 40 && yellowness < 45) undertone = "cool";
  const depth = lum > 175 ? "light" : lum > 115 ? "medium" : "deep";
  return { undertone, depth, rgb: `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})` };
}

export default function ColorTryOn() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [salon, setSalon] = useState(null);
  const [step, setStep] = useState("intro"); // intro | camera | results | done
  const [skin, setSkin] = useState(null);
  const [selfie, setSelfie] = useState(null); // JPEG data URL kept on-device until "See it on me"
  const [preview, setPreview] = useState(null); // {front, back, color}
  const [previewBusy, setPreviewBusy] = useState(false);
  const [face, setFace] = useState("front");
  const [camErr, setCamErr] = useState("");
  const [picked, setPicked] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", by_staff: false });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const videoRef = useRef(null), canvasRef = useRef(null), streamRef = useRef(null);

  useEffect(() => {
    axios.get(`${API}/api/public/color/${slug}`).then(r => setSalon(r.data)).catch(() => setSalon({ error: true }));
    return () => streamRef.current?.getTracks().forEach(t => t.stop());
  }, [slug]);

  const startCamera = async () => {
    setCamErr(""); setStep("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
    } catch (e) {
      setCamErr("Camera not available — allow camera access, or skip and browse all shades.");
    }
  };
  const capture = () => {
    const res = analyseSkin(videoRef.current, canvasRef.current);
    try { setSelfie(canvasRef.current.toDataURL("image/jpeg", 0.85)); } catch { setSelfie(null); }
    if (!res) { setCamErr("Couldn't read your skin — move into brighter light and fit your face in the oval."); return; }
    setSkin(res); streamRef.current?.getTracks().forEach(t => t.stop()); setStep("results");
  };
  const skipCamera = () => { streamRef.current?.getTracks().forEach(t => t.stop()); setSkin(null); setStep("results"); };

  const seeItOnMe = async () => {
    if (!picked || !selfie) return;
    setPreviewBusy(true); setPreview(null); setFace("front");
    try {
      const { data } = await axios.post(`${API}/api/public/color/${slug}/preview`, { color_id: picked.id, selfie_b64: selfie });
      setPreview(data);
    } catch (e) { setCamErr(e.response?.data?.detail || "Preview failed — try again"); }
    finally { setPreviewBusy(false); }
  };

  const [shareBusy, setShareBusy] = useState(false);
  const shareCard = async (mode) => {
    if (!preview) return;
    setShareBusy(true);
    try {
      const res = await axios.post(`${API}/api/public/color/${slug}/share-card`, { color_id: preview.color.id, front_b64: preview.front, back_b64: preview.back }, { responseType: "blob" });
      const file = new File([res.data], `my-new-look-${preview.color.id}.png`, { type: "image/png" });
      const text = `My new look — ${preview.color.name} at ${salon?.name}. Book yours: ${window.location.origin}/book/${slug}?color=${preview.color.id}`;
      if (mode === "share" && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text, title: "My new hair colour" });
      } else if (mode === "share") {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
      } else {
        const a = document.createElement("a"); a.href = URL.createObjectURL(res.data); a.download = file.name; a.click();
      }
    } catch (e) { if (e?.name !== "AbortError") setCamErr("Couldn't build the share image"); }
    finally { setShareBusy(false); }
  };

  const submit = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/api/public/color/${slug}/pick`, {
        color_id: picked.id, name: form.name, phone: form.phone, by_staff: form.by_staff,
        undertone: skin?.undertone || "", depth: skin?.depth || "",
      });
      setDone(data); setStep("done");
    } catch (e) { setCamErr(e.response?.data?.detail || "Couldn't save — try again"); }
    setBusy(false);
  };

  if (!salon) return <Shell><Loader2 className="w-8 h-8 animate-spin text-amber-400 mx-auto mt-24" /></Shell>;
  if (salon.error) return <Shell><p className="text-center text-white mt-24">Salon not found</p></Shell>;

  const suits = (c) => !skin || (c.suits.includes(skin.undertone) && c.depth.includes(skin.depth));
  const ordered = [...salon.colors].sort((a, b) => Number(suits(b)) - Number(suits(a)));

  return (
    <Shell>
      <header className="flex items-center gap-3 px-5 pt-6 pb-3" data-testid="color-tryon-header">
        {salon.logo_url && <img src={`${API}${salon.logo_url}`} alt="" className="w-12 h-12 rounded-full bg-white object-contain border-2 border-amber-400 p-1" />}
        <div>
          <p className="text-amber-300 text-[11px] tracking-[0.25em] font-semibold">HAIR COLOUR STUDIO</p>
          <h1 className="text-white text-lg font-serif leading-tight">{salon.name}</h1>
        </div>
      </header>

      {step === "intro" && (
        <section className="px-5 pb-10" data-testid="color-tryon-intro">
          <h2 className="text-white text-3xl font-serif mt-4">Find your perfect colour</h2>
          <p className="text-slate-300 text-sm mt-2">Fit your face in the oval — we read your skin undertone <b>on your phone</b> (no photo is uploaded) and highlight the professional shades that suit you.</p>
          <button onClick={startCamera} data-testid="color-start-camera" className="mt-6 w-full py-4 rounded-2xl bg-amber-400 text-slate-900 font-bold text-base inline-flex items-center justify-center gap-2">
            <ScanFace className="w-5 h-5" /> Open front camera
          </button>
          <button onClick={skipCamera} data-testid="color-skip-camera" className="mt-3 w-full py-3 rounded-2xl border border-slate-600 text-slate-200 text-sm">Skip — show all shades</button>
        </section>
      )}

      {step === "camera" && (
        <section className="px-5 pb-10" data-testid="color-tryon-camera">
          <div className="relative rounded-3xl overflow-hidden bg-black aspect-[3/4]">
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover -scale-x-100" />
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute left-1/2 top-[14%] -translate-x-1/2 w-[62%] h-[68%] rounded-[50%] border-4 border-amber-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
              <p className="absolute bottom-4 left-0 right-0 text-center text-white text-sm font-semibold drop-shadow">Fit your face inside the oval · good light · no filter</p>
            </div>
          </div>
          <canvas ref={canvasRef} className="hidden" />
          {camErr && <p className="mt-3 text-rose-300 text-sm" data-testid="color-cam-error">{camErr}</p>}
          <button onClick={capture} data-testid="color-capture-btn" className="mt-4 w-full py-4 rounded-2xl bg-amber-400 text-slate-900 font-bold inline-flex items-center justify-center gap-2"><Camera className="w-5 h-5" /> Read my skin tone</button>
          <button onClick={skipCamera} className="mt-3 w-full py-3 rounded-2xl border border-slate-600 text-slate-200 text-sm">Skip</button>
        </section>
      )}

      {step === "results" && (
        <section className="px-5 pb-28" data-testid="color-tryon-results">
          {skin ? (
            <div className="flex items-center gap-3 bg-slate-800/70 border border-amber-400/40 rounded-2xl p-3" data-testid="color-skin-result">
              <span className="w-10 h-10 rounded-full border-2 border-white/40" style={{ background: skin.rgb }} />
              <p className="text-slate-100 text-sm"><b className="capitalize">{skin.undertone}</b> · {skin.depth} — {UNDERTONE_COPY[skin.undertone]}</p>
              <button onClick={startCamera} className="ml-auto text-amber-300" title="Retry"><RotateCcw className="w-4 h-4" /></button>
            </div>
          ) : <p className="text-slate-300 text-sm">Browse all professional shades — tap one to choose.</p>}
          <div className="grid grid-cols-2 gap-3 mt-4">
            {ordered.map(c => {
              const good = skin && suits(c), sel = picked?.id === c.id;
              return (
                <button key={c.id} onClick={() => setPicked(c)} data-testid={`color-card-${c.id}`}
                  className={`text-left rounded-2xl overflow-hidden border-2 transition-transform active:scale-[0.98] ${sel ? "border-amber-400 ring-2 ring-amber-300/50" : good ? "border-emerald-400/70" : "border-slate-700"} ${skin && !good ? "opacity-60" : ""}`}>
                  <div className="aspect-[4/5] bg-slate-800 relative">
                    {c.image_url ? <img src={`${API}${c.image_url}`} alt={c.name} className="w-full h-full object-cover" loading="lazy" />
                      : <div className="w-full h-full" style={{ background: `linear-gradient(160deg, ${c.swatch.join(",")})` }} />}
                    {good && <span className="absolute top-2 left-2 text-[10px] font-bold bg-emerald-500 text-white px-2 py-0.5 rounded-full">✓ Suits you</span>}
                    {sel && <span className="absolute inset-0 bg-amber-400/20 flex items-center justify-center"><Check className="w-10 h-10 text-white drop-shadow" /></span>}
                  </div>
                  <div className="p-2.5 bg-slate-900">
                    <div className="flex gap-1 mb-1">{c.swatch.map(s => <span key={s} className="w-4 h-4 rounded-full border border-white/20" style={{ background: s }} />)}</div>
                    <p className="text-white text-sm font-semibold leading-tight">{c.name}</p>
                    <p className="text-slate-400 text-[10px] mt-0.5">{c.tag}</p>
                    {c.price != null && <p className="text-emerald-300 text-[11px] font-semibold mt-0.5" data-testid={`color-price-${c.id}`}>{c.service_name} · ₹{c.price}</p>}
                  </div>
                </button>
              );
            })}
          </div>
          {picked && (
            <div className="fixed bottom-0 left-0 right-0 bg-slate-950/95 backdrop-blur border-t border-amber-400/30 p-4" data-testid="color-pick-bar">
              <p className="text-amber-300 text-xs font-semibold mb-2">Selected: {picked.name}</p>
              {selfie && (
                <button onClick={seeItOnMe} disabled={previewBusy} data-testid="color-see-on-me"
                  className="mb-2 w-full py-3 rounded-2xl bg-white/10 border border-amber-400/50 text-amber-200 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
                  {previewBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanFace className="w-4 h-4" />}
                  {previewBusy ? "Colouring your hair… ~30 s" : "See it on me — front & back"}
                </button>
              )}
              <div className="flex gap-2">
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Your name" data-testid="color-pick-name" className="flex-1 rounded-xl bg-slate-800 text-white text-sm px-3 py-2.5 border border-slate-700" />
                <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Phone (optional)" inputMode="tel" data-testid="color-pick-phone" className="flex-1 rounded-xl bg-slate-800 text-white text-sm px-3 py-2.5 border border-slate-700" />
              </div>
              <label className="flex items-center gap-2 text-slate-300 text-xs mt-2"><input type="checkbox" checked={form.by_staff} onChange={e => setForm({ ...form, by_staff: e.target.checked })} /> Scanned by salon staff</label>
              <button onClick={submit} disabled={busy} data-testid="color-pick-submit" className="mt-2 w-full py-3.5 rounded-2xl bg-amber-400 text-slate-900 font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Choose this colour
              </button>
              {camErr && <p className="mt-2 text-rose-300 text-xs">{camErr}</p>}
            </div>
          )}
        </section>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-5" data-testid="color-preview-modal" style={{ perspective: "1200px" }}>
          <p className="text-amber-300 text-xs tracking-[0.25em] font-semibold mb-3">YOU IN {preview.color.name.toUpperCase()}</p>
          <div className="relative w-72 aspect-[4/5] transition-transform duration-700" style={{ transformStyle: "preserve-3d", transform: face === "back" ? "rotateY(180deg)" : "rotateY(0deg)" }} data-testid="color-preview-card">
            <img src={`data:image/png;base64,${preview.front}`} alt="front" className="absolute inset-0 w-full h-full object-cover rounded-3xl border-2 border-amber-400" style={{ backfaceVisibility: "hidden" }} />
            {preview.back
              ? <img src={`data:image/png;base64,${preview.back}`} alt="back" className="absolute inset-0 w-full h-full object-cover rounded-3xl border-2 border-amber-400" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }} />
              : <div className="absolute inset-0 rounded-3xl border-2 border-amber-400 bg-slate-900 flex items-center justify-center text-slate-400 text-xs" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>Back view unavailable</div>}
          </div>
          <div className="flex gap-2 mt-5">
            {["front", "back"].map(f => (
              <button key={f} onClick={() => setFace(f)} data-testid={`color-preview-${f}`}
                className={`px-5 py-2 rounded-full text-sm font-semibold ${face === f ? "bg-amber-400 text-slate-900" : "bg-white/10 text-white"}`}>{f === "front" ? "Front" : "Back"}</button>
            ))}
            <button onClick={() => setFace(f => f === "front" ? "back" : "front")} data-testid="color-preview-rotate" className="px-4 py-2 rounded-full bg-white/10 text-white text-sm inline-flex items-center gap-1"><RotateCcw className="w-4 h-4" /> Rotate</button>
          </div>
          <p className="text-slate-400 text-[11px] mt-3 text-center max-w-xs">AI preview of {preview.color.name} on your own photo. Your selfie is used only for this preview and is not saved.</p>
          <div className="flex gap-2 mt-4 w-full max-w-xs">
            <button onClick={() => shareCard("share")} disabled={shareBusy} data-testid="color-preview-share"
              className="flex-1 py-3 rounded-2xl bg-[#25D366] text-slate-900 text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
              {shareBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />} Share / WhatsApp
            </button>
            <button onClick={() => shareCard("download")} disabled={shareBusy} data-testid="color-preview-download"
              className="py-3 px-4 rounded-2xl bg-white/10 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
              <Download className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2 mt-2 w-full max-w-xs">
            <button onClick={() => setPreview(null)} data-testid="color-preview-close" className="flex-1 py-3 rounded-2xl bg-white/10 text-white text-sm font-semibold">Try another shade</button>
            <button onClick={() => { setPreview(null); submit(); }} data-testid="color-preview-choose" className="flex-1 py-3 rounded-2xl bg-amber-400 text-slate-900 text-sm font-bold">Choose this colour</button>
          </div>
        </div>
      )}

      {step === "done" && done && (
        <section className="px-5 pb-10 text-center" data-testid="color-tryon-done">
          <div className="mx-auto mt-6 w-40 aspect-[4/5] rounded-2xl overflow-hidden border-2 border-amber-400">
            {done.color.image_url ? <img src={`${API}${done.color.image_url}`} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{ background: `linear-gradient(160deg, ${done.color.swatch.join(",")})` }} />}
          </div>
          <h2 className="text-white text-2xl font-serif mt-4">{done.color.name}</h2>
          <p className="text-slate-300 text-sm mt-1">{done.color.tag}</p>
          <div className="mt-5 inline-block bg-amber-400 text-slate-900 rounded-2xl px-6 py-3">
            <p className="text-[11px] font-semibold tracking-widest">SHOW THIS TO YOUR STYLIST</p>
            <p className="text-3xl font-black tracking-widest" data-testid="color-pick-code">{done.code}</p>
          </div>
          <button onClick={() => navigate(`/book/${slug}?color=${done.color.id}&code=${done.code}`)} data-testid="color-book-btn"
            className="mt-6 w-full py-4 rounded-2xl bg-white text-slate-900 font-bold inline-flex items-center justify-center gap-2">
            <CalendarCheck className="w-5 h-5" /> Book this colour — pick stylist & time
          </button>
          <p className="text-slate-400 text-xs mt-3">Walk-in? Just show the code — your stylist has been notified ✦</p>
          <button onClick={() => { setPicked(null); setDone(null); setStep("results"); }} className="mt-6 text-amber-300 text-sm underline">Pick a different shade</button>
        </section>
      )}
    </Shell>
  );
}

const Shell = ({ children }) => (
  <div className="min-h-screen bg-[#07101f] text-white max-w-md mx-auto" data-testid="color-tryon-page">{children}</div>
);
