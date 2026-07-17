import { useEffect, useState } from "react";
import axios from "axios";
import { CalendarCheck, Clock, Sparkles, CheckCircle2, User } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const inputCls = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f4f1e8] placeholder:text-[#6d675c] focus:outline-none focus:border-[#d4af37]/60";

export default function PublicDemo() {
  const [slots, setSlots] = useState(null);
  const [form, setForm] = useState({ name: "", salon_name: "", city: "", email: "", phone: "" });
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    axios.get(`${API}/public/demo/slots`).then(r => setSlots(r.data)).catch(() => setErr("Couldn't load available slots — please refresh."));
  }, []);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const canBook = form.name.trim().length >= 2 && /\S+@\S+\.\S+/.test(form.email) && date && time;

  const book = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await axios.post(`${API}/public/demo/book`, { ...form, date, time });
      setDone({ slot: r.data.slot, gcal: r.data.gcal });
    } catch (e) {
      setErr(e.response?.data?.detail || "Couldn't book the slot — please try again.");
    }
    setBusy(false);
  };

  const pretty = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="min-h-screen bg-[#15151b] text-[#f4f1e8] flex items-center justify-center px-4 py-10" data-testid="public-demo-page">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="font-serif text-3xl tracking-[.3em] text-[#d4af37]">MIRACURL</div>
          <div className="text-[11px] tracking-[.25em] text-[#8f8798] mt-1">THE ALL-IN-ONE SALON SUITE</div>
        </div>

        {done && (
          <div className="bg-[#1d1d24] border border-[#d4af37]/30 rounded-2xl p-8 text-center space-y-4" data-testid="demo-success">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <h1 className="font-serif text-2xl">Your demo is booked ✦</h1>
            <p className="text-sm text-[#a49d8e]">
              {new Date(done.slot.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })} at <b className="text-[#f4f1e8]">{done.slot.time} IST</b> · 20 minutes
            </p>
            <p className="text-xs text-[#8f8798]">A confirmation email with the calendar invite is on its way to your inbox. See you there!</p>
            {done.gcal && (
              <a href={done.gcal} target="_blank" rel="noreferrer" data-testid="demo-gcal-btn"
                className="inline-block bg-[#d4af37] text-[#15151b] font-bold text-sm px-8 py-3.5 rounded-full hover:opacity-90 transition-opacity">
                📅 Add to Google Calendar
              </a>
            )}
          </div>
        )}

        {!done && (
          <div className="bg-[#1d1d24] border border-white/5 rounded-2xl p-7 space-y-6">
            <div>
              <h1 className="font-serif text-2xl leading-snug">Book your free live demo ✦</h1>
              <p className="text-xs text-[#8f8798] mt-2 leading-relaxed">
                A relaxed 20-minute walkthrough of the Miracurl Suite — bookings, POS, staff and your 12-agent AI team. No obligation, ever.
              </p>
            </div>

            <div className="space-y-2.5">
              <p className="text-[11px] tracking-widest text-[#9a8f6d] font-semibold flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> ABOUT YOU</p>
              <input value={form.name} onChange={set("name")} maxLength={80} placeholder="Your name *" data-testid="demo-name-input" className={inputCls} />
              <div className="grid grid-cols-2 gap-2.5">
                <input value={form.salon_name} onChange={set("salon_name")} maxLength={100} placeholder="Salon name" data-testid="demo-salon-input" className={inputCls} />
                <input value={form.city} onChange={set("city")} maxLength={60} placeholder="City" data-testid="demo-city-input" className={inputCls} />
              </div>
              <input value={form.email} onChange={set("email")} maxLength={120} type="email" placeholder="Email * (confirmation goes here)" data-testid="demo-email-input" className={inputCls} />
              <input value={form.phone} onChange={set("phone")} maxLength={20} placeholder="Phone (optional)" data-testid="demo-phone-input" className={inputCls} />
            </div>

            {slots && (
              <>
                <div>
                  <p className="text-[11px] tracking-widest text-[#9a8f6d] font-semibold mb-2 flex items-center gap-1.5"><CalendarCheck className="w-3.5 h-3.5" /> CHOOSE A DAY</p>
                  <div className="grid grid-cols-4 gap-2">
                    {slots.dates.map(d => (
                      <button key={d} onClick={() => setDate(d)} data-testid={`demo-date-${d}`}
                        className={`px-2 py-2.5 rounded-xl text-xs font-medium transition-colors ${date === d ? "bg-[#d4af37] text-[#15151b]" : "bg-white/5 text-[#c9c2b4] hover:bg-white/10"}`}>
                        {pretty(d)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] tracking-widest text-[#9a8f6d] font-semibold mb-2 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> CHOOSE A TIME (IST)</p>
                  <div className="grid grid-cols-4 gap-2">
                    {slots.times.map(t => (
                      <button key={t} onClick={() => setTime(t)} data-testid={`demo-time-${t}`}
                        className={`px-2 py-2.5 rounded-xl text-xs font-medium transition-colors ${time === t ? "bg-[#d4af37] text-[#15151b]" : "bg-white/5 text-[#c9c2b4] hover:bg-white/10"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <button onClick={book} disabled={!canBook || busy} data-testid="demo-book-btn"
              className="w-full bg-[#d4af37] text-[#15151b] font-bold text-sm py-4 rounded-full disabled:opacity-30 hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4" /> {busy ? "Booking…" : "Confirm my demo slot"}
            </button>
            {err && <p className="text-xs text-rose-300 text-center" data-testid="demo-error">{err}</p>}
          </div>
        )}

        <p className="text-center text-[10px] text-[#6d675c] mt-6">© Miracurl Suite · miracurl-suite.com · <a href="/terms-of-service" className="underline hover:text-[#3d3a33]">Terms</a> · <a href="/privacy-policy" className="underline hover:text-[#3d3a33]">Privacy</a></p>
      </div>
    </div>
  );
}
