import { useEffect, useState } from "react";
import axios from "axios";
import { Check, Sparkles, Phone, Mail, Globe, ShoppingBag, X, Minus, Plus } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";

const API = process.env.REACT_APP_BACKEND_URL;

const IMG = {
  shampoo: "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/dc9bdc2aab578e1698aeebe0b57a4bea367a76a33cade49cab042bfc52a227b3.jpeg",
  conditioner: "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/bf143980f0a5ad2f34d38481833ae40410589f624dd48cd8b99754b2210f8b20.jpeg",
  botox: "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/871f5d5cc09bfe08098f785a38dee0e30b6fa298eb297c63028d86dc056b7d86.jpeg",
  botoxShampoo: "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/b0dca30e52ebfadcc3cff07a56fbfebd841ec1eb628ff91533a7c1de1a2f3749.jpeg",
};

const PRODUCTS = [
  {
    id: "shampoo", img: IMG.shampoo, size: "250ml · 8.45 fl. oz.",
    name: "Long & Healthy Shampoo", sub: "Hibiscus & Ceramides",
    price: "₹400 – ₹480",
    desc: "A gentle yet effective shampoo enriched with Hibiscus, Ceramides, Biotin & Argan Oil that cleanses deeply while repairing damage, reduces hair fall and promotes healthy hair growth.",
    bestFor: "Dry, Damaged, Weak & Chemically Treated Hair",
    benefits: ["Reduces hair fall & breakage", "Repairs dry, damaged hair", "Strengthens hair roots", "Nourishes & hydrates", "Improves softness & shine", "Safe for color treated hair"],
    ingredients: ["Hibiscus Extract", "Ceramides", "Biotin (B7)", "Panthenol (B5)", "Argan Oil", "Rosemary Extract"],
    chemistry: "Loaded with Hibiscus flower extract, Ceramides and Biotin, this powerhouse blend repairs the hair shaft from within while Argan Oil seals in moisture — for visibly stronger, longer, healthier hair wash after wash.",
    howToUse: "Lather 1–2 pumps (or as needed) on wet palms & massage into scalp. Leave on for 60 seconds, rinse well. Repeat for a more thorough cleanse. Follow with Miracurl Nourish & Shine Conditioner to lock in moisture. Do a patch test before first use.",
    fullIngredients: "Aqua, Sodium Cocoyl Isethionate, Cocamidopropyl Betaine, Glycerin, Hibiscus Rosa-Sinensis Flower Extract, Ceramide NP, Biotin, Panthenol, Argania Spinosa (Argan) Kernel Oil, Rosmarinus Officinalis (Rosemary) Leaf Extract, Hydrolyzed Wheat Protein, Xanthan Gum, Phenoxyethanol, Sodium Benzoate, Citric Acid, Fragrance",
    mrp: "₹400 (250ml) · ₹480 (300ml)",
  },
  {
    id: "conditioner", img: IMG.conditioner, size: "250ml · 8.45 fl. oz.",
    name: "Nourish & Shine Conditioner", sub: "Ceramides · Panthenol · Keratin",
    price: "₹380 – ₹420",
    desc: "A rich, hydrating conditioner with Ceramides, Panthenol & Keratin that detangles, smoothens and locks in moisture for soft, manageable and shinier hair.",
    bestFor: "All Hair Types — Especially Dry & Frizzy Hair",
    benefits: ["Deeply hydrates & nourishes", "Locks in moisture", "Reduces frizz & tangles", "Strengthens & smoothens hair", "Adds natural shine", "Suitable for all hair types"],
    ingredients: ["Ceramides", "Panthenol", "Hydrolyzed Keratin", "Argan Oil", "Silk Protein", "Aloe Vera"],
    chemistry: "Ceramides rebuild the hair's natural moisture barrier while Keratin and Silk Protein smooth every strand — a rich, salon-grade conditioner that detangles instantly and leaves hair glossy, soft and manageable.",
    howToUse: "After shampooing, squeeze out excess water. Apply generously from mid-length to ends (avoid roots). Leave on for 2–3 minutes, then rinse thoroughly. Use after every wash for best results.",
    fullIngredients: "Aqua, Cetearyl Alcohol, Behentrimonium Chloride, Ceramide NP, Panthenol, Hydrolyzed Keratin, Argania Spinosa (Argan) Kernel Oil, Hydrolyzed Silk Protein, Aloe Barbadensis Leaf Juice, Glycerin, Dimethiconol, Phenoxyethanol, Sodium Benzoate, Citric Acid, Fragrance",
    mrp: "₹380 – ₹420 (250ml)",
  },
  {
    id: "botox", img: IMG.botox, size: "500ml or 1000ml — professional use",
    name: "Hair Botox Treatment", sub: "Deep Repair · Smooth · Shine",
    price: "₹4,500 (500ml) · ₹8,000 (1000ml)",
    desc: "A professional deep-repair treatment infused with Keratin, Peptides & Ceramides that restores hair structure, reduces frizz and breakage and delivers salon-like smooth, glossy & healthy hair.",
    bestFor: "Frizzy, Damaged, Unruly & Chemically Treated Hair",
    benefits: ["Deeply repairs damaged hair", "Reduces frizz & unruly hair", "Restores hair strength & elasticity", "Enhances smoothness & shine", "Hydrates & revitalizes", "Long-lasting salon-like finish"],
    ingredients: ["Hydrolyzed Keratin", "Peptides", "Ceramides", "Niacinamide (B3)", "Pea Peptide", "Argan Oil"],
    chemistry: "A professional-grade fusion of Hydrolyzed Keratin, Peptides and Ceramides that fills micro-damage inside the hair fibre, restoring elasticity, deep gloss and a silky salon finish that lasts for weeks.",
    howToUse: "PROFESSIONAL USE: Wash hair with a clarifying shampoo, towel-dry to 80%. Section hair and apply the treatment evenly strand by strand, keeping 1cm from the scalp. Leave for 30–45 minutes, then blow-dry and flat-iron in thin sections (180–200°C). Do not wash for 48 hours after treatment.",
    fullIngredients: "Aqua, Cetearyl Alcohol, Hydrolyzed Keratin, Copper Tripeptide-1, Ceramide NP, Niacinamide, Pisum Sativum (Pea) Peptide, Argania Spinosa (Argan) Kernel Oil, Behentrimonium Methosulfate, Glycerin, Panthenol, Hydrolyzed Collagen, Phenoxyethanol, Ethylhexylglycerin, Citric Acid, Fragrance",
    mrp: "₹4,500 (500ml) · ₹8,000 (1000ml)",
  },
  {
    id: "botox-shampoo", img: IMG.botoxShampoo, size: "250ml · 8.45 fl. oz.",
    name: "Keratin Botox Shampoo", sub: "Smooth · Strengthen · Shine",
    price: "₹2,500",
    desc: "A premium botox-care shampoo with Keratin, Peptides & Amino Acids that rebuilds hair strength, controls frizz and extends the life of your botox treatment with long-lasting shine & softness.",
    bestFor: "All Hair Types (Especially Frizz & Damage, post-Botox care)",
    benefits: ["Extends botox treatment results", "Rebuilds hair strength", "Controls frizz", "Long-lasting shine & softness", "Gentle sulfate-free cleanse", "Safe for treated hair"],
    ingredients: ["Hydrolyzed Keratin", "Peptides", "Amino Acids", "Ceramides", "Silk Protein", "Zinc PCA"],
    chemistry: "Keratin, Peptides and Amino Acids work together to rebuild the protein structure of treated hair while a gentle sulfate-free cleansing base protects your botox treatment — keeping hair smooth, strong and shiny for longer.",
    howToUse: "Wet hair thoroughly. Apply a small amount and massage gently into scalp and lengths — do not rub aggressively on treated hair. Leave for 60 seconds, rinse well. Use 2–3 times a week to extend your botox treatment. Follow with Miracurl Conditioner.",
    fullIngredients: "Aqua, Sodium Cocoyl Isethionate, Coco-Glucoside, Hydrolyzed Keratin, Copper Tripeptide-1, Arginine, Glycine, Ceramide NP, Hydrolyzed Silk Protein, Zinc PCA, Glycerin, Panthenol, Guar Hydroxypropyltrimonium Chloride, Phenoxyethanol, Sodium Benzoate, Citric Acid, Fragrance",
    mrp: "₹2,500 (250ml)",
  },
];

