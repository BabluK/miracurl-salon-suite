import { useState } from "react";
import { UtensilsCrossed, Loader2, Bell, History, RotateCcw } from "lucide-react";

const normPhone = (p) => {
  let d = (p || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
};
export const isValidPhone = (p) => /^[6-9]\d{9}$/.test(normPhone(p));

/** First screen after a table-QR scan: mobile → returning-guest greeting, or name for a new guest. */
export function WelcomeGate({ salon, table, phone, setPhone, name, setName, guest, lookingUp, onProceed, onCallWaiter, onReorder }) {
  const last = guest?.last_order;
  const lastWhen = last?.created_at ? new Date(last.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";
  const [step, setStep] = useState("phone");
  const valid = isValidPhone(phone);
  const known = !!guest;

  const next = () => {
    if (!valid) return;
    if (known || step === "name") { onProceed(); return; }
    setStep("name");
  };

  return (
    <div className="min-h-screen bg-[#0b0a09] text-white flex flex-col" data-testid="order-welcome-gate">
      <div className="px-6 pt-10 pb-6 text-center">
        {salon.logo_url && <img src={salon.logo_url} alt={salon.name} className="w-20 h-20 rounded-2xl object-contain bg-white p-1 mx-auto" />}
        <div className="mt-4 flex items-center justify-center gap-2 text-gold text-[10px] tracking-[0.3em] uppercase"><UtensilsCrossed className="w-3.5 h-3.5" /> Table {table || "—"}</div>
        <h1 className="font-playfair text-3xl mt-1">{salon.name}</h1>
      </div>

      <div className="px-6 flex-1">
        {known ? (
          <div className="rounded-3xl border border-gold/40 bg-gold/10 p-5 animate-fade-up" data-testid="welcome-back-card">
            <p className="font-playfair text-2xl text-gold">Welcome back{guest.title ? `, ${guest.title}` : ","} {guest.name} 👋</p>
            <p className="text-white/80 text-sm mt-2 leading-relaxed">We're happy you came back. Please proceed with your order — let us know if you need any assistance.</p>
            <p className="text-white/40 text-[11px] mt-2">Visit #{(guest.visits || 0) + 1} · loyalty points on this one ✨</p>
            {last?.items?.length > 0 && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4" data-testid="last-order-card">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] tracking-[0.25em] uppercase text-white/60 flex items-center gap-1.5"><History className="w-3.5 h-3.5 text-gold" /> Your last order</p>
                  <span className="text-[10px] text-white/40">{lastWhen}</span>
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {last.items.slice(0, 4).map((it, i) => (
                    <li key={i} className="flex justify-between gap-3"><span className="truncate text-white/90">{it.qty} × {it.name}</span><span className="text-gold shrink-0">₹{Math.round(it.price * it.qty)}</span></li>
                  ))}
                  {last.items.length > 4 && <li className="text-white/40 text-xs">+{last.items.length - 4} more</li>}
                </ul>
                <button onClick={() => onReorder(last)} data-testid="reorder-same-btn"
                  className="mt-3 w-full py-3 rounded-full bg-gold text-black text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
                  <RotateCcw className="w-4 h-4" /> Order the same again · ₹{Math.round(last.total || 0).toLocaleString("en-IN")}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-white/70 text-sm">{step === "phone" ? "Enter your mobile number to start ordering" : "Nice to meet you! What should we call you?"}</p>
            {step === "phone" ? (
              <input value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d+ ]/g, ""))} inputMode="tel" autoFocus
                data-testid="welcome-phone-input" placeholder="📱 10-digit mobile number"
                className="w-full px-4 py-3.5 rounded-2xl bg-white/5 border border-white/15 text-base placeholder:text-white/30 focus:outline-none focus:border-gold/60" />
            ) : (
              <input value={name} onChange={e => setName(e.target.value)} autoFocus
                data-testid="welcome-name-input" placeholder="Your name"
                className="w-full px-4 py-3.5 rounded-2xl bg-white/5 border border-white/15 text-base placeholder:text-white/30 focus:outline-none focus:border-gold/60" />
            )}
            {step === "phone" && valid && lookingUp && <p className="text-white/40 text-xs flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Checking…</p>}
            {step === "phone" && !valid && phone.length > 0 && <p className="text-rose-300 text-xs">Enter a valid 10-digit Indian mobile number</p>}
          </div>
        )}

        <button onClick={next} disabled={!valid || (step === "name" && !name.trim()) || (step === "phone" && lookingUp)} data-testid="welcome-proceed-btn"
          className="mt-5 w-full py-3.5 rounded-2xl bg-gold text-black font-bold disabled:opacity-40 hover:opacity-90 transition-opacity">
          {known ? "Proceed to order →" : step === "phone" ? "Continue →" : "Start ordering →"}
        </button>
      </div>

      <div className="px-6 py-6">
        <button onClick={onCallWaiter} data-testid="welcome-call-waiter-btn"
          className="w-full flex items-center justify-center gap-2 py-3 rounded-full border border-gold/40 text-gold text-xs font-bold hover:bg-gold/10 transition-colors">
          <Bell className="w-3.5 h-3.5" /> Call waiter
        </button>
      </div>
    </div>
  );
}
