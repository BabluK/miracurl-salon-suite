import { useState, useEffect, useRef } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/context/AuthContext";
import { GoldSparkles } from "@/components/GoldSparkles";
import { moodChannels, playPayload } from "@/constants/musicChannels";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { MiraAvatar } from "@/components/mira/MiraAvatar";
import { WinbackBlastModal } from "@/components/dashboard/MiraBlast";
import { SpeedPulse } from "@/components/dashboard/SpeedPulse";
import { Quote, Copy, ExternalLink, Sparkles, CalendarClock, UserPlus, Tag, MessageCircle, Calendar, Footprints, Users, Receipt, Crown, ArrowRight, AlertTriangle, Lightbulb, Play, Pause } from "lucide-react";

const QUOTES = [
  ["Beautiful salons create more than looks, they create confidence.", "Mira AI"],
  ["Every guest who leaves smiling is tomorrow's best advertisement.", "Mira AI"],
  ["Small daily follow-ups build the loyal client book you dream of.", "Mira AI"],
  ["Great service is remembered long after the price is forgotten.", "Mira AI"],
];

const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening"; };

export function DashboardHero({ user, tenant, slug, data, bookingUrl, onCopy, inr, loadMs }) {
  const salonUrl = slug ? `${window.location.origin}/salon/${slug}` : "";
  const copySalon = () => navigator.clipboard?.writeText(salonUrl).then(() => toast.success("Salon page link copied ✦")).catch(() => toast.error("Couldn't copy — long-press the link"));
  const [q, by] = QUOTES[new Date().getDate() % QUOTES.length];
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const n = data.today_bookings || 0;
  return (
    <section className="relative overflow-hidden rounded-3xl text-white min-h-[260px] shadow-[0_30px_60px_-30px_rgba(0,0,0,.6)]" data-testid="dashboard-hero">
      <img src="/assets/dashboard/hero-salon.jpg" alt="" className="absolute inset-0 w-full h-full object-cover object-right" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b0a08]/95 via-[#0b0a08]/70 to-[#0b0a08]/25" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0b0a08]/70 via-transparent to-transparent" />
      <GoldSparkles count={44} stars={10} bokeh={14} seed={3} />
      <div className="absolute inset-0 rounded-3xl ring-1 ring-inset ring-[#d4af37]/35 pointer-events-none" />
      <div className="relative p-6 sm:p-8 grid lg:grid-cols-[1.4fr_.8fr] gap-6 items-end">
        <div>
          <div className="font-playfair text-2xl sm:text-3xl text-[#f3e5ab]/90">{greeting()},<SpeedPulse ms={loadMs} /></div>
          <h1 className="font-playfair text-4xl sm:text-5xl lg:text-6xl leading-[1.02] mt-1" data-testid="dashboard-welcome-heading">
            {(user?.name || "Salon Admin").split(" ").slice(0, 2).join(" ")} <span className="text-[#e8c56a]">✦</span>
          </h1>
          <p className="text-white/80 mt-3 text-sm sm:text-base">{today}</p>
          <p className="text-white/75 text-sm sm:text-base" data-testid="hero-today-collection">
            ✦ {n} appointment{n === 1 ? "" : "s"} today · Collection {inr(data.today_revenue)} from {data.today_invoices} bill{data.today_invoices === 1 ? "" : "s"} — Here&apos;s your daily snapshot.
          </p>
          <div className="mt-5 max-w-xl rounded-2xl bg-white/[.06] backdrop-blur-md border border-[#e8c56a]/25 px-5 py-4 flex gap-4" data-testid="hero-quote">
            <Quote className="w-6 h-6 text-[#e8c56a] shrink-0" />
            <div>
              <p className="text-sm sm:text-base text-white/90 italic leading-relaxed">“{q}”</p>
              <p className="text-xs text-white/50 mt-1">— {by}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-4">
          <div className="hidden lg:block font-playfair italic text-4xl xl:text-5xl text-[#e8c56a] leading-[1.15] text-right drop-shadow-[0_6px_20px_rgba(232,197,106,.35)] select-none" style={{ fontStyle: "italic" }}>
            Beauty<br />Grows<br />Confidence <span className="not-italic">♡</span>
          </div>
          <div className="w-full max-w-sm rounded-2xl bg-white/[.08] backdrop-blur-md border border-white/15 p-3" data-testid="booking-link-widget">
            <div className="text-[10px] uppercase tracking-[.22em] text-[#e8c56a] font-semibold mb-1.5">Public booking link</div>
            <div className="flex items-center gap-2">
              <input id="booking-link-input" data-testid="booking-link-url" readOnly value={bookingUrl} onFocus={e => e.target.select()}
                className="flex-1 min-w-0 bg-black/30 rounded-lg px-3 py-2 text-xs font-mono text-white/85 outline-none border border-white/10" />
              <button data-testid="copy-booking-link-btn" onClick={onCopy} className="px-3 py-2 rounded-lg bg-gradient-to-r from-[#e8c56a] to-[#c99a2e] text-[#1a1408] text-xs font-bold inline-flex items-center gap-1 hover:brightness-110"><Copy className="w-3.5 h-3.5" /> Copy</button>
              <a data-testid="open-booking-link-btn" href={bookingUrl} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg bg-white/10 border border-white/15 text-white text-xs font-semibold inline-flex items-center gap-1 hover:bg-white/20"><ExternalLink className="w-3.5 h-3.5" /> Open</a>
            </div>
            <div className="mt-2.5 pt-2.5 border-t border-white/10 flex items-center gap-2" data-testid="salon-page-link-widget">
              <span className="text-[10px] uppercase tracking-[.18em] text-white/55 shrink-0">Salon page</span>
              <span className="flex-1 min-w-0 truncate text-[11px] font-mono text-white/70" data-testid="salon-page-url">{salonUrl}</span>
              <button data-testid="copy-salon-page-btn" onClick={copySalon} className="p-1.5 rounded-md bg-white/10 border border-white/15 text-white hover:bg-white/20" title="Copy salon page link"><Copy className="w-3.5 h-3.5" /></button>
              <a data-testid="open-salon-page-btn" href={salonUrl} target="_blank" rel="noreferrer" className="p-1.5 rounded-md bg-white/10 border border-white/15 text-white hover:bg-white/20" title="Open salon page"><ExternalLink className="w-3.5 h-3.5" /></a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const MIRA_ACTIONS = [
  ["Send reminders", CalendarClock, "/appointments", "mira-act-reminders"],
  ["Re-engage customers", UserPlus, "/customers", "mira-act-reengage"],
  ["Suggest offers", Tag, "/offers-studio", "mira-act-offers"],
  ["Answer queries 24/7", MessageCircle, "/assistant", "mira-act-assistant"],
];

export function MiraAssistantCard({ inactive }) {
  const [blast, setBlast] = useState(false);
  return (
    <section className="relative overflow-hidden rounded-3xl bg-[#0f0e0b] text-white p-6 sm:p-7 border border-[#e8c56a]/20 shadow-[0_30px_60px_-30px_rgba(0,0,0,.7)]" data-testid="mira-assistant-card">
      <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-[#e8c56a]/15 blur-3xl pointer-events-none" />
      <div className="relative grid md:grid-cols-[1fr_auto] gap-6">
        <div>
          <div className="flex items-center gap-5">
            <MiraAvatar size={112} speaking />
            <div>
              <h2 className="font-playfair text-2xl sm:text-3xl leading-tight">Mira AI Assistant</h2>
              <p className="text-white/60 text-sm">Your salon&apos;s smart companion</p>
              <p className="text-[11px] text-[#e8c56a]/80 mt-1 inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Online · watching bookings, stock &amp; guests</p>
            </div>
          </div>
          <div className="mt-5 rounded-2xl bg-white/[.06] border border-[#e8c56a]/20 p-5">
            <p className="font-playfair text-lg sm:text-xl leading-snug text-white/95" data-testid="mira-suggestion-text">
              {inactive > 0 ? <>Would you like me to send follow-ups to <span className="text-[#e8c56a]">{inactive} customers</span> who haven&apos;t visited in 30 days?</> : <>Would you like me to send follow-ups to customers who haven&apos;t visited in 30 days?</>}
            </p>
            <div className="mt-4 flex items-center gap-4 flex-wrap">
              <button onClick={() => setBlast(true)} data-testid="mira-yes-btn" className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#e8c56a] to-[#c99a2e] text-[#1a1408] text-sm font-bold inline-flex items-center gap-2 hover:brightness-110 hover:-translate-y-0.5 transition"><Sparkles className="w-4 h-4" /> Yes, Do It</button>
              <Link to="/assistant" className="text-sm text-white/60 underline underline-offset-4 hover:text-white" data-testid="mira-later-btn">Maybe later</Link>
            </div>
          </div>
        </div>
        <div className="grid gap-2.5 content-start md:w-60">
          {MIRA_ACTIONS.map(([l, Icon, to, tid]) => (
            <Link key={l} to={to} data-testid={tid} className="flex items-center gap-3 rounded-xl bg-white/[.06] border border-white/10 px-4 py-3 text-sm hover:bg-white/[.12] hover:border-[#e8c56a]/40 transition">
              <Icon className="w-4 h-4 text-[#e8c56a]" /> {l}
            </Link>
          ))}
        </div>
      </div>
      {blast && <WinbackBlastModal onClose={() => setBlast(false)} />}
    </section>
  );
}

export function LowStockCard({ items = [], count = 0, sym = "₹" }) {
  return (
    <section className="rounded-3xl bg-gradient-to-br from-rose-50 to-white border border-rose-100 p-5 shadow-sm flex flex-col" data-testid="low-stock-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-playfair text-xl text-slate-900"><AlertTriangle className="w-5 h-5 text-rose-500" /> {count} Product{count === 1 ? "" : "s"} Running Low</div>
          <p className="text-sm text-slate-500 mt-0.5">{count ? "Consider reordering to avoid stockouts." : "Stock levels look healthy."}</p>
        </div>
        <Link to="/inventory" className="text-sm font-semibold text-rose-600 inline-flex items-center gap-1 hover:underline shrink-0" data-testid="low-stock-view-btn">View Inventory <ArrowRight className="w-4 h-4" /></Link>
      </div>
      {items.length > 0 && (
        <div className="mt-4 space-y-2">
          {items.slice(0, 5).map(p => (
            <div key={p.id || p.name} className="flex items-center gap-3 rounded-xl bg-white border border-rose-100 px-3 py-2.5">
              <div className="w-9 h-9 rounded-lg bg-rose-50 overflow-hidden flex items-center justify-center shrink-0">{p.image_url ? <img src={p.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-rose-400 text-xs font-bold">{(p.name || "?")[0]}</span>}</div>
              <div className="flex-1 min-w-0 text-sm font-medium text-slate-800 truncate uppercase tracking-wide">{p.name}</div>
              <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-bold">{p.stock ?? 0} left</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const localHour = (tz) => {
  try { return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: tz || undefined }).format(new Date())) % 24; }
  catch { return new Date().getHours(); }
};
const botGreeting = (tz, name) => {
  const h = localHour(tz);
  const base = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const first = (name || "").trim().split(/\s+/)[0];
  return first ? `${base}, ${first} ✦` : `${base} ✦`;
};

const MOOD_POSE = {
  relaxing: { src: "/assets/dashboard/mira-dj.png", dance: "mira-dance-sway" },
  spa: { src: "/assets/dashboard/mira-spa.png", dance: "mira-dance-float" },
  positive: { src: "/assets/dashboard/mira-energy.png", dance: "mira-dance-jump" },
  bhakti: { src: "/assets/dashboard/mira-pranam.png", dance: "mira-dance-pranam" },
};
export function MiraSuggestsCard() {
  const player = usePlayer();
  const moods = moodChannels();
  const [mood, setMood] = useState(moods[0]?.id);
  const cur = moods.find(m => m.id === mood) || moods[0];
  const playing = player.track && moods.some(m => m.id === player.track.id);
  const anyPlaying = !!player.track;
  const { tenant, user } = useAuth();
  const [greet, setGreet] = useState(false);
  const botRef = useRef(null);
  useEffect(() => {
    // Wave once the bot first scrolls into view (dashboard open), then settle.
    const el = botRef.current; if (!el || !("IntersectionObserver" in window)) { setGreet(true); return; }
    let t; const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { io.disconnect(); setGreet(true); t = setTimeout(() => setGreet(false), 2600); }
    }, { threshold: 0.6 });
    io.observe(el); return () => { io.disconnect(); clearTimeout(t); };
  }, []);
  const waving = greet && !anyPlaying;
  const poseMood = anyPlaying && MOOD_POSE[player.track.id] ? player.track.id : (anyPlaying ? mood : null);
  const pose = MOOD_POSE[poseMood] || MOOD_POSE.relaxing;
  const start = (c) => { setMood(c.id); player.play(playPayload(c, "youtube")); player.setTimer(30); };
  return (
    <section className="relative overflow-hidden rounded-3xl bg-[radial-gradient(120%_140%_at_0%_0%,#fffdf7_0%,#fdf6e6_55%,#f8ecd2_100%)] border border-amber-100 p-5 shadow-sm" data-testid="mira-suggests-card">
      <div className="flex items-start gap-3">
        <span className="w-12 h-12 rounded-full bg-amber-100/80 text-[#c99a2e] flex items-center justify-center shrink-0 shadow-inner"><Lightbulb className="w-6 h-6" strokeWidth={1.6} /></span>
        <div className="min-w-0 flex-1">
          <div className="font-playfair text-2xl text-slate-900 leading-tight">Mira Suggests</div>
          <p className="text-sm text-slate-500 mt-0.5">Start the day with 30 minutes of soothing salon music.</p>
        </div>
        <div ref={botRef} className={`relative shrink-0 w-24 h-24 -mt-2 -mr-2 ${anyPlaying ? `mira-dancing ${pose.dance}` : waving ? "mira-waving" : ""}`} data-testid="mira-dj-bot" data-dancing={anyPlaying ? "true" : "false"} data-waving={waving ? "true" : "false"}>
          {waving && <span className="mira-hi" data-testid="mira-dj-greeting" data-tz={tenant?.timezone || ""}>{botGreeting(tenant?.timezone, user?.name)}</span>}
          {anyPlaying && <>
            <span className="mira-glow" />
            <span className="mira-note n1">♪</span><span className="mira-note n2">♫</span><span className="mira-note n3">♪</span>
          </>}
          <img key={pose.src} src={pose.src} alt="" loading="lazy" data-testid="mira-dj-pose" data-pose={poseMood || "idle"} className={`relative w-full h-full object-contain drop-shadow-[0_10px_18px_rgba(180,140,60,.35)]`} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" data-testid="mira-mood-chips">
        {moods.map(c => {
          const Icon = c.icon; const active = c.id === mood;
          return (
            <button key={c.id} type="button" data-testid={`mira-mood-${c.id}`} onClick={() => start(c)} title={c.desc}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs sm:text-sm font-medium transition-[background-color,border-color] ${active ? "bg-[#f7e7b8] border-[#e8c56a] text-[#6b4f12]" : "bg-white/70 border-amber-100 text-slate-700 hover:border-[#e8c56a]"}`}>
              <Icon className="w-3.5 h-3.5 text-[#c99a2e]" /> {c.label}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="font-playfair italic text-[#8a6d1f] text-xs sm:text-sm border-b-2 border-[#e8c56a] pb-0.5 min-w-0">“Great ambiance creates happier clients.”</p>
        <button type="button" onClick={() => (playing ? player.stop() : start(cur))} data-testid="mira-suggests-play"
          className="shrink-0 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#e8c56a] to-[#c99a2e] text-[#1a1408] text-sm font-bold inline-flex items-center gap-2 shadow-[0_10px_24px_-12px_rgba(201,154,46,.9)] hover:brightness-110 active:scale-[.98] transition-[filter,transform]">
          {playing ? <><Pause className="w-4 h-4" /> Stop</> : <><Play className="w-4 h-4 fill-current" /> Play Now <ArrowRight className="w-4 h-4" /></>}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-slate-400 flex items-center justify-between gap-2"><span>Plays instantly in the mini-player · 30-min timer</span><Link to="/entertainment" className="underline hover:text-[#8a6d1f] shrink-0" data-testid="mira-suggests-more">More channels</Link></p>
    </section>
  );
}

const QUICK = [
  ["New Booking", Calendar, "/appointments", "bg-emerald-50 text-emerald-600", "qa-new-booking"],
  ["Walk-in", Footprints, "/pos", "bg-violet-50 text-violet-600", "qa-walkin"],
  ["Add Customer", Users, "/customers", "bg-sky-50 text-sky-600", "qa-add-customer"],
  ["Create Bill", Receipt, "/pos", "bg-amber-50 text-[#b8893a]", "qa-create-bill"],
];
export function QuickActionsCard() {
  return (
    <section className="rounded-3xl bg-white border border-slate-200/80 p-5 shadow-sm" data-testid="quick-actions-card">
      <div className="flex items-center gap-2 font-playfair text-xl text-slate-900"><span className="w-9 h-9 rounded-xl bg-amber-50 text-[#b8893a] flex items-center justify-center"><Sparkles className="w-4 h-4" /></span> Quick Actions</div>
      <div className="grid grid-cols-2 gap-2.5 mt-4">
        {QUICK.map(([l, Icon, to, tone, tid]) => (
          <Link key={l} to={to} data-testid={tid} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3 text-sm font-medium text-slate-700 hover:border-[#b8893a]/50 hover:bg-amber-50/40 transition">
            <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${tone}`}><Icon className="w-4 h-4" /></span> {l}
          </Link>
        ))}
      </div>
    </section>
  );
}

export function MembershipPromoCard({ resto = false }) {
  if (resto) return null;
  return (
    <section className="relative overflow-hidden rounded-3xl bg-[#0f0e0b] text-white p-6 border border-[#e8c56a]/25 shadow-[0_30px_60px_-30px_rgba(0,0,0,.7)]" data-testid="membership-promo-card">
      <img src="/assets/salon/premium-membership.jpg" alt="" className="absolute inset-0 w-full h-full object-cover object-right opacity-60" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0f0e0b] via-[#0f0e0b]/85 to-transparent" />
      <div className="relative flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
        <div className="min-w-0 md:max-w-[60%]">
          <div className="flex items-center gap-2 text-[#e8c56a]"><Crown className="w-5 h-5" /><span className="text-[10px] uppercase tracking-[.22em] font-semibold">Premium</span></div>
          <h3 className="font-playfair text-2xl leading-tight mt-1">Grow Your Salon with Memberships</h3>
          <p className="text-sm text-white/70 mt-1">Turn first-time visitors into loyal customers — cashback wallets, tier perks and auto-renewals.</p>
        </div>
        <Link to="/plans?tab=memberships" data-testid="membership-promo-btn" className="md:ml-auto shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-[#e8c56a] to-[#c99a2e] text-[#1a1408] text-sm font-bold hover:brightness-110">Create Membership Plan <ArrowRight className="w-4 h-4" /></Link>
      </div>
    </section>
  );
}
