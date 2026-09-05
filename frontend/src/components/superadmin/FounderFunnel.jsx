import { useEffect, useState } from "react";
import api from "@/lib/api";
import { ChevronRight } from "lucide-react";

const STEPS = [
  ["sent", "Letters sent", "text-slate-100"],
  ["replied", "Replied", "text-orange-300"],
  ["live", "Live · 6 mo free", "text-emerald-300"],
  ["logged_in", "Logged in", "text-sky-300"],
  ["rated", "Rated", "text-[#d4af37]"],
];

export function FounderFunnel() {
  const [f, setF] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { api.get("/super-admin/founder-funnel").then(r => setF(r.data)).catch(() => {}); }, []);
  if (!f) return null;
  const pct = (n) => f.sent ? Math.round((n / f.sent) * 100) : 0;
  return (
    <div className="rounded-2xl border border-[#d4af37]/30 bg-[#15151b] p-4" data-testid="founder-funnel">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-[#d4af37]/80 uppercase">✍️ Founder Offer Funnel</p>
        <p className="text-[11px] text-slate-400">
          {f.avg_rating ? <>avg rating <b className="text-[#d4af37]">★ {f.avg_rating}</b> · </> : null}
          {f.paid ? <><b className="text-emerald-300">{f.paid}</b> converted to paid · </> : null}
          {f.opened} opened
        </p>
      </div>
      <div className="flex items-stretch gap-1 overflow-x-auto" data-testid="founder-funnel-strip">
        {STEPS.map(([k, label, color], i) => (
          <div key={k} className="flex items-center gap-1 flex-1 min-w-[120px]">
            <div className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-center" data-testid={`founder-funnel-${k}`}>
              <div className={`text-xl font-bold ${color}`}>{f[k]}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
              {i > 0 && <div className="text-[10px] text-slate-600 mt-0.5">{pct(f[k])}% of sent</div>}
            </div>
            {i < STEPS.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
          </div>
        ))}
      </div>
      {f.salons.length > 0 && (
        <>
          <button onClick={() => setOpen(o => !o)} className="mt-2 text-[11px] text-slate-500 hover:text-[#d4af37] underline" data-testid="founder-funnel-toggle">
            {open ? "Hide salons" : `Show ${f.salons.length} founder-offer salon${f.salons.length === 1 ? "" : "s"}`}
          </button>
          {open && (
            <div className="mt-2 space-y-1">
              {f.salons.map(s => (
                <div key={s.slug} className="flex items-center gap-2 text-xs bg-white/5 border border-white/5 rounded-lg px-2.5 py-1.5" data-testid={`founder-funnel-salon-${s.slug}`}>
                  <span className="font-medium text-slate-200 truncate">{s.name}</span>
                  <span className="text-slate-500 truncate hidden sm:inline">{s.slug}</span>
                  <span className="text-[10px] text-slate-500 shrink-0">trial ends {s.trial_end_date || "—"}</span>
                  <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${s.logged_in ? "bg-sky-500/20 text-sky-300" : "bg-white/10 text-slate-400"}`}>{s.logged_in ? "Logged in ✓" : "Not logged in"}</span>
                  {s.rating && <span className="text-[10px] text-[#d4af37] font-bold shrink-0">{"★".repeat(s.rating)}</span>}
                  {s.status === "active" && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-600 text-white font-semibold">Paid 🎉</span>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
