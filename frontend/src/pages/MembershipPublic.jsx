import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Crown, Loader2, CheckCircle2, Lock, User, CreditCard, ShieldCheck, QrCode, IdCard, BadgeCheck } from "lucide-react";

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

const TIERS = {
  silver:   { medal: "from-slate-200 via-slate-400 to-slate-600", banner: "from-slate-400 to-slate-600", text: "text-slate-200", glow: "rgba(148,163,184,0.35)", icon: "⭐" },
  gold:     { medal: "from-yellow-200 via-amber-400 to-amber-700", banner: "from-amber-400 to-yellow-600", text: "text-amber-200", glow: "rgba(212,175,55,0.45)", icon: "⭐" },
  platinum: { medal: "from-violet-300 via-purple-500 to-violet-800", banner: "from-violet-500 to-purple-700", text: "text-violet-200", glow: "rgba(139,92,246,0.5)", icon: "👑" },
  diamond:  { medal: "from-cyan-200 via-sky-400 to-cyan-700", banner: "from-cyan-400 to-sky-600", text: "text-cyan-200", glow: "rgba(34,211,238,0.45)", icon: "💎" },
  custom:   { medal: "from-orange-200 via-amber-500 to-rose-700", banner: "from-orange-400 to-rose-600", text: "text-orange-200", glow: "rgba(251,146,60,0.4)", icon: "✨" },
};
const RIBBON = { platinum: "MOST POPULAR", diamond: "BEST VALUE" };

