import { Link } from "react-router-dom";
import { SiteHeader } from "@/components/SiteHeader";
import { UtensilsCrossed, QrCode, ChefHat, Receipt, CalendarCheck, Sparkles, Bell, TrendingUp, Printer, MessageCircle, ArrowRight, Check } from "lucide-react";

const HERO_IMG = "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/ad3e4226d2d8cc2e72aaed1a5d03aec5a372f32668c561f2ec3f11a02fb237c7.jpeg";
const DISHES = [
  ["https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/0f1e2e44e3637ba21048427727e31a1c7db42360b50fb9259bc711ceeaf69230.jpeg", "Paneer Tikka", "veg", "₹289", "Charred, smoky cubes with mint chutney"],
  ["https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/3f976ea1847bc37c7a6e3a604b6a323d26e421fd3bbc964bbfbbf5aca2baca16.jpeg", "Chicken Biryani", "non-veg", "₹349", "Saffron rice, slow-cooked in a copper handi"],
  ["https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/806f8a030c9dafc9c58d70e058260c0fdb1ec79f90177d849d1c6e208e002bb0.jpeg", "Gulab Jamun", "veg", "₹149", "Warm, syrup-soaked with pistachio & rose"],
];

const STEPS = [
  ["📱", "Diner scans the table QR", "Menu opens instantly — photos, veg & spice tags, today's specials"],
  ["🛎️", "Orders in seconds", "No app, no waiter needed — extra rounds keep adding to the same table"],
  ["🔥", "Kitchen gets a live ticket", "Chime + dish list + table number; diners see 'Cooking now' on their phone"],
  ["🧾", "One tap bills the table", "Every order merges into ONE GST bill — table resets for the next guest"],
];

const FEATURES = [
  [QrCode, "QR Table Ordering", "Diners scan, browse and order straight to the kitchen — with best-seller badges and category specials."],
  [ChefHat, "Live Kitchen Tickets", "Every order lands with a chime. Live Tables panel shows each table's running total and ready-to-bill status."],
  [Receipt, "Table-wise Billing & GST", "All of a table's orders merge into one bill. Guest auto-set, one tap to close with a GST receipt."],
  [CalendarCheck, "Table Reservations", "Guests reserve online with party size and seating choice — and can pre-pick dishes before they arrive."],
  [Sparkles, "Mira — AI Menu Studio", "AI paints appetizing photos and writes mouth-watering descriptions for every dish in one batch."],
  [Bell, "Waiter Call & Live Status", "Diners tap 'Call waiter' or 'Water please'; their phone shows Order received → Cooking → Served, live."],
  [TrendingUp, "Insights & Sold-out Control", "Best-selling dishes, busiest tables and one-tap sold-out toggles that auto-reset at midnight."],
  [Printer, "Table QR Posters", "Download printable table-tent posters — your logo, table number and order QR for every table."],
  [MessageCircle, "WhatsApp Marketing", "Review requests, offers and win-back campaigns straight to your diners' WhatsApp."],
];

const PLANS = [
  ["3 Months", "₹3,000", "Perfect to try everything", false],
  ["6 Months", "₹6,000", "Most popular with owners", true],
  ["1 Year", "₹12,000", "Best value — save the most", false],
];

