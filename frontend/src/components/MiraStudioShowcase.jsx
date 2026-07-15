import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Wand2, Zap, Code2, ArrowRight, CheckCircle2, Loader2, Globe } from "lucide-react";

const GRADIENT = "linear-gradient(135deg, #D81B60 0%, #FF4081 45%, #D4AF37 100%)";
const DEMO_PROMPT = 'Build me a salon website';
const STEPS = ["Planner", "Design", "Code", "Test", "Deploy"];

export const MiraStudioShowcase = () => {
  const [typed, setTyped] = useState("");
  const [step, setStep] = useState(-1);
  const [phase, setPhase] = useState("typing");
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (phase === "typing") {
      if (typed.length < DEMO_PROMPT.length) {
        timer.current = setTimeout(() => setTyped(DEMO_PROMPT.slice(0, typed.length + 1)), 65);
      } else {
        timer.current = setTimeout(() => { setPhase("building"); setStep(0); }, 700);
      }
    } else if (phase === "building") {
      if (step < STEPS.length - 1) {
        timer.current = setTimeout(() => setStep(s => s + 1), 800);
      } else {
        timer.current = setTimeout(() => setPhase("live"), 800);
      }
    } else if (phase === "live") {
      timer.current = setTimeout(() => { setTyped(""); setStep(-1); setPhase("typing"); }, 5000);
    }
    return () => clearTimeout(timer.current);
  }, [phase, typed, step]);

  return (
    <section className="relative z-10 max-w-7xl mx-auto px-6 sm:px-10 pb-24" data-testid="mira-studio-showcase">
      <div className="rounded-[2rem] border border-amber-300/20 relative overflow-hidden p-8 md:p-14 grid lg:grid-cols-2 gap-10 lg:gap-14 items-center"
        style={{ background: "radial-gradient(ellipse 70% 120% at 15% 0%, rgba(212,175,55,0.10) 0%, rgba(216,27,96,0.05) 45%, #131013 75%)" }}>

        {/* Copy */}
        <div>
          <span className="inline-flex items-center gap-1.5 text-amber-300 text-[11px] uppercase tracking-[0.25em] font-semibold">
            <Sparkles className="w-3.5 h-3.5" /> Built with AI · New
          </span>
          <h2 className="font-playfair text-4xl sm:text-5xl mt-4 leading-tight">
            Need a website too?<br />
            <span style={{ background: "linear-gradient(100deg,#F3E5AB 0%,#D4AF37 40%,#FF4081 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Mira builds it from one sentence.
            </span>
          </h2>
          <p className="text-neutral-400 mt-5 leading-relaxed max-w-md">
            Mira AI Studio turns a prompt into a complete, live website in about a minute —
            for your salon, a friend's clinic, anyone. Refine it by chatting, download the full code, host anywhere.
          </p>
          <div className="flex flex-wrap gap-2 mt-6">
            {[[Zap, "Live in ~60 seconds"], [Sparkles, "50 free credits"], [Code2, "Full code ownership"]].map(([I, t]) => (
              <span key={t} className="inline-flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-full px-3 py-1.5 text-xs text-white/80">
                <I className="w-3.5 h-3.5 text-amber-300" /> {t}
              </span>
            ))}
          </div>
          <Link to="/mira.ai" data-testid="showcase-try-studio-btn"
            className="inline-flex items-center gap-2 mt-8 px-7 py-3 rounded-full text-white font-semibold text-sm hover:opacity-90 hover:shadow-[0_0_28px_rgba(255,64,129,0.4)] transition-[opacity,box-shadow]"
            style={{ background: GRADIENT }}>
            Try Mira AI Studio — free ✦ <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Animated demo */}
        <div className="relative" data-testid="showcase-demo">
          <div className="rounded-2xl border border-white/10 bg-[#0D0A0C]/90 backdrop-blur-xl p-5 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
            {/* Prompt line */}
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-3">
              <Wand2 className="w-4 h-4 text-[#FF4081] shrink-0" />
              <span className="text-sm text-white/85 font-mono min-h-[20px]">
                {typed}<span className="inline-block w-[7px] h-[15px] bg-amber-300 ml-0.5 align-middle animate-pulse" />
              </span>
            </div>
            {/* Pipeline */}
            <div className="flex items-center gap-1.5 mt-4 flex-wrap">
              {STEPS.map((s, i) => (
                <span key={s} className={`flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full border transition-colors duration-300 ${
                  phase === "live" || step > i ? "border-emerald-400/40 text-emerald-300 bg-emerald-500/10"
                    : step === i ? "border-amber-300/60 text-amber-200 bg-amber-300/10"
                      : "border-white/10 text-white/30"}`}>
                  {phase === "live" || step > i ? <CheckCircle2 className="w-3 h-3" />
                    : step === i ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <span className="w-3 h-3 rounded-full border border-white/20" />}
                  {s}
                </span>
              ))}
            </div>
            {/* Mock website result */}
            <div className={`mt-4 rounded-xl overflow-hidden border transition-opacity duration-700 ${phase === "live" ? "opacity-100 border-emerald-400/30" : "opacity-25 border-white/10"}`}>
              <div className="h-7 bg-[#1a1618] flex items-center gap-1.5 px-3">
                <span className="w-2 h-2 rounded-full bg-[#FF4081]/70" /><span className="w-2 h-2 rounded-full bg-[#D4AF37]/70" /><span className="w-2 h-2 rounded-full bg-emerald-400/70" />
                <span className="ml-2 text-[9px] text-white/40 font-mono flex items-center gap-1"><Globe className="w-2.5 h-2.5" /> your-salon.live ✦</span>
              </div>
              <div className="bg-[#171317] p-4">
                <div className="h-14 rounded-lg" style={{ background: "linear-gradient(120deg,#2a1f2b,#3d2438 60%,#41321c)" }} />
                <div className="mt-2 h-2.5 w-2/3 rounded bg-white/15" />
                <div className="mt-1.5 h-2 w-1/2 rounded bg-white/8" />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="h-9 rounded-md bg-white/[0.06]" /><div className="h-9 rounded-md bg-white/[0.06]" /><div className="h-9 rounded-md bg-white/[0.06]" />
                </div>
                <div className="mt-3 h-6 w-24 rounded-full" style={{ background: GRADIENT, opacity: phase === "live" ? 1 : 0.4 }} />
              </div>
            </div>
            {phase === "live" && (
              <div className="mt-3 text-center text-[11px] text-emerald-300 flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Live at a real URL — in under a minute
              </div>
            )}
          </div>
          <div className="absolute -inset-4 -z-10 rounded-[2rem] opacity-25 blur-2xl" style={{ background: GRADIENT }} />
        </div>
      </div>
    </section>
  );
};
