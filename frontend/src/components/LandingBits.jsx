import { Facebook, Instagram, Linkedin, MessageCircle, Youtube } from "lucide-react";

const NAV = [
  { label: "Features", href: "/features" }, { label: "Industries", href: "/who-can-use" }, { label: "Pricing", href: "/pricing" },
  { label: "Success Stories", href: "/success-stories" }, { label: "Support", href: "/contact-us" },
];
export const FB_URL = "https://www.facebook.com/profile.php?id=61593610030812";
export const IG_URL = "https://www.instagram.com/miracurl.ai/";
export const WA_DEMO_URL = "https://wa.me/919180261256?text=" + encodeURIComponent("Hi Miracurl! I'd like a demo of Miracurl Suite for my business.");

export function SparkleLogo({ className = "w-12 h-12", testid = "brand-logo-sparkle" }) {
  return (
    <span className="ms-logo-sparkle" data-testid={testid}>
      <img src="/assets/brand/ms-logo-dark.png" alt="Miracurl" className={`${className} rounded-full shadow-md ring-2 ring-[#d4af37]/60`} />
      <span className="ms-star s1" /><span className="ms-star s2" /><span className="ms-star s3" />
    </span>
  );
}

export function LandingNav() {
  return (
    <header className="relative z-20 max-w-[1640px] mx-auto flex items-center justify-end gap-3 lg:gap-6 px-4 sm:px-8 md:pl-24 lg:pl-8 pt-4 sm:pr-36 xl:pr-40" data-testid="landing-nav">
      <div className="flex-1" />
      <nav className="hidden md:flex items-center gap-4 lg:gap-7 text-xs lg:text-sm whitespace-nowrap font-semibold text-slate-700">
        {NAV.map(n => <a key={n.href} href={n.href} className="hover:text-[#b58a2c] transition-colors" data-testid={`landing-nav-${n.label.toLowerCase().replace(/ /g, "-")}`}>{n.label}</a>)}
      </nav>
      <div className="flex items-center gap-2">
        <a href={WA_DEMO_URL} target="_blank" rel="noreferrer" className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-600 text-white text-sm font-semibold shadow hover:bg-emerald-700 transition-colors" data-testid="landing-whatsapp-demo"><MessageCircle className="w-4 h-4" /> WhatsApp us</a>
        <a href="/signup-salon" className="inline-flex items-center px-4 py-2 rounded-full bg-[#14100a] text-[#e8c56a] text-sm font-semibold shadow hover:bg-black transition-colors" data-testid="landing-get-started">Get Started</a>
      </div>
    </header>
  );
}

export function LandingFooter() {
  return (
    <footer className="relative z-10 max-w-[1640px] mx-auto px-4 sm:px-8 pb-4" data-testid="landing-footer">
      <div className="rounded-2xl bg-white/80 backdrop-blur border border-white shadow-lg shadow-slate-200/60 px-6 py-3 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <SparkleLogo />
          <div className="leading-tight"><div className="font-playfair text-base tracking-wide text-slate-900">MIRACURL SUITE</div><div className="text-[9px] uppercase tracking-[0.22em] text-slate-600 font-semibold">AI-Powered Business Management Platform</div></div>
        </div>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-semibold text-slate-600">
          <a href="/about-us" className="hover:text-[#b58a2c]">About Us</a><a href="/features" className="hover:text-[#b58a2c]">Features</a><a href="/pricing" className="hover:text-[#b58a2c]">Pricing</a>
          <a href="/success-stories" className="hover:text-[#b58a2c]">Success Stories</a><a href="/contact-us" className="hover:text-[#b58a2c]">Contact Us</a>
        </nav>
        <div className="flex items-center gap-4 text-slate-800">
          <a href={IG_URL} target="_blank" rel="noreferrer" aria-label="Instagram" className="hover:text-[#b58a2c] transition-colors" data-testid="landing-instagram"><Instagram className="w-5 h-5" /></a>
          <a href="https://www.linkedin.com/company/miracurl" target="_blank" rel="noreferrer" aria-label="LinkedIn" className="hover:text-[#b58a2c] transition-colors" data-testid="landing-linkedin"><Linkedin className="w-5 h-5" /></a>
          <a href="https://www.youtube.com/@miracurl" target="_blank" rel="noreferrer" aria-label="YouTube" className="hover:text-[#b58a2c] transition-colors" data-testid="landing-youtube"><Youtube className="w-5 h-5" /></a>
          <a href={FB_URL} target="_blank" rel="noreferrer" aria-label="Facebook" className="hover:text-[#b58a2c] transition-colors" data-testid="landing-facebook"><Facebook className="w-5 h-5" /></a>
          <a href={WA_DEMO_URL} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="hover:text-[#25d366] transition-colors" data-testid="landing-whatsapp"><MessageCircle className="w-5 h-5" /></a>
          <span className="text-xs text-slate-500 ml-2 hidden lg:inline">© {new Date().getFullYear()} Miracurl Suite. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}

export function WhatsAppFloat() {
  return (
    <a href={WA_DEMO_URL} target="_blank" rel="noreferrer" className="fixed left-5 bottom-5 z-30 inline-flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full bg-[#25d366] text-white text-sm font-bold shadow-xl shadow-emerald-500/30 hover:scale-105 transition-transform" data-testid="landing-whatsapp-float">
      <MessageCircle className="w-5 h-5" /> Book a demo
    </a>
  );
}

export function GoogleButton({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="w-full mt-3 inline-flex items-center justify-center gap-2.5 rounded-full border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors" data-testid="login-google-btn">
      <svg className="w-4 h-4" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-2.8-.4-4H24v8.1h12.9c-.3 2.1-1.7 5.3-4.8 7.4l7.4 5.7c4.4-4.1 7-10.1 7-17.2z"/><path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2 1.4-4.7 2.4-8.5 2.4-6.3 0-11.7-4.1-13.6-9.9l-7.8 6C6.5 42.6 14.6 48 24 48z"/></svg>
      Login with Google
    </button>
  );
}
