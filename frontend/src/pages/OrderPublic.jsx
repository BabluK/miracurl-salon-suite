import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Loader2, Minus, Plus, UtensilsCrossed, CheckCircle2 } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function OrderPublic() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const [salon, setSalon] = useState(null);
  const [menu, setMenu] = useState([]);
  const [offer, setOffer] = useState(null);
  const [specials, setSpecials] = useState({});
  const [qty, setQty] = useState({});
  const [table, setTable] = useState(params.get("table") || "");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    axios.get(`${BACKEND_URL}/api/public/salon/${slug}`).then(r => setSalon(r.data)).catch(() => setSalon(false));
    axios.get(`${BACKEND_URL}/api/public/services/${slug}`).then(r => setMenu(r.data)).catch(() => {});
    axios.get(`${BACKEND_URL}/api/public/day-offer/${slug}`).then(r => {
      if (r.data?.offer?.discount_pct > 0) setOffer(r.data.offer);
    }).catch(() => {});
    axios.get(`${BACKEND_URL}/api/public/category-specials/${slug}`).then(r => setSpecials(r.data.specials || {})).catch(() => {});
  }, [slug]);

  const byCat = useMemo(() => {
    const g = {};
    menu.forEach(m => { (g[m.category || "Menu"] ||= []).push(m); });
    return g;
  }, [menu]);
  const cart = useMemo(() => menu.filter(m => qty[m.id] > 0), [menu, qty]);
  const total = cart.reduce((a, m) => a + m.price * qty[m.id], 0);
  const offPct = Number(offer?.discount_pct) || 0;
  const pctFor = (m) => Math.max(Number(specials[m.category || "Menu"] || specials[m.category] || 0), offPct);
  const payable = Math.round(cart.reduce((a, m) => a + m.price * qty[m.id] * (1 - pctFor(m) / 100), 0));
  const anyDiscount = payable < Math.round(total);

  function bump(id, d) { setQty(q => ({ ...q, [id]: Math.max(0, (q[id] || 0) + d) })); }

  async function submit() {
    if (!table || Number(table) < 1) { toast.error("Please enter your table number"); return; }
    if (cart.length === 0) { toast.error("Add at least one dish"); return; }
    setBusy(true);
    try {
      const { data } = await axios.post(`${BACKEND_URL}/api/public/table-order/${slug}`, {
        table_no: Number(table), customer_name: name.trim() || null,
        items: cart.map(m => ({ id: m.id, qty: qty[m.id] })),
      });
      setDone(data.order);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not place the order");
    } finally { setBusy(false); }
  }

  if (salon === false) return <div className="min-h-screen bg-[#0d0b10] text-white flex items-center justify-center">Restaurant not found</div>;
  if (!salon) return <div className="min-h-screen bg-[#0d0b10] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gold" /></div>;

  if (done) return (
    <div className="min-h-screen bg-[#0d0b10] text-white flex items-center justify-center p-6" data-testid="order-success">
      <div className="max-w-sm text-center">
        <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto" />
        <h1 className="font-playfair text-3xl mt-4">Order sent to the kitchen!</h1>
        <p className="text-white/60 text-sm mt-2">Order <b className="text-gold font-mono">#{done.id}</b> · Table {done.table_no} · ₹{done.total.toLocaleString("en-IN")}</p>
        <p className="text-white/40 text-xs mt-3">Sit back — your food is being prepared 🍽️</p>
        <button onClick={() => { setDone(null); setQty({}); }} data-testid="order-again-btn"
          className="btn-gold mt-6">Order something else</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0d0b10] text-white pb-40" data-testid="order-public-page">
      <header className="px-5 pt-8 pb-5 border-b border-white/10">
        <div className="flex items-center gap-2 text-gold text-[10px] tracking-[0.3em] uppercase"><UtensilsCrossed className="w-3.5 h-3.5" /> Order at your table</div>
        <h1 className="font-playfair text-3xl mt-1">{salon.name}</h1>
        <div className="flex gap-3 mt-4">
          <input value={table} onChange={e => setTable(e.target.value.replace(/\D/g, ""))} inputMode="numeric"
            data-testid="order-table-input" placeholder="Table #"
            className="w-24 px-3 py-2.5 rounded-xl bg-white/5 border border-gold/40 text-center font-bold text-gold placeholder:text-white/30 focus:outline-none focus:border-gold" />
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name (optional)"
            data-testid="order-name-input"
            className="flex-1 px-3 py-2.5 rounded-xl bg-white/5 border border-white/15 text-sm placeholder:text-white/30 focus:outline-none focus:border-gold/60" />
        </div>
      </header>

      <main className="px-5 py-6 space-y-8">
        {offer && (
          <div className="rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3" data-testid="order-day-offer">
            <p className="text-gold text-xs font-bold">✨ Today's special — {offPct}% OFF your whole order</p>
            {offer.title && <p className="text-white/50 text-[11px] mt-0.5">{offer.title}</p>}
          </div>
        )}
        {Object.entries(byCat).map(([cat, items]) => (
          <section key={cat}>
            <h2 className="text-gold text-xs tracking-[0.25em] uppercase mb-3 flex items-center gap-2">
              {cat}
              {specials[cat] > 0 && (
                <span data-testid={`cat-special-${cat}`} className="text-[9px] font-bold tracking-normal normal-case px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-300">
                  {specials[cat]}% OFF today
                </span>
              )}
            </h2>
            <div className="space-y-2.5">
              {items.map(m => (
                <div key={m.id} data-testid={`menu-item-${m.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{m.name}</p>
                    {pctFor(m) > 0 ? (
                      <p className="text-xs font-bold mt-0.5"><s className="text-white/35">₹{Math.round(m.price)}</s> <span className="text-emerald-300">₹{Math.round(m.price * (1 - pctFor(m) / 100))}</span></p>
                    ) : (
                      <p className="text-gold text-xs font-bold mt-0.5">₹{Math.round(m.price)}</p>
                    )}
                  </div>
                  {qty[m.id] > 0 ? (
                    <div className="flex items-center gap-3 shrink-0">
                      <button onClick={() => bump(m.id, -1)} data-testid={`menu-minus-${m.id}`} className="w-8 h-8 rounded-full border border-gold/50 text-gold flex items-center justify-center"><Minus className="w-3.5 h-3.5" /></button>
                      <span className="font-bold w-4 text-center">{qty[m.id]}</span>
                      <button onClick={() => bump(m.id, 1)} data-testid={`menu-plus-${m.id}`} className="w-8 h-8 rounded-full bg-gold text-bg-base flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <button onClick={() => bump(m.id, 1)} data-testid={`menu-add-${m.id}`}
                      className="shrink-0 px-4 py-1.5 rounded-full border border-gold/50 text-gold text-xs font-bold hover:bg-gold hover:text-bg-base transition-colors">ADD</button>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
        {menu.length === 0 && <p className="text-white/40 text-sm text-center py-10">Menu coming soon…</p>}
      </main>

      {cart.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 p-4 bg-[#12101a]/95 backdrop-blur border-t border-gold/25" data-testid="order-cart-bar">
          <button onClick={submit} disabled={busy}
            data-testid="order-submit-btn"
            className="w-full btn-gold py-3.5 flex items-center justify-center gap-2 text-sm font-bold disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UtensilsCrossed className="w-4 h-4" />}
            Send order to kitchen · {cart.reduce((a, m) => a + qty[m.id], 0)} item(s) ·
            {anyDiscount && <s className="opacity-60">₹{Math.round(total).toLocaleString("en-IN")}</s>} ₹{payable.toLocaleString("en-IN")}
          </button>
        </div>
      )}
    </div>
  );
}
