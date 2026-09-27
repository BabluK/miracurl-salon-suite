import { useEffect, useState } from "react";
import api from "@/lib/api";
import { GuestVisitCard } from "@/components/kitchen/GuestVisitCard";
import { Search, CalendarDays, Receipt } from "lucide-react";

const fmtDay = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - d) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
};
const fmtTime = (iso) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

function Badge({ o }) {
  if (o.status === "cancelled") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">Cancelled</span>;
  if (o.status === "billed" && o.paid) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200" data-testid={`history-paid-${o.id}`}>✅ Paid{o.invoice_no ? ` · ${o.invoice_no}` : ""}</span>;
  if (o.status === "billed") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">🧾 Billed · payment pending</span>;
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">Served · not billed</span>;
}

function HistoryCard({ o, onBill, onGuest }) {
  return (
    <div className={`rounded-2xl border p-3.5 bg-white ${o.status === "cancelled" ? "opacity-60" : ""}`} data-testid={`history-order-${o.id}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-extrabold text-slate-800">Table {o.table_no} <span className="text-slate-400 font-semibold text-xs">· {fmtTime(o.created_at)}</span></span>
        <Badge o={o} />
      </div>
      {(o.customer_name || o.customer_phone) && (
        <button type="button" onClick={() => o.customer_phone && onGuest?.(o)} disabled={!o.customer_phone} title={o.customer_phone ? "See this guest's visits & favourites" : ""}
          className="text-[11px] text-slate-500 mt-0.5 text-left enabled:hover:text-amber-700 enabled:underline-offset-2 enabled:hover:underline" data-testid={`history-guest-${o.id}`}>
          {o.customer_name || "Guest"}{o.customer_phone ? ` · ${o.customer_phone}` : ""}{o.guests ? ` · ${o.guests} guests` : ""}</button>
      )}
      <ul className="mt-1.5 text-xs text-slate-600 space-y-0.5">
        {o.items.slice(0, 4).map((i, idx) => <li key={idx}><b className="text-slate-800">{i.qty}×</b> {i.name}</li>)}
        {o.items.length > 4 && <li className="text-slate-400">+{o.items.length - 4} more</li>}
      </ul>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
        <span className="text-sm font-extrabold text-slate-900">{inr(o.total)}{o.discount_amt > 0 && <span className="ml-1.5 text-[10px] font-bold text-emerald-600">(saved {inr(o.discount_amt)})</span>}</span>
        {o.status === "served" && <button onClick={() => onBill(o.table_no)} data-testid={`history-bill-${o.id}`} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700">🧾 Bill Table {o.table_no}</button>}
      </div>
    </div>
  );
}

export function OrderHistory({ refreshKey, onBill }) {
  const [guest, setGuest] = useState(null);
  const [days, setDays] = useState(7);
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => {
      api.get("/table-orders/history", { params: { days, q } }).then(r => setData(r.data)).catch(() => setData({ groups: [] }));
    }, q ? 350 : 0);
    return () => clearTimeout(t);
  }, [days, q, refreshKey]);
  const groups = data?.groups || [];
  return (
    <section data-testid="order-history">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider inline-flex items-center gap-2"><Receipt className="w-4 h-4" /> Order history <span className="text-slate-300 normal-case tracking-normal font-medium">— closed &amp; paid tables, day by day</span></h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-slate-200 bg-white p-0.5" data-testid="history-range">
            {[[1, "Today"], [7, "7 days"], [30, "30 days"], [90, "90 days"]].map(([d, l]) => (
              <button key={d} onClick={() => setDays(d)} data-testid={`history-range-${d}`} className={`text-[11px] font-bold px-3 py-1 rounded-full ${days === d ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>{l}</button>
            ))}
          </div>
          <label className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Guest, phone or bill no." data-testid="history-search" className="h-8 pl-8 pr-3 rounded-full border border-slate-200 bg-white text-xs text-slate-800 w-48" />
          </label>
        </div>
      </div>
      {data === null && <p className="text-xs text-slate-400 mt-4">Loading history…</p>}
      {data && groups.length === 0 && <p className="text-xs text-slate-400 mt-4" data-testid="history-empty">No closed orders in this period.</p>}
      {groups.map(g => (
        <div key={g.date} className="mt-5" data-testid={`history-day-${g.date}`}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-slate-800"><CalendarDays className="w-4 h-4 text-slate-400" /> {fmtDay(g.date)} <span className="text-slate-400 font-medium text-xs">{g.date}</span></span>
            <span className="text-[11px] font-semibold text-slate-500">{g.count} order{g.count === 1 ? "" : "s"} · {inr(g.total)}</span>
            {g.paid_total > 0 && <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Paid {inr(g.paid_total)}</span>}
            <span className="flex-1 border-t border-slate-200" />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
            {g.orders.map(o => <HistoryCard key={o.id} o={o} onBill={onBill} onGuest={setGuest} />)}
          </div>
        </div>
      ))}
      {guest && <GuestVisitCard phone={guest.customer_phone} name={guest.customer_name} onClose={() => setGuest(null)} />}
    </section>
  );
}
