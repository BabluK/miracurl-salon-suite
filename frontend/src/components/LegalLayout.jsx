import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export const LegalNav = () => (
  <div className="sticky top-4 z-50 px-4">
    <nav className="max-w-6xl mx-auto flex items-center justify-between gap-4 rounded-full bg-[#fdfaf3]/95 backdrop-blur border border-[#eadfc8] shadow-[0_10px_35px_-12px_rgba(160,120,50,0.25)] pl-4 pr-3 py-2.5" data-testid="legal-nav">
      <Link to="/" className="flex items-center gap-2.5 shrink-0" data-testid="legal-nav-logo">
        <img src="/brand/miracurl-gold.png" alt="Miracurl" className="h-10 w-auto object-contain" />
      </Link>
      <div className="hidden md:flex items-center gap-8 text-[12px] font-semibold tracking-[0.22em] text-[#3d3728]">
        <Link to="/" className="hover:text-[#b08d3f] transition-colors">HOME</Link>
        <a href="/#features" className="hover:text-[#b08d3f] transition-colors">FEATURES</a>
        <a href="/#pricing" className="hover:text-[#b08d3f] transition-colors">PRICING</a>
        <Link to="/demo" className="hover:text-[#b08d3f] transition-colors">DEMO</Link>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <Link to="/login" className="hidden sm:inline-flex items-center gap-2 text-[12px] font-bold tracking-[0.18em] text-[#a0782e] border border-[#d9c08a] rounded-full px-5 py-2.5 hover:bg-[#f7efdd] transition-colors">
          <span className="w-1.5 h-1.5 rounded-full bg-[#c9a35c]" /> SALON SUITE
        </Link>
        <Link to="/signup-salon" data-testid="legal-nav-cta"
              className="inline-flex items-center gap-2 text-[12px] font-bold tracking-[0.18em] text-white rounded-full px-6 py-3 bg-gradient-to-r from-[#c9a35c] to-[#a67c2e] hover:from-[#b8924a] hover:to-[#95691f] shadow-[0_8px_22px_-6px_rgba(166,124,46,0.55)] transition-all hover:-translate-y-0.5">
          BOOK NOW <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </nav>
  </div>
);

export const LegalHero = ({ label, title, subtitle }) => (
  <header className="max-w-3xl mx-auto px-6 pt-16 pb-12 text-center">
    <div className="text-[11px] font-bold tracking-[0.4em] text-[#b08d3f]">{label}</div>
    <h1 className="font-playfair text-4xl sm:text-5xl lg:text-6xl text-[#2b2618] mt-4 leading-tight">{title}</h1>
    <div className="flex items-center justify-center gap-3 mt-6" aria-hidden="true">
      <span className="h-px w-16 bg-gradient-to-r from-transparent to-[#c9a35c]" />
      <span className="text-[#c9a35c]">✦</span>
      <span className="h-px w-16 bg-gradient-to-l from-transparent to-[#c9a35c]" />
    </div>
    <p className="text-sm text-[#8a7d5e] mt-5">{subtitle}</p>
  </header>
);

export const LegalSection = ({ n, title, children }) => (
  <section className="bg-white/80 border border-[#eee3cc] rounded-2xl px-7 py-7 mb-5 shadow-[0_6px_24px_-14px_rgba(160,120,50,0.25)]">
    <div className="flex items-start gap-4">
      <span className="shrink-0 w-9 h-9 rounded-full border border-[#d9c08a] text-[#a0782e] font-playfair text-sm flex items-center justify-center bg-[#fbf6ea]">{n}</span>
      <div className="min-w-0">
        <h2 className="text-base md:text-lg font-semibold text-[#2b2618] pt-1.5 mb-3 tracking-wide">{title}</h2>
        <div className="text-sm text-[#5c5340] leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:text-[#3d3728] [&_a]:text-[#a0782e] [&_a]:underline">
          {children}
        </div>
      </div>
    </div>
  </section>
);

export const LegalFooter = ({ crossLabel, crossTo }) => (
  <footer className="max-w-3xl mx-auto px-6 mt-12 pb-14">
    <div className="border-t border-[#eadfc8] pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#8a7d5e]">
      <span className="flex items-center gap-2">
        <span className="text-[#c9a35c]">✦</span> © Miracurl Salon Suite · Bangalore, India
      </span>
      <div className="flex gap-6 font-semibold tracking-[0.14em]">
        <Link to={crossTo} className="hover:text-[#a0782e] transition-colors">{crossLabel}</Link>
        <Link to="/" className="hover:text-[#a0782e] transition-colors">HOME</Link>
      </div>
    </div>
  </footer>
);

export default function LegalLayout({ label, title, subtitle, crossLabel, crossTo, children, testId }) {
  return (
    <div className="min-h-screen bg-[#faf6ec] pt-4" data-testid={testId}
         style={{ backgroundImage: "radial-gradient(circle at 15% 0%, rgba(201,163,92,0.10), transparent 45%), radial-gradient(circle at 90% 100%, rgba(201,163,92,0.08), transparent 40%)" }}>
      <LegalNav />
      <LegalHero label={label} title={title} subtitle={subtitle} />
      <main className="max-w-3xl mx-auto px-6">{children}</main>
      <LegalFooter crossLabel={crossLabel} crossTo={crossTo} />
    </div>
  );
}
