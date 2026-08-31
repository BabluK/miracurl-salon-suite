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
    <div className="min-h-screen bg-[#FBF6EC] text-[#2b2115]" data-testid="partners-page">
      <SiteHeader variant="light" />
      <div className="relative max-w-6xl mx-auto px-6 sm:px-10 py-12">
        <div className="pointer-events-none absolute -top-10 right-0 w-96 h-96 rounded-full bg-[#C89B52]/[0.10] blur-3xl" />
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-[#8a6420]/70 hover:text-[#8a6420] transition" data-testid="partners-back-link">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Miracurl
        </Link>
        <div className="mt-8 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#F0D9A5]/80 to-[#C89B52]/50 border border-[#D9B878]/50 flex items-center justify-center shadow-[0_10px_30px_-12px_rgba(184,134,59,0.5)]">
            <Handshake className="w-5 h-5 text-[#7a5a1e]" />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-[#a8813d]">Miracurl Network</div>
            <h1 className="font-playfair text-3xl sm:text-4xl mt-1">Our Trusted Partners</h1>
          </div>
        </div>
        <p className="text-sm text-[#6b5636] mt-4 max-w-2xl">
          Every salon on this list runs on the Miracurl platform — ratings come straight from their real customers.
        </p>
        <div className="mt-2 h-px w-24 bg-gradient-to-r from-[#C89B52] to-transparent" />
        <div className="mt-10">
          {loading ? (
            <p className="text-[#8b7a5e] text-sm">Loading partners…</p>
          ) : partners.length ? (
            <PartnerGrid partners={partners} light />
          ) : (
            <p className="text-[#8b7a5e] text-sm">Partners will appear here soon.</p>
          )}
        </div>

        {/* Become a partner CTA → opens the sales chat */}
        <div className="mt-16 rounded-3xl border border-[#C89B52]/35 bg-gradient-to-br from-[#F0D9A5]/40 to-white p-8 sm:p-10 text-center shadow-[0_24px_60px_-30px_rgba(184,134,59,0.4)]" data-testid="become-partner-cta">
          <Sparkles className="w-6 h-6 text-[#b8863b] mx-auto" />
          <h2 className="font-playfair text-2xl sm:text-3xl mt-3">Want your salon on this list?</h2>
          <p className="text-sm text-[#6b5636] mt-2 max-w-md mx-auto">
            Join the Miracurl network — bookings, billing, staff, AI tools and your own booking page, live in a day.
          </p>
          <button data-testid="become-partner-btn"
            onClick={() => window.dispatchEvent(new Event("open-sales-chat"))}
            className="mt-6 inline-flex items-center gap-2 px-7 py-3 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] hover:brightness-105 text-[#2b2115] text-sm font-bold transition shadow-lg shadow-[#C89B52]/30">
            <Handshake className="w-4 h-4" /> Become a partner — chat with us
          </button>
        </div>
      </div>
      <SalesChatWidget />
    </div>
  );
}