const BADGES = ["Paraben Free", "Sulfate Free", "Silicone Free", "Cruelty Free", "Vegan"];

function ProductDetailModal({ p, live, onClose, onOrder }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div className="product-pop bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-8 overflow-hidden max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid={`product-detail-${p.id}`}>
        {/* Hero */}
        <div className="grid grid-cols-1 sm:grid-cols-5">
          <div className="sm:col-span-2 bg-[#FDEDF0]">
            <img src={p.img} alt={p.name} className="w-full h-full max-h-64 sm:max-h-none object-cover" />
          </div>
          <div className="sm:col-span-3 p-6 relative">
            <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-700" data-testid="product-detail-close"><X className="w-5 h-5" /></button>
            <p className="text-[10px] font-bold tracking-[0.3em] text-[#C9A227] uppercase">Miracurl Hair Science</p>
            <h2 className="text-2xl font-extrabold text-[#A61C3C] leading-tight mt-1" style={{ fontFamily: "'Playfair Display', serif" }}>{p.name}</h2>
            <p className="text-xs font-semibold text-slate-500 mt-1">{p.sub} · {p.size}</p>
            <p className="mt-2 text-xl font-extrabold text-slate-900">{p.price}</p>
            {live && (
              <button onClick={onOrder} data-testid={`detail-order-now-${p.id}`}
                className="mt-3 inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-[#A61C3C] text-white text-sm font-bold hover:opacity-90 transition">
                <ShoppingBag className="w-4 h-4" /> Order Now
              </button>
            )}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {BADGES.map(b => <span key={b} className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700 uppercase tracking-wide">{b}</span>)}
            </div>
          </div>
        </div>
        {/* Back label */}
        <div className="p-6 pt-4 space-y-4 text-slate-700">
          <section>
            <p className="text-[11px] font-extrabold tracking-[0.2em] text-[#A61C3C] uppercase">We Have Chemistry</p>
            <p className="text-[13px] leading-relaxed mt-1">{p.chemistry}</p>
          </section>
          <section>
            <p className="text-[11px] font-extrabold tracking-[0.2em] text-[#A61C3C] uppercase">How To Use</p>
            <p className="text-[13px] leading-relaxed mt-1" data-testid={`detail-how-to-use-${p.id}`}>{p.howToUse}</p>
          </section>
          <section>
            <p className="text-[11px] font-extrabold tracking-[0.2em] text-[#A61C3C] uppercase">What's In — Ingredients</p>
            <p className="text-[12px] leading-relaxed mt-1 text-slate-600" data-testid={`detail-ingredients-${p.id}`}>{p.fullIngredients}</p>
          </section>
          <section>
            <p className="text-[11px] font-extrabold tracking-[0.2em] text-[#A61C3C] uppercase">What's Out</p>
            <p className="text-[13px] leading-relaxed mt-1">Parabens, Sulfates (SLS/SLES), Silicones, Phthalates, Formaldehyde & animal-derived ingredients.</p>
          </section>
          <div className="grid grid-cols-2 gap-3 text-[12px] bg-[#FDEDF0]/60 border border-rose-100 rounded-2xl p-4">
            <p><span className="font-bold text-[#A61C3C]">Net Vol:</span> {p.size}</p>
            <p><span className="font-bold text-[#A61C3C]">MRP (incl. taxes):</span> {p.mrp}</p>
            <p><span className="font-bold text-[#A61C3C]">Best For:</span> {p.bestFor}</p>
            <p><span className="font-bold text-[#A61C3C]">Use Before:</span> 24 months from Mfg. Dt.</p>
          </div>
          <section className="text-[11px] text-slate-500 leading-relaxed border-t border-rose-100 pt-3">
            <p><b>Important:</b> Store in a cool, dry place. For external use only. Do a patch test before first use.</p>
            <p className="mt-1"><b>Mktd by:</b> Miracurl Hair Science — Miracurl Suite, Marathahalli, Bengaluru, Karnataka, India.</p>
            <p className="mt-1"><b>Customer care:</b> Feedback/complaints? 📞 +91 8217072523 · ✉️ contact@miracurl-suite.com · 🌐 miracurl-suite.com</p>
          </section>
        </div>
      </div>
    </div>
  );
}

// numeric price for ordering (range products use the lower bound)
const ORDER_PRICE = { shampoo: 400, conditioner: 380, "botox-500": 4500, "botox-1000": 8000, "botox-shampoo": 2500 };
const ORDER_ITEMS = [
  { id: "shampoo", label: "Long & Healthy Shampoo (250ml)" },
  { id: "conditioner", label: "Nourish & Shine Conditioner (250ml)" },
  { id: "botox-500", label: "Hair Botox Treatment — 500ml" },
  { id: "botox-1000", label: "Hair Botox Treatment — 1000ml" },
  { id: "botox-shampoo", label: "Keratin Botox Shampoo (250ml)" },
];

function OrderModal({ cfg, onClose }) {
  const [qty, setQty] = useState({ shampoo: 0, conditioner: 0, "botox-500": 0, "botox-1000": 0, "botox-shampoo": 0 });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [pincode, setPincode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const total = Object.entries(qty).reduce((s, [k, q]) => s + q * ORDER_PRICE[k], 0);
  const step = (k, d) => setQty(q => ({ ...q, [k]: Math.max(0, Math.min(20, q[k] + d)) }));
  const inputCls = "px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-200";

  async function pay() {
    if (total < 1) return;
    setErr("");
    if (name.trim().length < 2) return setErr("Please enter your name");
    if (phone.replace(/\D/g, "").length < 10) return setErr("Please enter a valid phone number");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErr("Please enter a valid email — we'll send your receipt & payment confirmation there");
    if (address.trim().length < 8) return setErr("Please enter your full delivery address");
    if (!/^\d{6}$/.test(pincode.trim())) return setErr("Please enter a valid 6-digit PIN code");
    setBusy(true);
    try {
      const items = Object.entries(qty).filter(([, q]) => q > 0)
        .map(([id, q]) => ({ id, qty: q, price: ORDER_PRICE[id] }));
      const { data } = await axios.post(`${API}/api/public/product-orders`, {
        name: name.trim(), phone, email: email.trim(), address: address.trim(), pincode: pincode.trim(), items, total });
      if (data.razorpay_link) {
        window.open(data.razorpay_link, "_blank");
      }
      setErr("");
      onClose(`Order received! Receipt sent to ${email.trim()} ✦`);
    } catch (e) {
      const d = e.response?.data?.detail;
      setErr(typeof d === "string" ? d : "Couldn't place the order — please check your details and try again");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()} data-testid="product-order-modal">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-extrabold text-[#A61C3C]" style={{ fontFamily: "'Playfair Display', serif" }}>Order Miracurl Products</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" data-testid="order-modal-close"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-2.5">
          {ORDER_ITEMS.map(p => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-rose-100 bg-[#FDEDF0]/50 px-3 py-2.5" data-testid={`order-row-${p.id}`}>
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-800">{p.label}</p>
                <p className="text-xs text-slate-500">₹{ORDER_PRICE[p.id].toLocaleString("en-IN")}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => step(p.id, -1)} className="w-7 h-7 rounded-full border border-rose-200 text-[#A61C3C] flex items-center justify-center hover:bg-rose-50" data-testid={`order-minus-${p.id}`}><Minus className="w-3.5 h-3.5" /></button>
                <span className="w-6 text-center text-sm font-bold" data-testid={`order-qty-${p.id}`}>{qty[p.id]}</span>
                <button onClick={() => step(p.id, 1)} className="w-7 h-7 rounded-full bg-[#A61C3C] text-white flex items-center justify-center hover:opacity-90" data-testid={`order-plus-${p.id}`}><Plus className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name *" data-testid="order-name-input" className={inputCls} />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone (+91…) *" inputMode="tel" data-testid="order-phone-input" className={inputCls} />
        </div>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email — for receipt & payment confirmation *" type="email" data-testid="order-email-input"
          className={`${inputCls} w-full mt-2`} />
        <div className="grid grid-cols-[1fr_110px] gap-2 mt-2">
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Delivery address *" data-testid="order-address-input" className={inputCls} />
          <input value={pincode} onChange={e => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="PIN code *" inputMode="numeric" data-testid="order-pincode-input" className={inputCls} />
        </div>
        {err && <p className="text-xs text-rose-600 font-semibold mt-2" data-testid="order-error">{err}</p>}
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-slate-500">Total</p>
          <p className="text-2xl font-extrabold text-slate-900" data-testid="order-total">₹{total.toLocaleString("en-IN")}</p>
        </div>
        <button onClick={pay} disabled={busy || total < 1} data-testid="order-pay-razorpay-btn"
          className="mt-3 w-full py-3 rounded-xl bg-[#A61C3C] text-white font-bold shadow-md hover:opacity-90 transition disabled:opacity-40">
          {busy ? "Placing order…" : "Pay with Razorpay →"}
        </button>
        <p className="text-[10px] text-slate-400 text-center mt-2">Questions? payments@miracurl-suite.com</p>
      </div>
    </div>
  );
}

export default function MiracurlProducts() {
  const [cfg, setCfg] = useState({ available: false, razorpay_link: "" });
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderMsg, setOrderMsg] = useState("");
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    axios.get(`${API}/api/public/products-config`).then(({ data }) => setCfg(data)).catch(() => {});
  }, []);
  const live = cfg.available;

  return (
    <div className="min-h-screen bg-white text-slate-800" data-testid="miracurl-products-page" style={{ fontFamily: "'Manrope', sans-serif" }}>
      {/* Shared marketing header — same as the rest of the site */}
      <SiteHeader variant="light" />

      {/* Hero */}
      <header className="text-center pt-12 pb-10 px-4">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-wide text-[#A61C3C]" style={{ fontFamily: "'Playfair Display', serif" }}>MIRACURL</h1>
        <p className="text-[11px] tracking-[0.5em] text-[#C9A227] font-bold mt-1">HAIR SCIENCE</p>
        <p className="mt-3 text-lg font-semibold text-slate-700">Science. Nature. You.</p>
        <p className="text-sm text-slate-500">Advanced Haircare for Stronger, Healthier, Shinier Hair</p>
        {live ? (
          <button onClick={() => setOrderOpen(true)} data-testid="products-order-now-hero-btn"
            className="inline-flex items-center gap-2 mt-5 px-6 py-2.5 rounded-full bg-[#A61C3C] text-white text-sm font-bold tracking-widest shadow-md hover:opacity-90 transition">
            <ShoppingBag className="w-4 h-4" /> ORDER NOW
          </button>
        ) : (
          <span className="inline-block mt-5 px-5 py-2 rounded-full bg-[#A61C3C] text-white text-sm font-bold tracking-widest shadow-md animate-pulse" data-testid="products-coming-soon-badge">✦ COMING SOON ✦</span>
        )}
        <div className="flex flex-wrap justify-center gap-2 mt-6">
          {BADGES.map(b => (
            <span key={b} className="px-3 py-1.5 rounded-full border border-[#C9A227]/40 bg-white text-[11px] font-bold text-[#8a6d1a] uppercase tracking-wide">{b}</span>
          ))}
        </div>
      </header>

      {/* Range banner */}
      <div className="bg-[#A61C3C] text-center py-3 px-4">
        <p className="text-white font-bold tracking-wide flex items-center justify-center gap-2"><Sparkles className="w-4 h-4 text-[#F5D97E]" /> MIRACURL HAIRCARE RANGE</p>
        <p className="text-[#F5D97E] text-xs italic" style={{ fontFamily: "'Playfair Display', serif" }}>Powered by Science. Inspired by Nature.</p>
      </div>

      {/* Products */}
      <main className="max-w-6xl mx-auto px-4 py-12 grid md:grid-cols-2 gap-8">
        {PRODUCTS.map((p, i) => (
          <article key={p.id} data-testid={`product-card-${p.id}`} onClick={() => setDetail(p)}
            className="relative bg-white rounded-3xl shadow-lg shadow-rose-100 overflow-hidden border border-rose-100 flex flex-col cursor-pointer transition-transform duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:border-rose-300">
            {live ? (
              <span className="absolute top-4 right-[-38px] rotate-45 bg-emerald-500 text-white text-[10px] font-bold tracking-widest px-10 py-1 shadow">AVAILABLE</span>
            ) : (
              <span className="absolute top-4 right-[-38px] rotate-45 bg-[#C9A227] text-white text-[10px] font-bold tracking-widest px-10 py-1 shadow">COMING SOON</span>
            )}
            <div className="grid grid-cols-5 gap-0">
              <div className="col-span-2 bg-[#FDEDF0]">
                <img src={p.img} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
              </div>
              <div className="col-span-3 p-5">
                <p className="text-[10px] font-bold tracking-widest text-[#C9A227] uppercase">{i + 1}. Miracurl</p>
                <h2 className="text-xl font-extrabold text-[#A61C3C] leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>{p.name}</h2>
                <p className="text-xs font-semibold text-slate-500 mt-0.5">{p.sub} · {p.size}</p>
                <p className="mt-2 text-lg font-extrabold text-slate-900" data-testid={`product-price-${p.id}`}>{p.price}</p>
                {live && (
                  <button onClick={(e) => { e.stopPropagation(); setOrderOpen(true); }} data-testid={`order-now-${p.id}`}
                    className="mt-2 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#A61C3C] text-white text-xs font-bold hover:opacity-90 transition">
                    <ShoppingBag className="w-3.5 h-3.5" /> Order Now
                  </button>
                )}
                <p className="mt-2 text-[13px] text-slate-600 leading-relaxed">{p.desc}</p>
                <p className="mt-2 text-[11px] text-slate-500"><span className="font-bold text-[#A61C3C]">Best For:</span> {p.bestFor}</p>
              </div>
            </div>
            <div className="px-5 pb-5">
              <p className="text-[10px] font-bold tracking-widest text-[#A61C3C] uppercase border-b border-rose-100 pb-1 mb-2">Benefits</p>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {p.benefits.map(b => (
                  <li key={b} className="flex items-start gap-1.5 text-[12px] text-slate-600">
                    <Check className="w-3.5 h-3.5 text-[#C9A227] mt-0.5 shrink-0" /> {b}
                  </li>
                ))}
              </ul>
              <p className="text-[10px] font-bold tracking-widest text-[#A61C3C] uppercase border-b border-rose-100 pb-1 mb-2 mt-4">Key Ingredients</p>
              <div className="flex flex-wrap gap-1.5">
                {p.ingredients.map(ing => (
                  <span key={ing} className="px-2.5 py-1 rounded-full bg-[#FDEDF0] border border-rose-200 text-[11px] font-semibold text-[#A61C3C]">{ing}</span>
                ))}
              </div>
            </div>
          </article>
        ))}
      </main>

      {/* Combo offer */}
      <section className="max-w-4xl mx-auto px-4 pb-12">
        <div className="rounded-3xl bg-gradient-to-r from-[#A61C3C] to-[#7d1029] text-white p-8 text-center shadow-xl" data-testid="botox-combo-banner">
          <p className="text-[#F5D97E] text-xs font-bold tracking-[0.35em] uppercase">Signature Combo</p>
          <h3 className="text-2xl sm:text-3xl font-extrabold mt-1" style={{ fontFamily: "'Playfair Display', serif" }}>Hair Botox Treatment + Keratin Botox Shampoo</h3>
          <p className="mt-3 text-sm text-white/80">Complete botox care — the salon treatment plus the shampoo that makes it last.</p>
          <p className="mt-4 text-lg"><span className="line-through text-white/50 mr-3">₹10,500</span>
            <span className="text-3xl font-extrabold text-[#F5D97E]" data-testid="combo-price">₹9,500</span>
            <span className="ml-2 text-xs font-bold bg-[#F5D97E] text-[#7d1029] px-2 py-1 rounded-full align-middle">SAVE ₹1,000</span></p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#7d1029] text-white py-8 px-4">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-extrabold tracking-wide" style={{ fontFamily: "'Playfair Display', serif" }}>MIRACURL <span className="text-[#F5D97E]">HAIR SCIENCE</span></p>
            <p className="text-xs text-white/70">Your Brand. Your Identity. We create. You Shine.</p>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-white/85">
            <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-[#F5D97E]" /> +91 8217072523</span>
            <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-[#F5D97E]" /> miracurl-suite.com</span>
            <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-[#F5D97E]" /> payments@miracurl-suite.com</span>
          </div>
        </div>
      </footer>
      {detail && <ProductDetailModal p={detail} live={live} onClose={() => setDetail(null)}
        onOrder={() => { setDetail(null); setOrderOpen(true); }} />}
      {orderOpen && <OrderModal cfg={cfg} onClose={(msg) => { setOrderOpen(false); if (typeof msg === "string") setOrderMsg(msg); }} />}
      {orderMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-sm font-semibold px-5 py-3 rounded-full shadow-xl flex items-center gap-2" data-testid="order-success-toast">
          <Check className="w-4 h-4" /> {orderMsg}
          <button onClick={() => setOrderMsg("")} className="ml-2 opacity-80 hover:opacity-100" data-testid="order-success-close"><X className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
}
