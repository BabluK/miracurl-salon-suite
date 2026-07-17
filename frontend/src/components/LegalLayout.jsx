import { Link } from "react-router-dom";
import { ArrowRight, Scissors } from "lucide-react";
import BrandMark from "@/components/BrandMark";

export const LegalNav = () => (
  <header className="sticky top-0 z-40 backdrop-blur-xl bg-black/60 border-b border-white/10">
    <div className="max-w-7xl mx-auto px-6 sm:px-10 py-4 flex items-center justify-between">
      <Link to="/" data-testid="legal-nav-logo"><BrandMark variant="dark" size="md" /></Link>
      <div className="flex items-center gap-3 sm:gap-7 text-sm">
        <a href="/#features" className="hidden sm:block text-white/70 hover:text-white transition-colors">Features</a>
        <a href="/#pricing" className="hidden sm:block text-white/70 hover:text-white transition-colors">Pricing</a>
        <Link to="/demo" className="hidden sm:block text-white/70 hover:text-white transition-colors">Demo</Link>
        <Link to="/login" className="hidden sm:block text-white/70 hover:text-white font-medium transition-colors">Sign in</Link>
        <Link to="/signup-salon" data-testid="legal-nav-cta"
              className="px-4 py-2 rounded-full bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white text-xs sm:text-sm font-semibold hover:-translate-y-0.5 shadow-[0_8px_24px_-6px_rgba(217,70,239,0.6)] transition-transform">
          Start free trial
        </Link>
      </div>
    </div>
  </header>
);

export const LegalHero = ({ label, title, subtitle }) => (
  <section className="relative overflow-hidden">
    <div className="absolute inset-0" aria-hidden="true"
         style={{ background: "radial-gradient(ellipse 70% 60% at 50% -10%, rgba(217,70,239,0.14), transparent 60%), radial-gradient(ellipse 50% 40% at 80% 0%, rgba(251,191,36,0.10), transparent 55%)" }} />
    <div className="relative z-10 max-w-4xl mx-auto px-6 sm:px-10 pt-20 sm:pt-28 pb-14 text-center">
      <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/5 border border-white/15 backdrop-blur text-amber-300 text-[11px] uppercase tracking-[0.25em] font-semibold">
        {label}
      </span>
      <h1 className="font-playfair text-4xl sm:text-5xl lg:text-6xl tracking-tight mt-7 leading-[1.08]">
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-300 to-fuchsia-400">{title} ✦</span>
      </h1>
      <p className="text-neutral-400 text-base md:text-lg mt-6 max-w-2xl mx-auto font-light">{subtitle}</p>
    </div>
  </section>
);

export const LegalSection = ({ n, title, children }) => (
  <section className="bg-white/[0.04] border border-white/10 rounded-2xl px-7 py-7 mb-5 backdrop-blur hover:border-white/20 transition-colors">
    <div className="flex items-start gap-4">
      <span className="shrink-0 w-9 h-9 rounded-full border border-amber-300/40 bg-amber-300/10 text-amber-300 font-playfair text-sm flex items-center justify-center">{n}</span>
      <div className="min-w-0">
        <h2 className="text-base md:text-lg font-semibold text-white pt-1.5 mb-3 tracking-wide">{title}</h2>
        <div className="text-sm text-neutral-400 leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:text-neutral-200 [&_a]:text-fuchsia-400 [&_a]:underline [&_a:hover]:text-fuchsia-300">
          {children}
        </div>
      </div>
    </div>
  </section>
);

export const LegalFooter = ({ crossLabel, crossTo }) => (
  <footer className="relative z-10 border-t border-white/10 mt-16">
    <div className="max-w-4xl mx-auto px-6 sm:px-10 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
      <div className="flex items-center gap-2">
        <Scissors className="w-3.5 h-3.5 text-fuchsia-400" /> © Miracurl Salon Suite · Marathahalli, Bangalore
      </div>
      <div className="flex items-center gap-5">
        <Link to={crossTo} className="hover:text-white transition-colors">{crossLabel}</Link>
        <Link to="/" className="hover:text-white transition-colors">Home</Link>
        <Link to="/signup-salon" className="text-amber-300/70 hover:text-amber-300 transition-colors inline-flex items-center gap-1">
          Free trial <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  </footer>
);

export default function LegalLayout({ label, title, subtitle, crossLabel, crossTo, children, testId }) {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-outfit" data-testid={testId}>
      <LegalNav />
      <LegalHero label={label} title={title} subtitle={subtitle} />
      <main className="relative z-10 max-w-4xl mx-auto px-6 sm:px-10">{children}</main>
      <LegalFooter crossLabel={crossLabel} crossTo={crossTo} />
    </div>
  );
}
