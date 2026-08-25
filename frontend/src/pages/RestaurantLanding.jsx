import { Link } from "react-router-dom";
import { UtensilsCrossed, QrCode, ChefHat, Receipt, CalendarCheck, Sparkles, Bell, TrendingUp, Printer, MessageCircle, ArrowRight, Check } from "lucide-react";

const GOLD = "#DFB78C";

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

export default function RestaurantLanding() {
  return (
    <div className="min-h-screen bg-[#100e0b] text-white" data-testid="restaurant-landing">
      {/* Nav */}
      <nav className="sticky top-0 z-40 backdrop-blur-xl bg-[#100e0b]/80 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5" data-testid="resto-landing-logo">
            <span className="w-9 h-9 rounded-full border flex items-center justify-center text-sm font-bold" style={{ borderColor: GOLD, color: GOLD }}>MS</span>
            <div>
              <p className="font-playfair text-lg leading-none" style={{ color: GOLD }}>Miracurl Suite</p>
              <p className="text-[9px] tracking-[0.3em] uppercase text-white/40 mt-0.5">Restaurant Edition</p>
            </div>
          </Link>
          <div className="flex items-center gap-4 sm:gap-6 text-sm">
            <a href="#features" className="hidden sm:block text-white/60 hover:text-white transition-colors" data-testid="resto-nav-features">Features</a>
            <a href="#pricing" className="hidden sm:block text-white/60 hover:text-white transition-colors" data-testid="resto-nav-pricing">Pricing</a>
            <Link to="/login" className="text-white/60 hover:text-white transition-colors" data-testid="resto-nav-login">Sign In</Link>
            <Link to="/signup-restaurant" data-testid="resto-nav-cta"
              className="px-4 py-2 rounded-full text-[#100e0b] text-xs font-bold transition-transform hover:scale-[1.03]" style={{ background: GOLD }}>
              Start free month
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="max-w-6xl mx-auto px-5 pt-16 sm:pt-24 pb-14">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] tracking-[0.25em] uppercase font-semibold"
            style={{ borderColor: `${GOLD}55`, color: GOLD, background: `${GOLD}11` }}>
            <UtensilsCrossed className="w-3.5 h-3.5" /> First month free · No credit card
          </span>
          <h1 className="font-playfair text-4xl sm:text-5xl lg:text-6xl leading-[1.08] mt-6">
            Your diners order from the table.<br />
            <span style={{ color: GOLD }}>Your kitchen never misses a beat.</span>
          </h1>
          <p className="text-white/55 text-base mt-6 max-w-xl">
            QR table ordering, live kitchen tickets, one-tap table billing, reservations and Mira — your AI
            teammate that paints dish photos, writes menus and runs your marketing.
          </p>
          <div className="flex flex-wrap items-center gap-4 mt-9">
            <Link to="/signup-restaurant" data-testid="resto-hero-cta"
              className="px-7 py-3.5 rounded-full text-[#100e0b] text-sm font-bold inline-flex items-center gap-2 transition-transform hover:scale-[1.03]" style={{ background: GOLD }}>
              Start your free month <ArrowRight className="w-4 h-4" />
            </Link>
            <a href="#how" className="px-6 py-3.5 rounded-full border border-white/15 text-sm text-white/70 hover:text-white hover:border-white/30 transition-colors" data-testid="resto-hero-how">
              See how it works
            </a>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-2 mt-10 text-xs text-white/40">
            <span>✦ Set up in 90 seconds</span>
            <span>✦ Works on any phone — no app for diners</span>
            <span>✦ Cancel anytime</span>
          </div>
        </div>
      </header>

      {/* How it works */}
      <section id="how" className="border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-5 py-16">
          <p className="text-[10px] tracking-[0.3em] uppercase" style={{ color: GOLD }}>How it works</p>
          <h2 className="font-playfair text-lg mt-2">From "we're hungry" to a closed bill — no waiting, no mistakes</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
            {STEPS.map(([emoji, title, sub], i) => (
              <div key={title} className="rounded-2xl border border-white/8 bg-white/[0.03] p-5" data-testid={`resto-step-${i + 1}`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{emoji}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border" style={{ borderColor: `${GOLD}44`, color: GOLD }}>STEP {i + 1}</span>
                </div>
                <p className="font-bold text-sm mt-3">{title}</p>
                <p className="text-white/45 text-xs mt-1.5 leading-relaxed">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-5 py-16">
        <p className="text-[10px] tracking-[0.3em] uppercase" style={{ color: GOLD }}>Everything included</p>
        <h2 className="font-playfair text-lg mt-2">One platform runs the whole restaurant</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
          {FEATURES.map(([Icon, title, sub]) => (
            <div key={title} className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 hover:border-white/20 transition-colors" data-testid={`resto-feature-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
              <Icon className="w-5 h-5" style={{ color: GOLD }} />
              <p className="font-bold text-sm mt-3">{title}</p>
              <p className="text-white/45 text-xs mt-1.5 leading-relaxed">{sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-5 py-16">
          <p className="text-[10px] tracking-[0.3em] uppercase" style={{ color: GOLD }}>Simple pricing</p>
          <h2 className="font-playfair text-lg mt-2">First month FREE — then pick what suits you</h2>
          <div className="grid sm:grid-cols-3 gap-4 mt-8 max-w-3xl">
            {PLANS.map(([label, price, sub, popular]) => (
              <div key={label} data-testid={`resto-plan-${label.replace(/\s/g, "-").toLowerCase()}`}
                className={`rounded-2xl border p-6 ${popular ? "bg-white/[0.05]" : "border-white/8 bg-white/[0.02]"}`}
                style={popular ? { borderColor: `${GOLD}88` } : {}}>
                {popular && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full text-[#100e0b]" style={{ background: GOLD }}>MOST POPULAR</span>}
                <p className={`text-sm font-bold text-white/70 ${popular ? "mt-3" : ""}`}>{label}</p>
                <p className="font-playfair text-3xl mt-1" style={{ color: GOLD }}>{price}</p>
                <p className="text-white/40 text-xs mt-1">{sub}</p>
                <ul className="mt-4 space-y-1.5">
                  {["All features included", "Unlimited orders & tables", "Mira AI included"].map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs text-white/55"><Check className="w-3 h-3" style={{ color: GOLD }} /> {f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-white/35 text-xs mt-5">International: $299 / 3 months · $549 / 6 months · $999 / year (billed in USD).</p>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-5 py-20 text-center">
        <h2 className="font-playfair text-3xl sm:text-4xl">Ready to serve smarter?</h2>
        <p className="text-white/50 text-sm mt-3">Set up your menu and table QRs tonight — take orders tomorrow.</p>
        <Link to="/signup-restaurant" data-testid="resto-bottom-cta"
          className="inline-flex items-center gap-2 mt-8 px-8 py-4 rounded-full text-[#100e0b] text-sm font-bold transition-transform hover:scale-[1.03]" style={{ background: GOLD }}>
          Start your free month <ArrowRight className="w-4 h-4" />
        </Link>
        <p className="text-white/30 text-xs mt-10 pb-4">
          Miracurl Suite · <Link to="/" className="underline hover:text-white/60">For Salons</Link> · <Link to="/contact-us" className="underline hover:text-white/60">Contact us</Link>
        </p>
      </section>
    </div>
  );
}
