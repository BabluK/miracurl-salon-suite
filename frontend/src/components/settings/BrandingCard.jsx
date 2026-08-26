import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Store, Star, Instagram, MessageCircle, Save } from "lucide-react";
import { BookingPreview } from "./BookingPreview";

const EMPTY = { google_review_url: "", maps_url: "", hours: "", open_time: "10:00", close_time: "21:00", phone: "", location: "", hero_image: "", instagram_url: "", whatsapp_number: "", reception_phone: "", manager_phone: "", salon_email: "", book_bg: "", logo_shape: "", header_bg: "" };

// Header bar colours — light tones keep the gold-brown header text readable
const HEADER_BG_TONES = [
  { v: "", label: "Classic Ivory", swatch: "#FDFBF4" },
  { v: "grad:pearl", label: "Pearl Gold ✦", swatch: "linear-gradient(135deg,#ffffff,#f3e7c9)" },
  { v: "grad:gold", label: "Golden Silk ✦", swatch: "linear-gradient(135deg,#fdfbf4,#eed9a4)" },
  { v: "#F3E5BF", label: "Light Golden", swatch: "#F3E5BF" },
  { v: "#F7EDD8", label: "Champagne", swatch: "#F7EDD8" },
  { v: "#FFFFFF", label: "Pure White", swatch: "#FFFFFF" },
  { v: "#F6E3E3", label: "Rose Petal", swatch: "#F6E3E3" },
  { v: "#EAF2E6", label: "Mint Cream", swatch: "#EAF2E6" },
];

// Decent page tones — all keep strong contrast with the booking page's white text
const BOOK_BG_TONES = [
  { v: "", label: "Classic Black" },
  { v: "#221a2b", label: "Royal Plum" },
  { v: "#12251c", label: "Deep Emerald" },
  { v: "#101a2e", label: "Midnight Blue" },
  { v: "#241a12", label: "Coffee Mocha" },
  { v: "#2b1218", label: "Vintage Wine" },
];

const BOOK_BG_IMAGES_SALON = [
  { v: "img:aurora", label: "Aurora", src: "/booking-bg/aurora.jpg" },
  { v: "img:sunrise", label: "Sunrise", src: "/booking-bg/sunrise.jpg" },
  { v: "img:salon-craft", label: "Artisan Cream", src: "/booking-bg/salon-craft.jpg" },
  { v: "img:salon-blush", label: "Blush Studio", src: "/booking-bg/salon-blush.jpg" },
  { v: "img:salon-emerald", label: "Emerald Luxe", src: "/booking-bg/salon-emerald.jpg" },
  { v: "img:salon-noir", label: "Noir & Gold", src: "/booking-bg/salon-noir.jpg" },
  { v: "img:champagne", label: "Champagne Gold", src: "/booking-bg/champagne-gold.jpg" },
  { v: "img:royal-gold", label: "Royal Gold Silk", src: "/booking-bg/royal-gold.jpg" },
];
const BOOK_BG_IMAGES_RESTO = [
  { v: "img:aurora", label: "Aurora", src: "/booking-bg/aurora.jpg" },
  { v: "img:sunrise", label: "Sunrise", src: "/booking-bg/sunrise.jpg" },
  { v: "img:dining-fine", label: "Fine Dining", src: "/booking-bg/dining-fine.jpg" },
  { v: "img:dining-emerald", label: "Emerald Table", src: "/booking-bg/dining-emerald.jpg" },
  { v: "img:dining-noir", label: "Midnight Grill", src: "/booking-bg/dining-noir.jpg" },
  { v: "img:dining-harvest", label: "Rustic Harvest", src: "/booking-bg/dining-harvest.jpg" },
  { v: "img:champagne", label: "Champagne Gold", src: "/booking-bg/champagne-gold.jpg" },
  { v: "img:royal-gold", label: "Royal Gold Silk", src: "/booking-bg/royal-gold.jpg" },
];

const SALON_BG_PRESETS = [
  "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80",
  "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=80",
  "https://images.unsplash.com/photo-1600948836101-f9ffda59d250?q=80",
  "https://images.unsplash.com/photo-1633681926022-84c23e8cb2d6?q=80",
];
const RESTO_BG_PRESETS = [
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80",
  "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?q=80",
  "https://images.unsplash.com/photo-1552566626-52f8b828add9?q=80",
  "https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80",
];

