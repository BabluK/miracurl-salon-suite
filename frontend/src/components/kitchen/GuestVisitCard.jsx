import { useEffect, useState } from "react";
import api from "@/lib/api";
import { X, Loader2, UtensilsCrossed, Receipt, CalendarDays, Star, User } from "lucide-react";

const fmtDay = (iso) => iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "";
const inr = (v) => `₹${Number(v || 0).toLocaleString("en-IN")}`;

export function GuestVisitCard({ phone, name, onClose }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api.get(`/table-orders/guest/${encodeURIComponent(phone)}`).then(r => setD(r.data)).catch(e => setErr(e?.response?.data?.detail || "Couldn't load guest"));
  }, [phone]);
  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose} data-testid="guest-visit-card">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-5 pb-4 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 border-b border-amber-100 relative">
          <button onClick={onClose} aria-label="Close" data-testid="guest-visit-close" className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/70 hover:bg-white flex items-center justify-center text-slate-600"><X className="w-4 h-4" /></button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-lg">{(d?.name || name || "G").trim().charAt(0).toUpperCase()}</div>
            <div className="min-w-0">
              <h3 className="font-playfair text-xl text-slate-900 truncate" data-testid="guest-visit-name">{d?.name || name || "Guest"}</h3>
              <p className="text-xs text-slate-500">{phone}{d?.customer ? " · in CRM" : ""}{d?.customer?.loyalty_points ? ` · ${d.customer.loyalty_points} pts` : ""}</p>
            </div>
          </div>
          {d && (
            <div className="grid grid-cols-3 gap-2 mt-4" data-testid="guest-visit-stats">
              {[["Visits", d.visits, CalendarDays], ["Orders", d.orders, Receipt], ["Spent", inr(d.spend), UtensilsCrossed]].map(([l, v, Icon]) => (
                <div key={l} className="rounded-2xl bg-white/80 border border-amber-100 px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold inline-flex items-center gap-1"><Icon className="w-3 h-3" /> {l}</div>
                  <div className="text-lg font-bold text-slate-900 leading-tight">{v}</div>
                </div>
              ))}
            </div>
          )}
          {d?.first_visit && <p className="text-[11px] text-slate-500 mt-2">First visit {fmtDay(d.first_visit)} · last {fmtDay(d.last_visit)}</p>}
        </div>
        <div className="p-5 overflow-y-auto space-y-5">
          {err && <p className="text-sm text-rose-600" data-testid="guest-visit-error">{err}</p>}
          {!d && !err && <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading visits…</div>}
          {d && (
            <>
              <section>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 inline-flex items-center gap-1.5"><Star className="w-3.5 h-3.5 text-amber-500" /> Favourite dishes</h4>
                {d.favourites.length === 0 ? <p className="text-sm text-slate-400 mt-1">No dishes yet</p> : (
                  <div className="flex flex-wrap gap-2 mt-2" data-testid="guest-favourites">
                    {d.favourites.map((f, i) => (
                      <span key={f.name} className={`text-xs px-3 py-1.5 rounded-full border font-semibold ${i === 0 ? "bg-amber-100 border-amber-300 text-amber-800" : "bg-slate-50 border-slate-200 text-slate-700"}`}>
                        {i === 0 ? "★ " : ""}{f.name} <span className="text-slate-400 font-normal">× {f.qty}</span>
                      </span>
                    ))}
                  </div>
                )}
              </section>
              <section>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 inline-flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Past visits</h4>
                <div className="mt-2 divide-y divide-slate-100" data-testid="guest-history">
                  {d.history.map(o => (
                    <div key={o.id} className="py-2.5 flex items-start justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800">{fmtDay((o.created_at || "").slice(0, 10))} <span className="text-slate-400 font-normal">· {fmtTime(o.created_at)} · Table {o.table_no}</span></p>
                        <p className="text-xs text-slate-500 truncate">{(o.items || []).map(i => `${i.qty}× ${i.name}`).join(", ")}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-slate-900">{inr(o.invoice_total || o.total)}</p>
                        <span className={`text-[10px] font-bold ${o.paid ? "text-emerald-600" : o.status === "billed" ? "text-amber-600" : "text-slate-400"}`}>
                          {o.paid ? "paid ✅" : o.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
