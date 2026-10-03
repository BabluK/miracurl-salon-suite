import { MapPin, Clock, Star } from "lucide-react";

const SALON_HERO = "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=900";
const RESTO_HERO = "/resto-hero.jpg";

// Live mini-preview of the public booking page (mirrors BookPublic's top bar + hero) for the signup wizard.
export function BookingPreviewCard({ name, slug, resto = false, location = "" }) {
  const shownName = name.trim() || (resto ? "Your Restaurant" : "Your Salon");
  const shownSlug = slug || "your-slug";
  const host = window.location.host;
  return (
    <div data-testid="signup-live-preview" className="rounded-2xl border border-[#d4af37]/30 overflow-hidden shadow-[0_12px_30px_-18px_rgba(10,9,7,.35)] bg-white animate-fade-up">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 border-b border-slate-200">
        <span className="flex gap-1"><i className="w-2 h-2 rounded-full bg-rose-400" /><i className="w-2 h-2 rounded-full bg-amber-400" /><i className="w-2 h-2 rounded-full bg-emerald-400" /></span>
        <span data-testid="signup-live-preview-url" className="flex-1 min-w-0 truncate text-[10px] font-mono text-slate-500 bg-white rounded-md px-2 py-1 border border-slate-200">
          {host}/book/<span className={slug ? "text-[var(--su-accent)] font-semibold" : "text-slate-300"}>{shownSlug}</span>
        </span>
        <span className="text-[9px] uppercase tracking-[0.18em] font-bold text-[var(--su-accent)] shrink-0">Live preview</span>
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[rgba(253,251,244,0.97)] border-b border-[#eadfbd]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-full p-[2px] bg-gradient-to-br from-[#d4af37] via-[#f3e3ae] to-[#b08d3f] shrink-0">
            <span className="w-full h-full rounded-full bg-[#17141c] text-[#e8c37f] flex items-center justify-center font-playfair text-sm font-bold">{shownName.charAt(0).toUpperCase()}</span>
          </span>
          <div className="min-w-0 leading-tight">
            <div data-testid="signup-live-preview-name" className="font-playfair text-xs text-[#8a6d1f] font-semibold truncate">{shownName}</div>
            <div className="text-[8px] uppercase tracking-[0.28em] text-[#a5926a] truncate">{resto ? "Fine Dining · Powered by Mira AI" : "Luxury Salon · Powered by Mira AI"}</div>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-gradient-to-r from-[#d4af37] to-[#e6c66e] text-[#17141c] text-[9px] font-bold shrink-0">{resto ? "Reserve a Table ✦" : "Book Appointment ✦"}</span>
      </div>
      <div className="relative h-32 sm:h-36 overflow-hidden">
        <img src={resto ? RESTO_HERO : SALON_HERO} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0a08]/90 via-[#0b0a08]/45 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3 text-white">
          <div className="text-[8px] tracking-[0.3em] uppercase text-[#e8c37f] mb-1">{resto ? "Reserve Your Table" : "Book Your Visit"}</div>
          <div className="font-playfair text-sm sm:text-base leading-snug truncate">{resto ? "Great food, warm company, memorable evenings." : "Where elegance meets every strand."}</div>
          <div className="flex items-center gap-1.5 mt-2 text-[9px] text-white/80">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/40 border border-white/10"><MapPin className="w-2.5 h-2.5" /> {location.trim() || "Your city"}</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/40 border border-white/10"><Clock className="w-2.5 h-2.5" /> 10:00 AM – 9:00 PM</span>
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/40 border border-white/10"><Star className="w-2.5 h-2.5 text-[#e8c37f]" /> 4.9</span>
          </div>
        </div>
      </div>
    </div>
  );
}
