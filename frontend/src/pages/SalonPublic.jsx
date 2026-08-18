import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import api from "@/lib/api";
import { Star, MapPin, Phone, CalendarCheck, ShieldCheck, Scissors, MessageSquareQuote, Sparkles } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import InstallAppPrompt from "@/components/InstallAppPrompt";
import BookingChatWidget from "@/components/BookingChatWidget";

const GLOWS = [
  { ring: "border-cyan-400/30", text: "text-cyan-300", shadow: "shadow-[0_0_40px_-12px_rgba(34,211,238,.45)]", dot: "bg-cyan-400" },
  { ring: "border-violet-400/30", text: "text-violet-300", shadow: "shadow-[0_0_40px_-12px_rgba(167,139,250,.45)]", dot: "bg-violet-400" },
  { ring: "border-pink-400/30", text: "text-pink-300", shadow: "shadow-[0_0_40px_-12px_rgba(244,114,182,.45)]", dot: "bg-pink-400" },
];

const fadeUp = (d = 0) => ({
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-40px" },
  transition: { duration: 0.7, delay: d, ease: [0.22, 1, 0.36, 1] },
});

function Sparkle({ className, delay = 0, size = "text-base" }) {
  return (
    <span aria-hidden className={`absolute ${size} text-gold/80 pointer-events-none select-none ${className}`}
      style={{ animation: `sparkle-twinkle 2.6s ease-in-out ${delay}s infinite` }}>✦</span>
  );
}

