import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { PartnerGrid } from "@/components/PartnerGrid";
import SalesChatWidget from "@/components/SalesChatWidget";
import { Handshake, ArrowLeft, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";

export default function Partners() {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/public/partners").then(r => setPartners(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#0b0b10] text-white" data-testid="partners-page">
      <SiteHeader variant="light" />
      <div className="max-w-6xl mx-auto px-6 sm:px-10 py-12">
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition" data-testid="partners-back-link">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Miracurl
        </Link>
        <div className="mt-8 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400/30 to-fuchsia-500/30 border border-white/10 flex items-center justify-center">
            <Handshake className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-amber-300/80">Miracurl Network</div>
            <h1 className="font-playfair text-3xl sm:text-4xl mt-1">Our Trusted Partners</h1>
          </div>
        </div>
        <p className="text-sm text-white/50 mt-4 max-w-2xl">
          Every salon on this list runs on the Miracurl platform — ratings come straight from their real customers.
        </p>
        <div className="mt-10">
          {loading ? (
            <p className="text-white/40 text-sm">Loading partners…</p>
          ) : partners.length ? (
            <PartnerGrid partners={partners} />
          ) : (
            <p className="text-white/40 text-sm">Partners will appear here soon.</p>
          )}
        </div>

        {/* Become a partner CTA → opens the sales chat */}
        <div className="mt-16 rounded-3xl border border-amber-400/20 bg-gradient-to-br from-amber-400/10 to-fuchsia-500/10 p-8 sm:p-10 text-center" data-testid="become-partner-cta">
          <Sparkles className="w-6 h-6 text-amber-300 mx-auto" />
          <h2 className="font-playfair text-2xl sm:text-3xl mt-3">Want your salon on this list?</h2>
          <p className="text-sm text-white/50 mt-2 max-w-md mx-auto">
            Join the Miracurl network — bookings, billing, staff, AI tools and your own booking page, live in a day.
          </p>
          <button data-testid="become-partner-btn"
            onClick={() => window.dispatchEvent(new Event("open-sales-chat"))}
            className="mt-6 inline-flex items-center gap-2 px-7 py-3 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 text-sm font-semibold transition shadow-lg shadow-amber-400/20">
            <Handshake className="w-4 h-4" /> Become a partner — chat with us
          </button>
        </div>
      </div>
      <SalesChatWidget />
    </div>
  );
}
