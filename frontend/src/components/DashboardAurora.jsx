// Animated aurora waves + sparkles background, scoped to the Dashboard page.
const SPARKLES = Array.from({ length: 22 }, (_, i) => {
  const seed = (i * 9301 + 49297) % 233280;
  const rnd = (n) => ((seed * (n + 1)) % 997) / 997;
  return {
    id: i,
    left: `${Math.round(rnd(1) * 96 + 2)}%`,
    top: `${Math.round(rnd(2) * 92 + 4)}%`,
    size: 3 + Math.round(rnd(3) * 4),
    delay: `${(rnd(4) * 6).toFixed(2)}s`,
    duration: `${(3.2 + rnd(5) * 4).toFixed(2)}s`,
    gold: i % 3 !== 0,
  };
});

export const DashboardAurora = () => (
  <div className="dash-aurora absolute inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true" data-testid="dashboard-aurora-bg">
    <div className="dash-aurora-ribbon dash-aurora-gold" />
    <div className="dash-aurora-ribbon dash-aurora-rose" />
    <div className="dash-aurora-ribbon dash-aurora-sky" />
    {SPARKLES.map((s) => (
      <span
        key={s.id}
        className={`dash-sparkle ${s.gold ? "dash-sparkle-gold" : "dash-sparkle-rose"}`}
        style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay, animationDuration: s.duration }}
      />
    ))}
  </div>
);
