import { useEffect, useRef, useState } from "react";
import { Rocket, Scissors, Globe, Mic, Receipt, Wand2, BarChart3 } from "lucide-react";

const STEPS = [
  { n: 1, icon: Rocket, title: "CREATE YOUR SALON", desc: "2-minute signup, free trial included", tag: "No card needed",
    c: "#22d3ee", glow: "rgba(34,211,238,0.35)" },
  { n: 2, icon: Scissors, title: "ADD SERVICES & STAFF", desc: "Your price list, stylists & ID cards", tag: "Import from Excel",
    c: "#a78bfa", glow: "rgba(167,139,250,0.35)" },
  { n: 3, icon: Globe, title: "GO LIVE ONLINE", desc: "Own booking page + Google-ready salon page", tag: "miracurl-suite.com/salon/you",
    c: "#e879f9", glow: "rgba(232,121,249,0.35)" },
  { n: 4, icon: Mic, title: "MIRA BOOKS FOR YOU", desc: "AI receptionist takes bookings 24/7", tag: "Voice + chat",
    c: "#fbbf24", glow: "rgba(251,191,36,0.35)" },
  { n: 5, icon: Receipt, title: "BILL AT THE COUNTER", desc: "Smart POS, GST invoices, e-receipts", tag: "Zero training",
    c: "#fb7185", glow: "rgba(251,113,133,0.35)" },
  { n: 6, icon: Wand2, title: "MARKETING ON AUTO-PILOT", desc: "Daily posts, win-back emails, flash offers", tag: "Mira AI Studio",
    c: "#34d399", glow: "rgba(52,211,153,0.35)" },
  { n: 7, icon: BarChart3, title: "WATCH REVENUE GROW", desc: "Live reports, leaderboards & weekly digests", tag: "Every Monday, in your inbox",
    c: "#d4af37", glow: "rgba(212,175,55,0.4)" },
];

function FlowCard({ s, i, visible }) {
  const I = s.icon;
  return (
    <div className="relative flex items-stretch gap-0" data-testid={`flow-step-${s.n}`}>
      {/* center spine dot */}
      <span className="flow-spine-dot" style={{ background: s.c, boxShadow: `0 0 12px 3px ${s.glow}` }} />
      <div
        className={`flow-card group w-full rounded-2xl px-5 py-4 sm:px-7 sm:py-5 flex items-center gap-4 sm:gap-5 ${visible ? "flow-in" : "opacity-0"}`}
        style={{ border: `1px solid ${s.c}55`, boxShadow: `0 0 24px ${s.glow}, inset 0 0 24px rgba(255,255,255,0.02)`, animationDelay: `${i * 0.12}s` }}
      >
        <span className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm font-bold"
          style={{ color: s.c, border: `1.5px solid ${s.c}`, boxShadow: `0 0 14px ${s.glow}`, background: "#0d0d13" }}>
          {s.n}
        </span>
        <span className="shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6"
          style={{ background: `${s.c}14`, border: `1px solid ${s.c}33` }}>
          <I className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: s.c }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold tracking-[0.14em] text-sm sm:text-base" style={{ color: s.c, textShadow: `0 0 18px ${s.glow}` }}>{s.title}</span>
          <span className="block text-white/75 text-xs sm:text-sm mt-0.5">{s.desc}</span>
          <span className="block text-[10px] mt-1 uppercase tracking-widest text-white/35">{s.tag}</span>
        </span>
        <span className="shrink-0 w-2 h-2 rounded-full animate-pulse" style={{ background: s.c, boxShadow: `0 0 10px 2px ${s.glow}` }} />
      </div>
    </div>
  );
}

export function SoftwareFlowSection() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.12 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <section ref={ref} className="relative z-10 max-w-3xl mx-auto px-6 sm:px-10 pb-24" data-testid="software-flow-section">
      <div className="text-center mb-12">
        <div className="text-[11px] tracking-[0.4em] uppercase text-white/40">Fully Automated · Zero Manual Work</div>
        <h2 className="font-playfair text-3xl sm:text-4xl mt-3">Your salon, on <span className="text-gold">rails</span></h2>
        <p className="text-white/50 text-sm mt-3">Seven steps from signup to a salon that runs itself.</p>
      </div>
      <div className="relative flow-timeline">
        <span className="flow-spine" aria-hidden="true" />
        <div className="space-y-6 sm:space-y-8">
          {STEPS.map((s, i) => <FlowCard key={s.n} s={s} i={i} visible={visible} />)}
        </div>
      </div>
    </section>
  );
}
