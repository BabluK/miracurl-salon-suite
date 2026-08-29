import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { CalendarCheck, Clock, Phone, Sparkles, CheckCircle2 } from "lucide-react";
import BrandMark from "@/components/BrandMark";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function DemoSlot() {
  const { iid } = useParams();
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    axios.get(`${API}/public/demo-slot/${iid}`)
      .then(r => {
        setInfo(r.data);
        if (r.data.scheduled) setDone({ slot: r.data.scheduled, gcal: null });
      })
      .catch(() => setErr("This invitation link is invalid or has expired."));
  }, [iid]);

  const book = async () => {
    if (!date || !time) return;
    setBusy(true);
    try {
      const r = await axios.post(`${API}/public/demo-slot/${iid}`, { date, time, phone, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "" });
      setDone({ slot: r.data.slot, gcal: r.data.gcal });
    } catch (e) {
      setErr(e.response?.data?.detail || "Couldn't book the slot — please try again.");
    }
    setBusy(false);
  };

  const pretty = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="min-h-screen relative overflow-hidden bg-white text-slate-800 flex items-center justify-center px-4 py-12" data-testid="demo-slot-page">
      <div className="pointer-events-none absolute -right-32 -bottom-32 w-[640px] h-[640px] rounded-full opacity-90"
        style={{ background: "radial-gradient(circle at 30% 30%, #e8918f 0%, #d4af37 40%, #ec4899 75%, transparent 100%)" }} />
      <div className="pointer-events-none absolute -left-40 -bottom-44 w-[520px] h-[520px] rounded-full opacity-80"
        style={{ background: "radial-gradient(circle at 60% 40%, #f5d78e 0%, #e8a0a8 45%, #d4af37 80%, transparent 100%)" }} />
      <div className="absolute z-10 px-6 pt-5 sm:px-10 sm:pt-6 top-0 left-0" data-testid="demo-slot-logo">
        <BrandMark variant="light" size="lg" />
      </div>
      <div className="w-full max-w-lg relative z-10 mt-16">

        {err && !done && (
          <div className="bg-[#1d1d24] border border-rose-900/50 rounded-2xl p-8 text-center text-sm text-rose-300" data-testid="demo-slot-error">{err}</div>
        )}

        {done && (
          <div className="bg-[#1d1d24] border border-[#d4af37]/30 rounded-2xl p-8 text-center space-y-4" data-testid="demo-slot-success">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <h1 className="font-serif text-2xl">Your demo is booked ✦</h1>
            <p className="text-sm text-[#a49d8e]">
              {new Date(done.slot.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })} at <b className="text-[#f4f1e8]">{done.slot.time} IST</b> · 20 minutes
            </p>
            <p className="text-xs text-[#8f8798]">A confirmation email with the calendar invite is on its way to your inbox. See you there!</p>
            {done.gcal && (
              <a href={done.gcal} target="_blank" rel="noreferrer" data-testid="demo-slot-gcal-btn"
                className="inline-block bg-[#d4af37] text-[#15151b] font-bold text-sm px-8 py-3.5 rounded-full hover:opacity-90 transition-opacity">
                📅 Add to Google Calendar
              </a>
            )}
          </div>
        )}

        {info && !done && !err && (
          <div className="bg-white/90 backdrop-blur-xl border border-[#eadfc6] rounded-3xl p-7 space-y-6 shadow-[0_24px_60px_rgba(180,140,50,0.18)]">
            <div>
              <h1 className="font-serif text-2xl leading-snug bg-gradient-to-r from-[#8a6d1f] via-[#c99a2e] to-[#8a6d1f] bg-clip-text text-transparent font-semibold">
                {info.name ? `${info.name}, pick` : "Pick"} a time that suits you ✦
              </h1>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                A relaxed 20-minute walkthrough of the Miracurl Suite — bookings, POS, staff and your 12-agent AI team. No obligation, ever.
              </p>
            </div>

            <div>
              <p className="text-[11px] tracking-widest text-[#a5926a] font-bold mb-2 flex items-center gap-1.5"><CalendarCheck className="w-3.5 h-3.5" /> CHOOSE A DAY</p>
              <div className="grid grid-cols-4 gap-2">
                {info.dates.map(d => (
                  <button key={d} onClick={() => setDate(d)} data-testid={`demo-slot-date-${d}`}
                    className={`px-2 py-2.5 rounded-xl text-xs font-semibold transition-all ${date === d ? "bg-gradient-to-r from-[#d4af37] to-[#b08d3f] text-white shadow-md scale-[1.03]" : "bg-[#faf6ec] text-slate-600 border border-[#eadfc6] hover:border-[#d4af37]"}`}>
                    {pretty(d)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] tracking-widest text-[#a5926a] font-bold mb-2 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> CHOOSE A TIME (IST)</p>
              <div className="grid grid-cols-4 gap-2">
                {info.times.map(t => (
                  <button key={t} onClick={() => setTime(t)} data-testid={`demo-slot-time-${t}`}
                    className={`px-2 py-2.5 rounded-xl text-xs font-semibold transition-all ${time === t ? "bg-gradient-to-r from-[#d4af37] to-[#b08d3f] text-white shadow-md scale-[1.03]" : "bg-[#faf6ec] text-slate-600 border border-[#eadfc6] hover:border-[#d4af37]"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] tracking-widest text-[#a5926a] font-bold mb-2 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> PHONE (OPTIONAL)</p>
              <input value={phone} onChange={e => setPhone(e.target.value)} maxLength={20} data-testid="demo-slot-phone-input"
                placeholder="So we can call you at the chosen time"
                className="w-full bg-[#faf6ec] border border-[#eadfc6] rounded-xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#d4af37]" />
            </div>

            <button onClick={book} disabled={!date || !time || busy} data-testid="demo-slot-confirm-btn"
              className="w-full bg-gradient-to-r from-[#d4af37] via-[#c99a2e] to-[#b08d3f] text-white font-bold text-sm py-4 rounded-full disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-[0_10px_28px_rgba(180,140,50,0.4)]">
              <Sparkles className="w-4 h-4" /> {busy ? "Booking…" : "Confirm my demo slot"}
            </button>
            {err && <p className="text-xs text-rose-500 text-center">{err}</p>}
          </div>
        )}

        {!info && !err && <div className="text-center text-sm text-slate-400">Loading…</div>}
        <p className="text-center text-[10px] text-slate-400 mt-6">© Miracurl Suite · miracurl-suite.com</p>
      </div>
    </div>
  );
}
