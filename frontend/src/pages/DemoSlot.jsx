import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { CalendarCheck, Clock, Phone, Sparkles, CheckCircle2 } from "lucide-react";

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
    <div className="min-h-screen bg-[#15151b] text-[#f4f1e8] flex items-center justify-center px-4 py-10 relative overflow-hidden" data-testid="demo-slot-page">
      <img src="/assets/mira-outreach-hero.png" alt="" aria-hidden="true"
        className="fixed inset-0 w-full h-full object-cover opacity-[0.16] pointer-events-none" />
      <div className="fixed inset-0 bg-gradient-to-b from-[#15151b]/60 via-[#15151b]/80 to-[#15151b] pointer-events-none" />
      <div className="w-full max-w-lg relative z-10">
        <div className="text-center mb-8">
          <img src="/assets/ms-logo-gold.png" alt="Miracurl Suite" className="h-16 w-auto mx-auto mb-4 drop-shadow-[0_0_18px_rgba(212,175,55,0.35)]" data-testid="demo-slot-logo" />
          <div className="font-serif text-3xl tracking-[.3em] text-[#d4af37]">MIRACURL</div>
          <div className="text-[11px] tracking-[.25em] text-[#8f8798] mt-1">THE ALL-IN-ONE SALON SUITE</div>
        </div>

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
          <div className="bg-[#1d1d24] border border-white/5 rounded-2xl p-7 space-y-6">
            <div>
              <h1 className="font-serif text-2xl leading-snug">
                {info.name ? `${info.name}, pick` : "Pick"} a time that suits you ✦
              </h1>
              <p className="text-xs text-[#8f8798] mt-2 leading-relaxed">
                A relaxed 20-minute walkthrough of the Miracurl Suite — bookings, POS, staff and your 12-agent AI team. No obligation, ever.
              </p>
            </div>

            <div>
              <p className="text-[11px] tracking-widest text-[#9a8f6d] font-semibold mb-2 flex items-center gap-1.5"><CalendarCheck className="w-3.5 h-3.5" /> CHOOSE A DAY</p>
              <div className="grid grid-cols-4 gap-2">
                {info.dates.map(d => (
                  <button key={d} onClick={() => setDate(d)} data-testid={`demo-slot-date-${d}`}
                    className={`px-2 py-2.5 rounded-xl text-xs font-medium transition-colors ${date === d ? "bg-[#d4af37] text-[#15151b]" : "bg-white/5 text-[#c9c2b4] hover:bg-white/10"}`}>
                    {pretty(d)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] tracking-widest text-[#9a8f6d] font-semibold mb-2 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> CHOOSE A TIME (IST)</p>
              <div className="grid grid-cols-4 gap-2">
                {info.times.map(t => (
                  <button key={t} onClick={() => setTime(t)} data-testid={`demo-slot-time-${t}`}
                    className={`px-2 py-2.5 rounded-xl text-xs font-medium transition-colors ${time === t ? "bg-[#d4af37] text-[#15151b]" : "bg-white/5 text-[#c9c2b4] hover:bg-white/10"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] tracking-widest text-[#9a8f6d] font-semibold mb-2 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> PHONE (OPTIONAL)</p>
              <input value={phone} onChange={e => setPhone(e.target.value)} maxLength={20} data-testid="demo-slot-phone-input"
                placeholder="So we can call you at the chosen time"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f4f1e8] placeholder:text-[#6d675c] focus:outline-none focus:border-[#d4af37]/60" />
            </div>

            <button onClick={book} disabled={!date || !time || busy} data-testid="demo-slot-confirm-btn"
              className="w-full bg-[#d4af37] text-[#15151b] font-bold text-sm py-4 rounded-full disabled:opacity-30 hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4" /> {busy ? "Booking…" : "Confirm my demo slot"}
            </button>
            {err && <p className="text-xs text-rose-300 text-center">{err}</p>}
          </div>
        )}

        {!info && !err && <div className="text-center text-sm text-[#8f8798]">Loading…</div>}
        <p className="text-center text-[10px] text-[#6d675c] mt-6">© Miracurl Suite · miracurl-suite.com</p>
      </div>
    </div>
  );
}
