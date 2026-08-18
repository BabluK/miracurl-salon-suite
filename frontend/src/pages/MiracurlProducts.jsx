import { useEffect, useState } from "react";
import axios from "axios";
import { Check, Sparkles, Phone, Mail, Globe, ShoppingBag, X, Minus, Plus } from "lucide-react";

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
  },
  {
    id: "conditioner", img: IMG.conditioner, size: "250ml · 8.45 fl. oz.",
    name: "Nourish & Shine Conditioner", sub: "Ceramides · Panthenol · Keratin",
    price: "₹380 – ₹420",
    desc: "A rich, hydrating conditioner with Ceramides, Panthenol & Keratin that detangles, smoothens and locks in moisture for soft, manageable and shinier hair.",
    bestFor: "All Hair Types — Especially Dry & Frizzy Hair",
    benefits: ["Deeply hydrates & nourishes", "Locks in moisture", "Reduces frizz & tangles", "Strengthens & smoothens hair", "Adds natural shine", "Suitable for all hair types"],
    ingredients: ["Ceramides", "Panthenol", "Hydrolyzed Keratin", "Argan Oil", "Silk Protein", "Aloe Vera"],
  },
  {
    id: "botox", img: IMG.botox, size: "500ml or 1000ml — professional use",
    name: "Hair Botox Treatment", sub: "Deep Repair · Smooth · Shine",
    price: "₹4,500 (500ml) · ₹8,000 (1000ml)",
    desc: "A professional deep-repair treatment infused with Keratin, Peptides & Ceramides that restores hair structure, reduces frizz and breakage and delivers salon-like smooth, glossy & healthy hair.",
    bestFor: "Frizzy, Damaged, Unruly & Chemically Treated Hair",
    benefits: ["Deeply repairs damaged hair", "Reduces frizz & unruly hair", "Restores hair strength & elasticity", "Enhances smoothness & shine", "Hydrates & revitalizes", "Long-lasting salon-like finish"],
    ingredients: ["Hydrolyzed Keratin", "Peptides", "Ceramides", "Niacinamide (B3)", "Pea Peptide", "Argan Oil"],
  },
  {
    id: "botox-shampoo", img: IMG.botoxShampoo, size: "250ml · 8.45 fl. oz.",
    name: "Keratin Botox Shampoo", sub: "Smooth · Strengthen · Shine",
    price: "₹2,500",
    desc: "A premium botox-care shampoo with Keratin, Peptides & Amino Acids that rebuilds hair strength, controls frizz and extends the life of your botox treatment with long-lasting shine & softness.",
    bestFor: "All Hair Types (Especially Frizz & Damage, post-Botox care)",
    benefits: ["Extends botox treatment results", "Rebuilds hair strength", "Controls frizz", "Long-lasting shine & softness", "Gentle sulfate-free cleanse", "Safe for treated hair"],
    ingredients: ["Hydrolyzed Keratin", "Peptides", "Amino Acids", "Ceramides", "Silk Protein", "Zinc PCA"],
  },
];

const BADGES = ["Paraben Free", "Sulfate Free", "Silicone Free", "Cruelty Free", "Vegan"];

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
  const [busy, setBusy] = useState(false);
  const total = Object.entries(qty).reduce((s, [k, q]) => s + q * ORDER_PRICE[k], 0);
  const step = (k, d) => setQty(q => ({ ...q, [k]: Math.max(0, Math.min(20, q[k] + d)) }));

  async function pay() {
    if (total < 1) return;
    if (name.trim().length < 2 || phone.replace(/\D/g, "").length < 10) {
      alert("Please enter your name and a valid phone number");
      return;
    }
    setBusy(true);
    try {
      const items = Object.entries(qty).filter(([, q]) => q > 0)
        .map(([id, q]) => ({ id, qty: q, price: ORDER_PRICE[id] }));
      const { data } = await axios.post(`${API}/api/public/product-orders`, { name: name.trim(), phone, items, total });
      if (data.razorpay_link) {
        window.open(data.razorpay_link, "_blank");
      } else {
        alert(`Order received! Our team will send you a payment link shortly. For help: ${data.contact_email}`);
      }
      onClose();
    } catch (e) {
      alert(e.response?.data?.detail || "Couldn't place the order — please try again");
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
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" data-testid="order-name-input"
            className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200" />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone (+91…)" inputMode="tel" data-testid="order-phone-input"
            className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200" />
        </div>
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

  useEffect(() => {
    axios.get(`${API}/api/public/products-config`).then(({ data }) => setCfg(data)).catch(() => {});
  }, []);
  const live = cfg.available;

  return (
    <div className="min-h-screen bg-[#FBF6EC] text-slate-800" data-testid="miracurl-products-page" style={{ fontFamily: "'Manrope', sans-serif" }}>
      {/* Site header — matches the marketing site */}
      <nav className="bg-[#FBF6EC] border-b border-[#e7dcc4] px-6 py-4 flex items-center gap-3">
        <div className="w-11 h-11 rounded-full border-2 border-[#C9A227] flex items-center justify-center text-[#C9A227] font-serif text-lg font-bold bg-white/70">MS✦</div>
        <div>
          <p className="text-[#C9A227] font-extrabold tracking-widest text-lg leading-none" style={{ fontFamily: "'Playfair Display', serif" }}>MIRACURL SUITE</p>
          <p className="text-[9px] tracking-[0.35em] text-slate-500 font-semibold">SMART SALON MANAGEMENT SOFTWARE</p>
        </div>
        <a href="/" className="ml-auto text-xs font-bold text-[#A61C3C] hover:underline" data-testid="products-home-link">← Home</a>
      </nav>

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
          <article key={p.id} data-testid={`product-card-${p.id}`} className="relative bg-white rounded-3xl shadow-lg shadow-rose-100 overflow-hidden border border-rose-100 flex flex-col">
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
                  <button onClick={() => setOrderOpen(true)} data-testid={`order-now-${p.id}`}
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
            <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-[#F5D97E]" /> miracurl.com</span>
            <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-[#F5D97E]" /> payments@miracurl-suite.com</span>
          </div>
        </div>
      </footer>
      {orderOpen && <OrderModal cfg={cfg} onClose={() => setOrderOpen(false)} />}
    </div>
  );
}