function Tilt3D({ children, className = "", max = 7 }) {
  const [t, setT] = useState({ x: 0, y: 0 });
  return (
    <div className={`salon-tilt ${className}`}
      style={{ transform: `perspective(1100px) rotateX(${t.x}deg) rotateY(${t.y}deg)` }}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setT({
          x: -((e.clientY - r.top) / r.height - 0.5) * max,
          y: ((e.clientX - r.left) / r.width - 0.5) * max,
        });
      }}
      onMouseLeave={() => setT({ x: 0, y: 0 })}>
      {children}
    </div>
  );
}

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
  return (
    <div className="min-h-screen bg-[#080809] text-white overflow-x-hidden" data-testid="salon-public-page">

      {/* Glassy header */}
      <header className="fixed top-0 inset-x-0 z-40 backdrop-blur-xl bg-black/50 border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <BrandMark variant="dark" size="xs" />
          <Link to={s.book_url} data-testid="salon-header-book-btn"
            className="px-5 py-2 rounded-full bg-gradient-to-r from-gold to-blush text-bg-base text-xs font-bold hover:opacity-90 transition-opacity">
            Book now ✦
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-28 pb-16 px-4">
        {/* floating 3D glow orbs + depth rings */}
        <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden" style={{ perspective: "900px" }}>
          <div className="absolute -top-20 -left-24 w-96 h-96 rounded-full bg-violet-600/25 blur-[110px]" style={{ animation: "brand-orb-float 9s ease-in-out infinite" }} />
          <div className="absolute top-32 -right-28 w-[26rem] h-[26rem] rounded-full bg-pink-500/20 blur-[120px]" style={{ animation: "brand-orb-float 11s ease-in-out 1.2s infinite" }} />
          <div className="absolute bottom-0 left-1/3 w-80 h-80 rounded-full bg-cyan-500/15 blur-[100px]" style={{ animation: "brand-orb-float 13s ease-in-out 2s infinite" }} />
          <div className="salon-ring w-[34rem] h-[34rem] -top-24 left-1/2 -translate-x-1/2" />
          <div className="salon-ring w-[46rem] h-[46rem] -top-36 left-1/2 -translate-x-1/2" style={{ animationDelay: "1.5s", borderColor: "rgba(167,139,250,.14)" }} />
          <div className="salon-ring w-[58rem] h-[58rem] -top-48 left-1/2 -translate-x-1/2" style={{ animationDelay: "3s", borderColor: "rgba(244,114,182,.10)" }} />
        </div>

        <div className="relative max-w-4xl mx-auto text-center">
          <Sparkle className="top-0 left-[12%]" delay={0} />
          <Sparkle className="top-14 right-[10%]" delay={0.9} size="text-xl" />
          <Sparkle className="bottom-2 left-[26%]" delay={1.6} size="text-xs" />
          <Sparkle className="top-8 right-[30%]" delay={2.1} size="text-sm" />

          <motion.div {...fadeUp(0)}>
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.3em] text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-4 py-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Verified partner salon
            </span>
          </motion.div>

          <motion.h1 {...fadeUp(0.12)} data-testid="salon-name"
            className="mt-6 font-playfair text-4xl sm:text-5xl lg:text-6xl leading-tight">
            <span className="text-white">{s.name.split(" ").slice(0, Math.ceil(s.name.split(" ").length / 2)).join(" ")} </span>
            <span className="salon-shimmer bg-gradient-to-r from-gold via-amber-100 to-blush bg-clip-text text-transparent">
              {s.name.split(" ").slice(Math.ceil(s.name.split(" ").length / 2)).join(" ")}
            </span>
            <span className="text-blush"> ✦</span>
          </motion.h1>

          <motion.div {...fadeUp(0.24)} className="mt-5 flex flex-wrap items-center justify-center gap-3 text-sm text-white/60">
            {s.avg_rating != null && (
              <span className="inline-flex items-center gap-1.5 bg-white/5 border border-amber-300/20 rounded-full px-4 py-1.5 text-amber-300 font-semibold">
                <Star className="w-4 h-4 fill-amber-300" /> {s.avg_rating}
                <span className="text-white/40 font-normal">({s.reviews_count} reviews)</span>
              </span>
            )}
            {s.location && <span className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-4 py-1.5"><MapPin className="w-4 h-4 text-cyan-300" /> {s.location}</span>}
            {s.phone && <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 hover:border-gold/40 transition-colors"><Phone className="w-4 h-4 text-violet-300" /> {s.phone}</a>}
            <button type="button" data-testid="salon-talk-to-mira-btn"
              onClick={() => window.dispatchEvent(new CustomEvent("miracurl:open-chat", { detail: { tab: "ai" } }))}
              className="inline-flex items-center gap-1.5 bg-gradient-to-r from-fuchsia-500/20 to-violet-500/20 border border-fuchsia-300/40 rounded-full px-4 py-1.5 text-fuchsia-200 font-semibold hover:border-fuchsia-300 transition-colors">
              🎙️ Talk to Mira
            </button>
          </motion.div>

          <motion.div {...fadeUp(0.36)} className="mt-9">
            <span className="relative inline-block">
              <span aria-hidden className="salon-halo" />
              <Link to={s.book_url} data-testid="salon-book-now-btn"
                className="group relative inline-flex items-center gap-2 px-10 py-4 rounded-full bg-gradient-to-r from-gold to-blush text-bg-base font-bold text-sm shadow-gold-glow hover:scale-[1.03] transition-transform">
                <CalendarCheck className="w-5 h-5" /> Book an appointment
                <span aria-hidden className="absolute -top-1.5 -right-1 text-blush" style={{ animation: "sparkle-twinkle 2.2s ease-in-out infinite" }}>✦</span>
              </Link>
            </span>
            <p className="mt-3 text-[11px] text-white/35">Takes 30 seconds · instant confirmation · no app needed</p>
            <Link to={(s.book_url || "").replace("/book/", "/gift/") || "/gift"} data-testid="salon-gift-card-btn"
              className="mt-4 inline-flex items-center gap-2 px-6 py-2.5 rounded-full border border-gold/40 bg-white/5 text-sm font-semibold text-white hover:border-gold hover:bg-white/10 transition-all">
              🎁 Gift Card for a Loved One — Birthday · Anniversary · Valentine &amp; more
            </Link>
          </motion.div>
        </div>
      </section>

      <main className="relative max-w-4xl mx-auto px-4 pb-28 space-y-8">
        {/* vertical glow line */}
        <div aria-hidden className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-cyan-400/25 via-violet-400/25 to-pink-400/25 hidden sm:block" />

        {/* Services — neon section card */}
        <motion.div {...fadeUp(0)}>
        <Tilt3D max={4}>
        <section className={`relative rounded-3xl bg-[#0e0e12]/90 backdrop-blur border ${GLOWS[0].ring} ${GLOWS[0].shadow} p-6 sm:p-8`}>
          <span aria-hidden className={`absolute -left-1 top-10 w-2 h-2 rounded-full ${GLOWS[0].dot}`} style={{ animation: "sparkle-twinkle 3s ease-in-out infinite" }} />
          <div className="flex items-center gap-4 mb-6">
            <span className={`w-11 h-11 rounded-full border ${GLOWS[0].ring} flex items-center justify-center font-playfair ${GLOWS[0].text}`}>1</span>
            <span className={`w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center ${GLOWS[0].text}`}><Scissors className="w-5 h-5" /></span>
            <div>
              <h2 className={`text-sm sm:text-base font-bold tracking-[0.2em] uppercase ${GLOWS[0].text}`}>Services & Pricing</h2>
              <p className="text-xs text-white/40 mt-0.5">Transparent prices — what you see is what you pay</p>
            </div>
          </div>
          <div className="space-y-6">
            {cats.map(cat => (
              <div key={cat}>
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/35 mb-3">{cat}</div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {s.services.filter(x => (x.category || "Services") === cat).map((sv, i) => (
                    <div key={i}
                      className="group relative flex items-stretch overflow-hidden bg-white/[0.03] border border-white/10 rounded-2xl text-sm hover:border-cyan-400/40 hover:bg-white/[0.06] hover:-translate-y-0.5 transition-all duration-300">
                      <div className="flex-1 min-w-0 px-4 py-3.5 flex flex-col justify-center gap-1">
                        <span className="font-medium truncate">{sv.name}</span>
                        <span className="text-white/35 text-xs">{sv.duration_min ? `${sv.duration_min} min · ` : ""}<span className="text-gold font-semibold text-sm">₹{Math.round(sv.price)}</span></span>
                      </div>
                      <div className="w-24 sm:w-28 relative shrink-0">
                        <img src={sv.image_url || "https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=400"} alt="" loading="lazy"
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                        <div className="absolute inset-0 bg-gradient-to-r from-[#0e0e12] via-[#0e0e12]/40 to-transparent" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
        </Tilt3D>
        </motion.div>

        {/* Gallery — photo strip */}
        {s.gallery?.length > 0 && (
          <motion.div {...fadeUp(0.04)}>
          <Tilt3D max={4}>
          <section className="relative rounded-3xl bg-[#0e0e12]/90 backdrop-blur border border-amber-300/20 shadow-[0_0_40px_-12px_rgba(251,191,36,.35)] p-6 sm:p-8" data-testid="salon-gallery-section">
            <Sparkle className="top-4 right-[8%]" delay={0.6} size="text-sm" />
            <div className="flex items-center gap-4 mb-5">
              <span className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-amber-300"><Sparkles className="w-5 h-5" /></span>
              <div>
                <h2 className="text-sm sm:text-base font-bold tracking-[0.2em] uppercase text-amber-300">Inside the salon</h2>
                <p className="text-xs text-white/40 mt-0.5">A little look before you visit</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {s.gallery.map((url, i) => (
                <div key={i} className={`rounded-2xl overflow-hidden border border-white/10 ${i === 0 ? "col-span-2 row-span-2 sm:col-span-1" : ""}`}>
                  <img src={`${process.env.REACT_APP_BACKEND_URL}${url}`} alt={`${s.name} photo ${i + 1}`} loading="lazy"
                    className="w-full h-full object-cover aspect-square hover:scale-105 transition-transform duration-500" />
                </div>
              ))}
            </div>
          </section>
          </Tilt3D>
          </motion.div>
        )}

        {/* Reviews — neon section card */}
        {s.reviews.length > 0 && (
          <motion.div {...fadeUp(0.08)}>
          <Tilt3D max={4}>
          <section className={`relative rounded-3xl bg-[#0e0e12]/90 backdrop-blur border ${GLOWS[1].ring} ${GLOWS[1].shadow} p-6 sm:p-8`}>
            <span aria-hidden className={`absolute -right-1 top-10 w-2 h-2 rounded-full ${GLOWS[1].dot}`} style={{ animation: "sparkle-twinkle 3s ease-in-out .8s infinite" }} />
            <div className="flex items-center gap-4 mb-6">
              <span className={`w-11 h-11 rounded-full border ${GLOWS[1].ring} flex items-center justify-center font-playfair ${GLOWS[1].text}`}>2</span>
              <span className={`w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center ${GLOWS[1].text}`}><MessageSquareQuote className="w-5 h-5" /></span>
              <div>
                <h2 className={`text-sm sm:text-base font-bold tracking-[0.2em] uppercase ${GLOWS[1].text}`}>What clients say</h2>
                <p className="text-xs text-white/40 mt-0.5">Real reviews from verified visits</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {s.reviews.map((r, i) => (
                <div key={i} className="bg-white/[0.03] border border-white/10 rounded-xl p-4 hover:border-violet-400/40 hover:-translate-y-0.5 transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{r.customer_name || "Client"}</span>
                    <span className="text-xs text-amber-300 inline-flex items-center gap-1"><Star className="w-3 h-3 fill-amber-300" /> {r.rating}</span>
                  </div>
                  <p className="text-xs text-white/60 italic mt-2 leading-relaxed">"{r.comment}"</p>
                </div>
              ))}
            </div>
          </section>
          </Tilt3D>
          </motion.div>
        )}

        {/* Book CTA — neon section card */}
        <motion.div {...fadeUp(0.08)}>
        <Tilt3D max={4}>
        <section className={`relative rounded-3xl bg-[#0e0e12]/90 backdrop-blur border ${GLOWS[2].ring} ${GLOWS[2].shadow} p-8 sm:p-10 text-center overflow-hidden`}>
          <div aria-hidden className="absolute -top-16 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-pink-500/15 blur-[80px]" />
          <Sparkle className="top-6 left-[14%]" delay={0.4} />
          <Sparkle className="bottom-8 right-[12%]" delay={1.4} size="text-sm" />
          <div className="relative">
            <span className={`inline-flex w-11 h-11 rounded-full border ${GLOWS[2].ring} items-center justify-center font-playfair ${GLOWS[2].text} mb-4`}>3</span>
            <h2 className="font-playfair text-2xl sm:text-3xl">Your chair is <span className="bg-gradient-to-r from-gold to-blush bg-clip-text text-transparent">waiting</span> ✦</h2>
            <p className="text-sm text-white/50 mt-2 max-w-md mx-auto">Pick a service, choose your stylist and time — confirmed instantly with reminders before your visit.</p>
            <Link to={s.book_url} data-testid="salon-footer-book-btn"
              className="mt-6 inline-flex items-center gap-2 px-10 py-4 rounded-full bg-gradient-to-r from-gold to-blush text-bg-base font-bold text-sm shadow-gold-glow hover:scale-[1.03] transition-transform">
              <CalendarCheck className="w-5 h-5" /> Book now — it takes 30 seconds
            </Link>
            <p className="mt-4 text-[11px] text-white/30 inline-flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-violet-300" /> Get the <b className="text-violet-300">Miracurl Book</b> app for faster rebooking & reminders</p>
          </div>
        </section>
        </Tilt3D>
        </motion.div>

        <p className="text-center text-[10px] text-white/25 pt-2">Powered by <a href="/" className="underline hover:text-gold">Miracurl Salon Suite</a></p>
      </main>

      <InstallAppPrompt variant="customer" />
      <BookingChatWidget slug={slug} />
    </div>
  );
}
