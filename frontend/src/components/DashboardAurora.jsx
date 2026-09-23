// Light sparkling canvas layers for the Dashboard page: soft aurora washes, glint mesh, twinkling dots + stars.
const SPARKLES = Array.from({ length: 26 }, (_, i) => {
  const seed = (i * 9301 + 49297) % 233280;
  const rnd = (n) => ((seed * (n + 1)) % 997) / 997;
  return {
    id: i,
    left: `${Math.round(rnd(1) * 96 + 2)}%`,
    top: `${Math.round(rnd(2) * 92 + 4)}%`,
    size: 3 + Math.round(rnd(3) * 4),
    delay: `${(rnd(4) * 6).toFixed(2)}s`,
    duration: `${(3.2 + rnd(5) * 4).toFixed(2)}s`,
    kind: i % 3 === 0 ? "dash-sparkle-tint" : "dash-sparkle-gold",
  };
});
const STARS = Array.from({ length: 9 }, (_, i) => ({
  id: i,
  left: `${(i * 11 + 7) % 94}%`,
  top: `${(i * 29 + 11) % 88}%`,
  delay: `${(i * 0.7).toFixed(1)}s`,
  size: 10 + (i % 3) * 4,
}));

const StarIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0c.6 6.6 4.8 11.4 12 12-7.2.6-11.4 5.4-12 12-.6-6.6-4.8-11.4-12-12 7.2-.6 11.4-5.4 12-12z" /></svg>
);

export const DashboardAurora = () => (
  <div className="dash-aurora absolute inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true" data-testid="dashboard-aurora-bg">
    <div className="dash-aurora-ribbon dash-aurora-gold" />
    <div className="dash-aurora-ribbon dash-aurora-rose" style={{ background: "radial-gradient(circle at 55% 45%, var(--tenant-sparkle-tint), transparent 65%)", opacity: 0.9 }} />
    <div className="dash-aurora-ribbon dash-aurora-sky" />
    <div className="dash-glint-layer" />
    {SPARKLES.map((s) => (
      <span key={s.id} className={`dash-sparkle ${s.kind}`}
        style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay, animationDuration: s.duration }} />
    ))}
    {STARS.map((s) => (
      <span key={`st${s.id}`} className="dash-star" style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay }}><StarIcon /></span>
    ))}
  </div>
);
