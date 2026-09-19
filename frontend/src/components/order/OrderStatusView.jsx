import { useEffect, useState } from "react";
import { Check, FileText, Flame, UtensilsCrossed, ChefHat, Bell } from "lucide-react";
import { WaitGames } from "./WaitGames";

const GAMES_AFTER_MS = 10 * 60 * 1000;
const STEPS = [
  ["new", FileText, "Order received", "The kitchen has your ticket"],
  ["preparing", Flame, "Cooking now", "Our chefs are on it"],
  ["served", UtensilsCrossed, "Served — enjoy!", "Your food will be at your table soon"],
];
const sinceOrder = (done) => Date.now() - new Date(done.created_at || Date.now()).getTime();

/** Post-order screen: live status timeline, resume banner, order details, and games after a 10-minute wait. */
export function OrderStatusView({ salon, done, liveStatus, resumed, onOrderMore, onCallWaiter }) {
  const [showGames, setShowGames] = useState(() => sinceOrder(done) > GAMES_AFTER_MS);
  const [details, setDetails] = useState(false);
  const finished = ["served", "billed", "cancelled"].includes(liveStatus);
  useEffect(() => {
    if (showGames || finished) return;
    const t = setTimeout(() => setShowGames(true), Math.max(0, GAMES_AFTER_MS - sinceOrder(done)));
    return () => clearTimeout(t);
  }, [done, showGames, finished]);
  const activeIdx = liveStatus === "billed" || liveStatus === "served" ? 2 : liveStatus === "preparing" ? 1 : 0;
  const placedAt = done.created_at ? new Date(done.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div className="min-h-screen bg-[#0b0a09] text-white px-5 pt-6 pb-10 relative overflow-hidden" data-testid="order-success">
      <img src="/assets/login/restaurant.jpg" alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover opacity-[0.18] pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b0a09]/40 via-[#0b0a09]/85 to-[#0b0a09] pointer-events-none" />

      <div className="relative">
        <div className="flex items-start justify-between">
          {salon.logo_url ? <img src={salon.logo_url} alt={salon.name} className="w-20 h-20 rounded-full object-contain bg-black p-1 ring-2 ring-gold/70" /> : <span />}
          <p className="font-caveat text-gold text-xl leading-tight text-right">Good Food<br />Brings People Together<br />♡</p>
        </div>

        {resumed && !finished && (
          <div className="mt-4 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm" data-testid="order-resume-banner">
            <p className="font-bold text-emerald-300">Welcome back{done.customer_name ? `, ${done.customer_name.split(" ")[0]}` : ""}! Your order is on the way 🍽️</p>
            <p className="text-white/70 text-xs mt-0.5">We kept your order open — track it live below.</p>
          </div>
        )}

        <div className="text-center mt-4">
          <div className="relative w-28 h-28 mx-auto">
            {[-40, 20, 140, 200].map((deg) => (
              <span key={deg} className={`absolute left-1/2 top-1/2 w-4 h-1 rounded-full ${deg % 80 ? "bg-emerald-400" : "bg-gold"}`} style={{ transform: `rotate(${deg}deg) translateX(58px)`, transformOrigin: "0 50%" }} />
            ))}
            <div className="absolute inset-3 rounded-full bg-emerald-500/15 border-[5px] border-emerald-400 flex items-center justify-center shadow-[0_0_50px_rgba(52,211,153,0.4)]">
              <Check className="w-12 h-12 text-emerald-400" strokeWidth={3.5} />
            </div>
          </div>
          <h1 className="font-playfair text-[30px] leading-tight mt-4 whitespace-nowrap">Order sent <span className="text-gold">to the kitchen!</span></h1>
          <p className="text-white/80 text-base mt-2">Order <b className="text-gold">#{String(done.id).slice(0, 8)}</b> &nbsp;•&nbsp; Table {done.table_no} &nbsp;•&nbsp; ₹{Number(done.total || 0).toLocaleString("en-IN")}</p>
          <p className="text-white/70 text-[15px] mt-3 px-2">Great choice! Your delicious food is being prepared with care.</p>
        </div>

        <div className="mt-5 rounded-3xl border border-white/10 bg-[#141311]/90 p-5" data-testid="order-live-status">
          {STEPS.map(([key, Icon, label, sub], i) => {
            const reached = i <= activeIdx;
            const active = i === activeIdx && !finished;
            return (
              <div key={key} className="flex items-start gap-4 relative" data-testid={`order-step-${key}`}>
                {i < STEPS.length - 1 && <span className={`absolute left-[23px] top-12 h-7 border-l-2 border-dashed ${i < activeIdx ? "border-emerald-400" : "border-white/25"}`} />}
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${reached ? "bg-emerald-500/20 border-2 border-emerald-400 text-emerald-300" : "bg-white/10 border border-white/15 text-white/50"} ${active ? "animate-pulse" : ""}`}><Icon className="w-5 h-5" /></div>
                <div className={`pb-7 flex-1 ${reached ? "" : "opacity-60"}`}>
                  <div className="flex justify-between items-baseline"><p className="font-bold text-[17px]">{label}</p>{i === 0 && placedAt && <span className="text-sm text-white/60">{placedAt}</span>}</div>
                  <p className="text-sm text-white/55 mt-0.5">{sub}</p>
                </div>
              </div>
            );
          })}
          {liveStatus === "cancelled" && <p className="text-rose-300 text-xs">This order was cancelled — please ask a waiter.</p>}
          {liveStatus === "billed" && <p className="text-gold text-xs">🧾 Billed — thank you for dining with us!</p>}
        </div>
        {!finished && <p className="text-sm text-white/60 mt-3 flex items-center justify-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Live updates automatically every few seconds</p>}

        <div className="text-center mt-8">
          <ChefHat className="w-12 h-12 text-gold mx-auto" strokeWidth={1.5} />
          <p className="font-caveat text-gold text-3xl leading-tight mt-1">Sit back —<br />your food is being prepared ♡</p>
        </div>

        <p className="text-center text-sm text-white/70 mt-6" data-testid="order-more-prompt">Would you like to order anything else? We're happy to assist you.</p>
        <button onClick={onOrderMore} data-testid="order-again-btn" className="mt-3 w-full py-4 rounded-full bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 text-black text-lg font-bold flex items-center justify-center gap-3 shadow-[0_10px_30px_rgba(245,158,11,0.35)]"><UtensilsCrossed className="w-5 h-5" /> Order something else <span aria-hidden>→</span></button>
        <button onClick={() => setDetails(d => !d)} data-testid="order-details-btn" className="mt-3 w-full py-4 rounded-full border-2 border-gold/60 text-white text-lg font-semibold">{details ? "Hide Order Details" : "View Order Details"}</button>
        {details && (
          <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm" data-testid="order-details">
            {(done.items || []).map((it, i) => (
              <div key={i} className="flex justify-between py-1.5 border-b border-white/5 last:border-0"><span>{it.qty} × {it.name}{it.spice && it.spice !== "normal" ? <span className="text-white/40 text-xs"> · {it.spice.replace("_", " ")}</span> : null}</span><span className="text-gold">₹{Math.round(it.price * it.qty)}</span></div>
            ))}
            {done.discount_amt > 0 && <div className="flex justify-between py-1.5 text-emerald-300 text-xs"><span>{done.offer_title || "Discount"} ({done.discount_pct}%)</span><span>−₹{Math.round(done.discount_amt)}</span></div>}
            <div className="flex justify-between pt-2 font-bold"><span>Total</span><span className="text-gold">₹{Number(done.total || 0).toLocaleString("en-IN")}</span></div>
            <button onClick={onCallWaiter} data-testid="status-call-waiter-btn" className="mt-3 w-full py-2.5 rounded-full border border-gold/40 text-gold text-xs font-bold flex items-center justify-center gap-2"><Bell className="w-3.5 h-3.5" /> Call waiter</button>
          </div>
        )}

        {showGames && !finished && <WaitGames salon={salon} />}

        <div className="mt-10 flex items-center gap-3"><span className="flex-1 border-t border-white/15" /><p className="text-[12px] tracking-[0.35em] uppercase text-white/80">{salon.name}</p><span className="flex-1 border-t border-white/15" /></div>
        <p className="text-center text-[10px] tracking-[0.3em] uppercase text-white/50 mt-2">Good food • Great company</p>
      </div>
    </div>
  );
}
