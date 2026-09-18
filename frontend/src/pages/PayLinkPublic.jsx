import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Loader2, ShieldCheck, Sparkles, Clock, Gift } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { toast, Toaster } from "sonner";
import { trackPurchase } from "@/lib/analytics";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const loadRzp = () => new Promise((res) => {
  if (window.Razorpay) return res(true);
  const s = document.createElement("script");
  s.src = "https://checkout.razorpay.com/v1/checkout.js";
  s.onload = () => res(true);
  s.onerror = () => res(false);
  document.body.appendChild(s);
});

const BENEFITS_RESTO = [
  "🍽️ QR table ordering, kitchen tickets & POS billing with GST invoices",
  "🤖 Mira AI — daily specials, marketing studio & voice greetings",
  "🌐 Your own public menu & reservation page + occasion gift cards",
  "💬 WhatsApp reminders, reviews & the referral engine",
  "💛 Priority onboarding support from the Miracurl team",
];
const BENEFITS = [
  "📅 Appointments, POS billing & GST invoices",
  "🤖 Mira AI — daily briefings, marketing studio & voice greetings",
  "🌐 Your own public booking page + occasion gift cards",
  "💬 WhatsApp reminders, reviews & the referral engine",
  "💛 Priority onboarding support from the Miracurl team",
];

const Shell = ({ children }) => (
  <div className="min-h-screen bg-[#080809] text-white flex items-center justify-center p-5" data-testid="pay-link-page">
    <Toaster theme="dark" position="top-center" />
    <div className="w-full max-w-lg">{children}</div>
  </div>
);

