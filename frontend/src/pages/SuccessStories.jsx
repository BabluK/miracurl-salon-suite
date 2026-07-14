import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Sparkles, Star, CalendarCheck, Users, Store, Send, Loader2, CheckCircle2, Wallet, Megaphone, Bot } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const STORIES = [
  {
    icon: Megaphone,
    title: "Offers that post themselves",
    body: "Mira designs a fresh day-offer every morning — glamour poster, caption and all — and publishes it to Google, Instagram and Facebook the moment the owner approves. Marketing that used to take an evening now takes one tap.",
    tag: "AI Marketing",
  },
  {
    icon: Star,
    title: "Reviews on autopilot",
    body: "Three hours after every visit, guests get a personal rating link. Happy guests are guided to Google with a ready-written review; unhappy ones reach the owner privately — protecting the salon's public rating while fixing real issues.",
    tag: "Reputation",
  },
  {
    icon: Wallet,
    title: "Prepaid wallets that lock in loyalty",
    body: "Salons sell top-up wallets and memberships; guests check their balance right on the booking page. Prepaid money means guests come back — and revenue arrives before the appointment does.",
    tag: "Revenue",
  },
  {
    icon: Bot,
    title: "A front desk that never sleeps",
    body: "24/7 online booking with live slot availability, automated confirmations, staff leaderboards, POS billing, inventory and payroll — one suite replaces five tools and a notebook.",
    tag: "Operations",
  },
];

