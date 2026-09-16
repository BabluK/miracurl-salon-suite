import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import api from "@/lib/api";
import { noticeCountdown } from "@/lib/noticeCountdown";
import {
  Camera, Wallet, Smartphone, CreditCard, CalendarDays, Receipt, ChevronRight,
  ArrowUp, ArrowDown, Minus, Landmark, Copy, Hourglass, FileSignature, ArrowRight,
} from "lucide-react";

const inr = (n) => `₹${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;

export function StaffHero({ profile, quote, onUploadPhoto }) {
  const h = new Date().getHours();
  const greet = h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening";
  const first = profile.name?.split(" ")[0];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gold/40 min-h-[170px]" data-testid="staff-hero">
      <img src="/assets/dashboard/hero-salon.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/40" />
      <div className="relative flex items-center gap-5 p-5 sm:p-7">
        <div className="relative shrink-0">
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full p-[3px] bg-gradient-to-br from-gold via-[#f6e27a] to-gold-muted">
            <img
              src={profile.image_url || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300"}
              alt={profile.name}
              className="w-full h-full rounded-full object-cover border-2 border-black"
            />
          </div>
          <label data-testid="staff-photo-upload-label" title="Change photo — shows on the booking page & admin portal"
            className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-gold text-black flex items-center justify-center cursor-pointer hover:bg-gold-hover border-2 border-black">
            <Camera className="w-4 h-4" />
            <input data-testid="staff-photo-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={onUploadPhoto} />
          </label>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-gold/90 text-sm flex items-center gap-1.5">☀️ {greet},</div>
          <div className="font-playfair text-3xl sm:text-4xl text-white leading-tight truncate" data-testid="staff-portal-greeting">{first}</div>
          <div className="text-white/70 text-sm mt-0.5">{profile.role}{profile.specialties?.length ? `, ${profile.specialties.slice(0, 2).join(", ")}` : ""}</div>
          <div className="text-gold/80 text-xs sm:text-sm mt-2 italic truncate" data-testid="staff-motivation-line">“{quote}”</div>
        </div>
        <div className="hidden lg:block shrink-0 pr-4 text-right select-none" aria-hidden>
          <div className="text-gold/90 text-2xl leading-[1.15] -rotate-6" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>
            Beautiful<br />People<br />Brighter Days
          </div>
          <div className="text-gold/70 text-2xl -mt-1">♡</div>
        </div>
      </div>
    </div>
  );
}

const KPI = [
  { key: "cash", label: "Total Cash", icon: Wallet, tint: "from-[#3a2e10] to-[#1d1708] border-gold/40", ring: "bg-gold/20 text-gold", money: true },
  { key: "upi", label: "UPI Collection", icon: Smartphone, tint: "from-emerald-950 to-[#0b1a12] border-emerald-500/40", ring: "bg-emerald-500/20 text-emerald-300", money: true },
  { key: "card", label: "Card Collection", icon: CreditCard, tint: "from-violet-950 to-[#14101f] border-violet-500/40", ring: "bg-violet-500/20 text-violet-300", money: true },
  { key: "bookings", label: "Total Bookings", icon: CalendarDays, tint: "from-blue-950 to-[#0b1220] border-blue-500/40", ring: "bg-blue-500/20 text-blue-300" },
  { key: "bills", label: "Total Bills", icon: Receipt, tint: "from-[#3a2210] to-[#1d1108] border-orange-500/40", ring: "bg-orange-500/20 text-orange-300" },
];

function delta(cur, prev) {
  if (!prev) return cur > 0 ? { pct: 100, dir: 1 } : { pct: 0, dir: 0 };
  const p = Math.round(((cur - prev) / prev) * 100);
  return { pct: Math.abs(p), dir: p > 0 ? 1 : p < 0 ? -1 : 0 };
}

export function SalonKpiStrip({ refreshKey }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => api.get("/staff/me/salon-today").then(r => alive && setD(r.data)).catch(() => {});
    load();
    const id = setInterval(load, 120000);
    return () => { alive = false; clearInterval(id); };
  }, [refreshKey]);
  const t = d?.today || {}; const y = d?.yesterday || {};
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3" data-testid="salon-kpi-strip">
      {KPI.map(k => {
        const Icon = k.icon; const cur = t[k.key] || 0; const dl = delta(cur, y[k.key] || 0);
        return (
          <div key={k.key} className={`rounded-2xl border bg-gradient-to-b ${k.tint} p-3 sm:p-4 flex gap-2.5 sm:gap-3`} data-testid={`kpi-${k.key}`}>
            <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full ${k.ring} flex items-center justify-center shrink-0`}><Icon className="w-4 h-4 sm:w-5 sm:h-5" /></div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1 text-white/80 text-xs sm:text-sm font-medium"><span className="truncate">{k.label}</span><ChevronRight className="w-4 h-4 text-white/40 shrink-0" /></div>
              <div className="font-playfair text-2xl text-white mt-0.5" data-testid={`kpi-${k.key}-value`}>{d ? (k.money ? inr(cur) : cur) : "—"}</div>
              {k.key === "cash" ? (
                <div className="text-[11px] text-white/50 mt-1 whitespace-nowrap">UPI {inr(t.upi)} · Card {inr(t.card)}</div>
              ) : (
                <div className={`text-[11px] mt-1 flex items-center gap-1 whitespace-nowrap ${dl.dir > 0 ? "text-emerald-300" : dl.dir < 0 ? "text-rose-300" : "text-white/40"}`}>
                  {dl.dir > 0 ? <ArrowUp className="w-3 h-3" /> : dl.dir < 0 ? <ArrowDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                  {dl.pct}% <span className="text-white/40">vs yest.</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const mask = (n) => { const s = String(n || ""); return s.length > 4 ? `XXXX XXXX ${s.slice(-4)}` : s || "—"; };

export function BankDetailsCard({ bank }) {
  const b = bank || {};
  const copy = async (label, v) => {
    if (!v) return;
    try { await navigator.clipboard.writeText(String(v)); toast.success(`${label} copied`); } catch { toast.error("Couldn't copy"); }
  };
  const rows = [
    ["Bank Name", b.bank_name, b.bank_name],
    ["Account Number", mask(b.account_number), b.account_number],
    ["IFSC Code", b.ifsc, b.ifsc],
    ["Account Holder", b.account_holder, b.account_holder],
  ];
  const empty = !b.bank_name && !b.ifsc && !b.account_holder && !b.account_number;
  return (
    <div className="rounded-2xl bg-[#0F0F0F] border border-white/10 p-5" data-testid="bank-details-card">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gold/15 text-gold flex items-center justify-center"><Landmark className="w-5 h-5" /></div>
          <div className="font-playfair text-lg text-white">Bank Details</div>
        </div>
        <Link to="/bank-details" data-testid="bank-view-edit" className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-gold/40 text-gold hover:bg-gold/10">View / Edit <ArrowRight className="w-3.5 h-3.5" /></Link>
      </div>
      {empty ? (
        <div className="text-sm text-white/50 py-6 text-center">No bank details yet — add them so your salary reaches the right account.</div>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-hidden divide-y divide-white/10">
          {rows.map(([label, shown, raw]) => (
            <div key={label} className="grid grid-cols-[150px_1fr_auto] items-center text-sm">
              <div className="px-3 py-2.5 text-white/50 bg-white/[0.03] border-r border-white/10">{label}</div>
              <div className="px-3 py-2.5 text-white/90 truncate" data-testid={`bank-row-${label.toLowerCase().replace(/\s/g, "-")}`}>{shown || "—"}</div>
              <button onClick={() => copy(label, raw)} disabled={!raw} className="px-3 py-2.5 text-white/40 hover:text-gold disabled:opacity-30" title={`Copy ${label}`}><Copy className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function NoticePeriodCard({ profile }) {
  const serving = !!profile.serving_notice;
  const cd = serving ? noticeCountdown(profile.last_working_day) : null;
  const red = cd?.urgent;
  return (
    <div className={`rounded-2xl border p-5 flex flex-col md:flex-row md:items-center gap-4 ${serving ? (red ? "bg-rose-950/30 border-rose-500/40" : "bg-[#1d1708] border-gold/40") : "bg-[#0F0F0F] border-white/10"}`} data-testid="notice-period-card">
      <div className={`w-16 h-16 rounded-full flex items-center justify-center shrink-0 ${serving ? "bg-gold/20 text-gold" : "bg-gold/15 text-gold"}`}>
        {serving ? <Hourglass className="w-7 h-7" /> : <FileSignature className="w-7 h-7" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-playfair text-xl text-white">Serve Notice Period</div>
        <div className="text-sm text-white/60 mt-0.5" data-testid="notice-period-status">
          {serving
            ? `You're serving notice${profile.last_working_day ? ` — last working day ${new Date(`${profile.last_working_day}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}` : ""}. Thank you for everything you've given the team.`
            : "Not serving notice. Planning to move on? Submit your resignation here — your last working day is set automatically from your notice period."}
        </div>
      </div>
      {serving && cd && (
        <div className={`rounded-xl border px-5 py-3 text-center shrink-0 ${red ? "bg-rose-500/15 border-rose-400/40 text-rose-200" : "bg-gold/10 border-gold/40 text-gold"}`} data-testid="notice-period-countdown">
          <div className="text-3xl font-bold leading-none">{Math.max(0, cd.days)}</div>
          <div className="text-[10px] uppercase tracking-widest mt-1">{cd.days <= 0 ? cd.label : "days left"}</div>
        </div>
      )}
      <Link to="/notice-period" data-testid="notice-period-link"
        className={`inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold shrink-0 ${serving ? "border border-gold/40 text-gold hover:bg-gold/10" : "bg-gradient-to-r from-gold to-blush text-bg-base hover:opacity-90"}`}>
        {serving ? "View details" : "Start notice period"} <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
