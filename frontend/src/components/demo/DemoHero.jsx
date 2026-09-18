import { Sparkles, LifeBuoy, Quote } from "lucide-react";

const PURPOSES = {
  demo: {
    title: ["Book Your Free", "Live Demo"],
    blurb: "Experience the complete Miracurl Suite in just 20 minutes. See how Mira AI and our powerful features can simplify and grow your salon business.",
    quote: "Hi! I'm Mira, your AI Salon Assistant. Book a demo and see how I can help your salon grow.",
  },
  onboarding: {
    title: ["Get Assistance", "While Onboarding"],
    blurb: "Already signed up? Pick a slot and our team walks you through setup — services, staff, pricing, WhatsApp and your first bookings — live on a call.",
    quote: "Hi! I'm Mira. Book an onboarding session and we'll set up your salon together, step by step.",
  },
};

export function DemoHero({ purpose, setPurpose }) {
  const p = PURPOSES[purpose];
  return (
    <div className="grid lg:grid-cols-[1.25fr_1fr] gap-8 lg:gap-12 items-center" data-testid="demo-hero">
      <div className="text-left">
        <div className="flex items-center gap-3 mb-1">
          <img src="/assets/ms-logo-gold.png" alt="Miracurl Suite" className="h-14 sm:h-16 w-auto object-contain" data-testid="demo-brand-logo" />
          <div>
            <p className="font-serif text-xl sm:text-2xl tracking-[0.12em] text-[#b8932e] leading-none">MIRACURL SUITE</p>
            <p className="text-[9px] sm:text-[10px] tracking-[0.22em] text-slate-500 mt-1">SMART SALON MANAGEMENT SOFTWARE</p>
          </div>
        </div>
        <p className="text-[11px] uppercase tracking-[0.25em] font-semibold mb-6" data-testid="demo-ai-tagline">
          <span className="brand-ai-tag">✦ AI Powered Salon Suite ✦</span>
        </p>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] text-slate-900" data-testid="demo-headline">
          {p.title[0]}<br />
          <span className="relative inline-block bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 bg-clip-text text-transparent">
            {p.title[1]}
            <span className="absolute left-0 right-8 -bottom-1 h-[3px] rounded-full bg-gradient-to-r from-pink-400 to-amber-400" />
          </span>
        </h1>
        <div className="flex flex-wrap gap-2 mt-6" data-testid="demo-purpose-toggle">
          {[["demo", Sparkles, "Free live demo"], ["onboarding", LifeBuoy, "Onboarding assistance"]].map(([k, Icon, label]) => (
            <button key={k} onClick={() => setPurpose(k)} data-testid={`demo-purpose-${k}`}
              className={`flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-full border transition-colors ${
                purpose === k ? "bg-gradient-to-r from-pink-500 to-amber-500 text-white border-transparent shadow-md"
                  : "bg-white/80 border-pink-200 text-slate-600 hover:border-pink-400"}`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
        <p className="text-base sm:text-lg text-slate-600 leading-relaxed mt-5 max-w-xl" data-testid="demo-blurb">{p.blurb}</p>
      </div>

      <div className="hidden sm:flex flex-col items-center gap-4" data-testid="demo-mira-panel">
        <div className="relative">
          <Sparkles className="absolute -left-10 top-2 w-6 h-6 text-amber-400" />
          <Sparkles className="absolute -right-8 top-16 w-4 h-4 text-amber-400" />
          <Sparkles className="absolute -left-6 bottom-6 w-4 h-4 text-amber-400" />
          <div className="w-44 h-44 lg:w-52 lg:h-52 rounded-full p-1.5 bg-gradient-to-br from-amber-300 via-amber-500 to-pink-400 shadow-[0_20px_50px_-15px_rgba(236,72,153,0.45)]">
            <img src="/assets/mira-ai-logo.png" alt="Mira AI" data-testid="demo-mira-hero" className="w-full h-full rounded-full object-cover bg-white" />
          </div>
          <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[11px] font-bold tracking-[2px] px-5 py-1.5 rounded-full bg-gradient-to-r from-rose-400 via-pink-500 to-amber-500 text-white whitespace-nowrap shadow-lg">MIRA AI</span>
        </div>
        <div className="relative mt-4 bg-white/80 backdrop-blur rounded-2xl px-6 py-4 ring-1 ring-pink-100 shadow-sm max-w-xs" data-testid="demo-mira-quote">
          <Quote className="absolute left-3 top-2 w-4 h-4 text-pink-300 rotate-180" />
          <p className="text-sm text-slate-600 leading-relaxed pl-4">{p.quote}</p>
          <Quote className="absolute right-3 bottom-2 w-4 h-4 text-pink-300" />
        </div>
      </div>
    </div>
  );
}