export default function SuccessStories() {
  const [stats, setStats] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [form, setForm] = useState({ name: "", phone: "", email: "", salon_name: "", city: "" });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    axios.get(`${BACKEND_URL}/api/public/success-stats`).then(r => setStats(r.data)).catch(() => {});
    axios.get(`${BACKEND_URL}/api/public/reviews/featured?limit=6`).then(r => setReviews(r.data || [])).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!/^[A-Za-z][A-Za-z .'-]{1,}$/.test(form.name.trim())) { toast.error("Name should contain only letters"); return; }
    if (!/^[6-9]\d{9}$/.test(form.phone.trim())) { toast.error("Enter a valid 10-digit mobile number"); return; }
    setBusy(true);
    try {
      await axios.post(`${BACKEND_URL}/api/public/demo-request`, {
        ...form, email: form.email.trim() || null, salon_name: form.salon_name.trim() || null,
        city: form.city.trim() || null, source: "success_stories",
      });
      setSent(true);
    } catch (err) {
      toast.error(err.response?.data?.detail?.[0]?.msg || err.response?.data?.detail || "Couldn't send — try again");
    } finally { setBusy(false); }
  };

  const statItems = stats ? [
    { icon: Store, label: "Salons on Miracurl", value: `${stats.salons}+` },
    { icon: CalendarCheck, label: "Bookings managed", value: stats.bookings.toLocaleString("en-IN") },
    { icon: Users, label: "Guests delighted", value: stats.customers.toLocaleString("en-IN") },
    { icon: Star, label: "Average guest rating", value: `${stats.avg_rating} ★` },
  ] : [];

  return (
    <div className="min-h-screen bg-[#141118] text-white" data-testid="success-stories-page">
      <nav className="flex items-center justify-between px-6 sm:px-12 py-5 border-b border-white/5">
        <Link to="/" className="font-playfair text-2xl text-amber-200">Miracurl <span className="text-white/40 text-sm font-sans">Salon Suite</span></Link>
        <a href="#demo" data-testid="stories-nav-demo-btn" className="px-5 py-2 rounded-full bg-gradient-to-r from-amber-300 to-rose-200 text-[#17141c] text-sm font-semibold hover:opacity-90">Book a free demo</a>
      </nav>

      <header className="px-6 sm:px-12 pt-16 pb-12 max-w-5xl">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-amber-200/80 mb-5"><Sparkles className="w-4 h-4" /> Success stories</div>
        <h1 className="font-playfair text-4xl sm:text-5xl lg:text-6xl leading-tight">Salons that stopped managing<br />and started <span className="text-amber-200">growing</span>.</h1>
        <p className="text-white/60 mt-5 max-w-2xl text-base">Real numbers from salons running on Miracurl — AI marketing, 24/7 bookings, wallets, reviews and payroll, all in one place.</p>
      </header>

      {stats && (
        <section className="px-6 sm:px-12 pb-14" data-testid="stories-stats-band">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl">
            {statItems.map(s => (
              <div key={s.label} className="rounded-2xl bg-white/[0.04] border border-white/10 p-5">
                <s.icon className="w-5 h-5 text-amber-200 mb-3" />
                <div className="text-3xl font-semibold">{s.value}</div>
                <div className="text-xs text-white/50 mt-1 uppercase tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="px-6 sm:px-12 pb-16">
        <h2 className="font-playfair text-lg text-white/80 mb-6">How salons win with Miracurl</h2>
        <div className="grid md:grid-cols-2 gap-5 max-w-5xl">
          {STORIES.map(s => (
            <div key={s.title} className="rounded-2xl bg-white/[0.04] border border-white/10 p-6 hover:border-amber-200/30 transition-colors">
              <div className="flex items-center justify-between">
                <s.icon className="w-6 h-6 text-amber-200" />
                <span className="text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full bg-amber-200/10 text-amber-200/90 border border-amber-200/20">{s.tag}</span>
              </div>
              <h3 className="font-playfair text-2xl mt-4">{s.title}</h3>
              <p className="text-sm text-white/55 mt-2 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {reviews.length > 0 && (
        <section className="px-6 sm:px-12 pb-16" data-testid="stories-reviews">
          <h2 className="font-playfair text-lg text-white/80 mb-6">What guests say at Miracurl salons</h2>
          <div className="flex gap-4 overflow-x-auto no-scrollbar max-w-full pb-2">
            {reviews.map((r, i) => (
              <div key={i} className="min-w-[280px] max-w-[320px] rounded-2xl bg-white/[0.04] border border-white/10 p-5">
                <div className="flex gap-0.5 mb-2">{Array.from({ length: r.rating }).map((_, j) => <Star key={j} className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />)}</div>
                <p className="text-sm text-white/70 leading-relaxed">"{(r.comment || "Wonderful experience!").slice(0, 160)}"</p>
                <div className="text-xs text-amber-200/70 mt-3">— {r.customer_name || "A happy guest"}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section id="demo" className="px-6 sm:px-12 pb-20">
        <div className="max-w-2xl rounded-3xl bg-gradient-to-br from-amber-200/10 to-rose-200/5 border border-amber-200/20 p-8">
          {sent ? (
            <div className="text-center py-8" data-testid="demo-request-success">
              <CheckCircle2 className="w-12 h-12 text-emerald-300 mx-auto mb-4" />
              <h3 className="font-playfair text-3xl">You're on the list ✦</h3>
              <p className="text-white/60 mt-2 text-sm">Our team will call you within a few hours to set up your personal demo.</p>
              <Link to="/" className="inline-block mt-6 text-amber-200 text-sm hover:underline">← Back to Miracurl</Link>
            </div>
          ) : (
            <>
              <h3 className="font-playfair text-3xl">See it live for your salon</h3>
              <p className="text-white/55 text-sm mt-2 mb-6">A 20-minute demo, your data, no commitment. Free 14-day trial included.</p>
              <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3">
                <input data-testid="demo-form-name" required placeholder="Your name *" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value.replace(/[^A-Za-z .'-]/g, "") })} maxLength={80}
                  className="bg-black/30 border border-white/15 rounded-xl px-4 py-3 text-sm placeholder-white/30 focus:outline-none focus:border-amber-200/50" />
                <input data-testid="demo-form-phone" required placeholder="10-digit mobile *" inputMode="numeric" value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} maxLength={10}
                  className="bg-black/30 border border-white/15 rounded-xl px-4 py-3 text-sm placeholder-white/30 focus:outline-none focus:border-amber-200/50" />
                <input data-testid="demo-form-email" type="email" placeholder="Email (optional)" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="bg-black/30 border border-white/15 rounded-xl px-4 py-3 text-sm placeholder-white/30 focus:outline-none focus:border-amber-200/50" />
                <input data-testid="demo-form-salon" placeholder="Salon name (optional)" value={form.salon_name} maxLength={100}
                  onChange={e => setForm({ ...form, salon_name: e.target.value })}
                  className="bg-black/30 border border-white/15 rounded-xl px-4 py-3 text-sm placeholder-white/30 focus:outline-none focus:border-amber-200/50" />
                <input data-testid="demo-form-city" placeholder="City (optional)" value={form.city} maxLength={60}
                  onChange={e => setForm({ ...form, city: e.target.value })}
                  className="bg-black/30 border border-white/15 rounded-xl px-4 py-3 text-sm placeholder-white/30 focus:outline-none focus:border-amber-200/50" />
                <button type="submit" disabled={busy} data-testid="demo-form-submit"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-300 to-rose-200 text-[#17141c] text-sm font-semibold py-3 hover:opacity-90 disabled:opacity-50">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Request my free demo
                </button>
              </form>
            </>
          )}
        </div>
      </section>

      <footer className="px-6 sm:px-12 py-8 border-t border-white/5 text-xs text-white/35">
        © Miracurl Salon Suite · Crafted with care in Marathahalli · <Link to="/" className="text-amber-200/70 hover:underline">miracurl-suite.com</Link>
      </footer>
    </div>
  );
}