const TIME_OPTS = Array.from({ length: 36 }, (_, i) => {
  const m = 6 * 60 + i * 30; // 06:00 → 23:30
  const h = Math.floor(m / 60), mm = m % 60;
  const label = `${(h % 12) || 12}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  return { value: `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`, label };
});
const inputCls = "mt-1 w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200";

function flattenDetail(raw, fallback) {
  if (Array.isArray(raw)) {
    return raw.map((err) => {
      const field = Array.isArray(err.loc) ? err.loc[err.loc.length - 1] : "field";
      const clean = String(err.msg || "").replace(/^Value error,?\s*/i, "");
      return `${field}: ${clean}`;
    }).join(" · ");
  }
  return typeof raw === "string" ? raw : fallback;
}

export function BrandingCard() {
  const [branding, setBranding] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [isResto, setIsResto] = useState(false);
  const [tenantMeta, setTenantMeta] = useState({ name: "", logo_url: "" });

  useEffect(() => {
    api.get("/settings/branding").then(r => {
      if (r.data) setBranding(Object.fromEntries(Object.keys(EMPTY).map(k => [k, r.data[k] || ""])));
    }).catch(() => {});
    api.get("/tenants/current").then(r => {
      setIsResto(r.data?.business_type === "restaurant");
      setTenantMeta({ name: r.data?.name || "", logo_url: r.data?.logo_url || "" });
    }).catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    try {
      const { data } = await api.put("/settings/branding", branding);
      // Re-sync with server-normalized values (e.g. whatsapp digits-only)
      if (data) setBranding(b => Object.fromEntries(Object.keys(EMPTY).map(k => [k, data[k] ?? b[k]])));
      toast.success("Salon Profile saved successfully ✦");
    } catch (e) {
      toast.error(flattenDetail(e?.response?.data?.detail, e?.message || "Couldn't save profile"));
    } finally { setSaving(false); }
  }

  const field = (key) => ({ value: branding[key], onChange: (e) => setBranding(b => ({ ...b, [key]: e.target.value })), className: inputCls });

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm" data-testid="settings-branding-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center">
          <Store className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-800">Salon profile</h2>
          <p className="text-xs text-slate-500 mt-1">
            These details show on your public booking page and review pages. Keep them up to date so customers find you easily.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
        <div className="md:col-span-2">
          <label className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" /> Google review link
          </label>
          <input data-testid="settings-google-review-url" placeholder="https://g.page/r/your-business/review" {...field("google_review_url")} />
          <p className="text-[11px] text-slate-400 mt-1">
            Get this from Google Business Profile → <i>Get more reviews</i> → copy short link. 4★+ customers will see a one-tap CTA to leave you a Google review.
          </p>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500" /> Google Maps location link (main salon)
          </label>
          <input data-testid="settings-maps-url" placeholder="https://maps.app.goo.gl/…" {...field("maps_url")} />
          <p className="text-[11px] text-slate-400 mt-1">
            Open your salon on Google Maps → <i>Share</i> → copy link. Shown as the “Get Directions” button in the <b>Our Locations</b> section of your booking page.
          </p>
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium">Working hours</label>
          <input data-testid="settings-hours" placeholder="Mon–Sun · 10:00 AM – 9:00 PM" {...field("hours")} />
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium">Booking slots — Open & Close time</label>
          <div className="flex gap-2">
            <select data-testid="settings-open-time" {...field("open_time")}>
              {TIME_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select data-testid="settings-close-time" {...field("close_time")}>
              {TIME_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">The public booking page only offers slots inside these hours.</p>
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium">Phone</label>
          <input data-testid="settings-phone" placeholder="+91 98765 00000" {...field("phone")} />
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium">Receptionist number</label>
          <input data-testid="settings-reception-phone" placeholder="+91 98765 11111" {...field("reception_phone")} />
          <p className="text-[10px] text-slate-400 mt-1">Mira connects guests here when they ask for a human.</p>
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium">Manager number</label>
          <input data-testid="settings-manager-phone" placeholder="+91 98765 22222" {...field("manager_phone")} />
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium">Salon email</label>
          <input data-testid="settings-salon-email" type="email" placeholder="yoursalon@gmail.com" {...field("salon_email")} />
          <p className="text-[10px] text-slate-400 mt-1">Attendance sheets & reports are emailed here.</p>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-slate-500 font-medium">Location / Address</label>
          <input data-testid="settings-location" placeholder="Marathahalli, Bangalore" {...field("location")} />
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
            <Instagram className="w-3.5 h-3.5 text-fuchsia-500" /> Instagram URL
          </label>
          <input data-testid="settings-instagram-url" placeholder="https://www.instagram.com/your_handle/" {...field("instagram_url")} />
          <p className="text-[11px] text-slate-400 mt-1">Shown as an icon on your public booking page.</p>
        </div>
        <div>
          <label className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5 text-emerald-500" /> WhatsApp number
          </label>
          <input data-testid="settings-whatsapp-number" placeholder="+91 98765 43210" {...field("whatsapp_number")} />
          <p className="text-[11px] text-slate-400 mt-1">Include country code. Powers the &quot;Chat on WhatsApp&quot; button.</p>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-slate-500 font-medium">Booking page background</label>
          <div className="grid grid-cols-4 gap-2 mt-2 mb-2">
            {(isResto ? RESTO_BG_PRESETS : SALON_BG_PRESETS).map((u, i) => (
              <button key={u} type="button" data-testid={`bg-preset-${i}`}
                onClick={() => setBranding(b => ({ ...b, hero_image: u }))}
                className={`relative h-16 rounded-lg overflow-hidden border-2 transition ${branding.hero_image === u ? "border-fuchsia-500 ring-2 ring-fuchsia-200" : "border-transparent hover:border-slate-300"}`}>
                <img src={`${u}&w=300`} alt="" className="w-full h-full object-cover" loading="lazy" />
                {branding.hero_image === u && <span className="absolute top-1 right-1 bg-fuchsia-500 text-white text-[9px] px-1.5 py-0.5 rounded-full">✓</span>}
              </button>
            ))}
          </div>
          <input data-testid="settings-hero-image" placeholder="https://images.unsplash.com/photo-..." {...field("hero_image")} />
          <p className="text-[11px] text-slate-400 mt-1">Pick a decent preset above, or paste your own image URL. Shows at the top of your public booking page.</p>
          <div className="flex flex-col lg:flex-row gap-6 mt-4">
            <div className="flex-1 min-w-0">
              <label className="text-xs text-slate-500 font-medium block">Logo display shape</label>
              <div className="flex gap-2 mt-2">
                {[{ v: "", label: "✨ Auto (fit any logo)" }, { v: "blend", label: "◇ Blended (no box)" }, { v: "circle", label: "⬤ Circle badge" }, { v: "square", label: "▢ Wide plaque" }].map(s => (
                  <button key={s.v || "auto"} type="button" data-testid={`logo-shape-${s.v || "auto"}`}
                    onClick={() => setBranding(b => ({ ...b, logo_shape: s.v }))}
                    className={`px-4 py-2 rounded-full border text-xs transition ${(branding.logo_shape || "") === s.v ? "border-fuchsia-500 ring-2 ring-fuchsia-200 text-slate-800 font-semibold" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Auto picks the best fit — wide logos get the plaque, round emblems get the circle.</p>
              <label className="text-xs text-slate-500 font-medium block mt-4">Header bar colour</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {HEADER_BG_TONES.map(tn => (
                  <button key={tn.label} type="button" data-testid={`header-bg-${tn.label.replace(/\s/g, "-").toLowerCase()}`}
                    onClick={() => setBranding(b => ({ ...b, header_bg: tn.v }))}
                    className={`flex items-center gap-1.5 pl-1.5 pr-3 py-1.5 rounded-full border text-xs transition ${(branding.header_bg || "") === tn.v ? "border-fuchsia-500 ring-2 ring-fuchsia-200 text-slate-800 font-semibold" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}>
                    <span className="w-5 h-5 rounded-full border border-slate-300 shadow-inner" style={{ background: tn.swatch }} />
                    {tn.label}
                  </button>
                ))}
              </div>
              <label className="text-xs text-slate-500 font-medium block mt-4">Booking page colour tone</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {BOOK_BG_TONES.map(tn => (
                  <button key={tn.label} type="button" data-testid={`book-bg-${tn.label.replace(/\s/g, "-").toLowerCase()}`}
                    onClick={() => setBranding(b => ({ ...b, book_bg: tn.v }))}
                    className={`flex items-center gap-1.5 pl-1.5 pr-3 py-1.5 rounded-full border text-xs transition ${branding.book_bg === tn.v ? "border-fuchsia-500 ring-2 ring-fuchsia-200 text-slate-800 font-semibold" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}>
                    <span className="w-5 h-5 rounded-full border border-white shadow-inner" style={{ background: tn.v || "#141414" }} />
                    {tn.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">All tones keep crisp contrast so customers can read &amp; book easily.</p>
              <label className="text-xs text-slate-500 font-medium block mt-4">Or a signature Miracurl backdrop</label>
              <div className="grid grid-cols-3 gap-2 mt-2 max-w-xl">
                {(isResto ? BOOK_BG_IMAGES_RESTO : BOOK_BG_IMAGES_SALON).map(img => (
                  <button key={img.v} type="button" data-testid={`book-bg-${img.v.replace("img:", "image-")}`}
                    onClick={() => setBranding(b => ({ ...b, book_bg: b.book_bg === img.v ? "" : img.v }))}
                    className={`relative h-20 rounded-lg overflow-hidden border-2 transition ${branding.book_bg === img.v ? "border-fuchsia-500 ring-2 ring-fuchsia-200" : "border-slate-200 hover:border-slate-400"}`}>
                    <img src={img.src} alt={img.label} className="w-full h-full object-cover" loading="lazy" />
                    <span className="absolute bottom-1 left-1.5 text-[10px] font-semibold text-slate-700 bg-white/80 backdrop-blur px-1.5 py-0.5 rounded-full">{img.label}</span>
                    {branding.book_bg === img.v && <span className="absolute top-1 right-1 bg-fuchsia-500 text-white text-[9px] px-1.5 py-0.5 rounded-full">✓</span>}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Elegant Miracurl gradient art — applied with a soft dark veil so text stays perfectly readable. Tap again to unselect.</p>
            </div>
            <div className="lg:w-60 shrink-0 lg:pt-1">
              <BookingPreview bg={branding.book_bg} heroImage={branding.hero_image} name={tenantMeta.name} logoUrl={tenantMeta.logo_url} restaurant={isResto} headerBg={branding.header_bg} logoShape={branding.logo_shape} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-6">
        <button
          data-testid="settings-save-branding-btn"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-semibold text-sm hover:from-violet-600 hover:to-fuchsia-600 shadow-sm disabled:opacity-60"
        >
          <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save profile"}
        </button>
      </div>
    </div>
  );
}
