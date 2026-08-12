import { useEffect, useMemo, useRef, useState } from "react";

const STAGES = [
  "🧠 Analyzing your request…",
  "🔍 Researching data sources…",
  "🗂 Retrieving memory…",
  "⚙️ Running tools…",
  "🔗 Connecting insights…",
  "✨ Forming response…",
];

const BEAM_STAGES = ["Analyzing", "Researching", "Connecting", "Generating Results"];

export const MiraThinkingBeam = ({ className = "" }) => {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % BEAM_STAGES.length), 1600);
    return () => clearInterval(t);
  }, []);
  const dots = useMemo(() => Array.from({ length: 34 }, (_, k) => ({
    s: 2.5 + ((k * 7) % 3) * 1.4,
    o: 0.25 + ((k * 5) % 4) * 0.16,
  })), []);
  return (
    <div className={`rounded-2xl bg-white/[0.04] border border-white/10 px-5 py-4 backdrop-blur-sm ${className}`} data-testid="mira-thinking-beam">
      <style>{`@keyframes miraComet { 0% { left: 1%; } 50% { left: 90%; } 100% { left: 1%; } }`}</style>
      <p className="text-center text-sm font-bold text-white/90 mb-3">Mira is thinking…</p>
      <div className="relative h-4 flex items-center justify-between px-1 mb-3">
        {dots.map((d, k) => (
          <span key={k} className="rounded-full bg-violet-400 shrink-0" style={{ width: d.s, height: d.s, opacity: d.o }} />
        ))}
        <span
          className="absolute top-1/2 -translate-y-1/2 w-10 h-3 rounded-full pointer-events-none"
          style={{
            animation: "miraComet 2.8s ease-in-out infinite",
            background: "radial-gradient(closest-side, rgba(96,165,250,1), rgba(139,92,246,0.55), transparent)",
            boxShadow: "0 0 18px 6px rgba(99,102,241,0.45)",
          }}
        />
      </div>
      <div className="flex items-center justify-center gap-2.5 flex-wrap">
        {BEAM_STAGES.map((s, k) => (
          <span key={s} className="flex items-center gap-2.5">
            {k > 0 && <span className="w-1.5 h-1.5 rotate-45 bg-fuchsia-400/70 rounded-[1px]" />}
            <span className={`text-xs transition-all duration-500 ${k === i ? "text-white font-semibold drop-shadow-[0_0_8px_rgba(168,85,247,0.9)]" : "text-white/40"}`}>{s}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export const MiraThinkingStages = ({ className = "" }) => {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % STAGES.length), 1500);
    return () => clearInterval(t);
  }, []);
  return <span className={className} data-testid="mira-thinking-stage">{STAGES[i]}</span>;
};

