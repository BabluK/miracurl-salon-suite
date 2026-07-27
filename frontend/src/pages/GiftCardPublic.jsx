import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { Gift, ArrowLeft, Loader2, Copy, Check, Sparkles } from "lucide-react";
import { toast, Toaster } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const TOASTER_STYLE = { background: "#121212", color: "#fff", border: "1px solid rgba(212,175,55,0.3)" };

const loadRzp = () => new Promise((res) => {
  if (window.Razorpay) return res(true);
  const s = document.createElement("script");
  s.src = "https://checkout.razorpay.com/v1/checkout.js";
  s.onload = () => res(true);
  s.onerror = () => res(false);
  document.body.appendChild(s);
});

const CardPreview = ({ cfg, occ, amount, recipient, buyer }) => {
  const [g1, g2] = occ?.grad || ["#d4af37", "#b45309"];
  const logo = cfg?.salon?.logo_url ? (cfg.salon.logo_url.startsWith("/api/") ? `${BACKEND_URL}${cfg.salon.logo_url}` : cfg.salon.logo_url) : "";
  return (
    <div data-testid="gift-card-preview" className="rounded-3xl p-7 sm:p-8 text-center shadow-2xl relative overflow-hidden"
      style={{ background: `linear-gradient(120deg, ${g1}, ${g2})` }}>
      <div className="absolute -top-8 -right-8 text-[120px] opacity-15 select-none">{occ?.emoji || "🎁"}</div>
      {logo
        ? <img src={logo} alt={cfg?.salon?.name} className="h-12 mx-auto mb-2 rounded-lg object-contain bg-white/20 backdrop-blur px-2 py-1" />
        : <div className="text-white font-bold text-xl mb-1">{cfg?.salon?.name}</div>}
      <div className="text-4xl leading-none">{occ?.emoji || "🎁"}</div>
      <div className="text-white/90 text-[11px] uppercase tracking-[0.3em] mt-2">{occ?.label || "Gift"} Gift Card</div>
      <div className="text-white font-bold text-4xl sm:text-5xl mt-1">₹{amount || "—"}</div>
      <div className="inline-block bg-white/90 rounded-xl px-6 py-2 mt-3">
        <div className="text-[9px] uppercase tracking-widest text-neutral-500">Gift card code</div>
        <div className="font-mono font-bold text-neutral-800 tracking-widest">GC-••••-••••</div>
      </div>
      <div className="text-white/80 text-[11px] mt-3">
        {recipient ? `For ${recipient}` : "For someone special"}{buyer ? ` · From ${buyer}` : ""} · {cfg?.salon?.name}
      </div>
    </div>
  );
};

