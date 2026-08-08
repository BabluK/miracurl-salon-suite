import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Facebook, Instagram, Linkedin, Crown, ArrowLeft } from "lucide-react";
import api from "@/lib/api";
import { SiteHeader } from "@/components/SiteHeader";
import SalesChatWidget from "@/components/SalesChatWidget";

export default function AboutCeo() {
  const [site, setSite] = useState(null);
  useEffect(() => {
    api.get("/public/site-info").then((r) => setSite(r.data)).catch(() => {});
    window.scrollTo(0, 0);
  }, []);
  if (!site) return <div className="min-h-screen bg-white" />;

  const socials = [
    [site.ceo_facebook, Facebook, "hover:text-sky-600 hover:border-sky-300"],
    [site.ceo_instagram, Instagram, "hover:text-[#E35A89] hover:border-pink-300"],
    [site.ceo_linkedin, Linkedin, "hover:text-[#a87e2f] hover:border-[#e0c07a]"],
  ].filter(([url]) => url);

  return (
    <div className="min-h-screen relative overflow-hidden bg-white text-slate-800 font-outfit" data-testid="about-ceo-page">
      <SiteHeader variant="light" site={site} />
      <SalesChatWidget />
      <div className="pointer-events-none absolute -right-32 -top-24 w-[480px] h-[480px] rounded-full opacity-25"
        style={{ background: "radial-gradient(circle at 30% 30%, #f5d78e, #e8918f 55%, transparent 75%)" }} />

      <main className="relative z-10 max-w-4xl mx-auto px-6 sm:px-10 py-14 sm:py-16">
        <Link to="/about-us" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800" data-testid="ceo-back-link">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <div className="flex flex-col md:flex-row items-center md:items-start gap-10 mt-8">
          <div className="shrink-0">
            <div className="w-56 h-56 rounded-3xl overflow-hidden border-2 border-[#e0c07a] shadow-[0_30px_80px_-30px_rgba(184,134,59,0.5)] bg-amber-50">
              {site.ceo_photo ? (
                <img src={site.ceo_photo} alt={site.ceo_name} className="w-full h-full object-cover" data-testid="ceo-page-photo" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#c9a24a]"><Crown className="w-16 h-16" /></div>
              )}
            </div>
            {socials.length > 0 && (
              <div className="flex justify-center gap-3 mt-5">
                {socials.map(([url, Icon, cls], i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer"
                    className={`w-10 h-10 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-500 transition-colors ${cls}`}>
                    <Icon className="w-4.5 h-4.5" />
                  </a>
                ))}
              </div>
            )}
          </div>
          <div className="text-center md:text-left">
            <span className="text-xs uppercase tracking-[0.25em] text-[#a87e2f] font-semibold">Meet the Founder</span>
            <h1 className="font-playfair text-4xl sm:text-5xl font-light mt-3 text-slate-900">{site.ceo_name}</h1>
            <p className="text-sm text-[#a87e2f] mt-2 font-medium">{site.ceo_title}</p>
            <p className="text-slate-600 mt-6 leading-relaxed whitespace-pre-line" data-testid="ceo-page-about">{site.ceo_about}</p>
            <Link to="/signup-salon"
              className="inline-block mt-8 px-7 py-3.5 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#1c160c] font-bold hover:brightness-110 transition-all">
              Join Miracurl Suite — free trial
            </Link>
          </div>
        </div>
      </main>
      <footer className="relative z-10 border-t border-[#e9d9ae]/60 py-8 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} Miracurl Suite · <Link to="/" className="hover:text-slate-700">Home</Link>
      </footer>
    </div>
  );
}
