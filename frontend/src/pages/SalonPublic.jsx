import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "@/lib/api";
import { SalonHero, SignatureServices, TrustStrip, FooterStrip } from "@/components/salon/LandingSections";
import { PromoCards, TrendingShades, TransformCTA, ReviewsGrid } from "@/components/salon/LandingPromos";
import InstallAppPrompt from "@/components/InstallAppPrompt";
import BookingChatWidget from "@/components/BookingChatWidget";

export default function SalonPublic() {
  const { slug } = useParams();
  const [s, setS] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    api.get(`/public/salon-page/${slug}`).then(r => {
      setS(r.data);
      document.title = `${r.data.name} — Book Online | Miracurl`;
      const d = r.data;
      let meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute("content", `Book ${d.name}${d.location ? ` in ${d.location}` : ""} online — ${d.services?.length || ""} services, instant confirmation. Powered by Miracurl.`);
      const ld = {
        "@context": "https://schema.org", "@type": "HairSalon",
        name: d.name, url: `https://miracurl-suite.com/salon/${slug}`,
        ...(d.location ? { address: d.location } : {}),
        ...(d.phone ? { telephone: d.phone } : {}),
        ...(d.gallery?.length ? { image: d.gallery[0].startsWith("http") ? d.gallery[0] : `https://miracurl-suite.com${d.gallery[0]}` } : {}),
        ...(d.avg_rating && d.reviews_count ? {
          aggregateRating: { "@type": "AggregateRating", ratingValue: d.avg_rating, reviewCount: d.reviews_count }
        } : {}),
        potentialAction: { "@type": "ReserveAction", target: `https://miracurl-suite.com/book/${slug}` },
      };
      let tag = document.getElementById("salon-ld");
      if (!tag) {
        tag = document.createElement("script");
        tag.type = "application/ld+json";
        tag.id = "salon-ld";
        document.head.appendChild(tag);
      }
      tag.textContent = JSON.stringify(ld);
    }).catch(() => setErr(true));
    return () => document.getElementById("salon-ld")?.remove();
  }, [slug]);

  if (err) return <div className="min-h-screen bg-[#0A0A0A] text-white/60 flex items-center justify-center text-sm">Salon not found.</div>;
  if (!s) return <div className="min-h-screen bg-[#0A0A0A] text-white/40 flex items-center justify-center text-sm">Loading…</div>;

  const cats = [...new Set(s.services.map(x => x.category || "Services"))];
  const bookHref = `${s.book_url}#choose-services`;
  const resto = s.business_type === "restaurant";
  return (
    <div className="min-h-screen bg-[#080809] text-white overflow-x-hidden" data-testid="salon-public-page">
      <header className="fixed top-0 inset-x-0 z-40 backdrop-blur-xl bg-black/60 border-b border-gold/10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0" data-testid="salon-header-tenant-brand">
            {s.logo_url && <img src={s.logo_url} alt={s.name} className="w-10 h-10 rounded-lg object-contain bg-[#14141a] border border-gold/30 flex-shrink-0" />}
            <span className="font-playfair text-sm sm:text-base gold-shine-text truncate">{s.name}</span>
          </div>
          <div className="flex items-center gap-2">
            {s.show_products !== false && !resto && <a href="/products" data-testid="salon-our-products-btn" className="hidden sm:inline-flex text-xs text-gold/90 hover:text-gold px-3 py-2">Our Products</a>}
            <Link to={bookHref} data-testid="salon-header-book-btn" className="px-5 py-2 rounded-full bg-gradient-to-r from-[#e8c56a] to-[#c99a2e] text-[#1a1408] text-xs font-bold hover:brightness-110 flex-shrink-0">
              {resto ? "Reserve a Table ✦" : "Book now ✦"}
            </Link>
          </div>
        </div>
      </header>

      <SalonHero s={s} bookHref={bookHref} cats={cats} />
      <SignatureServices s={s} cats={cats} bookHref={bookHref} />
      <TrustStrip s={s} />
      <PromoCards s={s} slug={slug} />
      <TrendingShades s={s} slug={slug} />

      {s.gallery?.length > 0 && (
        <section className="max-w-6xl mx-auto px-5 sm:px-8 py-6" data-testid="salon-gallery-section">
          <h2 className="font-playfair text-2xl sm:text-3xl text-white mb-4">Inside the {resto ? "Restaurant" : "Salon"}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {s.gallery.map((url, i) => (
              <div key={i} className={`rounded-2xl overflow-hidden border border-white/10 ${i === 0 ? "col-span-2 row-span-2 sm:col-span-1" : ""}`}>
                <img src={`${process.env.REACT_APP_BACKEND_URL}${url}`} alt={`${s.name} photo ${i + 1}`} loading="lazy" className="w-full h-full object-cover aspect-square hover:scale-105 transition-transform duration-500" />
              </div>
            ))}
          </div>
        </section>
      )}

      <ReviewsGrid reviews={s.reviews} />
      <TransformCTA s={s} bookHref={bookHref} />
      <FooterStrip s={s} />
      <p className="text-center text-[10px] text-white/25 pb-24">Powered by <a href="/" className="underline hover:text-gold">Miracurl {resto ? "Restaurant" : "Salon"} Suite</a></p>

      <InstallAppPrompt variant="customer" />
      <BookingChatWidget slug={slug} restaurant={s?.business_type === "restaurant"} />
    </div>
  );
}
