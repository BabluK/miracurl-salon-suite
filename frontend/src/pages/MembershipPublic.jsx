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
  silver: { grad: "from-slate-400 to-slate-600", chip: "bg-slate-100 text-slate-700" },
  gold: { grad: "from-amber-400 to-yellow-600", chip: "bg-amber-100 text-amber-800" },
  platinum: { grad: "from-violet-400 to-purple-600", chip: "bg-violet-100 text-violet-700" },
  diamond: { grad: "from-cyan-400 to-sky-600", chip: "bg-cyan-100 text-cyan-700" },
  custom: { grad: "from-orange-400 to-rose-500", chip: "bg-orange-100 text-orange-700" },
};

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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-8" data-testid="membership-plans">
          {cfg.plans.map(p => {
            const st = TIER_STYLE[p.tier] || TIER_STYLE.custom;
            const sel = plan?.id === p.id;
            return (
              <button key={p.id} data-testid={`membership-plan-${p.tier}`} onClick={() => setPlan(p)}
                className={`text-left rounded-2xl border-2 p-4 transition ${sel ? "border-gold bg-white/10 shadow-gold-glow" : "border-white/10 bg-white/5 hover:border-white/30"}`}>
                <div className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${st.chip}`}>{p.name}</div>
                <div className="text-2xl font-bold mt-2">{p.custom ? `₹${(p.min_price || 5000).toLocaleString("en-IN")}+` : `₹${p.price.toLocaleString("en-IN")}`}</div>
                <div className="text-[11px] text-white/50 mt-1">12 months</div>
                <div className="text-xs text-gold mt-2 flex items-center gap-1"><Sparkles className="w-3 h-3" /> {p.cashback_pct}% wallet cashback</div>
                {p.discount_pct > 0 && <div className="text-[11px] text-white/60 mt-0.5">{p.discount_pct}% off services</div>}
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
