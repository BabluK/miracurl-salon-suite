import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { X, QrCode } from "lucide-react";

export function QrScanCheckIn({ onScan, onClose }) {
  const ref = useRef(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const scanner = new Html5Qrcode("staff-qr-reader");
    ref.current = scanner;
    let done = false;
    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      (text) => {
        if (done) return;
        done = true;
        let token = text;
        try {
          const u = new URL(text);
          token = u.searchParams.get("qr") || text;
        } catch { /* raw token */ }
        onScan(token);
      },
      () => {},
    ).catch(() => setErr("Camera unavailable — allow camera access in your browser, or open the QR with your phone camera app."));
    return () => {
      try { scanner.stop().then(() => scanner.clear()).catch(() => {}); } catch { /* already stopped */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" data-testid="qr-scan-modal" onClick={onClose}>
      <div className="bg-[#141414] border border-white/10 rounded-2xl w-full max-w-sm p-5 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <QrCode className="w-4 h-4 text-gold" /> Scan the salon desk QR
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white" data-testid="qr-scan-close"><X className="w-5 h-5" /></button>
        </div>
        <div id="staff-qr-reader" className="rounded-xl overflow-hidden bg-black min-h-[240px]" />
        {err
          ? <p className="text-xs text-amber-400 mt-3" data-testid="qr-scan-error">{err}</p>
          : <p className="text-[11px] text-white/40 mt-3">Point your camera at the printed QR at the salon desk — you'll be checked in instantly, no GPS needed.</p>}
      </div>
    </div>
  );
}
