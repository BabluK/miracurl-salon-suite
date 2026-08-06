import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Crown, Loader2, CheckCircle2, Sparkles } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PUBLIC = axios.create({ baseURL: `${API}/public` });

const loadRzp = () => new Promise((res) => {
  if (window.Razorpay) return res(true);
  const s = document.createElement("script");
  s.src = "https://checkout.razorpay.com/v1/checkout.js";
  s.onload = () => res(true);
  s.onerror = () => res(false);
  document.body.appendChild(s);
});

const TIER_STYLE = {
  silver:   { grad: "from-slate-300 via-slate-400 to-slate-600", chip: "bg-slate-200 text-slate-800", glow: "rgba(148,163,184,0.35)", icon: "🥈" },
  gold:     { grad: "from-amber-300 via-yellow-400 to-amber-600", chip: "bg-amber-200 text-amber-900", glow: "rgba(212,175,55,0.45)", icon: "🥇" },
  platinum: { grad: "from-violet-300 via-purple-400 to-violet-700", chip: "bg-violet-200 text-violet-900", glow: "rgba(139,92,246,0.45)", icon: "💎" },
  diamond:  { grad: "from-cyan-300 via-sky-400 to-cyan-700", chip: "bg-cyan-200 text-cyan-900", glow: "rgba(34,211,238,0.45)", icon: "👑" },
  custom:   { grad: "from-orange-300 via-rose-400 to-rose-600", chip: "bg-orange-200 text-orange-900", glow: "rgba(251,146,60,0.4)", icon: "✨" },
};
const TIER_RIBBON = { platinum: "⭐ MOST POPULAR", diamond: "👑 BEST VALUE" };

