import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { CalendarCheck, Clock, Sparkles, CheckCircle2, User, Send, Loader2, Bot, ClipboardList } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const inputCls = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f4f1e8] placeholder:text-[#6d675c] focus:outline-none focus:border-[#d4af37]/60";

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
    <div className="flex flex-col h-[460px]" data-testid="demo-mira-chat">
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "ai" && (
              <img src="/assets/mira-ai-logo.png" alt="" className="w-8 h-8 rounded-full border border-[#d4af37]/50 bg-[#1d1d24] object-cover mr-2 mt-1 flex-shrink-0" />
            )}
            <div className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${
              m.role === "user" ? "bg-[#d4af37] text-[#15151b] rounded-br-sm" : "bg-white/[0.07] text-[#eae5d8] rounded-bl-sm"}`}>
              {m.text}
            </div>
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-[#8f8798] text-xs pl-9"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Mira is typing…</div>}
        {msgs.length <= 1 && (
          <div className="flex flex-wrap gap-1.5 pt-2 pl-9" data-testid="demo-chat-chips">
            {CHIPS.map(c => (
              <button key={c} onClick={() => send(c)} data-testid="demo-chat-chip"
                className="text-[11px] px-3 py-1.5 rounded-full bg-[#d4af37]/10 border border-[#d4af37]/30 text-[#d4af37] hover:bg-[#d4af37]/20 transition-colors">
                {c}
              </button>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2 pt-3 border-t border-white/5 mt-2">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Tell Mira your preferred day & time…" data-testid="demo-chat-input"
          className={inputCls + " flex-1"} />
        <button onClick={() => send()} disabled={busy || !input.trim()} data-testid="demo-chat-send"
          className="w-11 h-11 rounded-xl bg-[#d4af37] text-[#15151b] flex items-center justify-center disabled:opacity-30 flex-shrink-0 hover:opacity-90 transition-opacity">
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
    <div className="min-h-screen bg-[#15151b] text-[#f4f1e8] px-4 py-10 relative overflow-hidden" data-testid="public-demo-page">
      {/* AI ambience background */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-[#d4af37]/[0.09] blur-[110px]" />
        <div className="absolute -bottom-40 -right-32 w-[520px] h-[520px] rounded-full bg-[#e2725b]/[0.08] blur-[120px]" />
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "linear-gradient(rgba(212,175,55,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,.5) 1px, transparent 1px)", backgroundSize: "56px 56px" }} />
        <img src="/assets/mira-ai-logo.png" alt="" className="absolute -right-16 top-24 w-[380px] opacity-[0.07] blur-[1px] select-none" />
      </div>
      <div className="w-full max-w-lg mx-auto relative z-10">
        <div className="text-center mb-7">
          <div className="relative inline-block">
            <img src="/assets/mira-ai-logo.png" alt="Mira AI" data-testid="demo-mira-hero"
              className="h-32 mx-auto drop-shadow-[0_0_34px_rgba(212,175,55,0.45)] animate-[pulse_4s_ease-in-out_infinite]" />
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-bold tracking-[2px] px-2.5 py-1 rounded-full bg-[#d4af37] text-[#15151b] whitespace-nowrap">MIRA AI</span>
          </div>
          <img src="/brand/miracurl-gold.png" alt="Miracurl — Salon Suite, AI Powered" data-testid="demo-brand-logo"
            className="h-20 mx-auto mt-4 drop-shadow-[0_0_28px_rgba(212,175,55,0.25)]" />
          <div className="text-[11px] tracking-[.25em] text-[#8f8798] mt-2">THE ALL-IN-ONE SALON SUITE</div>
        </div>

        {done && (
          <div className="bg-[#1d1d24] border border-[#d4af37]/30 rounded-2xl p-8 text-center space-y-4" data-testid="demo-success">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <h1 className="font-serif text-2xl">Your demo is booked ✦</h1>
            <p className="text-sm text-[#a49d8e]">
              {new Date(done.slot.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })} at <b className="text-[#f4f1e8]">{done.slot.time} IST</b>{done.slot.local_time ? ` (${done.slot.local_time} your time)` : ""} · 20 minutes
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
          <div className="bg-[#1d1d24] border border-white/5 rounded-2xl overflow-hidden">
            <div className="p-6 pb-0">
              <h1 className="font-serif text-2xl leading-snug">Book your free live demo ✦</h1>
              <p className="text-xs text-[#8f8798] mt-2 leading-relaxed">
                A relaxed 20-minute walkthrough of the Miracurl Suite — bookings, POS, staff and your 12-agent AI team. No obligation, ever.
              </p>
              <div className="flex gap-2 mt-5">
                <button onClick={() => setTab("mira")} data-testid="demo-tab-mira"
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-3 rounded-t-xl transition-colors ${
                    tab === "mira" ? "bg-white/[0.06] text-[#d4af37] border border-b-0 border-[#d4af37]/25" : "text-[#8f8798] hover:text-[#c9c2b4]"}`}>
                  <Bot className="w-4 h-4" /> Let Mira book it <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#d4af37]/15 border border-[#d4af37]/30">AI</span>
                </button>
                <button onClick={() => setTab("form")} data-testid="demo-tab-form"
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-3 rounded-t-xl transition-colors ${
                    tab === "form" ? "bg-white/[0.06] text-[#d4af37] border border-b-0 border-[#d4af37]/25" : "text-[#8f8798] hover:text-[#c9c2b4]"}`}>
                  <ClipboardList className="w-4 h-4" /> Quick form
                </button>
              </div>
            </div>

            {tab === "mira" && (
              <div className="p-6 pt-4 bg-white/[0.02]">
                <MiraDemoChat onBooked={setDone} />
              </div>
            )}

            {tab === "form" && (
              <div className="p-6 pt-4 space-y-6 bg-white/[0.02]">
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
          </div>
        )}

        <div className="flex items-center justify-center gap-4 mt-5 text-[10px] text-[#8f8798]">
          <span>✓ 20 minutes</span><span>✓ No obligation</span><span>✓ 7-day free trial after</span>
        </div>
        <p className="text-center text-[10px] text-[#6d675c] mt-4">© Miracurl Suite · miracurl-suite.com · <a href="/terms-of-service" className="underline hover:text-[#3d3a33]">Terms</a> · <a href="/privacy-policy" className="underline hover:text-[#3d3a33]">Privacy</a></p>
      </div>
    </div>
  );
}
