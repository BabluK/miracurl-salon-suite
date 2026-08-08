import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import api from "@/lib/api";
import { SiteHeader } from "@/components/SiteHeader";
import SalesChatWidget from "@/components/SalesChatWidget";

const TYPES = [
  { img: "unisex.jpg", title: "Unisex & Family Salons", desc: "Bookings, POS billing, staff payroll and CRM for busy family salons." },
  { img: "ladies-gents.jpg", title: "Ladies & Gents Salons", desc: "Separate service menus, stylist rosters and loyalty for every guest." },
  { img: "spa.jpg", title: "Spas & Massage Centers", desc: "Room & therapist scheduling, memberships and gift cards that sell themselves." },
  { img: "parlour.jpg", title: "Beauty Parlours", desc: "Simple billing, WhatsApp reminders and repeat-visit nudges for parlours." },
  { img: "boutique.jpg", title: "Boutiques & Designer Studios", desc: "Appointments, fittings, inventory and customer wardrobes in one place." },
  { img: "barber.jpg", title: "Barbershops", desc: "Fast walk-in billing, queue management and barber commissions sorted." },
  { img: "nails.jpg", title: "Nail Studios", desc: "Slot-based bookings, nail-art galleries and deposits for no-show protection." },
  { img: "bridal.jpg", title: "Makeup, Bridal & Mehendi Studios", desc: "Package quotes, advance payments and event-day scheduling made easy." },
  { img: "tattoo.jpg", title: "Tattoo & Piercing Studios", desc: "Consultations, session tracking, consent records and aftercare follow-ups." },
  { img: "wellness.jpg", title: "Wellness, Ayurveda & Skin Clinics", desc: "Treatment courses, therapist calendars and client health notes, organised." },
];

export default function WhoCanUse() {
  const [site, setSite] = useState(null);
  useEffect(() => {
    api.get("/public/site-info").then((r) => setSite(r.data)).catch(() => {});
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen relative overflow-hidden bg-white text-slate-800 font-outfit" data-testid="who-can-use-page">
      <SiteHeader variant="light" site={site} />
      <SalesChatWidget />
      <div className="pointer-events-none absolute -right-32 -top-24 w-[480px] h-[480px] rounded-full opacity-25"
        style={{ background: "radial-gradient(circle at 30% 30%, #f5d78e, #e8918f 55%, transparent 75%)" }} />

      <main className="relative z-10 max-w-6xl mx-auto px-6 sm:px-10 py-14 sm:py-16">
        <span className="text-xs uppercase tracking-[0.25em] text-[#a87e2f] font-semibold">Who Can Use Miracurl Suite</span>
        <h1 className="font-playfair text-4xl sm:text-5xl lg:text-6xl font-light mt-4 text-slate-900">Built for every beauty business</h1>
        <p className="text-slate-600 mt-4 max-w-2xl">One premium suite — bookings, billing, staff, marketing and Mira AI — shaped to fit however you run your business.</p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-7 mt-12">
          {TYPES.map((t) => (
            <div key={t.title} data-testid={`who-card-${t.img.replace('.jpg','')}`}
              className="group rounded-3xl overflow-hidden border border-[#e9d9ae] bg-white shadow-[0_20px_60px_-35px_rgba(184,134,59,0.5)] hover:-translate-y-1 transition-transform">
              <div className="h-44 overflow-hidden">
                <img src={`/assets/who/${t.img}`} alt={t.title} loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              </div>
              <div className="p-5">
                <h3 className="font-playfair text-lg text-slate-900">{t.title}</h3>
                <p className="text-sm text-slate-500 mt-1.5">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-14 text-center">
          <Link to="/signup-salon" data-testid="who-cta-signup"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#1c160c] font-bold hover:brightness-110 transition-all">
            Start your free trial <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="text-xs text-slate-400 mt-3">No card needed · live in 90 seconds</p>
        </div>
      </main>

      <footer className="relative z-10 border-t border-[#e9d9ae]/60 py-8 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} Miracurl Suite · <Link to="/" className="hover:text-slate-700">Home</Link> · <Link to="/contact-us" className="hover:text-slate-700">Contact Us</Link>
      </footer>
    </div>
  );
}
