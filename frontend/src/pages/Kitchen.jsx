import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { ChefHat, QrCode, Printer, CheckCircle2, Flame, XCircle } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const STATUS_NEXT = { new: ["preparing", "cancelled"], preparing: ["served", "cancelled"] };
const STATUS_STYLE = {
  new: "border-amber-300 bg-amber-50",
  preparing: "border-sky-300 bg-sky-50",
  served: "border-emerald-200 bg-emerald-50/60",
  cancelled: "border-slate-200 bg-slate-50 opacity-60",
};

const age = (iso) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : `${m} min ago`;
};

export default function Kitchen() {
  const { tenant } = useAuth();
  const [orders, setOrders] = useState([]);
  const [tableCount, setTableCount] = useState(8);
  const [showQrs, setShowQrs] = useState(false);

  const load = useCallback(() => {
    api.get("/table-orders").then(({ data }) => setOrders(data)).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  async function setStatus(id, status) {
    try {
      await api.put(`/table-orders/${id}/status`, { status });
      toast.success(status === "served" ? "Order served ✦" : `Order ${status}`);
      load();
    } catch { toast.error("Couldn't update the order"); }
  }

  const open = orders.filter(o => ["new", "preparing"].includes(o.status));
  const closed = orders.filter(o => !["new", "preparing"].includes(o.status)).slice(0, 20);
  const orderUrl = (n) => `${window.location.origin}/order/${tenant?.slug}?table=${n}`;

  const Ticket = ({ o }) => (
    <div data-testid={`kitchen-ticket-${o.id}`} className={`rounded-2xl border-2 p-4 ${STATUS_STYLE[o.status]}`}>
      <div className="flex items-center justify-between">
        <span className="font-extrabold text-slate-800 text-lg">Table {o.table_no}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500">#{o.id} · {age(o.created_at)}</span>
      </div>
      {o.customer_name && <p className="text-[11px] text-slate-500 mt-0.5">for {o.customer_name}</p>}
      <ul className="mt-2 space-y-1">
        {o.items.map((i, idx) => (
          <li key={idx} className="flex justify-between text-sm text-slate-700">
            <span><b className="text-slate-900">{i.qty}×</b> {i.name}</span>
            <span className="text-slate-400">₹{Math.round(i.price * i.qty)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200/70">
        <span className="text-sm font-extrabold text-slate-900">₹{Math.round(o.total).toLocaleString("en-IN")}</span>
        <div className="flex gap-2">
          {(STATUS_NEXT[o.status] || []).map(s => (
            <button key={s} onClick={() => setStatus(o.id, s)} data-testid={`ticket-${s}-${o.id}`}
              className={`text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 ${
                s === "cancelled" ? "border border-rose-200 text-rose-500 hover:bg-rose-50"
                : s === "preparing" ? "bg-sky-600 text-white hover:bg-sky-700"
                : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>
              {s === "preparing" ? <><Flame className="w-3 h-3" /> Start</> : s === "served" ? <><CheckCircle2 className="w-3 h-3" /> Served</> : <><XCircle className="w-3 h-3" /> Cancel</>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-8" data-testid="kitchen-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-playfair text-3xl flex items-center gap-3"><ChefHat className="w-7 h-7 text-amber-500" /> Kitchen Tickets</h1>
          <p className="text-slate-500 text-sm mt-1">Live table orders from your QR menu — auto-refreshes every 15 seconds.</p>
        </div>
        <button onClick={() => setShowQrs(v => !v)} data-testid="kitchen-toggle-qrs"
          className="flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100">
          <QrCode className="w-4 h-4" /> Table QR codes
        </button>
      </div>

      {showQrs && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 print:border-0" data-testid="table-qr-panel">
          <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
            <div>
              <h3 className="font-semibold text-slate-800">Print & place one QR on each table</h3>
              <p className="text-xs text-slate-500 mt-0.5">Diners scan → menu opens with their table number pre-filled → order lands here.</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Tables:</label>
              <input type="number" min="1" max="60" value={tableCount} data-testid="table-count-input"
                onChange={e => setTableCount(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 text-sm text-center" />
              <button onClick={() => window.print()} data-testid="print-qrs-btn"
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-slate-900 text-white"><Printer className="w-3.5 h-3.5" /> Print</button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
            {Array.from({ length: tableCount }, (_, i) => i + 1).map(n => (
              <div key={n} className="border border-slate-200 rounded-xl p-3 text-center" data-testid={`table-qr-${n}`}>
                <img src={`${BACKEND_URL}/api/public/products-qr?url=${encodeURIComponent(orderUrl(n))}`}
                  alt={`Table ${n}`} className="w-full aspect-square object-contain" />
                <p className="text-xs font-extrabold text-slate-700 mt-1">TABLE {n}</p>
                <p className="text-[9px] text-slate-400">Scan to order 🍽️</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <section>
        <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wider">Open orders ({open.length})</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
          {open.map(o => <Ticket key={o.id} o={o} />)}
        </div>
        {open.length === 0 && <p className="text-sm text-slate-400 mt-3" data-testid="kitchen-empty">No open orders — tickets appear here the moment a diner scans & orders.</p>}
      </section>

      {closed.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Recently closed</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
            {closed.map(o => <Ticket key={o.id} o={o} />)}
          </div>
        </section>
      )}
    </div>
  );
}
