import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { TrendingUp, Loader2, Check, CalendarClock, Video, Sparkles } from "lucide-react";
import { AdvisoryTracker } from "@/components/AdvisoryTracker";

function loadRazorpayScript() {
  return new Promise(resolve => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

const STATUS = {
  paid: ["bg-amber-50 text-amber-700", "Paid · slot coming"],
  scheduled: ["bg-emerald-50 text-emerald-700", "Scheduled"],
  completed: ["bg-slate-100 text-slate-600", "Completed"],
  refunded: ["bg-rose-50 text-rose-700", "Refunded"],
};

function BookingRow({ b }) {
  const [cls, label] = STATUS[b.status] || STATUS.paid;
  const when = b.session?.slot_at ? new Date(b.session.slot_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : null;
  return (
    <div className="px-3 py-2.5" data-testid={`advisory-booking-${b.id}`}>
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="min-w-0">
          <div className="font-semibold text-slate-800">{b.tier_name} <span className="text-slate-400 font-normal">· ₹{b.amount.toLocaleString("en-IN")}</span></div>
          <div className="text-slate-500 flex items-center gap-1.5 mt-0.5">
            {when ? <><CalendarClock className="w-3 h-3" /> {when} · {b.session.duration_min} min</> : "The Miracurl team will email your slot within 1 business day."}
            {b.session?.meet_link && <a href={b.session.meet_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-700 font-semibold ml-1" data-testid={`advisory-join-${b.id}`}><Video className="w-3 h-3" /> Join</a>}
          </div>
        </div>
        <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
      </div>
      <AdvisoryTracker booking={b} progress={b.progress} dark={false} />
    </div>
  );
}

export function GrowthAdvisoryCard() {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState("");
  const [goal, setGoal] = useState("");
  const refresh = () => api.get("/settings/growth-advisory").then(r => setD(r.data)).catch(() => {});
  useEffect(() => { refresh(); }, []);
  if (!d || (!d.offered && d.bookings.length === 0)) return null;

  async function buy(tier) {
    setBusy(tier.id);
    try {
      const ok = await loadRazorpayScript();
      if (!ok) { toast.error("Couldn't load Razorpay — check your internet"); return; }
      const { data: order } = await api.post("/settings/growth-advisory/order", { tier: tier.id, goal });
      new window.Razorpay({
        key: order.key_id, amount: order.amount, currency: order.currency, order_id: order.order_id,
        name: "Miracurl AI Salon Suite", description: `Growth Advisory — ${order.label}`, image: `${window.location.origin}/assets/brand/ms-logo-dark.png`,
        prefill: order.prefill, notes: { kind: "growth_advisory" }, theme: { color: "#b08d3f" },
        handler: async (rzp) => {
          try {
            await api.post("/settings/growth-advisory/verify", {
              razorpay_order_id: rzp.razorpay_order_id, razorpay_payment_id: rzp.razorpay_payment_id, razorpay_signature: rzp.razorpay_signature,
            });
            toast.success("🎉 You're in! Check your email — the growth team will confirm your slot.");
            setGoal(""); refresh();
          } catch (e) { toast.error(e.response?.data?.detail || "Verification failed. Contact support."); }
        },
        modal: { ondismiss: () => setBusy("") },
      }).open();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't start checkout"); }
    finally { setBusy(""); }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#d4af37]/40 bg-[#15151b] text-slate-100 p-6 mt-6" data-testid="growth-advisory-card">
      <div className="pointer-events-none absolute -top-20 -right-16 w-64 h-64 rounded-full bg-[#d4af37]/15 blur-3xl" />
      <div className="relative">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#F0D9A5] to-[#C89B52] flex items-center justify-center shrink-0"><TrendingUp className="w-5 h-5 text-[#15151b]" /></div>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-[3px] text-[#d4af37]/80">Invitation only · your salon is opted in</div>
            <h2 className="font-playfair text-2xl text-[#F0D9A5] leading-tight" data-testid="growth-advisory-headline">{d.headline}</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">{d.pitch}</p>
          </div>
          {d.test_mode && <span className="text-[10px] px-2 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-400/30">Razorpay test mode</span>}
        </div>

        {d.offered && <>
        <div className="grid md:grid-cols-3 gap-3 mt-5">
          {d.tiers.map((t, i) => (
            <div key={t.id} data-testid={`advisory-tier-${t.id}`}
              className={`relative rounded-2xl p-4 flex flex-col border transition-all duration-300 ${i === 1 ? "border-[#d4af37]/60 bg-gradient-to-b from-[#d4af37]/[.12] to-transparent shadow-[0_0_30px_rgba(212,175,55,.12)]" : "border-white/10 bg-white/[.03] hover:border-white/20"}`}>
              {t.badge && <span className="absolute -top-2.5 left-4 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-[#F0D9A5] to-[#C89B52] text-[#15151b]">{t.badge}</span>}
              <div className="text-sm font-semibold text-slate-100">{t.name}</div>
              <div className="font-playfair text-3xl text-[#F0D9A5] mt-1">₹{t.price.toLocaleString("en-IN")}</div>
              <p className="text-[11px] text-slate-400 mt-1 min-h-[32px]">{t.tagline}</p>
              <ul className="mt-3 space-y-1.5 flex-1">
                {t.includes.map((x, j) => <li key={j} className="text-[11px] text-slate-300 flex gap-1.5"><Check className="w-3 h-3 text-[#d4af37] shrink-0 mt-0.5" /> {x}</li>)}
              </ul>
              <button onClick={() => buy(t)} disabled={!!busy || !d.razorpay_enabled} data-testid={`advisory-buy-${t.id}`}
                className={`mt-4 w-full py-2 rounded-full text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50 transition ${i === 1 ? "bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] hover:brightness-110" : "border border-[#d4af37]/50 text-[#F0D9A5] hover:bg-[#d4af37]/10"}`}>
                {busy === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Book & pay ₹{t.price.toLocaleString("en-IN")}
              </button>
            </div>
          ))}
        </div>
        <label className="block mt-4 text-[10px] uppercase tracking-wide text-slate-500">Your #1 goal for the next 90 days (optional, helps us prepare)
          <input value={goal} onChange={e => setGoal(e.target.value)} maxLength={400} placeholder="e.g. Reach ₹4L/month, fill weekday afternoons, launch memberships…" data-testid="advisory-goal-input"
            className="mt-1 w-full border border-white/10 rounded-lg px-3 py-2 text-xs !bg-white/5 !text-slate-200 normal-case placeholder:text-slate-600" />
        </label>
        {!d.razorpay_enabled && <p className="text-[11px] text-amber-300 mt-2">Online payment is unavailable right now — message HQ to book manually.</p>}
        <p className="text-[10px] text-slate-500 mt-3">Secure payment via Razorpay · GST invoice on request · Delivered by the Miracurl growth team.</p>
        </>}

        {d.bookings.length > 0 && (
          <div className="mt-5 rounded-2xl bg-white border border-slate-200 divide-y divide-slate-100 text-slate-800" data-testid="advisory-my-bookings">
            <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Your sessions</div>
            {d.bookings.map(b => <BookingRow key={b.id} b={b} />)}
          </div>
        )}
      </div>
    </div>
  );
}
