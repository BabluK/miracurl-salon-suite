import { useRef, useState } from "react";
import { MapPin, Clock, Star, Camera, Loader2, X } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const SALON_HERO = "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=900";
const RESTO_HERO = "/resto-hero.jpg";

// Gold-ring avatar that doubles as the logo uploader (click → file picker). Shows the uploaded logo or the initial.
function LogoAvatar({ initial, logoUrl, onLogo }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { toast.error("Logo too large — max 3 MB"); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await axios.post(`${BACKEND_URL}/api/public/signup-logo`, fd);
      onLogo(data.url);
      toast.success("Logo added to your preview ✦");
    } catch (err) {
      const d = err.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Upload failed — try a JPG or PNG");
    } finally { setBusy(false); }
  };
  return (
    <span className="relative shrink-0 group">
      <button type="button" data-testid="signup-logo-upload-btn" onClick={() => inputRef.current?.click()} disabled={busy}
        aria-label="Upload your logo"
        className="w-9 h-9 rounded-full p-[2px] bg-gradient-to-br from-[#d4af37] via-[#f3e3ae] to-[#b08d3f] block transition-transform hover:scale-105 active:scale-95">
        <span className="w-full h-full rounded-full bg-[#17141c] overflow-hidden flex items-center justify-center text-[#e8c37f] font-playfair text-sm font-bold">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : logoUrl
            ? <img data-testid="signup-logo-preview-img" src={`${BACKEND_URL}${logoUrl}`} alt="logo" className="w-full h-full object-cover" />
            : initial}
        </span>
        {!logoUrl && !busy && (
          <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white border border-[#d4af37] flex items-center justify-center shadow">
            <Camera className="w-2.5 h-2.5 text-[#8a6d1f]" />
          </span>
        )}
      </button>
      {logoUrl && !busy && (
        <button type="button" data-testid="signup-logo-remove-btn" onClick={() => onLogo("")} aria-label="Remove logo"
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center shadow hover:bg-rose-600">
          <X className="w-2.5 h-2.5" />
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={pick} data-testid="signup-logo-file-input" />
    </span>
  );
}

// Live mini-preview of the public booking page (mirrors BookPublic's top bar + hero) for the signup wizard.
export function BookingPreviewCard({ name, slug, resto = false, location = "", logoUrl = "", onLogo }) {
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
          <LogoAvatar initial={shownName.charAt(0).toUpperCase()} logoUrl={logoUrl} onLogo={onLogo} />
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
      <div className="px-3 py-1.5 bg-white border-t border-slate-100 text-[10px] text-slate-500 flex items-center gap-1.5" data-testid="signup-logo-hint">
        <Camera className="w-3 h-3 text-[var(--su-accent)]" />
        {logoUrl ? "Your logo is set — it'll appear on your booking page from day one." : "Tap the gold circle to add your logo (PNG/JPG, up to 3 MB) — optional."}
      </div>
    </div>
  );
}
