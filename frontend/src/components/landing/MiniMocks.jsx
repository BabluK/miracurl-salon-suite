import { Check, ChevronRight, Flame, Bell, TrendingUp, MessageCircle, Utensils, Star } from "lucide-react";

const MIRA_IMG = "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images/0edf7cea5fd92564bf4bc69be15455570ba5f75f85561ee7bd0cdca2578254cc.png";
const AV = ["from-rose-300 to-pink-400", "from-amber-300 to-orange-400", "from-violet-300 to-fuchsia-400", "from-emerald-300 to-teal-400"];
const Avatar = ({ i, size = "w-5 h-5" }) => <span className={`${size} rounded-full bg-gradient-to-br ${AV[i % AV.length]} shrink-0 border border-white`} />;
const Card = ({ children, className = "" }) => <div className={`bg-white rounded-2xl shadow-[0_12px_30px_-12px_rgba(60,40,10,0.25)] border border-[#f1e6cf] ${className}`}>{children}</div>;

export function PhoneMock({ cur = "₹", className = "", compact = false }) {
  const rows = [["Hair Cut", `${cur}650`], ["Hair Color", `${cur}1,800`], ["Facial", `${cur}900`], ["Hair Spa", `${cur}1,200`]].slice(0, compact ? 3 : 4);
  return (
    <div className={`w-[126px] rounded-[22px] border-[3px] border-slate-900 bg-white shadow-[0_24px_50px_-20px_rgba(0,0,0,0.5)] overflow-hidden ${className}`}>
      <div className="px-2.5 pt-2 flex items-center justify-between text-[8px] font-bold text-slate-800"><span>✕</span><span>Your Salon</span><span>≡</span></div>
      <div className="grid grid-cols-5 gap-0.5 px-2 mt-1.5 text-center text-[7px] text-slate-500">
        {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d, i) => <div key={d}><div>{d}</div><div className={`mx-auto mt-0.5 w-4 h-4 rounded-full leading-4 font-bold ${i === 2 ? "bg-[#E35A89] text-white" : "text-slate-800"}`}>{12 + i}</div></div>)}
      </div>
      <div className="px-2 py-2 space-y-1">
        {rows.map(([n, p], i) => (
          <div key={n} className="flex items-center gap-1.5 rounded-lg bg-[#faf5ea] px-1.5 py-1">
            <Avatar i={i} /><span className="text-[8px] font-semibold text-slate-800 flex-1 truncate">{n}</span><span className="text-[7px] text-slate-400">{p}</span><ChevronRight className="w-2.5 h-2.5 text-slate-400" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TabletMock({ cur = "₹", className = "" }) {
  const dishes = [["Paneer Tikka", `${cur}280`, "from-orange-300 to-red-400"], ["Chicken Biryani", `${cur}320`, "from-amber-300 to-orange-500"], ["Butter Naan", `${cur}60`, "from-yellow-200 to-amber-300"], ["Dal Makhani", `${cur}240`, "from-amber-400 to-yellow-600"], ["Gulab Jamun", `${cur}120`, "from-rose-300 to-red-400"], ["Masala Chai", `${cur}40`, "from-orange-200 to-amber-400"]];
  return (
    <div className={`w-[176px] rounded-[14px] border-[4px] border-slate-800 bg-white shadow-[0_24px_50px_-20px_rgba(0,0,0,0.5)] overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-2 py-1 bg-slate-50 text-[7px] font-bold text-slate-700"><span>Table 3 · Menu</span><span className="text-emerald-600">● Live</span></div>
      <div className="grid grid-cols-3 gap-1 p-1.5">
        {dishes.map(([n, p, g]) => (
          <div key={n} className="rounded-md overflow-hidden bg-[#faf5ea]"><div className={`h-6 bg-gradient-to-br ${g}`} /><div className="px-1 py-0.5 text-[6px] leading-tight"><div className="font-semibold text-slate-800 truncate">{n}</div><div className="text-slate-400">{p}</div></div></div>
        ))}
      </div>
      <div className="mx-1.5 mb-1.5 rounded-md bg-gradient-to-r from-amber-500 to-rose-500 text-white text-[7px] font-bold text-center py-1">Send to kitchen →</div>
    </div>
  );
}

const WaBubble = ({ us }) => (
  <Card className="relative p-2.5 pr-5 w-[128px] rounded-tr-sm">
    <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow"><MessageCircle className="w-3 h-3" /></span>
    <p className="text-[8px] leading-snug text-slate-700">Hi Priya! 👋<br />Your appointment for <b>Hair Cut</b> is confirmed for <b>Tomorrow, 10:00 AM</b>.{us ? "" : " Reply 1 to reschedule."}</p>
  </Card>
);

const PosMock = ({ cur }) => (
  <div className="w-[136px] rounded-xl border-[3px] border-slate-800 bg-white overflow-hidden shadow-[0_18px_40px_-16px_rgba(0,0,0,0.45)]">
    <div className="grid grid-cols-3 gap-1 p-1.5">{AV.concat(AV.slice(0, 2)).map((g, i) => <div key={i} className={`h-6 rounded-md bg-gradient-to-br ${g}`} />)}</div>
    <div className="flex items-center justify-between px-2 py-1 bg-slate-900 text-white text-[7px] font-bold"><span>Total {cur}1,250</span><span className="px-1.5 py-0.5 rounded bg-emerald-500">Pay</span></div>
  </div>
);

const StaffMock = () => (
  <div className="space-y-1.5 w-[132px]">
    {[["Anita", "Present", "bg-emerald-100 text-emerald-700"], ["Rohan", "Present", "bg-emerald-100 text-emerald-700"], ["Neha", "On leave", "bg-amber-100 text-amber-700"]].map(([n, s, c], i) => (
      <Card key={n} className="flex items-center gap-1.5 px-2 py-1 rounded-lg"><Avatar i={i} /><span className="text-[8px] font-semibold text-slate-800 flex-1">{n}</span><span className={`text-[6.5px] font-bold px-1.5 py-0.5 rounded-full ${c}`}>{s}</span></Card>
    ))}
  </div>
);

const ReviewMock = () => (
  <Card className="p-2.5 w-[128px] relative">
    <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white shadow border border-slate-100 flex items-center justify-center text-[11px] font-black"><span className="text-[#4285F4]">G</span></span>
    <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map(i => <Star key={i} className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />)}</div>
    <p className="text-[7.5px] text-slate-700 mt-1 leading-snug">Amazing service! Will definitely come again.</p>
    <div className="flex items-center gap-1.5 mt-1.5"><Avatar i={0} size="w-4 h-4" /><div className="space-y-0.5 flex-1"><div className="h-1 w-10 rounded bg-slate-200" /><div className="h-1 w-6 rounded bg-slate-100" /></div></div>
  </Card>
);

const InventoryMock = () => (
  <div className="relative w-[120px] h-[84px]">
    <div className="absolute bottom-2 left-2 right-2 h-2 rounded-full bg-[#e9d9ae]/70" />
    {[["from-slate-700 to-slate-900", "h-16", "left-3"], ["from-rose-200 to-rose-300", "h-14", "left-12"], ["from-amber-200 to-amber-400", "h-[68px]", "left-[84px]"]].map(([g, h, l]) => (
      <div key={l} className={`absolute bottom-3 ${l} w-7 ${h} rounded-t-lg rounded-b-md bg-gradient-to-b ${g} shadow`}><div className="mx-auto mt-[-5px] w-3 h-2.5 rounded-sm bg-slate-800" /></div>
    ))}
    <span className="absolute top-1 right-0 px-2 py-0.5 rounded-full bg-[#E35A89] text-white text-[7px] font-bold shadow">Low Stock</span>
  </div>
);

const ChartMock = ({ cur }) => (
  <Card className="p-2.5 w-[128px]">
    <div className="flex items-center justify-between text-[7px] text-slate-500"><span>Revenue</span><TrendingUp className="w-2.5 h-2.5 text-emerald-500" /></div>
    <div className="text-[11px] font-bold text-slate-900">{cur}1,24,500</div>
    <div className="flex items-end gap-1 h-9 mt-1.5">{[35, 50, 42, 65, 78, 100].map((h, i) => <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-[#E35A89] to-[#f9a8d4]" style={{ height: `${h}%` }} />)}</div>
  </Card>
);

const MiraMock = () => (
  <div className="relative w-[132px] h-[92px]">
    <Card className="absolute top-0 left-0 px-2 py-1.5 w-[96px] rounded-bl-sm"><p className="text-[7.5px] text-slate-700 leading-snug"><b>Hi!</b> How can I help you today?</p></Card>
    <img src={MIRA_IMG} alt="Mira AI" loading="lazy" className="absolute bottom-0 right-0 w-14 h-14 rounded-full object-cover border-2 border-white shadow-lg" />
    <span className="absolute bottom-1 right-12 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
  </div>
);

const QR = [1,1,1,0,1,1,1, 1,0,1,0,1,0,1, 1,1,1,0,1,1,1, 0,1,0,1,0,1,0, 1,1,1,0,1,0,1, 1,0,1,0,0,1,1, 1,1,1,0,1,1,0];
const QrMock = () => (
  <Card className="p-2.5 w-[108px] text-center">
    <div className="grid grid-cols-7 gap-[2px] mx-auto w-14">{QR.map((b, i) => <span key={i} className={`aspect-square rounded-[1px] ${b ? "bg-slate-900" : "bg-white"}`} />)}</div>
    <div className="text-[7.5px] font-bold text-slate-800 mt-1.5">Scan to order</div><div className="text-[6.5px] text-slate-400">Table 3 · no app needed</div>
  </Card>
);

const KotMock = ({ cur }) => (
  <Card className="p-2.5 w-[128px] border-l-4 border-l-amber-400">
    <div className="flex items-center justify-between text-[7.5px]"><b className="text-slate-800">Table 3 · KOT #42</b><span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold text-[6.5px] inline-flex items-center gap-0.5"><Flame className="w-2 h-2" /> Cooking</span></div>
    <div className="mt-1.5 space-y-0.5 text-[7.5px] text-slate-600"><div>2× Chicken Biryani</div><div>1× Paneer Tikka</div><div className="text-slate-400">Note: less spicy</div></div>
    <div className="text-[7px] text-right text-slate-400 mt-1">{cur}987</div>
  </Card>
);

const BillMock = ({ cur }) => (
  <Card className="p-2.5 w-[120px] rounded-lg">
    <div className="text-[7.5px] font-bold text-slate-800 text-center">Table 3 — Bill</div>
    <div className="mt-1.5 space-y-0.5 text-[7px] text-slate-600">{[["Biryani ×2", 640], ["Paneer Tikka", 280], ["Naan ×3", 180]].map(([n, p]) => <div key={n} className="flex justify-between border-b border-dashed border-slate-200 pb-0.5"><span>{n}</span><span>{cur}{p}</span></div>)}</div>
    <div className="flex justify-between mt-1 text-[8px] font-bold text-slate-900"><span>Total</span><span>{cur}1,100</span></div>
    <span className="mt-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[6.5px] font-bold"><Check className="w-2 h-2" /> Paid · UPI</span>
  </Card>
);

const ReserveMock = () => (
  <Card className="p-2.5 w-[124px]">
    <div className="text-[7px] font-bold text-slate-700 text-center">October</div>
    <div className="grid grid-cols-7 gap-0.5 mt-1 text-center text-[6.5px] text-slate-500">{Array.from({ length: 14 }, (_, i) => <span key={i} className={`h-3.5 leading-[14px] rounded-full ${i === 9 ? "bg-amber-500 text-white font-bold" : ""}`}>{i + 1}</span>)}</div>
    <div className="mt-1.5 flex items-center gap-1 text-[7px] text-slate-700"><Utensils className="w-2.5 h-2.5 text-amber-500" /> Party of 4 · 8:00 PM · Window</div>
  </Card>
);

const WaiterMock = () => (
  <div className="relative w-[128px] space-y-1.5">
    {[["Order received", "bg-emerald-100 text-emerald-700", Check], ["Cooking", "bg-amber-100 text-amber-700", Flame], ["Served", "bg-slate-100 text-slate-400", Utensils]].map(([t, c, I]) => (
      <Card key={t} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[7.5px] font-semibold ${c} border-0`}><I className="w-2.5 h-2.5" /> {t}</Card>
    ))}
    <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 text-white flex items-center justify-center shadow-lg animate-pulse"><Bell className="w-3.5 h-3.5" /></span>
  </div>
);

const MenuMock = ({ cur }) => (
  <div className="flex gap-1.5 w-[132px]">
    {[["Paneer Tikka", 280, "from-orange-300 to-red-400"], ["Dal Makhani", 240, "from-amber-300 to-yellow-600"]].map(([n, p, g]) => (
      <Card key={n} className="flex-1 overflow-hidden rounded-xl"><div className={`h-9 bg-gradient-to-br ${g} relative`}><span className="absolute top-1 left-1 px-1 rounded bg-white/90 text-[5.5px] font-bold text-violet-700">✦ AI</span></div><div className="px-1.5 py-1 text-[6.5px]"><div className="font-semibold text-slate-800 truncate">{n}</div><div className="text-slate-400">{cur}{p}</div></div></Card>
    ))}
  </div>
);

const MOCKS = { phone: (p) => <PhoneMock {...p} compact />, wa: WaBubble, pos: PosMock, staff: StaffMock, review: ReviewMock, inventory: InventoryMock, chart: ChartMock, mira: MiraMock, qr: QrMock, kot: KotMock, bill: BillMock, reserve: ReserveMock, waiter: WaiterMock, menu: MenuMock, tablet: TabletMock };

export function MiniMock({ kind, cur = "₹", us = false }) {
  const M = MOCKS[kind];
  return M ? <M cur={cur} us={us} /> : null;
}
