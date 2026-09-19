import { useEffect, useState } from "react";
import { CheckCircle2, FileText, Flame, UtensilsCrossed, ChefHat, Bell } from "lucide-react";
import { WaitGames } from "./WaitGames";

const GAMES_AFTER_MS = 10 * 60 * 1000;
const STEPS = [
  ["new", FileText, "Order received", "The kitchen has your ticket"],
  ["preparing", Flame, "Cooking now", "Our chefs are on it"],
  ["served", UtensilsCrossed, "Served — enjoy!", "Your food will be at your table soon"],
];

/** Post-order screen: live status, resume banner, order-more prompt, and games after a 10-minute wait. */
export function OrderStatusView({ salon, done, liveStatus, resumed, onOrderMore, onCallWaiter }) {
  const [showGames, setShowGames] = useState(() => Date.now() - new Date(done.created_at || Date.now()).getTime() > GAMES_AFTER_MS);
  const finished = ["served", "billed", "cancelled"].includes(liveStatus);
  useEffect(() => {
    if (showGames || finished) return;
    const wait = Math.max(0, GAMES_AFTER_MS - (Date.now() - new Date(done.created_at || Date.now()).getTime()));
    const t = setTimeout(() => setShowGames(true), wait);
    return () => clearTimeout(t);
  }, [done, showGames, finished]);
  const activeIdx = liveStatus === "billed" || liveStatus === "served" ? 2 : liveStatus === "preparing" ? 1 : 0;
  const placedAt = done.created_at ? new Date(done.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div className="min-h-screen bg-[#0b0a09] text-white px-5 pt-8 pb-10 relative overflow-hidden" data-testid="order-success">
      <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-gold/10 blur-3xl pointer-events-none" />
      <div className="flex items-start justify-between">
        {salon.logo_url ? <img src={salon.logo_url} alt={salon.name} className="w-16 h-16 rounded-full object-contain bg-white p-1" /> : <span />}
        <p className="font-caveat text-gold text-xl leading-tight text-right">Good Food<br />Brings People Together ♡</p>
      </div>

      {resumed && !finished && (
        <div className="mt-5 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm" data-testid="order-resume-banner">
          <p className="font-bold text-emerald-300">Welcome back{done.customer_name ? `, ${done.customer_name.split(" ")[0]}` : ""}! Your order is on the way 🍽️</p>
          <p className="text-white/70 text-xs mt-0.5">We kept your order open — track it live below.</p>
        </div>
      )}

      <div className="text-center mt-6">
        <div className="w-24 h-24 mx-auto rounded-full bg-emerald-500/15 border-4 border-emerald-400 flex items-center justify-center shadow-[0_0_40px_rgba(52,211,153,0.35)]">
          <CheckCircle2 className="w-12 h-12 text-emerald-400" />
        </div>
        <h1 className="font-playfair text-3xl mt-5">Order sent <span className="text-gold">to the kitchen!</span></h1>
        <p className="text-white/70 text-sm mt-2">Order <b className="text-gold font-mono">#{String(done.id).slice(0, 8)}</b> · Table {done.table_no} · ₹{Number(done.total || 0).toLocaleString("en-IN")}</p>
        <p className="text-white/60 text-sm mt-3">Great choice! Your delicious food is being prepared with care.</p>
      </div>

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-5" data-testid="order-live-status">
        {STEPS.map(([key, Icon, label, sub], i) => {
          const reached = i <= activeIdx;
          const active = i === activeIdx && !finished;
          return (
            <div key={key} className="flex items-start gap-4 relative" data-testid={`order-step-${key}`}>
              {i < STEPS.length - 1 && <span className={`absolute left-[19px] top-10 h-8 border-l-2 border-dashed ${i < activeIdx ? "border-emerald-400" : "border-white/15"}`} />}
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${reached ? "bg-emerald-500/20 border-2 border-emerald-400 text-emerald-300" : "bg-white/5 border border-white/15 text-white/40"} ${active ? "animate-pulse" : ""}`}><Icon className="w-4 h-4" /></div>
              <div className={`pb-6 flex-1 ${reached ? "" : "opacity-50"}`}>
                <div className="flex justify-between"><p className="font-bold text-sm">{label}</p>{i === 0 && placedAt && <span className="text-xs text-white/50">{placedAt}</span>}</div>
                <p className="text-xs text-white/50 mt-0.5">{sub}</p>
              </div>
            </div>
          );
        })}
        {liveStatus === "cancelled" && <p className="text-rose-300 text-xs">This order was cancelled — please ask a waiter.</p>}
        {liveStatus === "billed" && <p className="text-gold text-xs">🧾 Billed — thank you for dining with us!</p>}
      </div>
      {!finished && <p className="text-[11px] text-white/50 mt-3 flex items-center justify-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live updates automatically every few seconds</p>}

      <div className="text-center mt-8">
        <ChefHat className="w-8 h-8 text-gold mx-auto" />
        <p className="font-caveat text-gold text-2xl mt-1">Sit back — your food is being prepared ♡</p>
      </div>

      <div className="mt-6 rounded-2xl border border-gold/30 bg-gold/5 px-4 py-3 text-sm" data-testid="order-more-prompt">
        <p className="font-semibold">Would you like to order anything else?</p>
        <p className="text-white/60 text-xs mt-0.5">We'll be happy to assist you — add a drink or dessert while you wait.</p>
      </div>
      <button onClick={onOrderMore} data-testid="order-again-btn" className="mt-4 w-full py-3.5 rounded-2xl bg-gold text-black font-bold flex items-center justify-center gap-2"><UtensilsCrossed className="w-4 h-4" /> Order something else →</button>
      <button onClick={onCallWaiter} data-testid="status-call-waiter-btn" className="mt-3 w-full py-3 rounded-2xl border border-gold/40 text-gold text-sm font-bold flex items-center justify-center gap-2"><Bell className="w-4 h-4" /> Call waiter</button>

      {showGames && !finished && <WaitGames salon={salon} />}

      <p className="text-center text-[10px] tracking-[0.3em] uppercase text-white/40 mt-10">{salon.name}</p>
    </div>
  );
}
