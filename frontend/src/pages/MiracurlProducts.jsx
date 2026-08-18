import { Check, Sparkles, Phone, Mail, Globe } from "lucide-react";

const IMG = {
  shampoo: "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/989481972d50b053295669a1f172eb4a879d26c087594d373f0ba2b491f257e1.jpeg",
  conditioner: "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/96a5c96b547c4e2683aeb125326bc5e20de53671198085725e78fb393e691542.jpeg",
  botox: "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/614c893dfc20a619123f76f6e60a3347eeb531c846a4a91a7d7ed0f1210f16a2.jpeg",
  botoxShampoo: "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/3d93c583e1940c519235821760acb0f820b1f066a140435ac385684de72e40e5.jpeg",
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
    id: "botox", img: IMG.botox, size: "300ml · 10.14 fl. oz.",
    name: "Hair Botox Treatment", sub: "Deep Repair · Smooth · Shine",
    price: "₹8,000",
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

export default function MiracurlProducts() {
  return (
    <div className="min-h-screen bg-[#FFF5F6] text-slate-800" data-testid="miracurl-products-page" style={{ fontFamily: "'Manrope', sans-serif" }}>
      {/* Hero */}
      <header className="text-center pt-14 pb-10 px-4 bg-gradient-to-b from-[#FDEDF0] to-[#FFF5F6]">
        <div className="w-20 h-20 mx-auto rounded-full border-2 border-[#C9A227] flex items-center justify-center text-[#C9A227] font-serif text-3xl font-bold shadow-sm bg-white/60">MS✦</div>
        <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold tracking-wide text-[#A61C3C]" style={{ fontFamily: "'Playfair Display', serif" }}>MIRACURL</h1>
        <p className="text-[11px] tracking-[0.5em] text-[#C9A227] font-bold mt-1">HAIR SCIENCE</p>
        <p className="mt-3 text-lg font-semibold text-slate-700">Science. Nature. You.</p>
        <p className="text-sm text-slate-500">Advanced Haircare for Stronger, Healthier, Shinier Hair</p>
        <span className="inline-block mt-5 px-5 py-2 rounded-full bg-[#A61C3C] text-white text-sm font-bold tracking-widest shadow-md animate-pulse" data-testid="products-coming-soon-badge">✦ COMING SOON ✦</span>
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
            <span className="absolute top-4 right-[-38px] rotate-45 bg-[#C9A227] text-white text-[10px] font-bold tracking-widest px-10 py-1 shadow">COMING SOON</span>
            <div className="grid grid-cols-5 gap-0">
              <div className="col-span-2 bg-[#FDEDF0]">
                <img src={p.img} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
              </div>
              <div className="col-span-3 p-5">
                <p className="text-[10px] font-bold tracking-widest text-[#C9A227] uppercase">{i + 1}. Miracurl</p>
                <h2 className="text-xl font-extrabold text-[#A61C3C] leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>{p.name}</h2>
                <p className="text-xs font-semibold text-slate-500 mt-0.5">{p.sub} · {p.size}</p>
                <p className="mt-2 text-lg font-extrabold text-slate-900" data-testid={`product-price-${p.id}`}>{p.price}</p>
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
            <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-[#F5D97E]" /> info@miracurl.com</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
