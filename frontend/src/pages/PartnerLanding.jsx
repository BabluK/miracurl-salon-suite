import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Sparkles, CalendarCheck, ShieldCheck, Bot, Receipt, Users, TrendingUp, Loader2, CheckCircle2, Zap } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const FEATURES = [
  { icon: CalendarCheck, title: "Online Bookings", desc: "Your own 24×7 booking page — guests book, you relax." },
  { icon: Receipt, title: "POS & GST Billing", desc: "Bill in 30 seconds with GST receipts, SMS & thermal print." },
  { icon: ShieldCheck, title: "Staff Verification Portal", desc: "Hire trusted, background-verified staff with one search." },
  { icon: Bot, title: "Mira — AI Marketing Agent", desc: "Daily Instagram posts, win-back emails & WhatsApp offers on autopilot." },
  { icon: Users, title: "CRM & Loyalty", desc: "Loyalty points, birthday offers and full guest history." },
  { icon: TrendingUp, title: "Reports & Multi-branch", desc: "Daily business reports and every branch in one dashboard." },
];

const TIMES = ["Morning (10 AM – 12 PM)", "Afternoon (12 – 4 PM)", "Evening (4 – 8 PM)", "Any time works"];

export default function PartnerLanding() {
  const [form, setForm] = useState({ name: "", phone: "", email: "", salon_name: "", preferred_time: TIMES[3], message: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim() || !form.email.trim()) { toast.error("Name, phone and email are required"); return; }
    setBusy(true);
    try {
      await axios.post(`${API}/api/public/partner-inquiry`, form);
      setDone(true);
    } catch (err) {
      toast.error(err.response?.data?.detail?.[0]?.msg || err.response?.data?.detail || "Couldn't submit — try again");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-[#12121a] text-white" data-testid="partner-landing">
      <div className="max-w-5xl mx-auto px-6 py-14">
        <header className="flex items-center gap-3">
          <img src="/mira-bot.png" alt="Mira" className="w-12 h-12 rounded-full ring-2 ring-amber-300/60" />
          <div>
            <p className="font-semibold tracking-wide text-amber-300">Miracurl Salon Suite</p>
            <p className="text-[11px] text-white/50 uppercase tracking-[3px]">Beauty · Care · You</p>
          </div>
        </header>

        <div className="grid lg:grid-cols-2 gap-10 mt-12 items-start">
          <div>
            <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
              Run your salon on <span className="text-amber-300">autopilot</span> — with Mira, your AI teammate
            </h1>
            <p className="text-white/60 mt-4 text-base">Bookings, billing, verified staff hiring and daily AI marketing — everything one salon needs, in one suite. Trusted by growing salons across India.</p>
            <div className="flex flex-wrap gap-2.5 mt-5" data-testid="partner-trust-badges">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full bg-emerald-400/10 border border-emerald-300/30 text-emerald-300 badge-spark">
                <Zap className="w-3 h-3 badge-spark-icon" /> Loads in under a second — even on 3G
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full bg-amber-300/10 border border-amber-300/30 text-amber-300">
                <ShieldCheck className="w-3 h-3" /> Bank-grade security · Independently audited
              </span>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 mt-8">
              {FEATURES.map(f => (
                <div key={f.title} className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <f.icon className="w-5 h-5 text-amber-300" />
                  <p className="font-semibold text-sm mt-2">{f.title}</p>
                  <p className="text-xs text-white/50 mt-1">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white text-slate-800 rounded-3xl p-7 shadow-2xl lg:sticky lg:top-10" data-testid="partner-form-card">
            {done ? (
              <div className="text-center py-10" data-testid="partner-success">
                <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
                <h2 className="text-lg font-bold mt-4">Thank you, {form.name.split(" ")[0]}! ✦</h2>
                <p className="text-sm text-slate-500 mt-2">The Miracurl Family has received your request.<br />We'll reach out shortly to schedule your personal demo{form.preferred_time !== TIMES[3] ? ` (${form.preferred_time.toLowerCase()})` : ""}.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3.5">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2"><Sparkles className="w-5 h-5 text-fuchsia-500" /> Get a free demo</h2>
                  <p className="text-xs text-slate-500 mt-1">Tell us where to reach you — we'll show you everything on a quick Google Meet call.</p>
                </div>
                <input data-testid="partner-name" value={form.name} onChange={set("name")} placeholder="Your name *"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400" />
                <div className="grid grid-cols-2 gap-3">
                  <input data-testid="partner-phone" value={form.phone} onChange={set("phone")} placeholder="Phone / WhatsApp *" inputMode="tel"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400" />
                  <input data-testid="partner-email" value={form.email} onChange={set("email")} placeholder="Email *" type="email"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400" />
                </div>
                <input data-testid="partner-salon" value={form.salon_name} onChange={set("salon_name")} placeholder="Salon name (optional)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400" />
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1.5">Preferred time for your demo call</p>
                  <select data-testid="partner-time" value={form.preferred_time} onChange={set("preferred_time")}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white text-slate-800">
                    {TIMES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <textarea data-testid="partner-message" value={form.message} onChange={set("message")} rows={2} placeholder="Anything specific you want to see? (optional)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400" />
                <button data-testid="partner-submit" disabled={busy}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-600 text-white font-bold text-sm disabled:opacity-60 inline-flex items-center justify-center gap-2">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {busy ? "Sending…" : "Request my free demo ✦"}
                </button>
                <p className="text-[10px] text-slate-400 text-center">No spam, ever. The Miracurl Family will contact you personally.</p>
              </form>
            )}
          </div>
        </div>

        <footer className="text-center text-white/30 text-xs mt-16 pb-6">© Miracurl Salon Suite — Beauty · Care · You</footer>
      </div>
    </div>
  );
}
