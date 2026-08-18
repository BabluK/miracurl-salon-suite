import { ShoppingBag, ArrowRight } from "lucide-react";

const PRODUCTS = [
  { id: "shampoo", name: "Long & Healthy Shampoo", sub: "Hibiscus & Ceramides", price: "₹400 – ₹480",
    img: "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/dc9bdc2aab578e1698aeebe0b57a4bea367a76a33cade49cab042bfc52a227b3.jpeg" },
  { id: "conditioner", name: "Nourish & Shine Conditioner", sub: "Ceramides · Panthenol · Keratin", price: "₹380 – ₹420",
    img: "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/bf143980f0a5ad2f34d38481833ae40410589f624dd48cd8b99754b2210f8b20.jpeg" },
  { id: "botox", name: "Hair Botox Treatment", sub: "Deep Repair · Smooth · Shine", price: "₹4,500 / ₹8,000",
    img: "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/871f5d5cc09bfe08098f785a38dee0e30b6fa298eb297c63028d86dc056b7d86.jpeg" },
  { id: "botox-shampoo", name: "Keratin Botox Shampoo", sub: "Smooth · Strengthen · Shine", price: "₹2,500",
    img: "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/b0dca30e52ebfadcc3cff07a56fbfebd841ec1eb628ff91533a7c1de1a2f3749.jpeg" },
];

export const MiracurlProductsStrip = ({ compact = false }) => (
  <section className={`relative z-10 max-w-6xl mx-auto px-6 sm:px-10 ${compact ? "py-10" : "pb-24"}`} data-testid="miracurl-products-strip">
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <div className="text-[11px] uppercase tracking-[0.35em] text-[#DFB78C] font-semibold flex items-center gap-2">
          <ShoppingBag className="w-3.5 h-3.5" /> Miracurl Hair Science
        </div>
        <h2 className={`font-playfair ${compact ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl"} font-light mt-3 text-white`}>
          Our Products — salon-grade care at home
        </h2>
        <p className="text-white/50 text-sm mt-2 max-w-lg">
          Paraben free · Sulfate free · Silicone free · Cruelty free · Vegan. Order online, delivered to your door.
        </p>
      </div>
      <a href="/products" data-testid="products-strip-shop-link"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#1c160c] text-sm font-bold hover:brightness-110 hover:-translate-y-0.5 shadow-[0_8px_24px_-6px_rgba(200,155,82,0.5)] transition-transform">
        Order Online <ArrowRight className="w-4 h-4" />
      </a>
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
      {PRODUCTS.map((p) => (
        <a key={p.id} href="/products" data-testid={`products-strip-card-${p.id}`}
          className="group rounded-3xl bg-[#0F0F10] border border-white/10 overflow-hidden hover:border-[#DFB78C]/40 hover:-translate-y-1 transition-transform">
          <div className="aspect-square bg-[#FBF6EC] overflow-hidden">
            <img src={p.img} alt={p.name} loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          </div>
          <div className="p-4">
            <div className="text-sm font-semibold text-white leading-snug">{p.name}</div>
            <div className="text-[11px] text-white/45 mt-0.5">{p.sub}</div>
            <div className="text-[13px] font-bold text-[#DFB78C] mt-2">{p.price}</div>
          </div>
        </a>
      ))}
    </div>
  </section>
);
