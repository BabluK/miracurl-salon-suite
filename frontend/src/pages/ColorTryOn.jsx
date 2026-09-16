import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { Camera, Sparkles, Check, Loader2, RotateCcw, ScanFace, CalendarCheck, Share2, Download, Upload } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;
const UNDERTONE_COPY = {
  warm: "Warm undertone — golden, caramel, copper and honey shades glow on you.",
  cool: "Cool undertone — ash, mocha, burgundy and rose-brown shades flatter you.",
  neutral: "Neutral undertone — lucky you, both warm and cool families suit you.",
};

// On-device skin read: average the cheek pixels inside the face oval → undertone + depth. Nothing is uploaded.
const srcSize = (src) => [src.videoWidth || src.naturalWidth || 320, src.videoHeight || src.naturalHeight || 240];
// Full-res shot for the AI try-on (analysis uses a small 320px copy).
const shotDataUrl = (src) => {
  const [sw, sh] = srcSize(src), w = Math.min(900, sw), h = Math.round(w * sh / sw);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d").drawImage(src, 0, 0, w, h);
  return c.toDataURL("image/jpeg", 0.9);
};
function analyseSkin(video, canvas) {
  const [vw, vh] = srcSize(video);
  const w = 320, h = Math.round(320 * vh / vw) || 240;
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
  const branchQ = new URLSearchParams(window.location.search).get("branch") || "";
  const branchQs = branchQ ? `&branch=${encodeURIComponent(branchQ)}` : "";
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
  const [faceInfo, setFaceInfo] = useState(null); // {face, presentation, hair_length}
  const [checking, setChecking] = useState(false);
  const processShot = async (source) => {
    const res = analyseSkin(source, canvasRef.current);
    let shot = null;
    try { shot = shotDataUrl(source); } catch { shot = null; }
    setSelfie(shot);
    if (!res) { setCamErr("Couldn't read your skin — use a brighter, front-facing photo with your face in the centre."); return; }
    setChecking(true); setCamErr("");
    let info = { face: true, presentation: "unclear" };
    try {
      if (shot) { const { data } = await axios.post(`${API}/api/public/color/${slug}/face-check`, { selfie_b64: shot }); info = data; }
    } catch { /* keep going without the hint */ }
    setChecking(false);
    if (!info.face) { setCamErr("No face detected — please use a clear, front-facing photo and try again."); return; }
    setFaceInfo(info);
    setSkin(res); streamRef.current?.getTracks().forEach(t => t.stop());
    setGender(info.presentation === "man" ? "men" : info.presentation === "woman" ? "women" : null);
    setStep("gender");
  };
  const capture = () => processShot(videoRef.current);
  const uploadSelfie = (file) => {
    if (!file) return;
    const img = new Image();
    img.onload = () => { setStep("camera"); processShot(img); URL.revokeObjectURL(img.src); };
    img.onerror = () => setCamErr("Couldn't read that photo — try a JPG or PNG.");
    img.src = URL.createObjectURL(file);
  };
  const skipCamera = () => { streamRef.current?.getTracks().forEach(t => t.stop()); setSkin(null); setGender(null); setStep("gender"); };
  const [gender, setGender] = useState(null); // men | women — confirmed by the guest
  const confirmGender = (g) => { setGender(g); setStep("results"); };

  const [backBusy, setBackBusy] = useState(false);
  const seeItOnMe = async () => {
    if (!picked || !selfie) return;
    setPreviewBusy(true); setPreview(null); setFace("front");
    const subject = {
      presentation: gender === "men" ? "man" : gender === "women" ? "woman" : (faceInfo?.presentation || "unclear"),
      hair_length: faceInfo?.hair_length || "unclear", facial_hair: faceInfo?.facial_hair || "unclear",
    };
    let front;
    try {
      const { data } = await axios.post(`${API}/api/public/color/${slug}/preview`, { color_id: picked.id, selfie_b64: selfie, view: "front", ...subject });
      front = data.front; setPreview({ color: data.color, front, back: null });
    } catch (e) { setCamErr(e.response?.data?.detail || "Preview failed — try again"); setPreviewBusy(false); return; }
    setPreviewBusy(false); setBackBusy(true);
    try {  // the back view is rendered from the coloured front so both match — shown as soon as it lands
      const { data } = await axios.post(`${API}/api/public/color/${slug}/preview`, { color_id: picked.id, selfie_b64: front, view: "back", ...subject });
      setPreview(p => p && p.front === front ? { ...p, back: data.back } : p);
    } catch { /* front alone is still useful */ }
    finally { setBackBusy(false); }
  };

  const [shareBusy, setShareBusy] = useState(false);
  const shareCard = async (mode) => {
    if (!preview) return;
    setShareBusy(true);
    try {
      const res = await axios.post(`${API}/api/public/color/${slug}/share-card`, { color_id: preview.color.id, front_b64: preview.front, back_b64: preview.back }, { responseType: "blob" });
      const file = new File([res.data], `my-new-look-${preview.color.id}.png`, { type: "image/png" });
      const text = `My new look — ${preview.color.name} at ${salon?.name}. Book yours: ${window.location.origin}/book/${slug}?color=${preview.color.id}${branchQs}`;
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

  const nameRef = useRef(null);
  const [nameNeeded, setNameNeeded] = useState(false);
  const submit = async () => {
    if (!picked) return;
    if (!form.name.trim()) {  // we need a name (and ideally a number) to save the pick and pre-fill the booking
      setPreview(null); setNameNeeded(true);
      setTimeout(() => { nameRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); nameRef.current?.focus(); }, 350);
      return;
    }
    setNameNeeded(false);
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/api/public/color/${slug}/pick`, {
        color_id: picked.id, name: form.name, phone: form.phone, by_staff: form.by_staff,
        undertone: skin?.undertone || "", depth: skin?.depth || "", gender: gender || "",
      });
      setDone(data); setStep("done");
    } catch (e) { setCamErr(e.response?.data?.detail || "Couldn't save — try again"); }
    setBusy(false);
  };

  if (!salon) return <Shell><Loader2 className="w-8 h-8 animate-spin text-amber-400 mx-auto mt-24" /></Shell>;
  if (salon.error) return <Shell><p className="text-center text-white mt-24">Salon not found</p></Shell>;

  const suits = (c) => !skin || (c.suits.includes(skin.undertone) && c.depth.includes(skin.depth));
  const bySuits = (list) => [...list].sort((a, b) => Number(suits(b)) - Number(suits(a)));
  const ordered = bySuits(salon.colors);
  const sections = gender === "men"
    ? [["Professional shades for men", bySuits(salon.men_colors || []).filter(c => !c.custom)]]
    : [[gender === "women" ? "Shades for women" : "All shades", ordered]];
  const guess = faceInfo?.presentation;

  const ShadeCard = (c) => {
    const good = skin && suits(c), sel = picked?.id === c.id;
    return (
      <button key={c.id} onClick={() => setPicked(c)} data-testid={`color-card-${c.id}`}
        className={`text-left rounded-2xl overflow-hidden border-2 transition-transform active:scale-[0.98] ${sel ? "border-amber-400 ring-2 ring-amber-300/50" : good ? "border-emerald-400/70" : "border-slate-700"} ${skin && !good ? "opacity-60" : ""}`}>
        <div className="aspect-[4/5] bg-slate-800 relative">
          {c.image_url ? <img src={`${API}${c.image_url}?w=480`} alt={c.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
            : <div className="w-full h-full" style={{ background: `linear-gradient(160deg, ${c.swatch.join(",")})` }} />}
          {good && <span className="absolute top-2 left-2 text-[10px] font-bold bg-emerald-500 text-white px-2 py-0.5 rounded-full">✓ Suits you</span>}
          {c.tier && c.tier !== "natural" && <span className={`absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${c.tier === "fashion" ? "bg-fuchsia-500/90 text-white" : "bg-sky-500/90 text-white"}`} data-testid={`color-tier-${c.id}`}>{c.tier === "fashion" ? "Fashion" : "Technique"}</span>}
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
  };

  const bgShade = (picked?.image_url && picked) || salon.colors.find(c => c.image_url && !c.custom) || salon.colors.find(c => c.image_url);
  return (
    <Shell bgUrl={bgShade?.image_url ? `${API}${bgShade.image_url}?w=960` : null}>
      <header className="flex items-center gap-3 px-5 pt-6 pb-3" data-testid="color-tryon-header">
        {salon.logo_url && <img src={`${API}${salon.logo_url}`} alt="" className="w-12 h-12 rounded-full bg-white object-contain border-2 border-amber-400 p-1" />}
        <div>
          <p className="text-amber-300 text-[11px] tracking-[0.25em] font-semibold">HAIR COLOUR STUDIO</p>
          <h1 className="text-white text-lg font-serif leading-tight">{salon.name}</h1>
        </div>
      </header>

      <canvas ref={canvasRef} className="hidden" />
      {step === "intro" && (
        <section className="px-5 pb-10" data-testid="color-tryon-intro">
          <h2 className="text-white text-3xl font-serif mt-4">Find your perfect colour</h2>
          <p className="text-slate-300 text-sm mt-2">Fit your face in the oval — we read your skin undertone <b>on your phone</b> (no photo is uploaded) and highlight the professional shades that suit you.</p>
          <button onClick={startCamera} data-testid="color-start-camera" className="mt-6 w-full py-4 rounded-2xl bg-amber-400 text-slate-900 font-bold text-base inline-flex items-center justify-center gap-2">
            <ScanFace className="w-5 h-5" /> Open front camera
          </button>
          <label className="mt-3 w-full py-3 rounded-2xl border border-amber-400/50 text-amber-200 text-sm inline-flex items-center justify-center gap-2 cursor-pointer" data-testid="color-upload-btn">
            <Upload className="w-4 h-4" /> Upload a selfie instead
            <input type="file" accept="image/*" className="hidden" onChange={e => { uploadSelfie(e.target.files?.[0]); e.target.value = ""; }} data-testid="color-upload-input" />
          </label>
          {camErr && step === "intro" && <p className="mt-2 text-rose-300 text-sm" data-testid="color-intro-error">{camErr}</p>}
          <button onClick={skipCamera} data-testid="color-skip-camera" className="mt-3 w-full py-3 rounded-2xl border border-slate-600 text-slate-200 text-sm">Skip — show all shades</button>
          <div className="flex gap-2 mt-6 text-[11px]" data-testid="color-intro-chips">
            {[`${salon.colors.filter(c => !c.custom).length} shades for her`, `${(salon.men_colors || []).filter(c => !c.custom).length} for him`, "Front & back preview"].map(x => (
              <span key={x} className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300">{x}</span>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3" data-testid="color-intro-mosaic">
            {[...salon.colors.filter(c => c.image_url && !c.custom).slice(0, 4), ...(salon.men_colors || []).filter(c => c.image_url && !c.custom).slice(0, 2)].map((c, i) => (
              <div key={c.id} className="relative aspect-[4/5] rounded-xl overflow-hidden border border-white/10" style={{ animation: `teaser-in .5s ease-out ${i * 70}ms both` }}>
                <img src={`${API}${c.image_url}?w=320`} alt={c.name} className="w-full h-full object-cover" loading="lazy" />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-5 text-[10px] text-white font-semibold truncate">{c.name}</span>
              </div>
            ))}
          </div>
          <style>{`@keyframes teaser-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}`}</style>
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
          {camErr && <p className="mt-3 text-rose-300 text-sm" data-testid="color-cam-error">{camErr}</p>}
          <button onClick={capture} disabled={checking} data-testid="color-capture-btn" className="mt-4 w-full py-4 rounded-2xl bg-amber-400 text-slate-900 font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60">{checking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />} {checking ? "Checking your face…" : "Read my skin tone"}</button>
          <label className="mt-3 w-full py-3 rounded-2xl border border-slate-600 text-slate-200 text-sm inline-flex items-center justify-center gap-2 cursor-pointer" data-testid="color-upload-camera-step">
            <Upload className="w-4 h-4" /> Upload a photo instead
            <input type="file" accept="image/*" className="hidden" onChange={e => { uploadSelfie(e.target.files?.[0]); e.target.value = ""; }} data-testid="color-upload-input-camera" />
          </label>
          <button onClick={skipCamera} className="mt-3 w-full py-3 rounded-2xl border border-slate-600 text-slate-200 text-sm">Skip</button>
        </section>
      )}

      {step === "gender" && (
        <section className="px-5 pb-10" data-testid="color-tryon-gender">
          <h2 className="text-white text-2xl font-serif mt-4">
            {guess === "man" ? "Looks like you're a gentleman — is that right?" : guess === "woman" ? "Looks like you're a lady — is that right?" : "Who's trying colour today?"}
          </h2>
          <p className="text-slate-300 text-sm mt-2">{guess && guess !== "unclear" ? "Confirm so we colour only your hair — beards and facial hair stay untouched for gentlemen." : "We'll show the right shade collection and keep facial hair untouched for gentlemen."}</p>
          <div className="grid grid-cols-2 gap-3 mt-6">
            {[["men", "Gentleman", "Men's shades · beard stays as is"], ["women", "Lady", "Women's shades · full collection"]].map(([g, label, sub]) => (
              <button key={g} onClick={() => confirmGender(g)} data-testid={`color-gender-${g}`}
                className={`rounded-2xl p-4 text-left border-2 transition-transform active:scale-[0.98] ${gender === g ? "border-amber-400 bg-amber-400/10" : "border-slate-700 bg-slate-800/60"}`}>
                <p className="text-white font-bold text-base">{gender === g ? "✓ " : ""}{label}</p>
                <p className="text-slate-400 text-[11px] mt-1">{sub}</p>
              </button>
            ))}
          </div>
          {selfie && <button onClick={startCamera} data-testid="color-gender-retake" className="mt-4 w-full py-3 rounded-2xl border border-slate-600 text-slate-200 text-sm">Retake photo</button>}
        </section>
      )}

      {step === "results" && (
        <section className="px-5 pb-28" data-testid="color-tryon-results">
          {skin ? (
            <div className="flex items-center gap-3 bg-slate-800/70 border border-amber-400/40 rounded-2xl p-3" data-testid="color-skin-result">
              <span className="w-10 h-10 rounded-full border-2 border-white/40" style={{ background: skin.rgb }} />
              <div>
                <p className="text-slate-100 text-sm"><b className="capitalize">{skin.undertone}</b> · {skin.depth} — {UNDERTONE_COPY[skin.undertone]}</p>
                {faceInfo && (
                  <p className="text-emerald-300 text-xs mt-1" data-testid="color-face-info">
                    ✓ Face detected · {gender === "men" ? "gentleman" : "lady"}{faceInfo.hair_length && faceInfo.hair_length !== "unclear" ? ` · ${faceInfo.hair_length} hair` : ""}{gender === "men" && faceInfo.facial_hair && !["none", "unclear"].includes(faceInfo.facial_hair) ? ` · ${faceInfo.facial_hair} kept` : ""}
                  </p>
                )}
              </div>
              <button onClick={startCamera} className="ml-auto text-amber-300" title="Retry"><RotateCcw className="w-4 h-4" /></button>
            </div>
          ) : <p className="text-slate-300 text-sm">Browse all professional shades — tap one to choose.</p>}
          <button onClick={() => setStep("gender")} data-testid="color-change-gender" className="mt-3 text-amber-300 text-xs underline">Showing {gender === "men" ? "men's" : "women's"} collection · change</button>
          {sections.filter(([, list]) => list.length).map(([title, list]) => (
            <div key={title} data-testid={`color-section-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
              <p className="text-amber-300 text-[11px] tracking-[0.25em] font-semibold mt-5 mb-2">{title.toUpperCase()}</p>
              <div className="grid grid-cols-2 gap-3">{list.map(ShadeCard)}</div>
            </div>
          ))}
          {picked && (
            <div className="fixed bottom-0 left-0 right-0 bg-slate-950/95 backdrop-blur border-t border-amber-400/30 p-4" data-testid="color-pick-bar">
              <p className="text-amber-300 text-xs font-semibold mb-1">Selected: {picked.name}{picked.level ? <span className="text-slate-400 font-normal"> · Level {picked.level}</span> : null}</p>
              {picked.description && <p className="text-slate-300 text-[11px] mb-2" data-testid="color-pick-description">{picked.description}</p>}
              {selfie && (
                <button onClick={seeItOnMe} disabled={previewBusy} data-testid="color-see-on-me"
                  className="mb-2 w-full py-3 rounded-2xl bg-white/10 border border-amber-400/50 text-amber-200 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
                  {previewBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanFace className="w-4 h-4" />}
                  {previewBusy ? "Colouring your hair… ~20 s" : "See it on me — front & back"}
                </button>
              )}
              <div className="flex gap-2">
                <input ref={nameRef} value={form.name} onChange={e => { setForm({ ...form, name: e.target.value }); if (e.target.value.trim()) setNameNeeded(false); }} placeholder="Your name *" data-testid="color-pick-name"
                  className={`flex-1 rounded-xl bg-slate-800 text-white text-sm px-3 py-2.5 border ${nameNeeded ? "border-rose-400 ring-2 ring-rose-400/40" : "border-slate-700"}`} />
                <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Mobile number" inputMode="tel" data-testid="color-pick-phone" className="flex-1 rounded-xl bg-slate-800 text-white text-sm px-3 py-2.5 border border-slate-700" />
              </div>
              {nameNeeded && <p className="mt-1.5 text-rose-300 text-xs" data-testid="color-pick-name-hint">Please enter your name and mobile number so we can save your colour and book your stylist.</p>}
              <label className="flex items-center gap-2 text-slate-300 text-xs mt-2"><input type="checkbox" checked={form.by_staff} onChange={e => setForm({ ...form, by_staff: e.target.checked })} /> Scanned by salon staff</label>
              <button onClick={submit} disabled={busy} data-testid="color-pick-submit" className="mt-2 w-full py-3.5 rounded-2xl bg-amber-400 text-slate-900 font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Choose this colour
              </button>
              {camErr && <p className="mt-2 text-rose-300 text-xs">{camErr}</p>}
            </div>
          )}
        </section>
      )}

      {preview && createPortal(
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center gap-2 px-3 py-3 sm:py-4 overflow-y-auto" data-testid="color-preview-modal" style={{ perspective: "1400px" }}>
          <p className="text-amber-300 text-[11px] sm:text-xs tracking-[0.25em] font-semibold shrink-0">YOU IN {preview.color.name.toUpperCase()}</p>
          <div className="relative shrink-0 transition-transform duration-700"
            style={{ transformStyle: "preserve-3d", transform: face === "back" ? "rotateY(180deg)" : "rotateY(0deg)", aspectRatio: "4 / 5",
                     height: "min(calc(100dvh - 15.5rem), calc((100vw - 1.5rem) * 1.25), 1000px)", width: "auto" }} data-testid="color-preview-card">
            <img src={`data:image/png;base64,${preview.front}`} alt="front" className="absolute inset-0 w-full h-full object-cover rounded-2xl sm:rounded-3xl border-2 border-amber-400" style={{ backfaceVisibility: "hidden" }} />
            {preview.back
              ? <img src={`data:image/png;base64,${preview.back}`} alt="back" className="absolute inset-0 w-full h-full object-cover rounded-2xl sm:rounded-3xl border-2 border-amber-400" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }} />
              : <div className="absolute inset-0 rounded-2xl sm:rounded-3xl border-2 border-amber-400 bg-slate-900 flex flex-col items-center justify-center gap-2 text-slate-300 text-xs" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }} data-testid="color-preview-back-pending">
                  {backBusy ? <><Loader2 className="w-6 h-6 animate-spin text-amber-400" /> Rendering the back view… ~20 s</> : "Back view unavailable"}
                </div>}
          </div>
          {backBusy && <p className="text-amber-300/80 text-[11px] inline-flex items-center gap-1 shrink-0" data-testid="color-preview-back-status"><Loader2 className="w-3 h-3 animate-spin" /> Back view rendering — flip when ready</p>}
          <div className="flex gap-2 shrink-0">
            {["front", "back"].map(f => (
              <button key={f} onClick={() => setFace(f)} data-testid={`color-preview-${f}`}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold ${face === f ? "bg-amber-400 text-slate-900" : "bg-white/10 text-white"}`}>{f === "front" ? "Front" : "Back"}</button>
            ))}
            <button onClick={() => setFace(f => f === "front" ? "back" : "front")} data-testid="color-preview-rotate" className="px-3 py-1.5 rounded-full bg-white/10 text-white text-sm inline-flex items-center gap-1"><RotateCcw className="w-4 h-4" /> Rotate</button>
          </div>
          <p className="text-slate-500 text-[10px] text-center max-w-sm shrink-0">AI preview of {preview.color.name} on your own photo — your selfie is not saved.</p>
          <div className="flex gap-2 w-full max-w-sm shrink-0">
            <button onClick={() => shareCard("share")} disabled={shareBusy} data-testid="color-preview-share"
              className="flex-1 py-2.5 rounded-2xl bg-[#25D366] text-slate-900 text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
              {shareBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />} Share / WhatsApp
            </button>
            <button onClick={() => shareCard("download")} disabled={shareBusy} data-testid="color-preview-download"
              className="py-2.5 px-4 rounded-2xl bg-white/10 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
              <Download className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2 w-full max-w-sm shrink-0">
            <button onClick={() => setPreview(null)} data-testid="color-preview-close" className="flex-1 py-2.5 rounded-2xl bg-white/10 text-white text-sm font-semibold">Try another shade</button>
            <button onClick={() => { setPreview(null); submit(); }} data-testid="color-preview-choose" className="flex-1 py-2.5 rounded-2xl bg-amber-400 text-slate-900 text-sm font-bold">Choose this colour</button>
          </div>
        </div>,
        document.body
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
          <button onClick={() => navigate(`/book/${slug}?color=${done.color.id}&code=${done.code}&name=${encodeURIComponent(form.name)}&phone=${encodeURIComponent(form.phone)}${gender ? `&gender=${gender}` : ""}${branchQs}`)} data-testid="color-book-btn"
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

const Shell = ({ children, bgUrl }) => (
  <div className="min-h-screen relative isolate text-white" data-testid="color-tryon-page">
    <div aria-hidden className="fixed inset-0 z-0 bg-[#0b0a12]">
      {bgUrl && <img src={bgUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60 scale-105" style={{ filter: "blur(6px) saturate(1.15)" }} />}
      <div className="absolute inset-0" style={{ background: "radial-gradient(60% 50% at 20% 10%, rgba(212,175,55,0.22), transparent 60%), radial-gradient(50% 45% at 85% 90%, rgba(180,90,120,0.22), transparent 60%), linear-gradient(180deg, rgba(8,8,16,0.55), rgba(8,8,16,0.88))" }} />
    </div>
    <div className="relative z-10 min-h-screen max-w-md mx-auto bg-[#0a1020]/85 backdrop-blur-xl sm:border-x border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.6)]">{children}</div>
  </div>
);
