import { useEffect, useState } from "react";
import api from "@/lib/api";
import { BarChart3, ChevronDown, ChevronUp } from "lucide-react";

export function WeeklyDigestCard() {
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => { api.get("/reports/weekly-digest").then(r => setD(r.data)).catch(() => {}); }, []);
  if (!d) return null;

  const up = d.revenue >= d.prev_revenue;
  const waHref = `https://wa.me/?text=${encodeURIComponent(d.wa_text)}`;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4" data-testid="weekly-digest-card">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0"><BarChart3 className="w-4.5 h-4.5 text-emerald-600" /></span>
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-800 text-sm">Weekly digest · {d.week_label}</h3>
            <p className="text-[11px] text-slate-500">
              <span className={up ? "text-emerald-600 font-semibold" : "text-rose-500 font-semibold"}>₹{Math.round(d.revenue).toLocaleString("en-IN")} {up ? "▲" : "▼"}</span>
              {" "}· {d.invoices} bills · {d.new_customers} new guests
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href={waHref} target="_blank" rel="noreferrer" data-testid="digest-whatsapp-btn"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#25D366] text-white text-xs font-bold hover:opacity-90">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.2-.7-1.7-1-2.3-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.1-.3-.2-.6-.3zM12 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4a9.8 9.8 0 1 1 8.3 4.6zM12 .5A11.5 11.5 0 0 0 2 17.7L.5 23.5l6-1.6A11.5 11.5 0 1 0 12 .5z" /></svg>
            Share on WhatsApp
          </a>
          <button onClick={() => setOpen(o => !o)} data-testid="digest-expand-btn" className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50">
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div><p className="text-[10px] uppercase text-slate-400">Revenue</p><p className="text-sm font-bold text-slate-800">₹{Math.round(d.revenue).toLocaleString("en-IN")}</p></div>
          <div><p className="text-[10px] uppercase text-slate-400">Avg bill</p><p className="text-sm font-bold text-slate-800">₹{Math.round(d.avg_bill).toLocaleString("en-IN")}</p></div>
          <div><p className="text-[10px] uppercase text-slate-400">Top service</p><p className="text-sm font-bold text-slate-800 truncate">{d.top_services[0]?.[0] || "—"}</p></div>
          <div><p className="text-[10px] uppercase text-slate-400">New guests</p><p className="text-sm font-bold text-slate-800">{d.new_customers}</p></div>
          <p className="col-span-2 sm:col-span-4 text-left text-[11px] text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">💡 {d.tip}</p>
        </div>
      )}
    </div>
  );
}