export default function PayLinkPublic() {
  const { token } = useParams();
  const API = useMemo(() => axios.create({ baseURL: `${BACKEND_URL}/api/public/pay-link` }), []);
  const [link, setLink] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    API.get(`/${token}`).then(({ data }) => setLink(data))
      .catch((e) => setError(e.response?.data?.detail || "This payment link doesn't exist"));
  }, [token, API]);

  // Returning from Stripe Checkout — poll until the payment settles.
  useEffect(() => {
    const sid = new URLSearchParams(window.location.search).get("session_id");
    if (!sid || !link || link.status === "paid") return;
    let tries = 0;
    const poll = async () => {
      try {
        const { data } = await API.get(`/${token}/stripe-status/${sid}`);
        if (data.status === "paid") {
          trackPurchase({ transaction_id: sid, value: link.amount, currency: link.currency || "USD", plan: link.plan_label, gateway: "stripe", source: "pay_link" });
          setDone({ salon_name: link.salon_name, plan_label: link.plan_label, end_date: "" });
          return;
        }
      } catch { /* keep polling */ }
      if (++tries < 8) setTimeout(poll, 2500);
    };
    poll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link?.status, token]);

  const sym = link?.currency_symbol || "₹";
  const fmtAmt = (v) => `${sym}${Number(v).toLocaleString(link?.currency === "INR" ? "en-IN" : "en-US")}`;

  const pay = async () => {
    setBusy(true);
    try {
      if (link.gateway === "stripe") {
        const { data: d } = await API.post(`/${token}/stripe-checkout`, { origin_url: window.location.origin });
        window.location.href = d.checkout_url;
        return;
      }
      const { data: d } = await API.post(`/${token}/order`);
      await loadRzp();
      new window.Razorpay({
        key: d.key_id, order_id: d.order_id, amount: d.amount, currency: "INR",
        name: "Miracurl Suite", description: `${d.plan_label} — ${d.salon_name}`,
        theme: { color: "#d4af37" },
        handler: async (resp) => {
          try {
            const { data: v } = await API.post(`/${token}/verify`, resp);
            trackPurchase({ transaction_id: resp.razorpay_payment_id, value: link.amount, currency: "INR", plan: link.plan_label, gateway: "razorpay", source: "pay_link" });
            setDone(v);
          } catch (e) { toast.error(e.response?.data?.detail || "Payment verification failed"); }
        },
      }).open();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't start the payment"); }
    finally { setBusy(false); }
  };

  const daysLeft = link ? Math.max(0, Math.ceil((new Date(link.expires_at) - Date.now()) / 86400000)) : 0;

  if (error) return (
    <Shell><div className="text-center bg-white/5 border border-white/10 rounded-3xl p-10" data-testid="pay-link-error">
      <div className="text-5xl">🔗</div>
      <h2 className="font-playfair text-2xl mt-3">Link not found</h2>
      <p className="text-sm text-white/60 mt-2">{error}</p>
    </div></Shell>
  );
  if (!link) return <Shell><div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-gold animate-spin" /></div></Shell>;

  if (done || link.status === "paid") return (
    <Shell><div className="text-center bg-white/5 border border-gold/30 rounded-3xl p-10" data-testid="pay-link-success">
      <div className="text-6xl">🎉</div>
      <h2 className="font-playfair text-3xl mt-4">Welcome aboard{done ? `, ${done.salon_name}` : ""}!</h2>
      <p className="text-sm text-white/70 mt-3 leading-relaxed">
        {done
          ? <>Your <b className="text-gold">{done.plan_label}</b> is active till <b className="text-gold">{done.end_date}</b>. A confirmation email is on its way — the whole Miracurl team is really happy to have you with us 💛</>
          : <>This plan was already activated{link.paid_at ? ` on ${link.paid_at.slice(0, 10)}` : ""} — you're all set! 💛</>}
      </p>
      <a href="/login" className="btn-gold inline-flex items-center gap-2 mt-6">Open my salon suite <Sparkles className="w-4 h-4" /></a>
    </div></Shell>
  );

  if (link.status !== "pending") return (
    <Shell><div className="text-center bg-white/5 border border-white/10 rounded-3xl p-10" data-testid="pay-link-expired">
      <div className="text-5xl">⏳</div>
      <h2 className="font-playfair text-2xl mt-3">This link has {link.status === "cancelled" ? "been withdrawn" : "expired"}</h2>
      <p className="text-sm text-white/60 mt-2">Please ask the Miracurl HQ team for a fresh payment link — we'll be happy to send one right over.</p>
    </div></Shell>
  );

  return (
    <Shell>
      <div className="flex flex-col items-center text-center" data-testid="pay-link-header">
        <BrandMark size="lg" />
        <div className="mt-4 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-gold/30 bg-gold/10 text-[10px] uppercase tracking-[0.3em] text-gold">
          {link.is_trial_offer ? <Gift className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
          {link.is_trial_offer ? "Trial upgrade · one-tap activation" : "Official HQ offer"}
        </div>
      </div>
      <div className="mt-6 relative bg-white/5 border border-gold/25 rounded-3xl p-8 text-center overflow-hidden" data-testid="pay-link-card">
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-gold/10 blur-3xl" />
        {link.tenant_logo_url
          ? <img src={link.tenant_logo_url} alt={link.salon_name} className="relative w-20 h-20 rounded-full object-cover mx-auto ring-2 ring-gold/70 ring-offset-4 ring-offset-[#101012] bg-white shadow-[0_10px_40px_-10px_rgba(212,175,55,.6)]" data-testid="pay-link-tenant-logo" />
          : <div className="relative w-20 h-20 rounded-full mx-auto ring-2 ring-gold/70 ring-offset-4 ring-offset-[#101012] bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] font-playfair text-3xl font-bold flex items-center justify-center" data-testid="pay-link-tenant-initial">{(link.salon_name || "M").trim()[0]}</div>}
        <h1 className="relative font-playfair text-2xl sm:text-3xl mt-4">{link.is_trial_offer ? `${link.salon_name}, keep the momentum going` : `Welcome, ${link.salon_name}!`}</h1>
        {link.tenant_location && <div className="text-[10px] uppercase tracking-[0.25em] text-white/40 mt-1">{link.tenant_location}</div>}
        <p className="text-xs text-white/55 mt-2 leading-relaxed max-w-sm mx-auto">
          {link.is_trial_offer
            ? `Your free trial is ending — activate now and every booking, bill, staff record and Mira insight stays exactly where it is.`
            : `Our team is really happy to onboard you — this exclusive plan was prepared just for your ${link.business_type === "restaurant" ? "restaurant" : "salon"} by Miracurl HQ ✨`}</p>
        <div className="inline-block bg-white/95 rounded-2xl px-8 py-4 mt-5">
          <div className="text-[10px] uppercase tracking-widest text-neutral-500">{link.plan_label}</div>
          <div className="font-bold text-4xl text-neutral-900" data-testid="pay-link-amount">{fmtAmt(link.amount)}
            {link.discount ? <span className="ml-2 text-lg font-semibold text-neutral-400 line-through align-middle" data-testid="pay-link-original-amount">{fmtAmt(link.original_amount)}</span> : null}</div>
          {link.discount ? <div className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold" data-testid="pay-link-offer-badge">🎁 {link.offer_label} — you save {fmtAmt(link.discount)} · valid till {new Date(link.expires_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div> : null}
          <div className="text-[11px] text-neutral-500">{link.months} months · full suite access</div>
        </div>
        {link.note && !link.is_trial_offer && <p className="text-sm italic text-gold/90 mt-4 max-w-sm mx-auto" data-testid="pay-link-note">"{link.note}"</p>}
        <div className="mt-5 text-left max-w-sm mx-auto space-y-2">
          {(link.business_type === "restaurant" ? BENEFITS_RESTO : BENEFITS).map((b, i) => <div key={i} className="text-xs text-white/70 leading-relaxed">{b}</div>)}
        </div>
        <button onClick={pay} disabled={busy} data-testid="pay-link-pay-btn"
          className="w-full btn-gold justify-center flex items-center gap-2 mt-6 !py-3.5 !text-base disabled:opacity-50">
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
          {link.gateway === "stripe"
            ? `Pay ${fmtAmt(link.amount)} securely by card`
            : `Pay ${fmtAmt(link.amount)} securely · UPI / Card / NetBanking`}
        </button>
        <div className="flex items-center justify-center gap-3 mt-3 text-[10px] text-white/40">
          <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Secured by {link.gateway === "stripe" ? "Stripe" : "Razorpay"}</span>
          <span className="flex items-center gap-1" data-testid="pay-link-expiry"><Clock className="w-3 h-3" /> Link valid {daysLeft} more day{daysLeft === 1 ? "" : "s"}</span>
        </div>
        {link.test_mode && <p className="text-[10px] text-amber-300/70 mt-2">TEST mode — use card 4111 1111 1111 1111, any CVV, any future expiry.</p>}
      </div>
    </Shell>
  );
}