const VegDot = ({ type }) => (
  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${type === "veg" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-rose-300 bg-rose-50 text-rose-700"}`}>
    <span className={`w-2 h-2 rounded-full ${type === "veg" ? "bg-emerald-500" : "bg-rose-500"}`} />
    {type === "veg" ? "VEG" : "NON-VEG"}
  </span>
);

export default function RestaurantLanding() {
  return (
    <div className="min-h-screen bg-[#fdf9f4] text-slate-800 relative overflow-hidden" data-testid="restaurant-landing">
      {/* soft gradient blobs like the staff verification page */}
      <div className="pointer-events-none absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full bg-gradient-to-br from-amber-200/60 via-rose-200/50 to-transparent blur-3xl" />
      <div className="pointer-events-none absolute top-[40%] -left-40 w-[420px] h-[420px] rounded-full bg-gradient-to-tr from-rose-100/60 via-amber-100/50 to-transparent blur-3xl" />

      {/* Shared branded header — same as the Products page (gold MS logo, light variant) */}
      <SiteHeader variant="light" subtitle="Smart Restaurant Management Software" signupTo="/signup-restaurant" />

      {/* Hero */}
      <header className="max-w-6xl mx-auto px-5 pt-14 sm:pt-20 pb-14 relative">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-rose-100 to-amber-100 border border-amber-200 text-[10px] tracking-[0.25em] uppercase font-bold text-amber-700">
              <UtensilsCrossed className="w-3.5 h-3.5" /> Miracurl Restaurant Suite
            </span>
            <h1 className="font-playfair text-4xl sm:text-5xl lg:text-6xl leading-[1.08] mt-5">
              Your diners order from the table.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-rose-500">Your kitchen never misses a beat.</span>
            </h1>
            <p className="text-slate-500 text-base mt-5 max-w-xl">
              QR table ordering, live kitchen tickets, one-tap table billing, reservations and Mira — your AI
              teammate that paints dish photos, writes menus and runs your marketing.
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-8">
              <Link to="/signup-restaurant" data-testid="resto-hero-cta"
                className="px-7 py-3.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-bold inline-flex items-center gap-2 shadow-lg shadow-amber-200 transition-transform hover:scale-[1.03]">
                Start your free month <ArrowRight className="w-4 h-4" />
              </Link>
              <a href="#how" className="px-6 py-3.5 rounded-full border border-slate-300 text-sm text-slate-600 hover:border-slate-500 transition-colors" data-testid="resto-hero-how">
                See how it works
              </a>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-2 mt-8 text-xs text-slate-400">
              <span>✦ First month FREE</span>
              <span>✦ No app for diners</span>
              <span>✦ Cancel anytime</span>
            </div>
          </div>
          <div className="relative">
            <img src={HERO_IMG} alt="Diners ordering with QR at a restaurant table" data-testid="resto-hero-image"
              className="rounded-3xl shadow-2xl shadow-amber-200/60 border-4 border-white w-full object-cover aspect-[3/2]" />
            <div className="absolute -bottom-5 -left-4 sm:left-6 bg-white rounded-2xl shadow-xl border border-amber-100 px-4 py-3 flex items-center gap-3">
              <span className="text-2xl">🔔</span>
              <div>
                <p className="text-xs font-bold text-slate-800">Table 3 has an order</p>
                <p className="text-[10px] text-slate-400">2× Chicken Biryani · 1× Paneer Tikka — ₹987</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Dish showcase — veg / non-veg */}
      <section className="max-w-6xl mx-auto px-5 pb-4 relative">
        <p className="text-[10px] tracking-[0.3em] uppercase font-bold text-amber-600">Your menu, beautifully served</p>
        <h2 className="font-playfair text-lg mt-2 text-slate-700">Dishes look this good on every diner's phone — veg & non-veg tagged</h2>
        <div className="grid sm:grid-cols-3 gap-5 mt-6">
          {DISHES.map(([img, name, type, price, sub]) => (
            <div key={name} className="bg-white rounded-3xl border border-amber-100 shadow-lg shadow-amber-100/50 overflow-hidden hover:-translate-y-1 transition-transform" data-testid={`resto-dish-${name.toLowerCase().replace(/\s/g, "-")}`}>
              <img src={img} alt={name} className="w-full aspect-[4/3] object-cover" loading="lazy" />
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-sm text-slate-800">{name}</p>
                  <VegDot type={type} />
                </div>
                <p className="text-xs text-slate-400 mt-1">{sub}</p>
                <div className="flex items-center justify-between mt-3">
                  <span className="font-bold text-amber-600">{price}</span>
                  <span className="text-[10px] font-bold px-3 py-1.5 rounded-full bg-slate-900 text-white">+ ADD</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="max-w-6xl mx-auto px-5 py-16 relative">
        <p className="text-[10px] tracking-[0.3em] uppercase font-bold text-amber-600">How it works</p>
        <h2 className="font-playfair text-lg mt-2 text-slate-700">From "we're hungry" to a closed bill — no waiting, no mistakes</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
          {STEPS.map(([emoji, title, sub], i) => (
            <div key={title} className="rounded-2xl bg-white border border-amber-100 shadow-sm p-5" data-testid={`resto-step-${i + 1}`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{emoji}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">STEP {i + 1}</span>
              </div>
              <p className="font-bold text-sm mt-3 text-slate-800">{title}</p>
              <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">{sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-white/70 border-y border-amber-100 relative">
        <div className="max-w-6xl mx-auto px-5 py-16">
          <p className="text-[10px] tracking-[0.3em] uppercase font-bold text-amber-600">Everything included</p>
          <h2 className="font-playfair text-lg mt-2 text-slate-700">One platform runs the whole restaurant</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
            {FEATURES.map(([Icon, title, sub]) => (
              <div key={title} className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5 hover:border-amber-300 hover:shadow-md transition-all" data-testid={`resto-feature-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
                <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-100 to-rose-100 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-amber-600" />
                </span>
                <p className="font-bold text-sm mt-3 text-slate-800">{title}</p>
                <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-5 py-16 relative">
        <p className="text-[10px] tracking-[0.3em] uppercase font-bold text-amber-600">Simple pricing</p>
        <h2 className="font-playfair text-lg mt-2 text-slate-700">First month FREE — then pick what suits you</h2>
        <div className="grid sm:grid-cols-3 gap-4 mt-8 max-w-3xl">
          {PLANS.map(([label, price, sub, popular]) => (
            <div key={label} data-testid={`resto-plan-${label.replace(/\s/g, "-").toLowerCase()}`}
              className={`rounded-2xl border p-6 bg-white shadow-sm ${popular ? "border-amber-400 ring-2 ring-amber-200 shadow-lg" : "border-slate-200"}`}>
              {popular && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white">MOST POPULAR</span>}
              <p className={`text-sm font-bold text-slate-500 ${popular ? "mt-3" : ""}`}>{label}</p>
              <p className="font-playfair text-3xl mt-1 text-amber-600">{price}</p>
              <p className="text-slate-400 text-xs mt-1">{sub}</p>
              <ul className="mt-4 space-y-1.5">
                {["All features included", "Unlimited orders & tables", "Mira AI included"].map(f => (
                  <li key={f} className="flex items-center gap-2 text-xs text-slate-500"><Check className="w-3 h-3 text-emerald-500" /> {f}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-slate-400 text-xs mt-5">International: $299 / 3 months · $549 / 6 months · $999 / year (billed in USD).</p>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-5 py-16 text-center relative">
        <h2 className="font-playfair text-3xl sm:text-4xl text-slate-800">Ready to serve smarter?</h2>
        <p className="text-slate-500 text-sm mt-3">Set up your menu and table QRs tonight — take orders tomorrow.</p>
        <Link to="/signup-restaurant" data-testid="resto-bottom-cta"
          className="inline-flex items-center gap-2 mt-8 px-8 py-4 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-bold shadow-lg shadow-amber-200 transition-transform hover:scale-[1.03]">
          Start your free month <ArrowRight className="w-4 h-4" />
        </Link>
        <p className="text-slate-400 text-xs mt-10 pb-4">
          Miracurl Suite · <Link to="/" className="underline hover:text-slate-600">For Salons</Link> · <Link to="/contact-us" className="underline hover:text-slate-600">Contact us</Link>
        </p>
      </section>
    </div>
  );
}
