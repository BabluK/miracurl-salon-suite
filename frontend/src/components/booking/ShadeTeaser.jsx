import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Palette, ArrowRight, Flame } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

export const ShadeTeaser = ({ slug }) => {
  const [data, setData] = useState(null);
  useEffect(() => {
    axios.get(`${API}/api/public/color/${slug}/trending`).then(r => setData(r.data)).catch(() => setData({ shades: [] }));
  }, [slug]);
  if (!data?.shades?.length) return null;
  const to = `/color/${slug}`;
  return (
    <section className="relative bg-[#0f0d13] border-y border-[#d4af37]/20 py-6 overflow-hidden" data-testid="shade-teaser">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-end justify-between gap-3 mb-4">
          <div>
            <p className="text-[10px] tracking-[0.3em] uppercase text-[#d4af37] flex items-center gap-1.5"><Flame className="w-3 h-3" /> Trending shades this season</p>
            <h3 className="font-playfair text-xl sm:text-2xl text-white leading-tight mt-1">See these colours on <span className="text-[#e6c66e] italic">you</span> — before you book</h3>
          </div>
          <Link to={to} data-testid="shade-teaser-cta" className="hidden sm:inline-flex items-center gap-1.5 shrink-0 px-4 py-2 rounded-full bg-gradient-to-r from-[#d4af37] to-[#e6c66e] text-[#17141c] text-xs font-bold hover:opacity-90 transition-opacity">
            <Palette className="w-3.5 h-3.5" /> Try it on me <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x" style={{ scrollbarWidth: "none" }}>
          {data.shades.map((s, i) => (
            <Link key={s.id} to={to} data-testid={`shade-teaser-tile-${s.id}`}
              className="group relative shrink-0 w-28 sm:w-32 aspect-[4/5] rounded-2xl overflow-hidden border border-white/10 snap-start hover:border-[#d4af37]/70 transition-colors"
              style={{ animation: `teaser-in .5s ease-out ${i * 60}ms both` }}>
              <img src={`${API}${s.image_url}?w=320`} alt={s.name} loading="lazy" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2 pt-6">
                <span className="flex gap-0.5 mb-1">{s.swatch.map(c => <i key={c} className="w-2.5 h-2.5 rounded-full border border-white/30" style={{ background: c }} />)}</span>
                <span className="block text-white text-[11px] font-semibold leading-tight truncate">{s.name}</span>
                {s.picks > 0 ? <span className="block text-[#e6c66e] text-[9px]">{s.picks} guest{s.picks === 1 ? "" : "s"} chose this</span>
                  : s.price != null ? <span className="block text-[#e6c66e] text-[9px]">from ₹{s.price}</span> : null}
              </span>
              {i === 0 && s.picks > 0 && <span className="absolute top-2 left-2 text-[9px] font-bold bg-[#d4af37] text-[#17141c] px-1.5 py-0.5 rounded-full">#1 pick</span>}
            </Link>
          ))}
          <Link to={to} data-testid="shade-teaser-more" className="shrink-0 w-28 sm:w-32 aspect-[4/5] rounded-2xl border border-dashed border-[#d4af37]/50 flex flex-col items-center justify-center gap-2 text-center text-[#e6c66e] snap-start hover:bg-[#d4af37]/10 transition-colors">
            <Palette className="w-6 h-6" />
            <span className="text-[11px] font-semibold px-2">Scan your face & find your shade</span>
          </Link>
        </div>
        <Link to={to} data-testid="shade-teaser-cta-mobile" className="sm:hidden mt-3 w-full inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-full bg-gradient-to-r from-[#d4af37] to-[#e6c66e] text-[#17141c] text-sm font-bold">
          <Palette className="w-4 h-4" /> Try it on me <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
      <style>{`@keyframes teaser-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}`}</style>
    </section>
  );
};