export default function MembershipPublic() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const renewId = (params.get("renew") || "").toUpperCase();
  const [cfg, setCfg] = useState(null);
  const [plan, setPlan] = useState(null);
  const [customAmt, setCustomAmt] = useState(5000);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [upi, setUpi] = useState(null); // upi order response
  const [upiRef, setUpiRef] = useState("");
  const [done, setDone] = useState(null); // activation result

  useEffect(() => {
    PUBLIC.get(`/membership/${slug}/config`).then(r => setCfg(r.data)).catch(() => setCfg(false));
  }, [slug]);

  if (cfg === null) return <div className="min-h-screen bg-bg-base flex items-center justify-center text-white/60">Loading…</div>;
  if (cfg === false) return <div className="min-h-screen bg-bg-base flex items-center justify-center text-white/60">Salon not found</div>;

  const amount = plan?.custom ? Number(customAmt || 0) : Number(plan?.price || 0);

  async function order(payMethod) {
    const { data } = await PUBLIC.post(`/membership/${slug}/order`, {
      plan_id: plan.id, amount, name: form.name, phone: form.phone, email: form.email,
      pay_method: payMethod, renew_member_id: renewId,
    });
    return data;
  }

  function validate() {
    if (!plan) { toast.error("Pick a membership plan"); return false; }
    if (plan.custom && amount < (plan.min_price || 5000)) { toast.error(`Custom membership starts at ₹${(plan.min_price || 5000).toLocaleString("en-IN")}`); return false; }
    if (form.name.trim().length < 2) { toast.error("Enter your name"); return false; }
    if (form.phone.replace(/\D/g, "").length < 8) { toast.error("Enter your phone number"); return false; }
    if (!/\S+@\S+\.\S+/.test(form.email)) { toast.error("Enter your email — your membership card is sent there"); return false; }
    return true;
  }

  async function payRazorpay() {
    if (!validate()) return;
    setBusy(true);
    try {
      if (!(await loadRzp())) throw new Error("Couldn't load payment");
      const d = await order("razorpay");
      new window.Razorpay({
        key: d.key_id, order_id: d.razorpay_order_id, amount: d.amount, currency: "INR",
        name: cfg.salon.name, description: `${plan.name} Membership`,
        prefill: { name: form.name, email: form.email, contact: form.phone },
        theme: { color: "#d4af37" },
        handler: async (resp) => {
          try {
            const v = await PUBLIC.post("/membership/verify", resp);
            setDone(v.data);
          } catch (e) { toast.error(e.response?.data?.detail || "Payment verification failed"); }
        },
      }).open();
    } catch (e) { toast.error(e.response?.data?.detail || e.message || "Couldn't start payment"); }
    finally { setBusy(false); }
  }

  async function payUpi() {
    if (!validate()) return;
    setBusy(true);
    try { setUpi(await order("upi")); }
    catch (e) { toast.error(e.response?.data?.detail || "Couldn't create the order"); }
    finally { setBusy(false); }
  }

  async function confirmUpi() {
    if (upiRef.trim().length < 6) { toast.error("Enter your UPI transaction / reference ID"); return; }
    setBusy(true);
    try {
      await PUBLIC.post(`/membership/${upi.order_id}/upi-paid`, { upi_ref: upiRef.trim() });
      setDone({ status: "awaiting_confirmation" });
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't submit"); }
    finally { setBusy(false); }
  }

  if (done) {
    const pending = done.status === "awaiting_confirmation";
    return (
      <div className="min-h-screen bg-bg-base text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-3xl p-8 text-center" data-testid="membership-success">
          <CheckCircle2 className="w-14 h-14 mx-auto text-gold" />
          <h2 className="font-playfair text-3xl mt-4">{pending ? "Payment submitted ✦" : renewId ? "Membership renewed! 🎉" : "You're a member! 🎉"}</h2>
          {pending ? (
            <p className="text-white/60 text-sm mt-3">The salon will confirm your UPI payment shortly — your membership card will arrive by email right after.</p>
          ) : (
            <>
              <p className="text-white/60 text-sm mt-3">Your digital membership card & QR have been emailed to <b className="text-white">{form.email}</b>.</p>
              <div className="mt-5 bg-black/40 border border-gold/40 rounded-2xl px-4 py-3 font-mono tracking-widest text-gold text-lg" data-testid="membership-member-id">
                {done.member_id}
              </div>
              <Link to={`/member/${done.member_id}`} data-testid="view-member-card-link"
                className="mt-5 inline-block bg-gold text-bg-base font-semibold px-6 py-3 rounded-full">View my membership card →</Link>
            </>
          )}
          <div className="mt-6"><Link to={`/book/${slug}`} className="text-white/50 text-sm hover:text-white">← Back to {cfg.salon.name}</Link></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base text-white p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-gold text-xs tracking-[0.3em] uppercase"><Crown className="w-4 h-4" /> Premium Membership</div>
          <h1 className="font-playfair text-4xl sm:text-5xl mt-2">{cfg.salon.name}</h1>
          <p className="text-white/50 text-sm mt-2">{renewId ? `Renewing membership ${renewId} — pick your plan` : "Earn wallet cashback + member-only perks on every visit."}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8" data-testid="membership-plans">
          {cfg.plans.map(p => {
            const st = TIER_STYLE[p.tier] || TIER_STYLE.custom;
            const sel = plan?.id === p.id;
            const ribbon = TIER_RIBBON[p.tier];
            return (
              <button key={p.id} data-testid={`membership-plan-${p.tier}`} onClick={() => setPlan(p)}
                className={`relative text-left rounded-2xl p-[1.5px] transition-transform duration-200 hover:-translate-y-1 ${ribbon ? "lg:-mt-3" : ""}`}
                style={{ background: sel ? `linear-gradient(140deg, ${st.glow}, rgba(255,255,255,0.06))` : "rgba(255,255,255,0.08)", boxShadow: sel ? `0 0 34px ${st.glow}` : "none" }}>
                <div className="rounded-2xl bg-[#141419] h-full p-4 pt-5 overflow-hidden relative">
                  <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${st.grad}`} />
                  <div className={`absolute -top-10 -right-10 w-28 h-28 rounded-full bg-gradient-to-br ${st.grad} opacity-15 blur-xl pointer-events-none`} />
                  {ribbon && (
                    <div className={`absolute top-3 right-[-34px] rotate-45 text-[8px] font-bold tracking-wider text-black bg-gradient-to-r ${st.grad} px-9 py-1`}>{ribbon}</div>
                  )}
                  <div className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${st.chip}`}>
                    {st.icon} {p.name}
                  </div>
                  <div className="text-[26px] leading-tight font-bold mt-3">
                    {p.custom ? `₹${(p.min_price || 5000).toLocaleString("en-IN")}+` : `₹${p.price.toLocaleString("en-IN")}`}
                  </div>
                  <div className="text-[10px] text-white/40 uppercase tracking-wider">12 months validity</div>
                  <ul className="mt-3 space-y-1.5 text-[11px] text-white/75">
                    <li className="flex items-center gap-1.5"><span className="text-gold">💰</span> {p.cashback_pct}% wallet cashback</li>
                    {p.discount_pct > 0 && <li className="flex items-center gap-1.5"><span className="text-gold">✂️</span> {p.discount_pct}% off services</li>}
                    <li className="flex items-center gap-1.5"><span className="text-gold">🪪</span> Digital card + QR</li>
                    <li className="flex items-center gap-1.5"><span className="text-gold">🎂</span> Birthday member perks</li>
                  </ul>
                  <div className={`mt-4 rounded-full text-center text-xs font-bold py-2 transition ${sel ? `bg-gradient-to-r ${st.grad} text-black` : "border border-white/20 text-white/70"}`}>
                    {sel ? "Selected ✦" : "Choose plan"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {plan && !upi && (
          <div className="max-w-md mx-auto bg-white/5 border border-white/10 rounded-3xl p-6 space-y-3" data-testid="membership-buyer-form">
            {plan.custom && (
              <div>
                <label className="text-xs text-white/50 block mb-1">Membership amount (min ₹{(plan.min_price || 5000).toLocaleString("en-IN")})</label>
                <input data-testid="membership-custom-amount" type="number" min={plan.min_price || 5000} step="500" value={customAmt}
                  onChange={e => setCustomAmt(e.target.value)}
                  className="w-full bg-black/30 border border-white/15 rounded-xl px-4 py-3 text-white focus:border-gold outline-none" />
              </div>
            )}
            <input data-testid="membership-name" placeholder="Your full name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full bg-black/30 border border-white/15 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:border-gold outline-none" />
            <input data-testid="membership-phone" placeholder="Phone number" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
              className="w-full bg-black/30 border border-white/15 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:border-gold outline-none" />
            <input data-testid="membership-email" type="email" placeholder="Email (card is sent here)" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
              className="w-full bg-black/30 border border-white/15 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:border-gold outline-none" />
            <div className="pt-2 space-y-2">
              {cfg.payment.razorpay && (
                <button data-testid="membership-pay-razorpay" onClick={payRazorpay} disabled={busy}
                  className="w-full bg-gold text-bg-base font-bold py-3.5 rounded-full flex items-center justify-center gap-2 disabled:opacity-60">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
                  Pay ₹{Number(amount || 0).toLocaleString("en-IN")} securely
                </button>
              )}
              {cfg.payment.upi && (
                <button data-testid="membership-pay-upi" onClick={payUpi} disabled={busy}
                  className="w-full border border-white/20 text-white/90 font-semibold py-3 rounded-full hover:border-gold/60 disabled:opacity-60">
                  Pay via UPI ({cfg.payment.upi_id})
                </button>
              )}
              {!cfg.payment.razorpay && !cfg.payment.upi && (
                <p className="text-center text-white/50 text-sm">Online purchase isn&apos;t enabled yet — please ask at the salon reception.</p>
              )}
            </div>
          </div>
        )}

        {upi && (
          <div className="max-w-md mx-auto bg-white/5 border border-white/10 rounded-3xl p-6 text-center space-y-4" data-testid="membership-upi-panel">
            <h3 className="font-playfair text-2xl">Pay ₹{Number(amount).toLocaleString("en-IN")} via UPI</h3>
            {upi.qr_b64 && <img src={`data:image/png;base64,${upi.qr_b64}`} alt="UPI QR" className="w-44 h-44 mx-auto rounded-xl bg-white p-2" />}
            <p className="text-white/50 text-xs">Scan with any UPI app, or tap: </p>
            <div className="flex justify-center gap-2 text-xs">
              <a className="px-3 py-2 rounded-full bg-white/10" href={upi.gpay_link}>GPay</a>
              <a className="px-3 py-2 rounded-full bg-white/10" href={upi.phonepe_link}>PhonePe</a>
              <a className="px-3 py-2 rounded-full bg-white/10" href={upi.paytm_link}>Paytm</a>
            </div>
            <input data-testid="membership-upi-ref" placeholder="UPI transaction / reference ID" value={upiRef} onChange={e => setUpiRef(e.target.value)}
              className="w-full bg-black/30 border border-white/15 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:border-gold outline-none" />
            <button data-testid="membership-upi-confirm" onClick={confirmUpi} disabled={busy}
              className="w-full bg-gold text-bg-base font-bold py-3 rounded-full disabled:opacity-60">I have paid — submit</button>
          </div>
        )}

        <div className="text-center mt-10">
          <Link to={`/book/${slug}`} className="text-white/40 text-sm hover:text-white">← Back to booking</Link>
        </div>
      </div>
    </div>
  );
}
