import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "@/lib/api";
import { Star, MapPin, Phone, CalendarCheck, ShieldCheck } from "lucide-react";
import BrandMark from "@/components/BrandMark";

export default function SalonPublic() {
  const { slug } = useParams();
  const [s, setS] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    api.get(`/public/salon-page/${slug}`).then(r => {
      setS(r.data);
      document.title = `${r.data.name} — Book Online | Miracurl`;
    }).catch(() => setErr(true));
  }, [slug]);

  if (err) return <div className="min-h-screen bg-[#0A0A0A] text-white/60 flex items-center justify-center text-sm">Salon not found.</div>;
  if (!s) return <div className="min-h-screen bg-[#0A0A0A] text-white/40 flex items-center justify-center text-sm">Loading…</div>;

  const cats = [...new Set(s.services.map(x => x.category || "Services"))];
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white" data-testid="salon-public-page">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <BrandMark variant="dark" size="xs" />
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.25em] text-emerald-400"><ShieldCheck className="w-3.5 h-3.5" /> Verified partner salon</span>
        </div>

        <h1 className="font-playfair text-4xl sm:text-5xl" data-testid="salon-name">{s.name}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/60">
          {s.avg_rating != null && (
            <span className="inline-flex items-center gap-1 text-amber-300 font-semibold">
              <Star className="w-4 h-4 fill-amber-300" /> {s.avg_rating} <span className="text-white/40 font-normal">({s.reviews_count} reviews)</span>
            </span>
          )}
          {s.location && <span className="inline-flex items-center gap-1"><MapPin className="w-4 h-4" /> {s.location}</span>}
          {s.phone && <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1 hover:text-gold"><Phone className="w-4 h-4" /> {s.phone}</a>}
        </div>

        <Link to={s.book_url} data-testid="salon-book-now-btn"
          className="mt-6 inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-gradient-to-r from-gold to-blush text-bg-base font-semibold hover:opacity-90 transition">
          <CalendarCheck className="w-5 h-5" /> Book an appointment
        </Link>

        {/* Services */}
        <div className="mt-10 space-y-6">
          {cats.map(cat => (
            <div key={cat}>
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/40 mb-3">{cat}</div>
              <div className="grid sm:grid-cols-2 gap-2">
                {s.services.filter(x => (x.category || "Services") === cat).map((sv, i) => (
                  <div key={i} className="flex items-center justify-between bg-[#111013] border border-white/10 rounded-xl px-4 py-3 text-sm">
                    <span>{sv.name}{sv.duration_min ? <span className="text-white/35 text-xs"> · {sv.duration_min} min</span> : null}</span>
                    <span className="text-gold font-semibold">₹{Math.round(sv.price)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Reviews */}
        {s.reviews.length > 0 && (
          <div className="mt-10">
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/40 mb-3">What clients say</div>
            <div className="grid sm:grid-cols-2 gap-3">
              {s.reviews.map((r, i) => (
                <div key={i} className="bg-[#111013] border border-white/10 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{r.customer_name || "Client"}</span>
                    <span className="text-xs text-amber-300 inline-flex items-center gap-1"><Star className="w-3 h-3 fill-amber-300" /> {r.rating}</span>
                  </div>
                  <p className="text-xs text-white/60 italic mt-2 leading-relaxed">"{r.comment}"</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-12 text-center">
          <Link to={s.book_url} className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-gradient-to-r from-gold to-blush text-bg-base font-semibold hover:opacity-90 transition">
            <CalendarCheck className="w-5 h-5" /> Book now — it takes 30 seconds
          </Link>
          <p className="text-[10px] text-white/25 mt-6">Powered by <a href="/" className="underline hover:text-gold">Miracurl Salon Suite</a></p>
        </div>
      </div>
    </div>
  );
}
