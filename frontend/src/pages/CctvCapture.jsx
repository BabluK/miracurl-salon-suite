import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Camera, ArrowLeft, Play, Square } from "lucide-react";

export default function CctvCapture() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const wakeRef = useRef(null);
  const [running, setRunning] = useState(false);
  const [interval_, setInterval_] = useState(3);
  const [countdown, setCountdown] = useState(0);
  const [last, setLast] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        setErr("Camera access denied — allow camera permission and reload.");
      }
    })();
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      clearInterval(timerRef.current);
      wakeRef.current?.release?.();
    };
  }, []);

  const captureAndSend = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 960 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    const b64 = canvas.toDataURL("image/jpeg", 0.7);
    try {
      const { data } = await api.post("/cctv/analyze-frame", { image_base64: b64 });
      setLast(data.observation);
      setErr("");
    } catch (e) {
      setErr(e.response?.data?.detail || "Upload failed — retrying next cycle");
    }
  }, []);

  const start = async () => {
    setRunning(true);
    try { wakeRef.current = await navigator.wakeLock?.request?.("screen"); } catch { /* unsupported */ }
    captureAndSend();
    setCountdown(interval_ * 60);
    timerRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { captureAndSend(); return interval_ * 60; }
        return c - 1;
      });
    }, 1000);
  };

  const stop = () => {
    setRunning(false);
    clearInterval(timerRef.current);
    wakeRef.current?.release?.();
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col" data-testid="cctv-capture-page">
      <div className="flex items-center justify-between p-4">
        <Link to="/cctv" className="inline-flex items-center gap-2 text-white/60 hover:text-white text-sm" data-testid="capture-back-btn">
          <ArrowLeft className="w-4 h-4" /> Back to analytics
        </Link>
        <div className="text-[10px] uppercase tracking-[0.25em] text-gold flex items-center gap-2">
          <Camera className="w-3.5 h-3.5" /> Mira Floor-Cam
          {running && <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />}
        </div>
      </div>

      <div className="flex-1 relative">
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-contain" />
        {last && (
          <div className="absolute bottom-4 left-4 right-4 bg-black/70 backdrop-blur rounded-xl p-3 text-xs flex flex-wrap gap-x-4 gap-y-1" data-testid="capture-last-result">
            <span>👥 {last.waiting_customers} waiting</span>
            <span>🪑 {last.chairs_empty} empty chairs</span>
            <span>📏 queue {last.queue_length}</span>
            <span>😴 {last.staff_idle} idle staff</span>
            <span className="text-white/50 w-full">{last.scene_notes}</span>
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        {err && <div className="text-xs text-rose-400 text-center">{err}</div>}
        <div className="flex items-center justify-center gap-3">
          <select value={interval_} onChange={e => setInterval_(+e.target.value)} disabled={running}
            className="bg-white/10 border border-white/20 rounded-md px-3 py-2 text-sm" data-testid="capture-interval-select">
            {[2, 3, 5, 10].map(m => <option key={m} value={m} className="text-black">every {m} min</option>)}
          </select>
          {running ? (
            <button onClick={stop} data-testid="capture-stop-btn"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-rose-600 text-white font-semibold text-sm">
              <Square className="w-4 h-4" /> Stop · next in {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
            </button>
          ) : (
            <button onClick={start} disabled={!!err} data-testid="capture-start-btn"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-gold to-blush text-bg-base font-semibold text-sm disabled:opacity-50">
              <Play className="w-4 h-4" /> Start auto-capture
            </button>
          )}
        </div>
        <p className="text-[11px] text-white/40 text-center max-w-sm mx-auto">
          Mount this device facing the salon floor. Keep this page open — the screen stays awake and a frame is analyzed automatically.
        </p>
      </div>
    </div>
  );
}
