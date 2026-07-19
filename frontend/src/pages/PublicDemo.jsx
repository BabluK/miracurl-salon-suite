import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { CalendarCheck, Clock, Sparkles, CheckCircle2, User, Send, Loader2, Bot, ClipboardList } from "lucide-react";
import BrandMark from "@/components/BrandMark";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const inputCls = "w-full bg-rose-50/50 border border-rose-100 rounded-xl px-4 py-3 text-base sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-pink-400";
const gradBtn = "bg-gradient-to-r from-rose-400 via-pink-500 to-amber-500 hover:from-rose-500 hover:via-pink-600 hover:to-amber-600 text-white";

const CHIPS = ["Book me a demo for tomorrow evening", "What can Miracurl do for my salon?", "मुझे कल का डेमो चाहिए"];

function newSid() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 36);
}

function MiraDemoChat({ onBooked }) {
  const [msgs, setMsgs] = useState([{ role: "ai", text: "Hi, I'm Mira ✦ I can book your free live demo in under a minute — no forms needed.\n\nJust tell me: what day and time suits you, and may I know your name?" }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const sidRef = useRef(newSid());
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = async (preset) => {
    const text = (preset ?? input).trim();
    if (!text || busy) return;
    setInput("");
    setMsgs(m => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/public/demo-chat`, {
        message: text, session_id: sidRef.current,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      }, { timeout: 90000 });
      setMsgs(m => [...m, { role: "ai", text: data.reply }]);
      if (data.booking) setTimeout(() => onBooked({ slot: data.booking, gcal: data.booking.gcal }), 1600);
    } catch (e) {
      setMsgs(m => [...m, { role: "ai", text: e.response?.data?.detail || "I hit a snag — please try again, or use the quick form." }]);
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col h-[55vh] min-h-[340px] max-h-[460px]" data-testid="demo-mira-chat">
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "ai" && (
              <img src="/assets/mira-ai-logo.png" alt="Mira AI" className="w-8 h-8 rounded-full border-2 border-amber-300/70 bg-white object-cover mr-2 mt-1 flex-shrink-0 shadow-sm" />
            )}
            <div className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${
              m.role === "user" ? `${gradBtn} rounded-br-sm` : "bg-slate-100 text-slate-700 rounded-bl-sm"}`}>
              {m.text}
            </div>
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-slate-400 text-xs pl-10"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Mira is typing…</div>}
        {msgs.length <= 1 && (
          <div className="flex flex-wrap gap-1.5 pt-2 pl-10" data-testid="demo-chat-chips">
            {CHIPS.map(c => (
              <button key={c} onClick={() => send(c)} data-testid="demo-chat-chip"
                className="text-[11px] px-3 py-1.5 rounded-full bg-pink-50 border border-pink-200 text-pink-600 hover:bg-pink-100 transition-colors">
                {c}
              </button>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2 pt-3 border-t border-rose-100 mt-2">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Tell Mira your preferred day & time…" data-testid="demo-chat-input"
          className={inputCls + " flex-1"} />
        <button onClick={() => send()} disabled={busy || !input.trim()} data-testid="demo-chat-send"
          className={`w-11 h-11 rounded-xl ${gradBtn} flex items-center justify-center disabled:opacity-40 flex-shrink-0 transition-opacity`}>
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function PublicDemo() {
  const [slots, setSlots] = useState(null);
  const [form, setForm] = useState({ name: "", salon_name: "", city: "", email: "", phone: "" });
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  const [tab, setTab] = useState("mira");

  useEffect(() => {
    axios.get(`${API}/public/demo/slots`).then(r => setSlots(r.data)).catch(() => setErr("Couldn't load available slots — please refresh."));
  }, []);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const canBook = form.name.trim().length >= 2 && /\S+@\S+\.\S+/.test(form.email) && date && time;

  const book = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await axios.post(`${API}/public/demo/book`, { ...form, date, time, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "" });
      setDone({ slot: r.data.slot, gcal: r.data.gcal });
    } catch (e) {
      setErr(e.response?.data?.detail || "Couldn't book the slot — please try again.");
    }
    setBusy(false);
  };

  const pretty = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="min-h-screen relative overflow-hidden bg-white text-slate-800 px-4 py-8" data-testid="public-demo-page">
      {/* Rose-gold gradient blobs — same brand language as the login page */}
      <div className="pointer-events-none absolute -right-32 -bottom-32 w-[640px] h-[640px] rounded-full opacity-90"
        style={{ background: "radial-gradient(circle at 30% 30%, #e8918f 0%, #d4af37 40%, #ec4899 75%, transparent 100%)" }} />
      <div className="pointer-events-none absolute -left-40 -bottom-44 w-[520px] h-[520px] rounded-full opacity-80"
        style={{ background: "radial-gradient(circle at 60% 40%, #f5d78e 0%, #e8a0a8 45%, #d4af37 80%, transparent 100%)" }} />
      <div className="pointer-events-none absolute -right-24 -top-32 w-[420px] h-[420px] rounded-full opacity-60"
        style={{ background: "radial-gradient(circle at 40% 60%, #f5d78e 0%, #ec4899 60%, transparent 100%)" }} />

      {/* Brand mark — top-left like the login page */}
      <div className="absolute z-10 px-6 pt-5 sm:px-10 sm:pt-6">
        <BrandMark variant="light" size="lg" />
      </div>

      <div className="w-full max-w-lg mx-auto relative z-10 pt-16 sm:pt-14">
        {/* Mira AI hero */}
        <div className="text-center mb-6">
          <div className="relative inline-block">
            <img src="/assets/mira-ai-logo.png" alt="Mira AI" data-testid="demo-mira-hero"
              className="h-24 sm:h-28 mx-auto rounded-full drop-shadow-[0_12px_30px_rgba(236,72,153,0.35)]" />
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[9px] font-bold tracking-[2px] px-3 py-1 rounded-full bg-gradient-to-r from-rose-400 via-pink-500 to-amber-500 text-white whitespace-nowrap shadow">MIRA AI</span>
          </div>
          <p className="text-[11px] uppercase tracking-[0.25em] mt-5 font-semibold" data-testid="demo-ai-tagline">
            <span className="brand-ai-tag">✦ AI Powered Salon Suite ✦</span>
          </p>
        </div>

        {done && (
          <div className="bg-white rounded-2xl shadow-[0_20px_50px_-15px_rgba(0,0,0,0.18)] ring-1 ring-slate-100 p-8 text-center space-y-4" data-testid="demo-success">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <h1 className="font-serif text-2xl text-slate-800">Your demo is booked ✦</h1>
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
        )}

        {!done && (
          <div className="bg-white rounded-2xl shadow-[0_20px_50px_-15px_rgba(0,0,0,0.18)] ring-1 ring-slate-100 overflow-hidden">
            <div className="p-6 pb-0">
              <h1 className="font-serif text-2xl leading-snug text-slate-800">Book your free live demo ✦</h1>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                A relaxed 20-minute walkthrough of the Miracurl Suite — bookings, POS, staff and your 12-agent AI team. No obligation, ever.
              </p>
              <div className="flex gap-1 mt-5 p-1 rounded-full bg-slate-100" data-testid="demo-tabs">
                <button onClick={() => setTab("mira")} data-testid="demo-tab-mira"
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2.5 rounded-full transition-all ${
                    tab === "mira" ? "bg-white text-pink-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  <Bot className="w-4 h-4" /> Let Mira book it <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gradient-to-r from-rose-400 to-amber-500 text-white">AI</span>
                </button>
                <button onClick={() => setTab("form")} data-testid="demo-tab-form"
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2.5 rounded-full transition-all ${
                    tab === "form" ? "bg-white text-pink-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  <ClipboardList className="w-4 h-4" /> Quick form
                </button>
              </div>
            </div>

            {tab === "mira" && (
              <div className="p-4 sm:p-6 pt-4 sm:pt-4">
                <MiraDemoChat onBooked={setDone} />
              </div>
            )}

            {tab === "form" && (
              <div className="p-4 sm:p-6 pt-4 sm:pt-4 space-y-6">
                <div className="space-y-2.5">
                  <p className="text-[11px] tracking-widest text-pink-500 font-semibold flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> ABOUT YOU</p>
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
                      <p className="text-[11px] tracking-widest text-pink-500 font-semibold mb-2 flex items-center gap-1.5"><CalendarCheck className="w-3.5 h-3.5" /> CHOOSE A DAY</p>
                      <div className="grid grid-cols-4 gap-2">
                        {slots.dates.map(d => (
                          <button key={d} onClick={() => setDate(d)} data-testid={`demo-date-${d}`}
                            className={`px-2 py-2.5 rounded-xl text-xs font-medium transition-colors ${date === d ? `${gradBtn}` : "bg-white border border-slate-200 text-slate-600 hover:border-pink-300"}`}>
                            {pretty(d)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] tracking-widest text-pink-500 font-semibold mb-2 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> CHOOSE A TIME (IST)</p>
                      <div className="grid grid-cols-4 gap-2">
                        {slots.times.map(t => (
                          <button key={t} onClick={() => setTime(t)} data-testid={`demo-time-${t}`}
                            className={`px-2 py-2.5 rounded-xl text-xs font-medium transition-colors ${time === t ? `${gradBtn}` : "bg-white border border-slate-200 text-slate-600 hover:border-pink-300"}`}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <button onClick={book} disabled={!canBook || busy} data-testid="demo-book-btn"
                  className={`w-full ${gradBtn} font-bold text-sm py-4 rounded-full disabled:opacity-40 transition-colors flex items-center justify-center gap-2`}>
                  <Sparkles className="w-4 h-4" /> {busy ? "Booking…" : "Confirm my demo slot"}
                </button>
                {err && <p className="text-xs text-rose-500 text-center" data-testid="demo-error">{err}</p>}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-center gap-4 mt-5 text-[10px] text-slate-500 font-medium">
          <span>✓ 20 minutes</span><span>✓ No obligation</span><span>✓ 7-day free trial after</span>
        </div>
        <p className="text-center text-[10px] text-slate-400 mt-4 pb-4">© Miracurl Suite · miracurl-suite.com · <a href="/terms-of-service" className="underline hover:text-slate-600">Terms</a> · <a href="/privacy-policy" className="underline hover:text-slate-600">Privacy</a></p>
      </div>
    </div>
  );
}