export default function GiftCardPublic() {
  const { slug: routeSlug } = useParams();
  const slug = routeSlug || "miracurl-marathahalli";
  const API = useMemo(() => axios.create({ baseURL: `${BACKEND_URL}/api/public/gift-cards` }), []);
  const [cfg, setCfg] = useState(null);
  const [occKey, setOccKey] = useState("birthday");
  const [amount, setAmount] = useState(0);
  const [custom, setCustom] = useState("");
  const [f, setF] = useState({ buyer_name: "", buyer_email: "", buyer_phone: "", recipient_name: "", recipient_email: "", recipient_whatsapp: "", message: "" });
  const [sendLater, setSendLater] = useState(false);
  const [sendOn, setSendOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [upiOrder, setUpiOrder] = useState(null);
  const [upiRef, setUpiRef] = useState("");
  const [done, setDone] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    API.get(`/${slug}/config`).then(({ data }) => {
      setCfg(data);
      setAmount(data.amounts?.[1] || data.amounts?.[0] || 1000);
    }).catch(() => toast.error("Salon not found"));
  }, [slug, API]);

  const occ = cfg?.occasions?.find((o) => o.key === occKey);
  const finalAmount = custom ? Number(custom) : amount;
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));

  const validate = () => {
    if (!finalAmount || finalAmount < 50) { toast.error("Amount must be at least ₹50"); return false; }
    if (!f.buyer_name.trim() || !f.buyer_email.trim()) { toast.error("Enter your name and email"); return false; }
    if (!f.recipient_name.trim() || !f.recipient_email.trim()) { toast.error("Enter the recipient's name and email"); return false; }
    if (sendLater && !sendOn) { toast.error("Pick the delivery date"); return false; }
    return true;
  };

  const order = async (pay_method) => {
    if (!validate()) return null;
    const { data } = await API.post(`/${slug}/order`, {
      occasion: occKey, amount: finalAmount, ...f,
      send_on: sendLater ? sendOn : "", pay_method,
    });
    return data;
  };

  const payRazorpay = async () => {
    setBusy(true);
    try {
      const d = await order("razorpay");
      if (!d) return;
      await loadRzp();
      new window.Razorpay({
        key: d.key_id, order_id: d.order_id, amount: d.amount, currency: "INR",
        name: d.salon_name, description: `${occ?.label} Gift Card`,
        prefill: { name: f.buyer_name, email: f.buyer_email, contact: f.buyer_phone },
        theme: { color: occ?.grad?.[0] || "#d4af37" },
        handler: async (resp) => {
          try {
            const { data } = await API.post(`/verify`, resp);
            setDone(data);
          } catch (e) { toast.error(e.response?.data?.detail || "Payment verification failed"); }
        },
      }).open();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't start payment"); }
    finally { setBusy(false); }
  };

  const payUpi = async () => {
    setBusy(true);
    try {
      const d = await order("upi");
      if (d) setUpiOrder(d);
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't create the order"); }
    finally { setBusy(false); }
  };

  const [proofB64, setProofB64] = useState("");
  const [proofName, setProofName] = useState("");
  const [payTapped, setPayTapped] = useState(false);

  useEffect(() => {
    // Buyer returns from GPay/PhonePe → nudge them to add proof
    const onVisible = () => {
      if (document.visibilityState === "visible" && payTapped && !proofB64 && !upiRef.trim()) {
        toast.info("Paid? Add your UPI transaction ID or payment screenshot below to unlock the confirm button ⬇");
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [payTapped, proofB64, upiRef]);

  const onProofFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Screenshot too large — max 5MB"); return; }
    const reader = new FileReader();
    reader.onload = () => { setProofB64(reader.result); setProofName(file.name); };
    reader.readAsDataURL(file);
  };

  const confirmUpiPaid = async () => {
    setBusy(true);
    try {
      await API.post(`/${upiOrder.gift_card_id}/upi-paid`, { upi_ref: upiRef, proof_b64: proofB64 });
      setDone({ status: "awaiting_confirmation" });
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't submit"); }
    finally { setBusy(false); }
  };

  const inputCls = "w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-gold focus:outline-none";
  const canRzp = cfg?.payment?.razorpay;
  const canUpi = cfg?.payment?.upi;

  if (!cfg) return <div className="min-h-screen bg-[#080809] flex items-center justify-center"><Loader2 className="w-8 h-8 text-gold animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-[#080809] text-white" data-testid="gift-card-page">
      <Toaster theme="dark" position="top-center" toastOptions={{ style: TOASTER_STYLE }} />
      <div className="max-w-3xl mx-auto px-5 py-8 sm:py-12">
        <Link to={`/book/${slug}`} className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-gold transition-colors" data-testid="gift-back-link">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to {cfg.salon.name}
        </Link>
        <div className="mt-5 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gold to-amber-700 flex items-center justify-center"><Gift className="w-6 h-6 text-black" /></div>
          <div>
            <h1 className="font-playfair text-3xl sm:text-4xl">Gift Card for a Loved One</h1>
            <p className="text-xs text-white/50 mt-1">{cfg.salon.name}{cfg.salon.location ? ` · ${cfg.salon.location}` : ""} · valid {cfg.validity_days} days · redeemable on any service</p>
          </div>
        </div>

        {done ? (
          <div className="mt-10 text-center bg-white/5 border border-gold/30 rounded-3xl p-10" data-testid="gift-success">
            <div className="text-5xl">{done.status === "awaiting_confirmation" ? "⏳" : "🎉"}</div>
            {done.status === "awaiting_confirmation" ? (
              <>
                <h2 className="font-playfair text-2xl mt-3">Payment submitted!</h2>
                <p className="text-sm text-white/60 mt-2 max-w-md mx-auto">The salon will confirm your UPI payment shortly — then the gift card is emailed straight to <b className="text-white">{f.recipient_email}</b> with its unique code.</p>
              </>
            ) : (
              <>
                <h2 className="font-playfair text-2xl mt-3">{done.status === "scheduled" ? "Gift scheduled! 💌" : "Gift card sent! 🎁"}</h2>
                <p className="text-sm text-white/60 mt-2 max-w-md mx-auto">
                  {done.status === "scheduled"
                    ? <>It will be delivered to <b className="text-white">{f.recipient_email}</b> on <b className="text-gold">{done.send_on}</b>.</>
                    : <>The e-gift card is on its way to <b className="text-white">{f.recipient_email}</b>. Code: <b className="font-mono text-gold">{done.code}</b></>}
                  {" "}Valid till {done.expires_at}.
                </p>
                {done.whatsapp_url && (
                  <a href={done.whatsapp_url} target="_blank" rel="noreferrer" data-testid="gift-whatsapp-send-btn"
                    className="inline-flex items-center gap-2 mt-5 bg-[#25D366] hover:bg-[#1fbd5a] text-black font-bold rounded-full px-6 py-3 text-sm transition-colors">
                    💬 Send it to {f.recipient_name || "them"} on WhatsApp
                  </a>
                )}
              </>
            )}
            <Link to={`/book/${slug}`} className="btn-gold inline-flex items-center gap-2 mt-6">Book an appointment <Sparkles className="w-4 h-4" /></Link>
          </div>
        ) : upiOrder ? (
          <div className="mt-10 bg-white/5 border border-white/10 rounded-3xl p-8 text-center" data-testid="gift-upi-panel">
            <h2 className="font-playfair text-2xl">Pay ₹{finalAmount} via UPI</h2>
            <p className="text-xs text-white/50 mt-1">GPay · PhonePe · Paytm · any UPI app</p>
            {upiOrder.qr_b64 && (
              <div className="mt-5 flex flex-col items-center" data-testid="gift-upi-qr">
                <div className="bg-white p-2.5 rounded-2xl">
                  <img src={`data:image/png;base64,${upiOrder.qr_b64}`} alt="Scan to pay via UPI" className="w-44 h-44" />
                </div>
                <p className="text-[11px] text-white/50 mt-2">📱 Scan with GPay, PhonePe or any UPI app to pay ₹{finalAmount}</p>
              </div>
            )}
            <div className="mt-4 inline-flex items-center gap-2 bg-white/10 rounded-xl px-5 py-3 font-mono text-gold text-lg" data-testid="gift-upi-id">
              {upiOrder.upi_id}
              <button onClick={() => { navigator.clipboard.writeText(upiOrder.upi_id); setCopied(true); toast.success("UPI ID copied"); }} data-testid="gift-upi-copy">
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5" onClickCapture={() => setPayTapped(true)}>
              <a href={upiOrder.gpay_link || upiOrder.upi_link} data-testid="gift-upi-gpay"
                className="inline-flex items-center gap-1.5 bg-white text-black font-bold text-sm rounded-full px-5 py-2.5 hover:bg-white/90">
                <span className="font-black" style={{ color: "#4285F4" }}>G</span> Pay with GPay
              </a>
              <a href={upiOrder.phonepe_link || upiOrder.upi_link} data-testid="gift-upi-phonepe"
                className="inline-flex items-center gap-1.5 text-white font-bold text-sm rounded-full px-5 py-2.5" style={{ background: "#5f259f" }}>
                ▮ PhonePe
              </a>
              <a href={upiOrder.upi_link} className="btn-gold inline-flex items-center gap-2 !py-2.5 !text-sm" data-testid="gift-upi-open">Any UPI app</a>
            </div>
            <p className="text-[10px] text-white/35 mt-2">App buttons work on your phone — on a computer, scan the QR above.</p>
            <div className="mt-6 max-w-sm mx-auto text-left">
              <p className="text-[11px] text-white/60 mb-2 text-center">After paying, add <b className="text-gold">one proof</b> below — transaction ID <i>or</i> screenshot — to unlock the confirm button 🔒</p>
              <label className="text-[11px] uppercase tracking-wider text-white/40">UPI transaction ID</label>
              <input value={upiRef} onChange={(e) => setUpiRef(e.target.value)} placeholder="e.g. 4172XXXXXXXX" className={inputCls + " mt-1"} data-testid="gift-upi-ref" />
              <label className="block mt-3 text-[11px] uppercase tracking-wider text-white/40">Or payment screenshot (fastest confirmation)</label>
              <label data-testid="gift-proof-upload" className={`mt-1 flex items-center justify-center gap-2 border border-dashed rounded-xl px-4 py-3 text-xs cursor-pointer transition ${proofName ? "border-emerald-400/60 text-emerald-300 bg-emerald-500/10" : "border-white/20 text-white/50 hover:border-gold/60 hover:text-gold"}`}>
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onProofFile} />
                {proofName ? `📎 ${proofName} ✓ attached` : "📎 Attach your GPay/PhonePe payment screenshot"}
              </label>
              <button onClick={confirmUpiPaid} disabled={busy || (!proofB64 && upiRef.trim().length < 6)} data-testid="gift-upi-paid-btn"
                className="w-full mt-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl py-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                {busy ? "Submitting…"
                  : (!proofB64 && upiRef.trim().length < 6) ? "🔒 Add transaction ID or screenshot to confirm"
                  : "✓ I have paid — send the gift card"}
              </button>
              <p className="text-[10px] text-white/35 mt-2 text-center">The salon verifies your proof, then the card is emailed to {f.recipient_email}.</p>
            </div>
          </div>
        ) : (
          <>
            <h3 className="text-[11px] uppercase tracking-[0.25em] text-gold mt-10 mb-3">1 · Pick the occasion</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {cfg.occasions.map((o) => (
                <button key={o.key} onClick={() => setOccKey(o.key)} data-testid={`gift-occasion-${o.key}`}
                  className={`rounded-2xl px-2 py-3.5 text-center border transition-all ${occKey === o.key ? "border-gold bg-gold/10 scale-[1.03]" : "border-white/10 bg-white/[0.03] hover:border-white/30"}`}>
                  <div className="text-2xl">{o.emoji}</div>
                  <div className="text-[11px] mt-1 text-white/80">{o.label}</div>
                </button>
              ))}
            </div>

            <h3 className="text-[11px] uppercase tracking-[0.25em] text-gold mt-9 mb-3">2 · Choose the amount</h3>
            <div className="flex flex-wrap gap-2.5">
              {cfg.amounts.map((a) => (
                <button key={a} onClick={() => { setAmount(a); setCustom(""); }} data-testid={`gift-amount-${a}`}
                  className={`px-6 py-3 rounded-full border font-bold text-sm transition-all ${!custom && amount === a ? "border-gold bg-gold text-black" : "border-white/15 bg-white/[0.03] hover:border-white/40"}`}>
                  ₹{a}
                </button>
              ))}
              <input type="number" min={50} max={100000} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Custom ₹"
                data-testid="gift-amount-custom" className="w-32 bg-white/5 border border-white/15 rounded-full px-5 py-3 text-sm focus:border-gold focus:outline-none" />
            </div>

            <div className="mt-9 grid sm:grid-cols-2 gap-7 items-start">
              <div>
                <h3 className="text-[11px] uppercase tracking-[0.25em] text-gold mb-3">3 · The details</h3>
                <div className="space-y-2.5">
                  <input value={f.buyer_name} onChange={set("buyer_name")} placeholder="Your name *" data-testid="gift-buyer-name" className={inputCls} />
                  <input type="email" value={f.buyer_email} onChange={set("buyer_email")} placeholder="Your email *" data-testid="gift-buyer-email" className={inputCls} />
                  <input value={f.buyer_phone} onChange={set("buyer_phone")} placeholder="Your phone" data-testid="gift-buyer-phone" className={inputCls} />
                  <div className="h-px bg-white/10 my-1" />
                  <input value={f.recipient_name} onChange={set("recipient_name")} placeholder="Recipient's name *" data-testid="gift-recipient-name" className={inputCls} />
                  <input type="email" value={f.recipient_email} onChange={set("recipient_email")} placeholder="Recipient's email * (card is sent here)" data-testid="gift-recipient-email" className={inputCls} />
                  <input type="tel" value={f.recipient_whatsapp} onChange={set("recipient_whatsapp")} placeholder="Recipient's WhatsApp (optional — send it there too 💬)" data-testid="gift-recipient-whatsapp" className={inputCls} />
                  <textarea rows={2} maxLength={400} value={f.message} onChange={set("message")} placeholder={`Personal message — e.g. "Happy ${occ?.label || "day"}! Treat yourself 💛"`} data-testid="gift-message" className={inputCls} />
                  <div className="flex items-center gap-3 pt-1">
                    <button onClick={() => setSendLater(false)} data-testid="gift-send-now"
                      className={`px-4 py-2 rounded-full text-xs font-semibold border ${!sendLater ? "border-gold bg-gold/15 text-gold" : "border-white/15 text-white/60"}`}>Send now</button>
                    <button onClick={() => setSendLater(true)} data-testid="gift-send-later"
                      className={`px-4 py-2 rounded-full text-xs font-semibold border ${sendLater ? "border-gold bg-gold/15 text-gold" : "border-white/15 text-white/60"}`}>Send on the day 📅</button>
                    {sendLater && <input type="date" min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} value={sendOn} onChange={(e) => setSendOn(e.target.value)}
                      data-testid="gift-send-date" className="bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-xs focus:border-gold focus:outline-none" />}
                  </div>
                </div>
              </div>
              <div className="sm:sticky sm:top-6">
                <h3 className="text-[11px] uppercase tracking-[0.25em] text-gold mb-3">Preview</h3>
                <CardPreview cfg={cfg} occ={occ} amount={finalAmount} recipient={f.recipient_name} buyer={f.buyer_name} />
                <div className="mt-5 space-y-2.5">
                  {canRzp && (
                    <button onClick={payRazorpay} disabled={busy} data-testid="gift-pay-razorpay"
                      className="w-full btn-gold justify-center flex items-center gap-2 disabled:opacity-50">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />} Pay ₹{finalAmount || 0} · Card / UPI / Netbanking
                    </button>
                  )}
                  {canUpi && (
                    <button onClick={payUpi} disabled={busy} data-testid="gift-pay-upi"
                      className="w-full border border-emerald-400/40 bg-emerald-500/10 text-emerald-300 font-bold rounded-full py-3 text-sm hover:bg-emerald-500/20 disabled:opacity-50">
                      Pay via UPI · GPay / PhonePe {canRzp ? "(direct to salon)" : ""}
                    </button>
                  )}
                  {!canRzp && !canUpi && <p className="text-xs text-amber-300/80 text-center" data-testid="gift-no-payment">This salon hasn't enabled gift card payments yet — please contact them directly.</p>}
                  <p className="text-[10px] text-white/35 text-center">The e-gift card with a unique code is emailed {sendLater ? "on the chosen day" : "instantly after payment"}.</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
