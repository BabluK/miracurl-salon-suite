import { useEffect, useState, useCallback } from "react";

const SLIDES = [
  { src: "/demo/resto_order.jpeg", label: "QR Table Ordering — diners scan, browse & order from their phone", tag: "QR Ordering" },
  { src: "/demo/resto_kitchen.jpeg", label: "Live Kitchen — order tickets, live tables & waiter calls", tag: "Kitchen" },
  { src: "/demo/resto_dashboard.jpeg", label: "Owner dashboard — revenue, orders & Mira's briefing", tag: "Dashboard" },
  { src: "/demo/resto_menu.jpeg", label: "Menu manager — AI dish photos, veg/spice tags & sold-out control", tag: "Menu" },
  { src: "/demo/resto_booking.jpeg", label: "Online table reservations — party size, seating & dish pre-picks", tag: "Reservations" },
];

export const RestoDemoCarousel = () => {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = useCallback(() => setIdx(i => (i + 1) % SLIDES.length), []);
  useEffect(() => {
    if (paused) return undefined;
    const t = setInterval(next, 3800);
    return () => clearInterval(t);
  }, [paused, next]);

  return (
    <section className="relative z-10 max-w-5xl mx-auto px-6 sm:px-10 py-16" data-testid="resto-demo-carousel-section">
      <div className="text-center mb-10">
        <span className="text-xs uppercase tracking-[0.25em] text-amber-600 font-semibold">See it in action</span>
        <h2 className="font-playfair text-3xl sm:text-5xl text-slate-900 mt-3">A quick peek inside</h2>
      </div>
      <div
        className="relative rounded-2xl border border-amber-100 shadow-2xl overflow-hidden bg-slate-900"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        data-testid="resto-demo-carousel"
      >
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 border-b border-slate-700">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 flex-1 max-w-xs bg-slate-700 rounded-md px-3 py-1 text-[10px] text-slate-300 truncate">miracurl restaurant suite</span>
          <span className="text-[10px] uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded-full" data-testid="resto-demo-slide-tag">{SLIDES[idx].tag}</span>
        </div>
        <div className="relative aspect-[16/10]">
          {SLIDES.map((s, i) => (
            <img
              key={s.src}
              src={s.src}
              alt={s.label}
              loading={i === 0 ? "eager" : "lazy"}
              className={`absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-700 ${i === idx ? "opacity-100" : "opacity-0"}`}
            />
          ))}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-5 py-4">
            <p className="text-white text-sm font-medium" data-testid="resto-demo-slide-label">{SLIDES[idx].label}</p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center gap-2 mt-5">
        {SLIDES.map((s, i) => (
          <button
            key={s.src}
            data-testid={`resto-demo-dot-${i}`}
            aria-label={`Slide ${i + 1}`}
            onClick={() => setIdx(i)}
            className={`h-2 rounded-full transition-all duration-300 ${i === idx ? "w-7 bg-amber-500" : "w-2 bg-slate-300 hover:bg-slate-400"}`}
          />
        ))}
      </div>
    </section>
  );
};
