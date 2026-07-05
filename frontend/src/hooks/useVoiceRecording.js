import { useEffect, useRef, useState } from "react";

// Mic recording with voice-activity detection: auto-stops on a natural pause
// after speech, or after 30s of total silence (hands-free mode).
export function useVoiceRecording({ onBlob, onNoSpeech, onMicError }) {
  const [recording, setRecording] = useState(false);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const vadCtxRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const maxTimerRef = useRef(null);
  const rafRef = useRef(null);
  const speechRef = useRef(false);
  const cbRef = useRef({ onBlob, onNoSpeech, onMicError });
  cbRef.current = { onBlob, onNoSpeech, onMicError };

  function cleanupVad() {
    clearTimeout(silenceTimerRef.current);
    clearTimeout(maxTimerRef.current);
    cancelAnimationFrame(rafRef.current);
    try { vadCtxRef.current?.close(); } catch { /* ignore */ }
    vadCtxRef.current = null;
    silenceTimerRef.current = null;
  }

  async function startRecording(auto = false) {
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      speechRef.current = false;
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        cleanupVad();
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        setRecording(false);
        if (auto && !speechRef.current) {
          cbRef.current.onNoSpeech?.();
          return;
        }
        if (blob.size < 1200) return;
        await cbRef.current.onBlob?.(blob, auto);
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);

      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      vadCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      maxTimerRef.current = setTimeout(() => { try { rec.state !== "inactive" && rec.stop(); } catch { /* noop */ } }, 30000);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / buf.length);
        if (rms > 0.045) {
          speechRef.current = true;
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        } else if (speechRef.current && !silenceTimerRef.current) {
          // 1.4s of silence after speech → end turn and send
          silenceTimerRef.current = setTimeout(() => { try { rec.state !== "inactive" && rec.stop(); } catch { /* noop */ } }, 1400);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      cbRef.current.onMicError?.();
    }
  }

  function stopRecording() {
    cleanupVad();
    try { recRef.current?.state !== "inactive" && recRef.current?.stop(); } catch { /* noop */ }
    setRecording(false);
  }

  useEffect(() => () => {
    cleanupVad();
    try { recRef.current?.state !== "inactive" && recRef.current?.stop(); } catch { /* noop */ }
  }, []);

  return { recording, startRecording, stopRecording };
}