export default function MembershipPublic() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const renewId = (params.get("renew") || "").toUpperCase();
  const [cfg, setCfg] = useState(null);
  const [plan, setPlan] = useState(null);
  const [customAmt, setCustomAmt] = useState(5000);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [upi, setUpi] = useState(null);
  const [upiRef, setUpiRef] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    PUBLIC.get(`/membership/${slug}/config`).then(r => setCfg(r.data)).catch(() => setCfg(false));
  }, [slug]);

  if (cfg === null) return <div className="min-h-screen bg-[#0b0b0f] flex items-center justify-center text-white/60">Loading…</div>;
  if (cfg === false) return <div className="min-h-screen bg-[#0b0b0f] flex items-center justify-center text-white/60">Salon not found</div>;

  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
  const logo = cfg?.salon?.logo_url ? (cfg.salon.logo_url.startsWith("/api/") ? `${BACKEND_URL}${cfg.salon.logo_url}` : cfg.salon.logo_url) : "";
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
      <div className="min-h-screen bg-[#0b0b0f] text-white flex items-center justify-center p-4">
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
              <a data-testid="wa-my-card"
                href={`https://wa.me/?text=${encodeURIComponent(`🎉 My ${(plan?.name || "Premium").toUpperCase()} membership at ${cfg.salon.name} is active ✦\n🪪 Member ID: ${done.member_id}\nCard & QR: ${window.location.origin}/member/${done.member_id}`)}`}
                target="_blank" rel="noreferrer"
                className="mt-3 block text-emerald-400 text-sm font-semibold hover:text-emerald-300">
                📲 Save my card on WhatsApp →
              </a>
            </>
          )}
          <div className="mt-6"><Link to={`/book/${slug}`} className="text-white/50 text-sm hover:text-white">← Back to {cfg.salon.name}</Link></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-white text-slate-800">
      <div className="pointer-events-none fixed -right-32 -bottom-32 w-[640px] h-[640px] rounded-full opacity-90"
           style={{ background: "radial-gradient(circle at 30% 30%, #e8918f 0%, #d4af37 40%, #ec4899 75%, transparent 100%)" }} />
      <div className="pointer-events-none fixed -left-40 -bottom-44 w-[520px] h-[520px] rounded-full opacity-80"
           style={{ background: "radial-gradient(circle at 60% 40%, #f5d78e 0%, #e8a0a8 45%, #d4af37 80%, transparent 100%)" }} />
      <div className="relative z-10 max-w-6xl mx-auto p-4 sm:p-8">
        {/* Header */}
        <div className="text-center mb-10">
          {logo ? (
            <img src={logo} alt={cfg.salon.name} className="w-16 h-16 rounded-2xl object-cover mx-auto mb-3 ring-2 ring-gold/50 shadow-lg" data-testid="membership-salon-logo" />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gold to-amber-700 flex items-center justify-center mx-auto mb-3"><Crown className="w-7 h-7 text-black" /></div>
          )}
          <div className="inline-flex items-center gap-2 text-amber-600 text-[11px] tracking-[0.35em] uppercase font-semibold"><Crown className="w-4 h-4" /> Premium Membership</div>
          <h1 className="font-playfair text-4xl sm:text-5xl lg:text-6xl mt-3 text-slate-800">{cfg.salon.name}</h1>
          <p className="text-slate-500 text-sm mt-3">{renewId ? `Renewing membership ${renewId} — pick your plan` : "Unlock exclusive benefits and enjoy premium care on every visit."}</p>
          <div className="mx-auto mt-4 h-px w-56 bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-10" data-testid="membership-plans">
          {cfg.plans.map(p => {
            const st = TIERS[p.tier] || TIERS.custom;
            const sel = plan?.id === p.id;
            const ribbon = RIBBON[p.tier];
            return (
              <button key={p.id} data-testid={`membership-plan-${p.tier}`} onClick={() => setPlan(p)}
                className={`relative text-left rounded-2xl p-[1.5px] transition-transform duration-200 hover:-translate-y-1 ${ribbon === "MOST POPULAR" ? "lg:-mt-3 lg:mb-[-12px]" : ""}`}
                style={{ background: sel ? `linear-gradient(150deg, ${st.glow}, rgba(255,255,255,0.4))` : "rgba(15,23,42,0.10)", boxShadow: sel ? `0 0 40px ${st.glow}` : "0 4px 18px rgba(15,23,42,0.06)" }}>
                <div className="rounded-2xl bg-white h-full px-4 pb-4 pt-6 overflow-hidden relative text-center">
                  <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${st.banner}`} />
                  {ribbon && (
                    <div className={`absolute top-0 right-0 text-[8px] font-bold tracking-widest text-white bg-gradient-to-r ${st.banner} px-2.5 py-1 rounded-bl-xl`}>{ribbon}</div>
                  )}
                  {/* medallion */}
                  <div className={`mx-auto w-14 h-14 rounded-full bg-gradient-to-br ${st.medal} flex items-center justify-center text-xl shadow-lg`} style={{ boxShadow: `0 6px 22px ${st.glow}` }}>
                    {st.icon}
                  </div>
                  {/* tier banner */}
                  <div className={`mx-auto -mt-1 mt-2 w-fit bg-gradient-to-r ${st.banner} text-black/90 text-[10px] font-extrabold uppercase tracking-[0.2em] px-4 py-1`}
                    style={{ clipPath: "polygon(8% 0, 92% 0, 100% 50%, 92% 100%, 8% 100%, 0 50%)" }}>
                    {p.name}
                  </div>
                  <div className="text-[27px] leading-tight font-bold mt-3 text-slate-800">
                    {p.custom ? `₹${(p.min_price || 5000).toLocaleString("en-IN")}+` : `₹${p.price.toLocaleString("en-IN")}`}
                  </div>
                  <div className="text-[9px] text-slate-400 uppercase tracking-[0.25em] mt-1" data-testid={`plan-validity-${p.tier}`}>
                    {p.validity_days % 365 === 0 ? `${p.validity_days / 365 * 12} months validity` : `${p.validity_days} days validity`}
                  </div>
                  <ul className="mt-4 space-y-2 text-[11px] text-slate-600 text-left" data-testid={`plan-benefits-${p.tier}`}>
                    <li className="flex items-start gap-1.5"><span className={st.text}>💰</span> {p.cashback_pct}% wallet cashback</li>
                    {p.discount_pct > 0 && <li className="flex items-start gap-1.5"><span className={st.text}>✂️</span> {p.discount_pct}% off on services</li>}
                    {(p.benefits || []).map((b, i) => (
                      <li key={i} className="flex items-start gap-1.5"><span className={st.text}>✓</span> {b}</li>
                    ))}
                    <li className="flex items-start gap-1.5"><span className={st.text}>🪪</span> Digital card + QR</li>
                  </ul>
                  <div className={`mt-4 rounded-full text-center text-xs font-bold py-2.5 transition flex items-center justify-center gap-1.5 ${sel ? `bg-gradient-to-r ${st.banner} text-white` : "border border-slate-300 text-slate-500"}`}>
                    {sel ? <>Selected <BadgeCheck className="w-3.5 h-3.5" /></> : "Choose Plan"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Member details + payment summary */}
        {plan && !upi && (
          <div className="max-w-4xl mx-auto bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-8 shadow-2xl shadow-rose-200/40" data-testid="membership-buyer-form">
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center"><User className="w-4 h-4 text-amber-600" /></div>
                <h3 className="font-semibold text-slate-800">Member Details</h3>
              </div>
              <div className="space-y-3">
                {plan.custom && (
                  <input data-testid="membership-custom-amount" type="number" min={plan.min_price || 5000} step="500" value={customAmt}
                    onChange={e => setCustomAmt(e.target.value)} placeholder={`Amount (min ₹${(plan.min_price || 5000).toLocaleString("en-IN")})`}
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3.5 text-slate-800 placeholder:text-slate-400 focus:border-amber-500 outline-none" />
                )}
                <input data-testid="membership-name" placeholder="Full Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3.5 text-slate-800 placeholder:text-slate-400 focus:border-amber-500 outline-none" />
                <input data-testid="membership-phone" placeholder="Phone Number" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3.5 text-slate-800 placeholder:text-slate-400 focus:border-amber-500 outline-none" />
                <input data-testid="membership-email" type="email" placeholder="Email Address (Card will be sent here)" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3.5 text-slate-800 placeholder:text-slate-400 focus:border-amber-500 outline-none" />
                <p className="text-[11px] text-slate-400 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-amber-600" /> Your data is safe and secure with us.</p>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-5 relative overflow-hidden bg-white"
              style={{ boxShadow: `0 10px 36px ${(TIERS[plan.tier] || TIERS.custom).glow}` }}>
              <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${(TIERS[plan.tier] || TIERS.custom).banner}`} />
              <div className="flex items-center justify-between mb-4 mt-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center"><CreditCard className="w-4 h-4 text-amber-600" /></div>
                  <h3 className="font-semibold text-slate-800">Payment Summary</h3>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-gradient-to-r ${(TIERS[plan.tier] || TIERS.custom).banner} text-white`}>{plan.name} plan</span>
              </div>
              <div className="space-y-2.5 text-sm border-b border-slate-200 pb-4">
                <div className="flex justify-between text-slate-600"><span>Plan Amount</span><span className="font-semibold text-slate-800">₹{Number(amount || 0).toLocaleString("en-IN")}</span></div>
                <div className="flex justify-between text-slate-600"><span>Validity</span><span className="font-semibold text-slate-800">{plan.validity_days % 365 === 0 ? `${plan.validity_days / 365 * 12} months` : `${plan.validity_days} days`}</span></div>
              </div>
              <div className="flex justify-between items-center py-4">
                <span className="font-semibold text-slate-800">Total Payable</span>
                <span className="text-2xl font-bold text-amber-600" data-testid="membership-total">₹{Number(amount || 0).toLocaleString("en-IN")}</span>
              </div>
              {cfg.payment.razorpay && (
                <button data-testid="membership-pay-razorpay" onClick={payRazorpay} disabled={busy}
                  className="w-full bg-gradient-to-r from-gold to-amber-600 text-black font-bold py-4 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60 shadow-lg shadow-amber-300/50">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  Pay ₹{Number(amount || 0).toLocaleString("en-IN")} Securely
                </button>
              )}
              {cfg.payment.upi && (
                <button data-testid="membership-pay-upi" onClick={payUpi} disabled={busy}
                  className="w-full mt-2.5 border border-slate-300 text-slate-700 font-semibold py-3 rounded-2xl hover:border-amber-500 disabled:opacity-60 bg-white">
                  Pay via UPI ({cfg.payment.upi_id})
                </button>
              )}
              {!cfg.payment.razorpay && !cfg.payment.upi && (
                <p className="text-center text-slate-500 text-sm">Online purchase isn&apos;t enabled yet — please ask at the salon reception.</p>
              )}
              <p className="text-[10px] text-slate-400 text-center mt-3">🔒 Secure payment · You&apos;ll receive your digital membership card instantly on email &amp; WhatsApp.</p>
            </div>
          </div>
        )}

        {upi && (
          <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-3xl p-6 text-center space-y-4 shadow-xl" data-testid="membership-upi-panel">
            <h3 className="font-playfair text-2xl text-slate-800">Pay ₹{Number(amount).toLocaleString("en-IN")} via UPI</h3>
            {upi.qr_b64 && <img src={`data:image/png;base64,${upi.qr_b64}`} alt="UPI QR" className="w-44 h-44 mx-auto rounded-xl bg-white p-2 border border-slate-200" />}
            <p className="text-slate-500 text-xs">Scan with any UPI app, or tap:</p>
            <div className="flex justify-center gap-2 text-xs">
              <a className="px-3 py-2 rounded-full bg-slate-100 text-slate-700 font-semibold" href={upi.gpay_link}>GPay</a>
              <a className="px-3 py-2 rounded-full bg-slate-100 text-slate-700 font-semibold" href={upi.phonepe_link}>PhonePe</a>
              <a className="px-3 py-2 rounded-full bg-slate-100 text-slate-700 font-semibold" href={upi.paytm_link}>Paytm</a>
            </div>
            <input data-testid="membership-upi-ref" placeholder="UPI transaction / reference ID" value={upiRef} onChange={e => setUpiRef(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-800 placeholder:text-slate-400 focus:border-amber-500 outline-none" />
            <button data-testid="membership-upi-confirm" onClick={confirmUpi} disabled={busy}
              className="w-full bg-gold text-white font-bold py-3 rounded-full disabled:opacity-60">I have paid — submit</button>
          </div>
        )}

        {/* Trust strip */}
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 mt-10 pt-6 border-t border-slate-200 text-left" data-testid="membership-trust-strip">
          {[
            { Icon: IdCard, h: "Instant Digital Card", s: "Get your card on email" },
            { Icon: QrCode, h: "QR Code Access", s: "Scan & enjoy benefits" },
            { Icon: ShieldCheck, h: "Secure & Safe", s: "100% secure payments" },
            { Icon: BadgeCheck, h: "Wallet Cashback", s: "Earn on every visit" },
          ].map(({ Icon, h, s }) => (
            <div key={h} className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-amber-600" /></div>
              <div><div className="text-xs font-semibold text-slate-700">{h}</div><div className="text-[10px] text-slate-400">{s}</div></div>
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <Link to={`/book/${slug}`} className="text-slate-400 text-sm hover:text-slate-700">← Back to booking</Link>
        </div>
      </div>
    </div>
  );
}
