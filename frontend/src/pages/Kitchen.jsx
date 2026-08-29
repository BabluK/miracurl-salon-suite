import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { ChefHat, QrCode, Printer, CheckCircle2, Flame, XCircle, Download, Loader2 } from "lucide-react";
import { CategorySpecials } from "@/components/CategorySpecials";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const STATUS_NEXT = { new: ["preparing", "cancelled"], preparing: ["served", "cancelled"] };
const STATUS_STYLE = {
  new: "border-amber-300 bg-amber-50",
  preparing: "border-sky-300 bg-sky-50",
  served: "border-emerald-200 bg-emerald-50/60",
  billed: "border-slate-300 bg-white opacity-75",
  cancelled: "border-slate-200 bg-slate-50 opacity-60",
};

const age = (iso) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : `${m} min ago`;
};

export default function Kitchen() {
  const { tenant } = useAuth();
  const nav = useNavigate();
  const [orders, setOrders] = useState([]);
  const [calls, setCalls] = useState([]);
  const [insights, setInsights] = useState(null);
  const [tableCount, setTableCount] = useState(8);
  const [showQrs, setShowQrs] = useState(false);
  const [dlTable, setDlTable] = useState(0);

  async function downloadTableQr(n) {
    setDlTable(n);
    try {
      const { data } = await api.get("/settings/table-qr-posters.pdf", {
        params: { table: n, origin: window.location.origin }, responseType: "blob",
      });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `table-${n}-qr.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Couldn't download this table's poster");
    }
    setDlTable(0);
  }
  const seenIds = useRef(null);
  const seenCallIds = useRef(null);

  const chime = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [880, 1175].forEach((f, i) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.18);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.35);
        o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 0.4);
      });
    } catch { /* audio blocked until first interaction */ }
  };

  const load = useCallback(() => {
    api.get("/table-orders").then(({ data }) => {
      const freshOrders = data.filter(o => o.status === "new");
      const fresh = freshOrders.map(o => o.id);
      if (seenIds.current !== null) {
        const newcomers = freshOrders.filter(o => !seenIds.current.includes(o.id));
        if (newcomers.length > 0) {
          chime();
          newcomers.forEach(o => {
            toast.success(`🔔 Table ${o.table_no} has an order — ₹${Math.round(o.total)}`, {
              duration: 12000,
              description: o.items.map(i => `${i.qty}× ${i.name} — ₹${Math.round(i.price * i.qty)}`).join("  ·  "),
            });
          });
        }
      }
      seenIds.current = fresh;
      const openCount = data.filter(o => ["new", "preparing"].includes(o.status)).length;
      document.title = openCount > 0 ? `(${openCount}) Kitchen — Miracurl` : "Kitchen — Miracurl";
      setOrders(data);
    }).catch(() => {});
    api.get("/table-calls").then(({ data }) => {
      const ids = data.map(c => c.id);
      if (seenCallIds.current !== null) {
        const fresh = data.filter(c => !seenCallIds.current.includes(c.id));
        if (fresh.length > 0) {
          chime();
          fresh.forEach(c => toast.warning(
            c.kind === "water" ? `💧 Table ${c.table_no} is asking for water` :
            c.kind === "bill" ? `🧾 Table ${c.table_no} is asking for the bill` :
            `🙋 Table ${c.table_no} is calling a waiter`, { duration: 15000 }));
        }
      }
      seenCallIds.current = ids;
      setCalls(data);
    }).catch(() => {});
    api.get("/restaurant/insights").then(({ data }) => setInsights(data)).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => { clearInterval(t); document.title = "Miracurl Suite"; };
  }, [load]);

  // One bill per table — merges EVERY open order of the table into a single POS bill
  function billTable(tableNo) {
    const tableOrders = orders.filter(o => o.table_no === tableNo && ["new", "preparing", "served"].includes(o.status));
    if (tableOrders.length === 0) { toast.error("No open orders on this table"); return; }
    const merged = [];
    tableOrders.forEach(o => o.items.forEach(i => {
      const dp = Number(i.disc_pct ?? o.discount_pct) || 0;
      const same = merged.find(m => m.id === i.id && m.disc_pct === dp);
      if (same) same.qty += i.qty;
      else merged.push({ id: i.id, name: i.name, price: i.price, qty: i.qty, disc_pct: dp });
    }));
    localStorage.setItem(`kitchen_bill:${tenant?.id}`, JSON.stringify({
      order_ids: tableOrders.map(o => o.id), table_no: tableNo,
      customer_name: tableOrders.find(o => o.customer_name)?.customer_name || "",
      items: merged,
    }));
    nav("/pos");
  }

  async function resolveCall(id) {
    try {
      await api.put(`/table-calls/${id}/done`);
      setCalls(cs => cs.filter(c => c.id !== id));
    } catch { toast.error("Couldn't resolve the call"); }
  }

  async function setStatus(id, status) {
    try {
      await api.put(`/table-orders/${id}/status`, { status });
      toast.success(status === "served" ? "Order served ✦" : `Order ${status}`);
      load();
    } catch { toast.error("Couldn't update the order"); }
  }

  const open = orders.filter(o => ["new", "preparing"].includes(o.status));
  const closed = orders.filter(o => !["new", "preparing", "billed"].includes(o.status)).slice(0, 20);

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
            <span>
              <b className="text-slate-900">{i.qty}×</b> {i.name}
              {i.spice === "spicy" && <span className="ml-1.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-600 border border-red-200" data-testid={`kot-spice-${idx}`}>🌶 spicy</span>}
              {i.spice === "not_spicy" && <span className="ml-1.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-sky-100 text-sky-600 border border-sky-200" data-testid={`kot-spice-${idx}`}>🥛 not spicy</span>}
            </span>
            <span className="text-slate-400">₹{Math.round(i.price * i.qty)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200/70">
        <span className="text-sm font-extrabold text-slate-900">
          ₹{Math.round(o.total).toLocaleString("en-IN")}
          {o.discount_amt > 0 && <span className="ml-1.5 text-[10px] font-bold text-emerald-600">(saved ₹{Math.round(o.discount_amt)})</span>}
        </span>
        <div className="flex gap-2">
          {o.status === "served" && (
            <button onClick={() => billTable(o.table_no)} data-testid={`ticket-bill-${o.id}`}
              className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700 flex items-center gap-1">
              🧾 Bill Table {o.table_no}
            </button>
          )}
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
              <div key={n} className="rounded-2xl overflow-hidden border-2 border-[#C89B52]/50 bg-[#141210]" data-testid={`table-qr-${n}`}>
                <img src={`${BACKEND_URL}/api/settings/table-qr-card.png?table=${n}&origin=${encodeURIComponent(window.location.origin)}`}
                  alt={`Table ${n} QR`} className="w-full" loading="lazy" />
                <button onClick={() => downloadTableQr(n)} disabled={dlTable === n} data-testid={`download-table-qr-${n}`}
                  className="print:hidden w-[calc(100%-1.5rem)] mx-3 my-2.5 flex items-center justify-center gap-1.5 text-[10px] font-bold px-2 py-1.5 rounded-lg border border-[#C89B52]/60 text-[#DFB78C] hover:bg-[#C89B52]/15 disabled:opacity-60">
                  {dlTable === n ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  {dlTable === n ? "Preparing…" : "Download poster"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <CategorySpecials />

      {calls.length > 0 && (
        <section data-testid="table-calls-panel">
          <h2 className="text-sm font-bold text-rose-600 uppercase tracking-wider animate-pulse">Tables calling ({calls.length})</h2>
          <div className="flex flex-wrap gap-3 mt-3">
            {calls.map(c => (
              <div key={c.id} data-testid={`table-call-${c.id}`}
                className="flex items-center gap-3 rounded-2xl border-2 border-rose-300 bg-rose-50 px-4 py-2.5">
                <span className="text-lg">{c.kind === "water" ? "💧" : c.kind === "bill" ? "🧾" : "🙋"}</span>
                <div>
                  <p className="text-sm font-extrabold text-slate-800">Table {c.table_no}</p>
                  <p className="text-[10px] text-slate-500">{c.kind === "water" ? "needs water" : c.kind === "bill" ? "wants the bill" : "calling a waiter"} · {age(c.created_at)}</p>
                </div>
                <button onClick={() => resolveCall(c.id)} data-testid={`call-done-${c.id}`}
                  className="ml-2 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">✓ Done</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {open.length > 0 && (
        <section data-testid="live-tables-panel">
          <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wider">Live tables</h2>
          <p className="text-xs text-slate-400 mt-0.5">Every open table with its running total — extra orders keep adding until you bill. One table = one bill.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-3">
            {Object.entries(open.reduce((g, o) => { (g[o.table_no] ||= []).push(o); return g; }, {}))
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([tableNo, list]) => {
                const running = list.reduce((s, o) => s + o.total, 0);
                const allServed = list.every(o => o.status === "served");
                const guestName = list.find(o => o.customer_name)?.customer_name || "";
                return (
                  <div key={tableNo} data-testid={`live-table-${tableNo}`}
                    className={`rounded-2xl border-2 p-3.5 ${allServed ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-slate-800">Table {tableNo}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500">
                        {list.length} order{list.length > 1 ? "s" : ""}
                      </span>
                    </div>
                    {guestName && <p className="text-[11px] font-semibold text-slate-600 mt-0.5" data-testid={`live-table-guest-${tableNo}`}>👤 {guestName}</p>}
                    <p className="text-lg font-extrabold text-slate-900 mt-1">₹{Math.round(running).toLocaleString("en-IN")}</p>
                    <p className="text-[10px] text-slate-500">{allServed ? "All served — ready to bill" : "Still cooking…"}</p>
                    <button onClick={() => billTable(Number(tableNo))} data-testid={`bill-table-${tableNo}`}
                      className="w-full mt-2 text-[11px] font-bold px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-700">
                      🧾 Bill Table {tableNo}{guestName ? ` — ${guestName}` : ""} · ₹{Math.round(running).toLocaleString("en-IN")}
                    </button>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wider">Open orders ({open.length})</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
          {open.map(o => <Ticket key={o.id} o={o} />)}
        </div>
        {open.length === 0 && <p className="text-sm text-slate-400 mt-3" data-testid="kitchen-empty">No open orders — tickets appear here the moment a diner scans & orders.</p>}
      </section>

      {insights && insights.orders > 0 && (
        <section data-testid="weekly-insights-panel">
          <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wider">This week's insights</h2>
          <p className="text-xs text-slate-400 mt-0.5">Last {insights.days} days · {insights.orders} table orders · ₹{Math.round(insights.revenue).toLocaleString("en-IN")} in QR orders</p>
          <div className="grid sm:grid-cols-2 gap-4 mt-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-5" data-testid="top-dishes-card">
              <h3 className="text-xs font-bold text-amber-600 uppercase tracking-wider">🏆 Best-selling dishes</h3>
              <ul className="mt-3 space-y-2">
                {insights.top_dishes.map((d, i) => (
                  <li key={d.name} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 truncate"><b className="text-slate-400 mr-1.5">{i + 1}.</b>{d.name}</span>
                    <span className="text-slate-500 text-xs shrink-0 ml-2"><b className="text-slate-800">{d.qty}×</b> · ₹{Math.round(d.revenue).toLocaleString("en-IN")}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5" data-testid="busy-tables-card">
              <h3 className="text-xs font-bold text-sky-600 uppercase tracking-wider">🪑 Busiest tables</h3>
              <ul className="mt-3 space-y-2">
                {insights.busy_tables.map((t, i) => (
                  <li key={t.table_no} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700"><b className="text-slate-400 mr-1.5">{i + 1}.</b>Table {t.table_no}</span>
                    <span className="text-slate-500 text-xs"><b className="text-slate-800">{t.orders}</b> orders · ₹{Math.round(t.revenue).toLocaleString("en-IN")}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

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
