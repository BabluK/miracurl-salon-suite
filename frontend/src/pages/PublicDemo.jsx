import { useEffect, useState } from "react";
import axios from "axios";
import { CalendarCheck, Sparkles, CheckCircle2, User, ArrowRight, Lock } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import SalesChatWidget from "@/components/SalesChatWidget";
import { DemoHero } from "@/components/demo/DemoHero";
import { DemoCalendar, DemoTimes } from "@/components/demo/DemoCalendar";
import { DemoFeatureRow, DemoTrustRow, DemoField, SectionHead } from "@/components/demo/DemoBits";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const gradBtn = "bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 hover:from-pink-600 hover:via-rose-600 hover:to-amber-600 text-white";

function DemoSuccess({ done }) {
  const label = done.purpose === "onboarding" ? "onboarding session" : "demo";
  return (
    <div className="bg-white rounded-3xl shadow-[0_20px_50px_-15px_rgba(0,0,0,0.18)] ring-1 ring-slate-100 p-10 text-center space-y-4 max-w-lg mx-auto" data-testid="demo-success">
      <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
      <h1 className="font-serif text-3xl text-slate-800">Your {label} is booked ✦</h1>
      <p className="text-sm text-slate-500">
        {new Date(done.slot.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })} at <b className="text-slate-800">{done.slot.time} IST</b>{done.slot.local_time ? ` (${done.slot.local_time} your time)` : ""} · 20 minutes
      </p>
      <p className="text-xs text-slate-400">A confirmation email with the calendar invite is on its way to your inbox. See you there!</p>
      {done.gcal && (
        <a href={done.gcal} target="_blank" rel="noreferrer" data-testid="demo-gcal-btn"
          className={`inline-block ${gradBtn} font-bold text-sm px-8 py-3.5 rounded-full transition-colors`}>
          📅 Add to Google Calendar
        </a>
      )}
    </div>
  );
}

export default function PublicDemo() {
  const [slots, setSlots] = useState(null);
  const [form, setForm] = useState({ name: "", salon_name: "", city: "", email: "", phone: "" });
  const [purpose, setPurpose] = useState("demo");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    axios.get(`${API}/public/demo/slots`).then(r => {
      setSlots(r.data);
      setDate(r.data.dates[0] || "");
      setTime(r.data.times[0] || "");
    }).catch(() => setErr("Couldn't load available slots — please refresh."));
  }, []);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const canBook = form.name.trim().length >= 2 && form.salon_name.trim().length >= 1 && form.city.trim().length >= 1
    && /\S+@\S+\.\S+/.test(form.email) && date && time;

  const book = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await axios.post(`${API}/public/demo/book`, { ...form, date, time, purpose, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "" });
      setDone({ slot: r.data.slot, gcal: r.data.gcal, purpose });
    } catch (e) {
      setErr(e.response?.data?.detail || "Couldn't book the slot — please try again.");
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#fffaf8] text-slate-800" data-testid="public-demo-page">
      <SiteHeader variant="light" />
      <SalesChatWidget />
      <div className="pointer-events-none absolute -right-32 -top-24 w-[520px] h-[520px] rounded-full opacity-70"
        style={{ background: "radial-gradient(circle at 35% 35%, #fde68a 0%, #f9a8d4 45%, #f472b6 70%, transparent 100%)" }} />
      <div className="pointer-events-none absolute -left-40 top-[40%] w-[520px] h-[520px] rounded-full opacity-60"
        style={{ background: "radial-gradient(circle at 60% 40%, #fbcfe8 0%, #fde68a 55%, transparent 100%)" }} />
      <div className="pointer-events-none absolute -right-24 -bottom-40 w-[560px] h-[560px] rounded-full opacity-60"
        style={{ background: "radial-gradient(circle at 40% 60%, #f9a8d4 0%, #fde68a 55%, transparent 100%)" }} />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-12">
        {done ? <DemoSuccess done={done} /> : (
          <>
            <DemoHero purpose={purpose} setPurpose={setPurpose} />
            <DemoFeatureRow />

            <div className="bg-white rounded-3xl shadow-[0_24px_60px_-20px_rgba(236,72,153,0.25)] ring-1 ring-pink-100 p-6 sm:p-8 lg:p-10" data-testid="demo-form-card">
              <div className="grid lg:grid-cols-2 gap-10 lg:gap-14">
                <div>
                  <SectionHead icon={User} title="Your Details" sub={`Let us know a few details to schedule your ${purpose === "onboarding" ? "onboarding session" : "demo"}.`} testid="demo-details-head" />
                  <div className="space-y-4">
                    <DemoField k="name" label="Your Name" required form={form} set={set} placeholder="Enter your full name" testid="demo-name-input" />
                    <DemoField k="salon_name" label="Salon Name" required form={form} set={set} placeholder="Enter your salon name" testid="demo-salon-input" />
                    <DemoField k="city" label="City" required form={form} set={set} placeholder="Enter your city" testid="demo-city-input" />
                    <DemoField k="email" label="Email" required type="email" form={form} set={set} placeholder="Enter your email address" testid="demo-email-input" />
                    <DemoField k="phone" label="Phone (Optional)" form={form} set={set} placeholder="Enter your phone number" testid="demo-phone-input" />
                  </div>
                </div>
                <div>
                  <SectionHead icon={CalendarCheck} title="Select Date & Time" sub={`Choose a convenient date and time for your ${purpose === "onboarding" ? "session" : "demo"}.`} testid="demo-schedule-head" />
                  {slots ? (
                    <div className="space-y-6">
                      <DemoCalendar dates={slots.dates} value={date} onChange={setDate} />
                      <DemoTimes times={slots.times} value={time} onChange={setTime} />
                    </div>
                  ) : <p className="text-sm text-slate-400" data-testid="demo-slots-loading">Loading available slots…</p>}
                </div>
              </div>

              <button onClick={book} disabled={!canBook || busy} data-testid="demo-book-btn"
                className={`w-full mt-10 ${gradBtn} font-bold text-base py-4 rounded-2xl disabled:opacity-40 transition-colors flex items-center justify-center gap-2.5 shadow-lg`}>
                <Sparkles className="w-5 h-5" /> {busy ? "Booking…" : purpose === "onboarding" ? "Confirm My Onboarding Slot" : "Confirm My Demo Slot"} <ArrowRight className="w-5 h-5" />
              </button>
              {err && <p className="text-xs text-rose-500 text-center mt-3" data-testid="demo-error">{err}</p>}
              <p className="text-xs text-slate-500 text-center mt-4 flex items-center justify-center gap-1.5" data-testid="demo-privacy-note">
                <Lock className="w-3.5 h-3.5" /> Your information is safe with us. We'll only use it to schedule your {purpose === "onboarding" ? "session" : "demo"}.
              </p>
            </div>

            <DemoTrustRow />
          </>
        )}
        <p className="text-center text-[10px] text-slate-400 mt-8">© Miracurl Suite · miracurl-suite.com · <a href="/terms-of-service" className="underline hover:text-slate-600">Terms</a> · <a href="/privacy-policy" className="underline hover:text-slate-600">Privacy</a></p>
      </div>
    </div>
  );
}
