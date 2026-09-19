import { useState } from "react";
import { UtensilsCrossed, Loader2, Bell, RotateCcw, Zap, ConciergeBell, Heart, ChevronDown, ArrowRight, Crown, ChevronRight, Users, Star } from "lucide-react";
import { thumbUrl } from "@/lib/api";

const normPhone = (p) => { let d = (p || "").replace(/\D/g, ""); if (d.length > 10) d = d.slice(-10); return d; };
export const isValidPhone = (p) => /^[6-9]\d{9}$/.test(normPhone(p));

const FEATURES = [[Zap, "Quick Ordering"], [ConciergeBell, "Freshly Prepared"], [Heart, "Great Taste"]];
const FEATURES_BACK = [[ConciergeBell, "Delicious Food"], [Heart, "Family Friendly"], [Users, "Great Ambience"], [Star, "Happy Guests"]];

/** First screen after a table-QR scan: mobile → (name for new guests) → welcome back / proceed. */
export function WelcomeGate({ salon, table, phone, setPhone, name, setName, guest, lookingUp, onProceed, onCallWaiter, onReorder, menu = [] }) {
  const dish = (id) => menu.find(m => m.id === id) || {};
  const [step, setStep] = useState("phone");
  const valid = isValidPhone(phone);
  const known = !!guest;
  const last = guest?.last_order;
  const lastWhen = last?.created_at ? new Date(last.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
  const next = () => {
    if (!valid) return;
    if (known || step === "name") { onProceed(); return; }
    setStep("name");
  };
  const disabled = !valid || (step === "name" && !name.trim()) || (step === "phone" && lookingUp);

  return (
    <div className="relative min-h-screen bg-[#0b0a09] text-white flex flex-col max-w-md mx-auto overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.8)]" data-testid="order-welcome-gate">
      <img src="/assets/order/welcome-bg.jpg" alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(11,10,9,0.55) 0%, rgba(11,10,9,0.72) 35%, rgba(11,10,9,0.55) 60%, rgba(11,10,9,0.35) 80%, rgba(11,10,9,0.85) 100%)" }} />

      <div className="relative flex-1 px-5 pt-5 pb-8 flex flex-col">
        <p className="absolute right-5 top-5 font-caveat text-gold text-2xl leading-[1.05] text-right w-32">Good<br />Food<br />Brings People<br />Together<br /><span className="text-xl">♡</span></p>

        <div className="text-center mt-4">
          {salon?.logo_url ? (
            <div className="inline-block p-[3px] rounded-3xl bg-gradient-to-br from-[#f3d27a] via-[#d4af37] to-[#8a6d1f] shadow-[0_10px_40px_rgba(212,175,55,0.35)]">
              <img src={salon.logo_url} alt={salon.name} data-testid="welcome-logo" className="w-36 h-36 rounded-[21px] object-contain bg-[#0b0a09] p-2" />
            </div>
          ) : (
            <div className="inline-flex w-36 h-36 rounded-3xl bg-black/70 border border-gold/60 items-center justify-center"><UtensilsCrossed className="w-14 h-14 text-gold" /></div>
          )}
          <p className="text-gold text-sm tracking-[0.35em] uppercase mt-5 flex items-center justify-center gap-2"><UtensilsCrossed className="w-4 h-4" /> Table {table || "—"}</p>
          {known ? (
            <>
              <h1 className="font-playfair text-[38px] leading-[1.1] mt-3" data-testid="welcome-back-card">Welcome back, <span className="text-[#f3e5ab]">{guest.title ? `${guest.title} ` : ""}{guest.name}</span> 👋</h1>
              <p className="text-white/85 text-[17px] leading-snug mt-3 px-2">We're happy you came back. Please proceed with your order — let us know if you need any assistance.</p>
            </>
          ) : (
            <>
              <h1 className="font-playfair text-[38px] leading-[1.1] mt-3">{salon?.name}</h1>
              <p className="text-[10px] tracking-[0.3em] uppercase text-white/80 mt-3">Delicious food • Happy moments • Together always</p>
              <div className="mx-auto mt-4 h-px w-40 bg-gradient-to-r from-transparent via-gold to-transparent" />
            </>
          )}
        </div>

        <div className="mt-7 space-y-4">
          {known ? (
            <>
              <div className="rounded-2xl border border-gold/50 bg-black/45 backdrop-blur-md px-5 py-4 flex items-center gap-3 text-gold" data-testid="loyalty-pill">
                <Crown className="w-6 h-6 shrink-0" />
                <span className="flex-1 text-[15px] font-semibold">You're earning loyalty points on this visit!</span>
                <ChevronRight className="w-5 h-5" />
              </div>
              {last?.items?.length > 0 && (
                <div className="rounded-3xl border border-white/10 bg-black/55 backdrop-blur-md p-5" data-testid="last-order-card">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <p className="text-[13px] tracking-[0.25em] uppercase text-gold font-semibold flex items-center gap-2"><RotateCcw className="w-4 h-4" /> Your last order</p>
                    <span className="text-xs text-white/50">{lastWhen}</span>
                  </div>
                  <ul>
                    {last.items.slice(0, 5).map((it, i) => {
                      const d = dish(it.id);
                      return (
                        <li key={i} className="flex items-center gap-4 py-3 border-b border-white/10 last:border-0">
                          {d.image_url && <img src={thumbUrl(d.image_url, 160)} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-[17px] font-semibold text-white leading-tight">{it.qty} × {it.name}</p>
                            {d.description && <p className="text-sm text-white/50 truncate mt-0.5">{d.description}</p>}
                          </div>
                          <span className="text-gold text-xl font-semibold shrink-0">₹{Math.round(it.price * it.qty)}</span>
                        </li>
                      );
                    })}
                    {last.items.length > 5 && <li className="text-white/40 text-xs pt-2">+{last.items.length - 5} more</li>}
                  </ul>
                  <button onClick={() => onReorder(last)} data-testid="reorder-same-btn"
                    className="mt-4 w-full py-4 rounded-full border-2 border-gold/80 text-gold text-lg font-bold flex items-center justify-center gap-3 active:scale-[0.98] transition-transform relative">
                    <RotateCcw className="w-5 h-5" /> Order the same again <span className="text-white/60 text-base">•</span> ₹{Math.round(last.total || 0).toLocaleString("en-IN")}
                    <ChevronRight className="w-5 h-5 absolute right-5" />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center">
              <p className="text-[26px] font-semibold leading-tight">{step === "phone" ? "Let's get your order started!" : `Nice to meet you${name.trim() ? `, ${name.trim().split(" ")[0]}` : ""}!`}</p>
              <p className="text-white/70 text-base mt-1.5">{step === "phone" ? "Enter your mobile number to continue" : "What should we call you?"}</p>
            </div>
          )}

          {!known && step === "phone" && (
            <div className="flex items-stretch rounded-2xl border-2 border-gold/70 bg-black/60 backdrop-blur-md overflow-hidden focus-within:border-gold" data-testid="welcome-phone-wrap">
              <span className="pl-5 pr-4 flex items-center gap-2.5 text-lg font-bold text-white border-r border-white/15 shrink-0">🇮🇳 +91 <ChevronDown className="w-4 h-4 text-gold" /></span>
              <input value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d+ ]/g, ""))} inputMode="tel" autoFocus
                data-testid="welcome-phone-input" placeholder="10-digit mobile number"
                className="flex-1 min-w-0 px-5 py-5 bg-transparent text-lg placeholder:text-white/35 focus:outline-none" />
              {lookingUp && <Loader2 className="w-5 h-5 animate-spin text-gold self-center mr-4" />}
            </div>
          )}
          {!known && step === "name" && (
            <input value={name} onChange={e => setName(e.target.value)} autoFocus maxLength={60}
              data-testid="welcome-name-input" placeholder="Your name"
              className="w-full px-5 py-5 rounded-2xl border-2 border-gold/70 bg-black/60 backdrop-blur-md text-lg text-center placeholder:text-white/35 focus:outline-none focus:border-gold" />
          )}

          <button onClick={next} disabled={disabled} data-testid="welcome-proceed-btn"
            className="w-full py-5 rounded-full bg-gradient-to-r from-[#d4af37] via-[#f3d27a] to-[#d4af37] text-black text-xl font-bold flex items-center justify-center gap-2 shadow-[0_12px_40px_rgba(212,175,55,0.35)] disabled:opacity-40 active:scale-[0.99] transition-transform">
            {known && <UtensilsCrossed className="w-6 h-6" />}{known ? "Proceed to order" : step === "phone" ? "Continue" : "Start ordering"} <ArrowRight className="w-6 h-6" />
          </button>
        </div>

        <div className={`mt-7 grid ${known ? "grid-cols-4" : "grid-cols-3"} text-center`}>
          {(known ? FEATURES_BACK : FEATURES).map(([I, l], i) => (
            <div key={l} className={`flex flex-col items-center gap-2 py-1 ${i ? "border-l border-white/20" : ""}`}>
              <I className="w-7 h-7 text-gold" strokeWidth={1.8} />
              <span className={`${known ? "text-[12px]" : "text-[13px]"} text-white/90 leading-tight`}>{l}</span>
            </div>
          ))}
        </div>

        <div className="mt-auto pt-10">
          {!known && <button onClick={onCallWaiter} data-testid="welcome-call-waiter-btn"
            className="mx-auto flex items-center justify-center gap-3 w-72 max-w-full py-4 rounded-full border-2 border-gold/80 bg-black/40 backdrop-blur text-gold text-lg font-bold hover:bg-gold/10 transition-colors">
            <Bell className="w-5 h-5" /> Call waiter
          </button>}
          <div className="mt-8 flex items-center gap-3"><span className="flex-1 border-t border-gold/40" /><p className="text-[10px] tracking-[0.3em] uppercase text-white/85 whitespace-nowrap">{known ? "Good food • Great company • Always a reason to smile" : "Good food brings people together"}</p><span className="flex-1 border-t border-gold/40" /></div>
          {!known && <p className="text-center text-gold text-lg mt-1">♡</p>}
        </div>
      </div>
    </div>
  );
}
