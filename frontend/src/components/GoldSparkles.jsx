// Reusable gold sparkle overlay (twinkling dots + bokeh + 4-point stars) for dark chrome/hero surfaces.
const StarIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0c.6 6.6 4.8 11.4 12 12-7.2.6-11.4 5.4-12 12-.6-6.6-4.8-11.4-12-12 7.2-.6 11.4-5.4 12-12z" /></svg>
);
const rnd = (seed, n) => (((seed * 9301 + 49297) % 233280) * (n + 1) % 997) / 997;

export function GoldSparkles({ count = 18, stars = 5, bokeh = 5, seed = 7, className = "" }) {
  const dots = Array.from({ length: count }, (_, i) => ({
    id: i, left: `${Math.round(rnd(seed + i, 1) * 96 + 2)}%`, top: `${Math.round(rnd(seed + i, 2) * 90 + 5)}%`,
    size: 2 + Math.round(rnd(seed + i, 3) * 3), delay: `${(rnd(seed + i, 4) * 6).toFixed(2)}s`, dur: `${(3 + rnd(seed + i, 5) * 4).toFixed(2)}s`,
  }));
  const orbs = Array.from({ length: bokeh }, (_, i) => ({
    id: i, left: `${Math.round(rnd(seed + 40 + i, 1) * 94 + 3)}%`, top: `${Math.round(rnd(seed + 40 + i, 2) * 80 + 10)}%`,
    size: 8 + Math.round(rnd(seed + 40 + i, 3) * 18), delay: `${(rnd(seed + 40 + i, 4) * 5).toFixed(1)}s`,
  }));
  const st = Array.from({ length: stars }, (_, i) => ({
    id: i, left: `${Math.round(rnd(seed + 80 + i, 1) * 94 + 3)}%`, top: `${Math.round(rnd(seed + 80 + i, 2) * 80 + 6)}%`,
    size: 9 + Math.round(rnd(seed + 80 + i, 3) * 9), delay: `${(rnd(seed + 80 + i, 4) * 5).toFixed(1)}s`,
  }));
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`} aria-hidden="true" data-testid="gold-sparkles">
      {orbs.map(o => <span key={`o${o.id}`} className="dash-bokeh" style={{ left: o.left, top: o.top, width: o.size, height: o.size, animationDelay: o.delay }} />)}
      {dots.map(d => <span key={d.id} className="dash-sparkle dash-sparkle-gold" style={{ left: d.left, top: d.top, width: d.size, height: d.size, animationDelay: d.delay, animationDuration: d.dur }} />)}
      {st.map(s => <span key={`s${s.id}`} className="dash-star" style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay }}><StarIcon /></span>)}
    </div>
  );
}
