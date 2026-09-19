import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Loader2, Minus, Plus, UtensilsCrossed, Users, Bell, Droplets, ShoppingCart, LayoutGrid, ChevronDown, User, Phone, ArrowRight } from "lucide-react";

const CAT_ICON = (c) => { const k = c.toLowerCase(); return /bever|drink|juice|shake|coffee|tea/.test(k) ? "☕" : /bread|rice|naan|roti|biryani/.test(k) ? "🍚" : /dessert|sweet|ice/.test(k) ? "🍰" : /starter|snack|grill|bbq|tandoor|kebab/.test(k) ? "🍢" : /pizza/.test(k) ? "🍕" : /burger|sandwich/.test(k) ? "🍔" : /soup|salad/.test(k) ? "🥗" : /main|curry|gravy|veg/.test(k) ? "🍛" : /chicken|mutton|fish|non/.test(k) ? "🍗" : "🍽️"; };
import { DishPhotoLightbox } from "../components/DishPhotoLightbox";
import { thumbUrl } from "@/lib/api";
import { WelcomeGate } from "../components/order/WelcomeGate";
import { OrderStatusView } from "../components/order/OrderStatusView";

const ACTIVE_KEY = (slug) => `mc_order_active:${slug}`;
const readActive = (slug) => { try { const o = JSON.parse(localStorage.getItem(ACTIVE_KEY(slug)) || "null"); return o && Date.now() - new Date(o.created_at).getTime() < 3 * 3600 * 1000 ? o : null; } catch { return null; } };

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function OrderPublic() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const [salon, setSalon] = useState(null);
  const [menu, setMenu] = useState([]);
  const [offer, setOffer] = useState(null);
  const [specials, setSpecials] = useState({});
  const [stats, setStats] = useState({ counts: {}, best_sellers: [] });
  const [qty, setQty] = useState({});
  const [spice, setSpice] = useState({});
  const [table, setTable] = useState(params.get("table") || readActive(slug)?.table_no?.toString() || "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(() => readActive(slug));
  const [resumed] = useState(() => !!readActive(slug));
  const [guests, setGuests] = useState(2);
  const [activeCat, setActiveCat] = useState("All");
  const [liveStatus, setLiveStatus] = useState("new");
  const [photoDish, setPhotoDish] = useState(null);
  const [guest, setGuest] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [entered, setEntered] = useState(() => sessionStorage.getItem(`mc_order_gate:${slug}`) === "1" || !!readActive(slug));

  useEffect(() => {
    let d = phone.replace(/\D/g, "");
    if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
    if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
    if (!/^[6-9]\d{9}$/.test(d)) { setGuest(null); setLookingUp(false); return; }
    setLookingUp(true);
    const t = setTimeout(() => {
      axios.get(`${BACKEND_URL}/api/public/guest-lookup/${slug}?phone=${d}`)
        .then(r => {
          setGuest(r.data.found ? r.data : null);
          if (r.data.found) setName(n => n || r.data.name);
        }).catch(() => setGuest(null)).finally(() => setLookingUp(false));
    }, 500);
    return () => { clearTimeout(t); setLookingUp(false); };
  }, [phone, slug]);

  useEffect(() => {
    if (!done) return;
    setLiveStatus(done.status || "new");
    const iv = setInterval(() => {
      axios.get(`${BACKEND_URL}/api/public/table-order-status/${slug}/${done.id}`)
        .then(r => {
          setLiveStatus(r.data.status);
          if (["served", "billed", "cancelled"].includes(r.data.status)) { clearInterval(iv); localStorage.removeItem(ACTIVE_KEY(slug)); }
        }).catch(() => {});
    }, 10000);
    return () => clearInterval(iv);
  }, [done, slug]);

  useEffect(() => {
    axios.get(`${BACKEND_URL}/api/public/salon/${slug}`).then(r => setSalon(r.data)).catch(() => setSalon(false));
    axios.get(`${BACKEND_URL}/api/public/services/${slug}`).then(r => setMenu(r.data)).catch(() => {});
    axios.get(`${BACKEND_URL}/api/public/day-offer/${slug}`).then(r => {
      if (r.data?.offer?.discount_pct > 0) setOffer(r.data.offer);
    }).catch(() => {});
    axios.get(`${BACKEND_URL}/api/public/category-specials/${slug}`).then(r => setSpecials(r.data.specials || {})).catch(() => {});
    axios.get(`${BACKEND_URL}/api/public/menu-stats/${slug}`).then(r => setStats(r.data)).catch(() => {});
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

  async function callStaff(kind) {
    if (!table || Number(table) < 1) { toast.error("Enter your table number first"); return; }
    try {
      await axios.post(`${BACKEND_URL}/api/public/table-call/${slug}`, { table_no: Number(table), kind });
      toast.success(kind === "water" ? "💧 Water is on the way!" : "🙋 A waiter is coming to your table!");
    } catch { toast.error("Couldn't reach the restaurant — please wave 🙂"); }
  }

  async function submit() {
    if (!table || Number(table) < 1) { toast.error("Please enter your table number"); return; }
    if (cart.length === 0) { toast.error("Add at least one dish"); return; }
    setBusy(true);
    try {
      const { data } = await axios.post(`${BACKEND_URL}/api/public/table-order/${slug}`, {
        table_no: Number(table), customer_name: name.trim() || null,
        customer_phone: phone.trim() || null, guests,
        items: cart.map(m => ({ id: m.id, qty: qty[m.id], spice: spice[m.id] || "normal" })),
      });
      localStorage.setItem(ACTIVE_KEY(slug), JSON.stringify(data.order));
      setDone(data.order);
      setQty({});
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not place the order");
    } finally { setBusy(false); }
  }

  if (salon === false) return <div className="min-h-screen bg-[#0d0b10] text-white flex items-center justify-center">Restaurant not found</div>;
  if (!salon) return <div className="min-h-screen bg-[#0d0b10] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gold" /></div>;

  if (done) return (
    <OrderStatusView salon={salon} done={done} liveStatus={liveStatus} resumed={resumed}
      onCallWaiter={() => callStaff("waiter")}
      onOrderMore={() => { localStorage.removeItem(ACTIVE_KEY(slug)); setDone(null); setQty({}); }} />
  );

  if (!entered) return (
    <WelcomeGate salon={salon} table={table} menu={menu} phone={phone} setPhone={setPhone} name={name} setName={setName}
      guest={guest} lookingUp={lookingUp} onCallWaiter={() => callStaff("waiter")}
      onProceed={() => { sessionStorage.setItem(`mc_order_gate:${slug}`, "1"); setEntered(true); }}
      onReorder={(last) => {
        const ids = new Set(menu.filter(m => !m.sold_out).map(m => m.id));
        const q = {}, sp = {};
        let skipped = 0;
        (last.items || []).forEach(it => { if (ids.has(it.id)) { q[it.id] = it.qty; sp[it.id] = it.spice || "normal"; } else skipped += 1; });
        if (!Object.keys(q).length) { toast.error("Those dishes aren't on today's menu — please pick from the menu"); return; }
        setQty(q); setSpice(sp);
        sessionStorage.setItem(`mc_order_gate:${slug}`, "1"); setEntered(true);
        toast.success(skipped ? `Last order added to your cart (${skipped} item${skipped > 1 ? "s" : ""} no longer available) — review & send to kitchen` : "Last order added to your cart — review & send to kitchen");
      }} />
  );

  return (
    <div className="min-h-screen bg-[#0d0b10] text-white pb-40 max-w-md mx-auto shadow-[0_0_80px_rgba(0,0,0,0.8)]" data-testid="order-public-page">
      <header className="relative px-5 pt-7 pb-5 overflow-hidden border-b border-white/10">
        <img src="/assets/login/restaurant.jpg" alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none" style={{ WebkitMaskImage: "linear-gradient(180deg,#000 30%,transparent)", maskImage: "linear-gradient(180deg,#000 30%,transparent)" }} />
        <div className="relative flex items-start gap-3">
          {salon.logo_url && (
            <img src={salon.logo_url} alt={salon.name} data-testid="order-restaurant-logo"
              className="w-16 h-16 rounded-full object-contain bg-black p-1 ring-2 ring-gold/60 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-gold text-[10px] tracking-[0.3em] uppercase"><UtensilsCrossed className="w-3.5 h-3.5" /> Order at your table{table ? ` · Table ${table}` : ""}</div>
            <h1 className="font-playfair text-2xl leading-tight mt-1">{salon.name}</h1>
            <p className="text-[10px] tracking-[0.25em] uppercase text-white/60 mt-1">Good food • Great company</p>
          </div>
          <p className="font-caveat text-gold text-lg leading-tight text-right shrink-0 hidden sm:block">Good Food<br />Brings People<br />Together ♡</p>
        </div>
        <div className="relative flex gap-3 mt-5">
          <label className="relative w-28 shrink-0">
            <Users className="w-4 h-4 text-gold absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select value={guests} onChange={e => setGuests(Number(e.target.value))} data-testid="order-guests-select"
              className="w-full appearance-none pl-9 pr-8 py-3 rounded-2xl bg-white/5 border border-white/15 font-bold text-gold text-sm focus:outline-none focus:border-gold">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n} className="text-black">{n}</option>)}
            </select>
            <ChevronDown className="w-4 h-4 text-gold absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </label>
          <div className="flex-1 min-w-0 flex items-center gap-2 px-4 rounded-2xl bg-white/5 border border-white/15 focus-within:border-gold/60">
            <User className="w-4 h-4 text-white/50 shrink-0" />
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name (optional)"
              data-testid="order-name-input"
              className="flex-1 min-w-0 py-3 bg-transparent text-sm placeholder:text-white/40 focus:outline-none" />
          </div>
        </div>
        <div className="relative flex gap-3 mt-3">
          {!params.get("table") && <input value={table} onChange={e => setTable(e.target.value.replace(/\D/g, ""))} inputMode="numeric"
            data-testid="order-table-input" placeholder="Table #"
            className="w-24 shrink-0 px-3 py-3 rounded-2xl bg-white/5 border border-gold/40 text-center font-bold text-gold placeholder:text-white/30 focus:outline-none focus:border-gold" />}
          <div className="flex-1 min-w-0 flex rounded-2xl bg-white/5 border border-white/15 focus-within:border-gold/60 overflow-hidden">
            <span className="px-3 flex items-center gap-1.5 text-sm font-bold text-white/80 border-r border-white/10 shrink-0">🇮🇳 +91 <ChevronDown className="w-3.5 h-3.5 text-white/50" /></span>
            <Phone className="w-4 h-4 text-white/50 shrink-0 self-center ml-3" />
            <input value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d+ ]/g, ""))} inputMode="tel"
              data-testid="order-phone-input" placeholder="Mobile number – earn loyalty points on this visit"
              className="flex-1 min-w-0 px-3 py-3 bg-transparent text-sm placeholder:text-white/40 focus:outline-none" />
          </div>
        </div>
        {guest && (
          <div data-testid="returning-guest-greeting"
            className="relative mt-3 px-4 py-2.5 rounded-2xl bg-gold/10 border border-gold/40 text-gold text-sm font-semibold">
            👋 Welcome back{guest.title ? `, ${guest.title}` : ","} {guest.name}! We're happy you came back — proceed with your order, and tap <b>Call waiter</b> anytime you need assistance. Visit #{(guest.visits || 0) + 1} ✨
          </div>
        )}
        <div className="relative flex gap-3 mt-4">
          <button onClick={() => callStaff("waiter")} data-testid="call-waiter-btn"
            className="flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-full border border-gold/60 text-gold text-sm font-bold hover:bg-gold/10 transition-colors"><Bell className="w-4 h-4" /> Call waiter</button>
          <button onClick={() => callStaff("water")} data-testid="call-water-btn"
            className="flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-full border border-white/25 text-white/90 text-sm font-bold hover:bg-white/5 transition-colors"><Droplets className="w-4 h-4 text-sky-300" /> Water please</button>
        </div>
      </header>

      <nav className="sticky top-0 z-20 bg-[#0d0b10]/95 backdrop-blur border-b border-white/10 px-5 py-3 flex gap-2 overflow-x-auto no-scrollbar" data-testid="order-category-chips">
        {["All", ...Object.keys(byCat)].map(c => (
          <button key={c} onClick={() => setActiveCat(c)} data-testid={`order-cat-${c}`}
            className={`relative shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-colors ${activeCat === c ? "bg-gold text-black" : "bg-white/5 border border-white/10 text-white/85 hover:bg-white/10"}`}>
            {c === "All" ? <LayoutGrid className="w-4 h-4" /> : <span>{CAT_ICON(c)}</span>}{c}
            {activeCat === c && <span className="absolute -bottom-3 left-2 right-2 h-0.5 bg-gold rounded-full" />}
          </button>
        ))}
      </nav>

      <main className="px-5 py-6 space-y-8">
        {offer && (
          <div className="rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3" data-testid="order-day-offer">
            <p className="text-gold text-xs font-bold">✨ Today's special — {offPct}% OFF your whole order</p>
            {offer.title && <p className="text-white/50 text-[11px] mt-0.5">{offer.title}</p>}
          </div>
        )}
        {Object.entries(byCat).filter(([cat]) => activeCat === "All" || cat === activeCat).map(([cat, items]) => (
          <section key={cat}>
            <h2 className="text-2xl font-bold mb-3 flex items-center gap-2 border-l-4 border-gold pl-3">
              {cat}
              {activeCat === "All" && <button onClick={() => setActiveCat(cat)} data-testid={`view-all-${cat}`} className="ml-auto text-sm font-normal text-white/70 inline-flex items-center gap-1">View all <ArrowRight className="w-4 h-4" /></button>}
              {specials[cat] > 0 && (
                <span data-testid={`cat-special-${cat}`} className="text-[9px] font-bold tracking-normal normal-case px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-300">
                  {specials[cat]}% OFF today
                </span>
              )}
            </h2>
            <div className="space-y-2.5">
              {items.map(m => (
                <div key={m.id} data-testid={`menu-item-${m.id}`}
                  className={`flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 ${m.sold_out ? "opacity-50" : ""}`}>
                  <div className="flex items-start gap-3 min-w-0">
                    {m.image_url ? (
                      <img src={thumbUrl(m.image_url, 160)} alt={m.name} loading="lazy"
                        data-testid={`dish-photo-thumb-${m.id}`}
                        onClick={() => setPhotoDish(m)}
                        className="w-20 h-20 rounded-2xl object-cover ring-1 ring-white/15 shrink-0 cursor-pointer active:scale-95 transition-transform self-start" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xl shrink-0">🍽️</div>
                    )}
                  <div className="min-w-0">
                    {stats.best_sellers.includes(m.id) && (
                      <span data-testid={`best-seller-${m.id}`} className="inline-block text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full border border-gold/60 text-gold mb-1">⭐ Best Seller</span>
                    )}
                    <p className="text-base font-bold leading-snug">
                      {m.veg === "veg" && <span title="Veg">🟢 </span>}
                      {m.veg === "non-veg" && <span title="Non-veg">🔴 </span>}
                      {m.veg === "egg" && <span title="Egg">🟡 </span>}
                      {m.name}
                      {Number(m.spice) > 0 && <span className="ml-1 text-[10px]">{"🌶️".repeat(Number(m.spice))}</span>}
                    </p>
                    {pctFor(m) > 0 ? (
                      <p className="text-xs font-bold mt-0.5"><s className="text-white/35">₹{Math.round(m.price)}</s> <span className="text-emerald-300">₹{Math.round(m.price * (1 - pctFor(m) / 100))}</span></p>
                    ) : (
                      <p className="text-gold text-base font-bold mt-0.5">₹{Math.round(m.price)}</p>
                    )}
                    {m.description && <p className="text-xs text-white/50 mt-1 line-clamp-2">{m.description}</p>}
                  </div>
                  </div>
                  {m.sold_out ? (
                    <span data-testid={`sold-out-${m.id}`} className="shrink-0 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-400/40 text-rose-300 text-[10px] font-bold uppercase tracking-wider">Sold out</span>
                  ) : qty[m.id] > 0 ? (
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <div className="flex items-center gap-3">
                        <button onClick={() => bump(m.id, -1)} data-testid={`menu-minus-${m.id}`} className="w-8 h-8 rounded-full border border-gold/50 text-gold flex items-center justify-center"><Minus className="w-3.5 h-3.5" /></button>
                        <span className="font-bold w-4 text-center">{qty[m.id]}</span>
                        <button onClick={() => bump(m.id, 1)} data-testid={`menu-plus-${m.id}`} className="w-8 h-8 rounded-full bg-gold text-bg-base flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></button>
                      </div>
                      <div className="flex gap-1">
                        {[["not_spicy", "🥛 mild"], ["normal", "🙂 normal"], ["spicy", "🌶 spicy"]].map(([v, l]) => (
                          <button key={v} data-testid={`spice-${m.id}-${v}`}
                            onClick={() => setSpice(sp => ({ ...sp, [m.id]: v }))}
                            className={`px-2 py-0.5 rounded-full text-[9px] font-bold border transition-colors ${(spice[m.id] || "normal") === v ? "bg-gold text-bg-base border-gold" : "border-white/20 text-white/60 hover:border-gold/50"}`}>
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => bump(m.id, 1)} data-testid={`menu-add-${m.id}`}
                      className="shrink-0 px-4 py-2.5 rounded-full border-2 border-gold/70 text-gold text-sm font-bold hover:bg-gold hover:text-black transition-colors inline-flex items-center gap-1"><Plus className="w-4 h-4" /> ADD</button>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
        {menu.length === 0 && <p className="text-white/40 text-sm text-center py-10">Menu coming soon…</p>}
      </main>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md p-4 bg-[#12101a]/95 backdrop-blur border-t border-gold/25 flex items-center gap-3" data-testid="order-cart-bar">
        <div className="relative w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
          <ShoppingCart className="w-5 h-5 text-gold" />
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-black text-[10px] font-bold flex items-center justify-center" data-testid="order-cart-count">{cart.reduce((a, m) => a + qty[m.id], 0)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base">Your Order</p>
          <p className="text-xs text-white/50 truncate">{cart.length === 0 ? "Add items to get started" : <>{anyDiscount && <s className="opacity-60 mr-1">₹{Math.round(total).toLocaleString("en-IN")}</s>}₹{payable.toLocaleString("en-IN")} · {cart.length} dish{cart.length > 1 ? "es" : ""}</>}</p>
        </div>
        <button onClick={submit} disabled={busy || cart.length === 0} data-testid="order-submit-btn"
          className="shrink-0 px-5 py-3 rounded-2xl bg-gold text-black text-sm font-bold flex items-center gap-2 disabled:opacity-40">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{cart.length === 0 ? "View Cart" : "Send to kitchen"} →
        </button>
      </div>
      <DishPhotoLightbox dish={photoDish} onClose={() => setPhotoDish(null)} />
    </div>
  );
}