export const MiraNeuralAvatar = ({ thinking = false, size = 112, className = "" }) => {
  const dim = Math.round(size * 2.1);
  const canvasRef = useRef(null);
  const thinkRef = useRef(thinking);
  thinkRef.current = thinking;

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return undefined;
    const ctx = cv.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    cv.width = dim * dpr;
    cv.height = dim * dpr;
    ctx.scale(dpr, dpr);
    const C = dim / 2, r0 = size / 2 - 8, r1 = dim / 2 - 4;
    const N = 34;
    const nodes = Array.from({ length: N }, (_, i) => ({
      a: (i / N) * Math.PI * 2 + Math.random() * 0.5,
      r: r0 + Math.random() * (r1 - r0 - 4),
      s: 0.0015 + Math.random() * 0.003,
      ph: Math.random() * Math.PI * 2,
      sz: 1 + Math.random() * 1.8,
      hue: Math.random() < 0.5 ? "56,189,248" : "232,121,249",
    }));
    const crownR = size / 2 + 5;
    const headNodes = Array.from({ length: 7 }, (_, i) => {
      const a = -Math.PI / 2 + (i - 3) * 0.22 + (Math.random() - 0.5) * 0.08;
      return { x: C + Math.cos(a) * (crownR + Math.random() * 10), y: C + Math.sin(a) * (crownR + Math.random() * 10), ph: Math.random() * Math.PI * 2 };
    });
    let intensity = thinkRef.current ? 1 : 0.18;
    let rings = [];
    let raf, t = 0, lastRing = 0;
    const maxD = size * 0.55;
    const loop = () => {
      t += 0.016;
      const target = thinkRef.current ? 1 : 0.18;
      intensity += (target - intensity) * 0.05;
      ctx.clearRect(0, 0, dim, dim);
      const pts = nodes.map((n) => {
        const a = n.a + t * n.s * (0.4 + intensity * 2.2) * 60;
        return { x: C + Math.cos(a) * n.r, y: C + Math.sin(a) * n.r, n };
      });
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
          if (d < maxD) {
            const o = (1 - d / maxD) * 0.55 * intensity;
            ctx.strokeStyle = `rgba(125,211,252,${o.toFixed(3)})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
            if (intensity > 0.5 && (i + j) % 4 === 0) {
              const p = (t * 0.6 + (i * 7 + j) * 0.13) % 1;
              ctx.fillStyle = `rgba(232,121,249,${(0.9 * intensity).toFixed(2)})`;
              ctx.beginPath();
              ctx.arc(pts[i].x + (pts[j].x - pts[i].x) * p, pts[i].y + (pts[j].y - pts[i].y) * p, 1.3, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
      pts.forEach(({ x, y, n }) => {
        const tw = 0.5 + 0.5 * Math.sin(t * (2 + intensity * 4) + n.ph);
        const o = (0.25 + tw * 0.75) * Math.min(1, intensity + 0.25);
        ctx.fillStyle = `rgba(${n.hue},${o.toFixed(2)})`;
        ctx.shadowColor = `rgba(${n.hue},0.9)`;
        ctx.shadowBlur = intensity > 0.5 ? 6 : 2;
        ctx.beginPath();
        ctx.arc(x, y, n.sz * (0.8 + tw * 0.5 * intensity), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });
      if (intensity > 0.3) {
        headNodes.forEach((h, i) => {
          const tw = 0.5 + 0.5 * Math.sin(t * 5 + h.ph);
          ctx.fillStyle = `rgba(147,197,253,${(tw * intensity * 0.9).toFixed(2)})`;
          ctx.shadowColor = "rgba(96,165,250,0.9)";
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(h.x, h.y, 1.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          const nx = headNodes[(i + 1) % headNodes.length];
          ctx.strokeStyle = `rgba(147,197,253,${(0.3 * intensity).toFixed(2)})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(h.x, h.y);
          ctx.lineTo(nx.x, nx.y);
          ctx.stroke();
        });
      }
      if (thinkRef.current && t - lastRing > 0.9) {
        rings.push({ r: r0 + 4, o: 0.5 });
        lastRing = t;
      }
      rings = rings.filter((rg) => rg.o > 0.02 && rg.r < dim / 2);
      rings.forEach((rg) => {
        rg.r += 0.7;
        rg.o *= 0.965;
        ctx.strokeStyle = `rgba(56,189,248,${rg.o.toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(C, C, rg.r, 0, Math.PI * 2);
        ctx.stroke();
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [dim, size]);

  return (
    <div className={`relative ${className}`} style={{ width: dim, height: dim }} data-testid="mira-neural-avatar">
      <div
        className={`absolute z-0 rounded-full transition-all duration-700 ${thinking ? "bg-sky-500/25 blur-2xl" : "bg-fuchsia-500/10 blur-xl"}`}
        style={{ inset: dim * 0.18 }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none" style={{ width: dim, height: dim }} />
      <div className={`absolute rounded-full overflow-hidden border-2 transition-all duration-700 ${thinking ? "border-sky-300/80 shadow-[0_0_55px_rgba(56,189,248,0.5)]" : "border-fuchsia-400/60 shadow-[0_0_45px_rgba(217,70,239,0.35)]"}`}
        style={{ width: size, height: size, left: (dim - size) / 2, top: (dim - size) / 2, zIndex: 10 }}>
        <img src="/mira-neural.png" alt="Mira" className="w-full h-full object-cover"
          style={{ transform: "scale(1.22) translateY(2%)" }} />
      </div>
      <div className="absolute z-20 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#0b1020]/95 border border-fuchsia-400/60 shadow-[0_0_20px_rgba(217,70,239,0.45)] backdrop-blur-sm"
        style={{ left: "50%", transform: "translateX(-50%)", top: (dim + size) / 2 - 14 }}
        data-testid="mira-name-badge">
        <img src="/icon-192.png" alt="Miracurl" className="w-4 h-4 rounded-full object-cover" />
        <span className="text-[10px] font-bold tracking-[0.25em] text-white whitespace-nowrap">MIRA <span className="text-fuchsia-300">AI</span></span>
      </div>
      <span
        className={`absolute z-20 w-4 h-4 rounded-full border-2 border-[#0b1020] ${thinking ? "bg-sky-400 animate-pulse" : "bg-emerald-400"}`}
        style={{ right: (dim - size) / 2 + 2, bottom: (dim - size) / 2 + 2 }}
        title={thinking ? "Mira is thinking" : "Mira is online"}
      />
    </div>
  );
};
