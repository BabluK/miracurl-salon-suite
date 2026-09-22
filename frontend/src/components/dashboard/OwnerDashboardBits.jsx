import { useState } from "react";
import { KeyRound, Link as LinkIcon, Copy, ExternalLink, IndianRupee } from "lucide-react";
import { toast } from "sonner";

export function PinDialog({ title, hint, confirmLabel = "Unlock", danger = false, busy = false, onCancel, onConfirm, testid }) {
  const [pin, setPin] = useState("");
  const ok = /^\d{4,8}$/.test(pin);
  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid={`${testid}-pin-modal`}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-xs shadow-2xl">
        <p className="text-sm font-semibold text-slate-800 flex items-center gap-2"><KeyRound className="w-4 h-4 text-amber-500" /> {title}</p>
        <p className="text-[11px] text-slate-500 mt-1">{hint}</p>
        <input autoFocus data-testid={`${testid}-pin-input`} type="password" autoComplete="one-time-code" inputMode="numeric" maxLength={8} value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, ""))} onKeyDown={e => e.key === "Enter" && ok && onConfirm(pin)}
          style={{ background: "#fff", color: "#0f172a", WebkitTextFillColor: "#0f172a", colorScheme: "light" }}
          className="mt-3 w-full px-3 py-2 rounded-lg border border-slate-200 text-center text-lg tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-amber-200" />
        <div className="flex gap-2 mt-3">
          <button data-testid={`${testid}-pin-cancel`} onClick={onCancel} className="flex-1 py-2 rounded-lg text-xs text-slate-500 border border-slate-200">Cancel</button>
          <button data-testid={`${testid}-pin-confirm`} disabled={!ok || busy} onClick={() => onConfirm(pin)}
            className={`flex-1 py-2 rounded-lg text-white text-xs font-semibold disabled:opacity-50 ${danger ? "bg-rose-600" : "bg-slate-900"}`}>
            {busy ? "Checking…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SnapshotHero({ name, today, bills, bookingUrl, inr }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(bookingUrl); toast.success("Booking link copied!"); } catch { toast.error("Couldn't copy"); }
  };
  return (
    <section data-testid="owner-snapshot-hero"
      className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white shadow-[0_30px_60px_-30px_rgba(37,99,235,.7)] bg-[linear-gradient(135deg,#2563eb_0%,#1d4ed8_45%,#0ea5e9_100%)]">
      <div className="pointer-events-none absolute -right-20 -top-24 w-72 h-72 rounded-full bg-white/15 blur-3xl" />
      <div className="pointer-events-none absolute -left-16 bottom-0 w-56 h-56 rounded-full bg-sky-300/20 blur-3xl" />
      <div className="relative grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-6 items-start">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/70 font-semibold">Today's Snapshot</div>
          <h1 className="font-outfit text-3xl sm:text-4xl font-bold leading-tight mt-2">Welcome back to<br />{name} <span className="text-white/90">✦</span></h1>
          <div className="mt-4 inline-flex items-center gap-2.5 rounded-xl bg-white/15 border border-white/25 px-3.5 py-2 backdrop-blur" data-testid="owner-snapshot-today">
            <span className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center"><IndianRupee className="w-4 h-4" /></span>
            <span className="text-sm sm:text-base font-semibold">Today's Collection: {inr(today)} <span className="text-white/70 font-normal">· {bills} bills</span></span>
          </div>
          <p className="text-sm text-white/80 mt-4 max-w-md">A polished glance at appointments, revenue and inventory — everything you need at a glance.</p>
        </div>
        <div className="rounded-2xl bg-white/12 border border-white/25 p-4 backdrop-blur-md" data-testid="owner-snapshot-link">
          <div className="text-[10px] uppercase tracking-[0.26em] text-white/80 font-semibold flex items-center gap-1.5"><LinkIcon className="w-3.5 h-3.5" /> Public Booking Link</div>
          <p className="text-xs text-white/75 mt-1.5">Share on Instagram, WhatsApp & Google profile — customers can self-book 24/7.</p>
          <div className="mt-3 rounded-lg bg-white text-slate-700 text-xs font-mono px-3 py-2 truncate">{bookingUrl}</div>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <button onClick={copy} data-testid="owner-snapshot-copy" className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/20 hover:bg-white/30 px-3 py-2 text-xs font-semibold transition-colors"><Copy className="w-3.5 h-3.5" /> Copy Link</button>
            <a href={bookingUrl} target="_blank" rel="noreferrer" data-testid="owner-snapshot-open" className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white text-blue-700 hover:bg-blue-50 px-3 py-2 text-xs font-semibold transition-colors"><ExternalLink className="w-3.5 h-3.5" /> Open</a>
          </div>
        </div>
      </div>
    </section>
  );
}

const fmtD = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
const fmtDow = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" });

export function DailyBars({ days, inr }) {
  if (!days || days.length < 2) return null;
  const max = Math.max(...days.map(d => d.revenue), 1);
  const many = days.length > 10;
  return (
    <div className="rounded-2xl bg-white/[.05] border border-white/10 p-4" data-testid="owner-daily-bars">
      <div className="text-[10px] uppercase tracking-[.18em] text-white/55 mb-3">Day by day</div>
      <div className="flex items-stretch gap-1.5 sm:gap-2 h-40">
        {days.map((d) => (
          <div key={d.date} className="flex-1 min-w-0 flex flex-col justify-end group" title={`${fmtD(d.date)} · ${inr(d.revenue)}`}>
            {!many && <div className="text-[10px] text-[#f3e5ab] font-semibold truncate max-w-full text-center mb-1">{inr(d.revenue)}</div>}
            <div className="w-full flex-1 flex flex-col justify-end">
              <div className="w-full rounded-t-md bg-gradient-to-t from-[#c99a2e] to-[#e8c56a] transition-[height] duration-700 group-hover:brightness-110" style={{ height: `${Math.max(4, (d.revenue / max) * 100)}%` }} />
            </div>
            <div className="text-[9px] text-white/50 leading-tight text-center mt-1">{many ? d.date.slice(8) : <>{fmtD(d.date).split(" ")[0]}<br />{fmtDow(d.date)}</>}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
