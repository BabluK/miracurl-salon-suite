import { useEffect, useState, useCallback } from "react";

const SLIDES = [
  { src: "/demo/mira.jpeg", label: "Mira AI books clients on your public page", tag: "AI Booking" },
  { src: "/demo/dashboard.jpeg", label: "Owner dashboard — revenue, bookings & AI Brand Studio", tag: "Dashboard" },
  { src: "/demo/pos.jpeg", label: "POS & Billing — invoices in seconds", tag: "POS" },
  { src: "/demo/appointments.jpeg", label: "Appointments with WhatsApp confirmations", tag: "Appointments" },
];

export const DemoCarousel = () => {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = useCallback(() => setIdx(i => (i + 1) % SLIDES.length), []);
  useEffect(() => {
    if (paused) return undefined;
    const t = setInterval(next, 3800);
    return () => clearInterval(t);
  }, [paused, next]);

  return (
    <section className="relative z-10 max-w-5xl mx-auto px-6 sm:px-10 py-16" data-testid="demo-carousel-section">
      <div className="text-center mb-10">
        <span className="text-xs uppercase tracking-[0.25em] text-fuchsia-600 font-semibold">See it in action</span>
        <h2 className="font-playfair text-3xl sm:text-5xl text-slate-900 mt-3">A quick peek inside</h2>
      </div>
      <div
        className="relative rounded-2xl border border-slate-200 shadow-2xl overflow-hidden bg-slate-900"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        data-testid="demo-carousel"
      >
        {/* browser chrome bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 border-b border-slate-700">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 flex-1 max-w-xs bg-slate-700 rounded-md px-3 py-1 text-[10px] text-slate-300 truncate">miracurl salon suite</span>
          <span className="text-[10px] uppercase tracking-wider bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-400/30 px-2 py-0.5 rounded-full" data-testid="demo-slide-tag">{SLIDES[idx].tag}</span>
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
            <p className="text-white text-sm font-medium" data-testid="demo-slide-label">{SLIDES[idx].label}</p>
          </div>
        </div>
      </div>
      {/* dots */}
      <div className="flex items-center justify-center gap-2 mt-5">
        {SLIDES.map((s, i) => (
          <button
            key={s.src}
            data-testid={`demo-dot-${i}`}
            aria-label={`Slide ${i + 1}`}
            onClick={() => setIdx(i)}
            className={`h-2 rounded-full transition-all duration-300 ${i === idx ? "w-7 bg-fuchsia-600" : "w-2 bg-slate-300 hover:bg-slate-400"}`}
          />
        ))}
      </div>
    </section>
  );
};
