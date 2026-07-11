const SPARKS = [
  { top: "8%", left: "12%", delay: "0s", size: 8 }, { top: "22%", left: "78%", delay: "0.7s", size: 10 },
  { top: "60%", left: "6%", delay: "1.4s", size: 7 }, { top: "75%", left: "88%", delay: "2.1s", size: 9 },
  { top: "38%", left: "45%", delay: "0.4s", size: 6 }, { top: "14%", left: "55%", delay: "1.8s", size: 8 },
  { top: "85%", left: "30%", delay: "1s", size: 7 }, { top: "50%", left: "92%", delay: "2.5s", size: 6 },
  { top: "68%", left: "60%", delay: "0.2s", size: 9 }, { top: "30%", left: "25%", delay: "2.8s", size: 7 },
];

export function Super3DBackdrop() {
  return (
    <div className="super-3d-scene fixed inset-0 z-0 overflow-hidden" aria-hidden="true" data-testid="super-3d-backdrop">
      <div className="orb3d w-72 h-72 bg-indigo-400/60" style={{ top: "-4rem", left: "-3rem" }} />
      <div className="orb3d w-96 h-96 bg-violet-400/50" style={{ bottom: "-6rem", right: "-4rem", animationDelay: "-5s" }} />
      <div className="orb3d w-64 h-64 bg-amber-300/40" style={{ top: "30%", right: "18%", animationDelay: "-9s" }} />
      <div className="ring3d w-[480px] h-[480px]" style={{ top: "-140px", right: "-120px" }} />
      <div className="ring3d w-72 h-72" style={{ bottom: "-60px", left: "10%", animationDelay: "-11s", borderColor: "rgba(139, 92, 246, 0.25)" }} />
      {SPARKS.map((s, i) => (
        <span key={i} className="sparkle-dot" style={{ top: s.top, left: s.left, width: s.size, height: s.size, animationDelay: s.delay }} />
      ))}
    </div>
  );
}
