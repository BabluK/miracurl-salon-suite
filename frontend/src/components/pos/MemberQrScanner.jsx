import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import jsQR from "jsqr";
import { X, Camera } from "lucide-react";

// Camera QR scanner for member cards — BarcodeDetector when available, jsQR fallback.
export function MemberQrScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stream, raf, stop = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const detector = "BarcodeDetector" in window ? new window.BarcodeDetector({ formats: ["qr_code"] }) : null;

    async function tick() {
      if (stop) return;
      const v = videoRef.current;
      if (v && v.readyState === 4) {
        try {
          if (detector) {
            const codes = await detector.detect(v);
            if (codes.length) { onDetected(codes[0].rawValue); return; }
          } else {
            canvas.width = v.videoWidth; canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height);
            if (code?.data) { onDetected(code.data); return; }
          }
        } catch { /* keep scanning */ }
      }
      raf = requestAnimationFrame(tick);
    }

    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then(s => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
        raf = requestAnimationFrame(tick);
      })
      .catch(() => setError("Camera not available — allow camera access in your browser, or type the Member ID instead."));

    return () => {
      stop = true;
      if (raf) cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[150] bg-black/85 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#141419] border border-white/15 rounded-3xl w-full max-w-sm p-5 text-center" onClick={e => e.stopPropagation()} data-testid="member-qr-scanner">
        <div className="flex items-center justify-between mb-3">
          <div className="text-white font-semibold text-sm flex items-center gap-2"><Camera className="w-4 h-4 text-amber-400" /> Scan member QR</div>
          <button onClick={onClose} data-testid="qr-scanner-close" className="text-white/50 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        {error ? (
          <p className="text-amber-300 text-xs py-10" data-testid="qr-scanner-error">{error}</p>
        ) : (
          <div className="relative rounded-2xl overflow-hidden">
            <video ref={videoRef} muted playsInline className="w-full aspect-square object-cover" />
            <div className="absolute inset-8 border-2 border-amber-400/80 rounded-2xl pointer-events-none animate-pulse" />
          </div>
        )}
        <p className="text-white/40 text-[11px] mt-3">Point the camera at the member's QR (card, email or phone screen)</p>
      </div>
    </div>,
    document.body
  );
}
