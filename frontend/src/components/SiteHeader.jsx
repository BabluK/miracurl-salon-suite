import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Mail, Instagram, Facebook, ArrowRight, MessageSquare } from "lucide-react";

// Shared marketing header — dark (landing) & light "golden white" (public portals).
// Sticky ("locked") to the top on every page it's used on.
const T = {
  dark: {
    header: "bg-black/70 border-b border-[#DFB78C]/15",
    sub: "text-white/45",
    link: "text-white/70 hover:text-white",
    verify: "text-emerald-400 hover:text-emerald-300",
    pill: "border-[#DFB78C]/40 bg-[#DFB78C]/10 text-[#DFB78C] hover:bg-[#DFB78C]/20",
    dd: "border-[#DFB78C]/25 bg-[#0b0a08]/95 text-white/80",
    ddItem: "text-white/80 hover:text-[#DFB78C]",
    chip: "border-white/10 bg-white/5 text-white/65",
  },
  light: {
    header: "bg-[#FBF6EC]/90 border-b border-[#D9B878]/30 shadow-[0_4px_24px_-12px_rgba(184,134,59,0.25)]",
    sub: "text-[#8a7048]/80",
    link: "text-[#4d3f2a]/80 hover:text-[#1c160c]",
    verify: "text-emerald-600 hover:text-emerald-500",
    pill: "border-[#C89B52]/50 bg-[#C89B52]/10 text-[#8a6420] hover:bg-[#C89B52]/20",
    dd: "border-[#D9B878]/40 bg-[#FFFDF8] text-[#4d3f2a] shadow-[0_30px_80px_-20px_rgba(120,90,40,0.35)]",
    ddItem: "text-[#4d3f2a] hover:text-[#8a6420]",
    chip: "border-[#D9B878]/30 bg-[#C89B52]/[0.07] text-[#6b5636]",
  },
};

export const SuiteLogo = ({ variant = "dark", size = "md" }) => (
  <Link to="/" className="flex items-center gap-3 group shrink-0" data-testid="suite-logo">
    <img src={variant === "light" ? "/assets/ms-logo-gold.png" : "/assets/ms-logo-emblem.png"} alt="Miracurl Suite"
      className={`${size === "lg" ? "w-24 h-24" : "w-10 h-10 sm:w-14 sm:h-14 xl:w-[72px] xl:h-[72px]"} gold-shine-img group-hover:scale-105 transition-transform`} />
    <span className="leading-tight">
      <span className={`block font-playfair ${size === "lg" ? "text-2xl" : "text-sm sm:text-lg"} tracking-[0.08em] gold-shine-text font-semibold whitespace-nowrap`}>
        MIRACURL <span className="tracking-[0.3em]">SUITE</span>
      </span>
      <span className={`hidden sm:block text-[9px] uppercase tracking-[0.3em] ${T[variant].sub}`}>Smart Salon Management Software</span>
    </span>
  </Link>
);

export const SiteHeader = ({ variant = "light", site = null }) => {
  const t = T[variant];
  const [open, setOpen] = useState(false);
  return (
    <header className={`sticky top-0 z-40 backdrop-blur-xl ${t.header}`} data-testid="site-header">
      <div className="max-w-7xl mx-auto px-4 xl:px-10 py-2 flex items-center justify-between">
        <SuiteLogo variant={variant} />
        <div className="hidden xl:flex items-center gap-3 2xl:gap-5 text-sm">
          <Link to="/" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className={`nav-cap ${t.link} transition-colors`} data-testid="header-home-link">Home</Link>
          <Link to="/about-us" className={`nav-cap ${t.link} transition-colors`} data-testid="header-about-link">About Us</Link>
          <Link to="/mira.ai" data-testid="header-mira-link"
            className={`nav-cap flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-medium transition-colors ${t.pill}`}>
            ✦ Mira AI Studio
          </Link>
          <Link to="/features" className={`nav-cap ${t.link} transition-colors`} data-testid="header-features-link">Features</Link>
          <Link to="/pricing" className={`nav-cap ${t.link} transition-colors`} data-testid="header-pricing-link">Pricing</Link>
          <a href="/products" className="nav-cap text-[#C89B52] hover:text-[#8a6420] font-medium transition-colors" data-testid="header-products-link">🧴 Our Products</a>
          <Link to="/staff-registry" className={`nav-cap ${t.verify} font-medium transition-colors`} data-testid="header-verify-link">Staff Verification</Link>
          <div className="nav-cap relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
            <button onClick={() => setOpen((v) => !v)} data-testid="header-contact-btn"
              className={`flex items-center gap-1 uppercase transition-colors ${t.link}`}>
              Contact Us <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
              <div className="absolute right-0 top-full pt-3 w-[300px]" data-testid="header-contact-dropdown">
                <div className={`rounded-2xl border backdrop-blur-xl p-5 space-y-3 ${t.dd}`}>
                  <a href={`mailto:${site?.contact_email || "admin@miracurl-suite.com"}`}
                    className={`flex items-center gap-2.5 text-sm transition-colors ${t.ddItem}`}>
                    <Mail className="w-4 h-4 text-[#C89B52]" /> {site?.contact_email || "admin@miracurl-suite.com"}
                  </a>
                  {site?.instagram && (
                    <a href={site.instagram} target="_blank" rel="noreferrer" className={`flex items-center gap-2.5 text-sm transition-colors ${t.ddItem}`}>
                      <Instagram className="w-4 h-4 text-[#E35A89]" /> Instagram
                    </a>
                  )}
                  {site?.facebook && (
                    <a href={site.facebook} target="_blank" rel="noreferrer" className={`flex items-center gap-2.5 text-sm transition-colors ${t.ddItem}`}>
                      <Facebook className="w-4 h-4 text-sky-500" /> Facebook
                    </a>
                  )}
                  {site?.whatsapp && (
                    <a href={`https://wa.me/${(site.whatsapp || "").replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                      className={`flex items-center gap-2.5 text-sm transition-colors ${t.ddItem}`}>
                      <MessageSquare className="w-4 h-4 text-emerald-500" /> WhatsApp
                    </a>
                  )}
                  <Link to="/contact-us" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#8a6420] hover:text-[#C89B52] transition-colors">
                    Visit the Contact Us page <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            )}
          </div>
          <Link to="/login" className={`nav-cap ${t.link} font-medium transition-colors`} data-testid="header-signin-link">Sign In</Link>
          <Link to="/signup-salon" data-testid="header-signup-link"
            className="nav-cap px-4 py-2 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#1c160c] font-bold hover:brightness-110 hover:-translate-y-0.5 shadow-[0_8px_24px_-6px_rgba(200,155,82,0.5)] transition-transform">
            Sign Up
          </Link>
        </div>
        <div className="flex xl:hidden items-center gap-2 sm:gap-3 text-sm whitespace-nowrap">
          <Link to="/contact-us" className={`${t.link} transition-colors`}>Contact</Link>
          <Link to="/login" className={`${t.link} font-medium transition-colors`}>Sign In</Link>
          <Link to="/signup-salon"
            className="px-3 sm:px-4 py-2 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#1c160c] text-xs font-bold shadow-[0_8px_24px_-6px_rgba(200,155,82,0.5)]">
            Sign Up
          </Link>
        </div>
      </div>
    </header>
  );
};
