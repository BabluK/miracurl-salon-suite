import { useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";
import { Sparkles, MessageCircle, X, Send, Loader2, Check, User, Mic, Square, Volume2 } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function newSid() {
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const mkMsg = (m) => ({ id: crypto.randomUUID(), ...m });

function BookingCard({ booking }) {
  return (
    <div className="mt-2 rounded-xl border border-gold/40 bg-gold/10 p-3 text-xs space-y-1" data-testid="ai-booking-card">
      <div className="flex items-center gap-1.5 text-gold font-semibold"><Check className="w-3.5 h-3.5" /> Appointment Booked</div>
      <div className="text-white/80">{booking.service_names.join(", ")}</div>
      <div className="text-white/60">{new Date(booking.scheduled_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · with {booking.staff_name}</div>
      <div className="text-gold font-semibold">₹{booking.total} · {booking.duration_min} min</div>
    </div>
  );
}

function renderText(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  );
}

function Bubble({ m }) {
  const mine = m.role === "user" || m.sender === "customer";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${
        mine ? "bg-gold text-bg-base rounded-br-sm" : "bg-white/10 text-white/90 rounded-bl-sm"}`}>
        {renderText(m.text)}
        {m.booking && <BookingCard booking={m.booking} />}
      </div>
    </div>
  );
}

function AiTab({ slug }) {
  const [msgs, setMsgs] = useState([mkMsg({ role: "ai", text: "Hi! I'm Mira ✨ your personal beauty advisor. May I know your name, please?" })]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const endRef = useRef(null);
  const sidRef = useRef(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const audioRef = useRef(null);
  if (!sidRef.current) {
    const k = `mira_ai_sid_${slug}`;
    sidRef.current = sessionStorage.getItem(k) || newSid();
    sessionStorage.setItem(k, sidRef.current);
  }
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  useEffect(() => () => { audioRef.current?.pause(); recRef.current?.stream?.getTracks().forEach(t => t.stop()); }, []);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs(m => [...m, mkMsg({ role: "user", text })]);
    setBusy(true);
    try {
      const { data } = await axios.post(`${BACKEND_URL}/api/public/ai-chat/${slug}`, { message: text, session_id: sidRef.current }, { timeout: 90000 });
      setMsgs(m => [...m, mkMsg({ role: "ai", text: data.reply, booking: data.booking })]);
    } catch (e) {
      setMsgs(m => [...m, mkMsg({ role: "ai", text: e.response?.data?.detail || "Sorry, I hit a snag — please try again." })]);
    } finally { setBusy(false); }
  }

  function playAudio(b64) {
    try {
      audioRef.current?.pause();
      const a = new Audio(`data:audio/mp3;base64,${b64}`);
      audioRef.current = a;
      a.play().catch(() => {});
    } catch { /* autoplay blocked */ }
  }

  async function startRecording() {
    if (busy || recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 1000) { setRecording(false); return; }
        await sendVoice(blob);
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch {
      setMsgs(m => [...m, { role: "ai", text: "I couldn't access your microphone 🎙️ — please allow mic permission and try again, or just type your message." }]);
    }
  }

  function stopRecording() {
    recRef.current?.stop();
    setRecording(false);
  }

  async function sendVoice(blob) {
    setBusy(true);
    setMsgs(m => [...m, mkMsg({ role: "user", text: "🎙️ …", pending: true })]);
    try {
      const fd = new FormData();
      fd.append("audio", blob, "voice.webm");
      fd.append("session_id", sidRef.current);
      const { data } = await axios.post(`${BACKEND_URL}/api/public/ai-voice/${slug}`, fd, { timeout: 120000 });
      setMsgs(m => {
        const next = m.filter(x => !x.pending);
        return [...next, mkMsg({ role: "user", text: `🎙️ ${data.transcript}` }), mkMsg({ role: "ai", text: data.reply, booking: data.booking, spoken: !!data.audio_b64 })];
      });
      if (data.audio_b64) playAudio(data.audio_b64);
    } catch (e) {
      setMsgs(m => [...m.filter(x => !x.pending), mkMsg({ role: "ai", text: e.response?.data?.detail || "Sorry, I couldn't hear that — please try again." })]);
    } finally { setBusy(false); }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5" data-testid="ai-chat-messages">
        {msgs.map((m, i) => (
          <div key={m.id || i}>
            <Bubble m={m} />
            {m.spoken && <div className="flex justify-start mt-0.5"><span className="text-[9px] text-white/30 flex items-center gap-1 px-1"><Volume2 className="w-2.5 h-2.5" /> spoken</span></div>}
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-white/50 text-xs px-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Mira is {recording ? "listening" : "typing"}…</div>}
        <div ref={endRef} />
      </div>
      <div className="p-3 border-t border-white/10 flex gap-2 items-center">
        <button
          data-testid="ai-voice-btn"
          onClick={recording ? stopRecording : startRecording}
          disabled={busy}
          title={recording ? "Tap to stop & send" : "Speak to Mira"}
          className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-50 ${
            recording ? "bg-rose-500 text-white animate-pulse" : "bg-white/10 text-gold hover:bg-white/20"}`}
        >
          {recording ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-4 h-4" />}
        </button>
        <input
          data-testid="ai-chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder={recording ? "Listening… tap ■ to send" : "Type or tap the mic to speak…"}
          disabled={recording}
          className="flex-1 bg-white/5 border border-white/15 rounded-full px-4 py-2 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-gold/60 disabled:opacity-60"
        />
        <button data-testid="ai-chat-send-btn" onClick={send} disabled={busy || recording} className="w-9 h-9 rounded-full bg-gold text-bg-base flex items-center justify-center disabled:opacity-50 flex-shrink-0">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </>
  );
}

function OwnerTab({ slug }) {
  const storeKey = `salon_chat_${slug}`;
  const [identity, setIdentity] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storeKey)) || null; } catch { return null; }
  });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  const poll = useCallback(async (threadId) => {
    try {
      const { data } = await axios.get(`${BACKEND_URL}/api/public/chat/${slug}/${threadId}`);
      setMsgs(data.messages);
    } catch { /* thread gone */ }
  }, [slug]);

  useEffect(() => {
    if (!identity?.thread_id) return;
    poll(identity.thread_id);
    const t = setInterval(() => poll(identity.thread_id), 8000);
    return () => clearInterval(t);
  }, [identity, poll]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function start() {
    if (name.trim().length < 2 || !/^\d{7,15}$/.test(phone.trim())) return;
    setBusy(true);
    // SEC-001: a persistent per-device secret binds this chat to us, so no one
    // can read our history just by typing our phone number on another device.
    const skKey = `salon_chat_key_${slug}`;
    let sessionKey = localStorage.getItem(skKey);
    if (!sessionKey) {
      sessionKey = (crypto.randomUUID?.() || newSid()).replace(/-/g, "").slice(0, 32);
      localStorage.setItem(skKey, sessionKey);
    }
    try {
      const { data } = await axios.post(`${BACKEND_URL}/api/public/chat/${slug}/start`, { name: name.trim(), phone: phone.trim(), session_key: sessionKey });
      const id = { name: name.trim(), phone: phone.trim(), thread_id: data.thread_id };
      localStorage.setItem(storeKey, JSON.stringify(id));
      setIdentity(id);
      setMsgs(data.messages);
    } catch { /* rate limited */ } finally { setBusy(false); }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    try {
      const { data } = await axios.post(`${BACKEND_URL}/api/public/chat/${slug}/${identity.thread_id}/send`, { message: text });
      setMsgs(m => [...m, data]);
    } catch { /* noop */ } finally { setBusy(false); }
  }

  if (!identity) {
    return (
      <div className="flex-1 p-5 flex flex-col justify-center gap-3" data-testid="owner-chat-identity-form">
        <div className="text-center mb-2">
          <User className="w-8 h-8 text-gold mx-auto mb-2" />
          <div className="text-sm text-white/90 font-medium">Chat with the salon</div>
          <p className="text-xs text-white/50 mt-1">Tell us who you are — the owner will reply here.</p>
        </div>
        <input data-testid="owner-chat-name-input" value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
          className="bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-gold/60" />
        <input data-testid="owner-chat-phone-input" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ""))} placeholder="Phone number" inputMode="numeric"
          className="bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-gold/60" />
        <button data-testid="owner-chat-start-btn" onClick={start} disabled={busy || name.trim().length < 2 || !/^\d{7,15}$/.test(phone.trim())}
          className="btn-gold py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40">
          {busy ? "Starting…" : "Start chat"}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5" data-testid="owner-chat-messages">
        {msgs.length === 0 && <p className="text-center text-xs text-white/40 mt-8">Say hello 👋 — the salon owner will reply here.</p>}
        {msgs.map(m => <Bubble key={m.id} m={m} />)}
        <div ref={endRef} />
      </div>
      <div className="p-3 border-t border-white/10 flex gap-2">
        <input
          data-testid="owner-chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Message the salon owner…"
          className="flex-1 bg-white/5 border border-white/15 rounded-full px-4 py-2 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-gold/60"
        />
        <button data-testid="owner-chat-send-btn" onClick={send} disabled={busy} className="w-9 h-9 rounded-full bg-gold text-bg-base flex items-center justify-center disabled:opacity-50 flex-shrink-0">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </>
  );
}

export const BookingChatWidget = ({ slug }) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("ai");

  return (
    <>
      {!open && (
        <button
          data-testid="booking-chat-fab"
          onClick={() => setOpen(true)}
          className="fixed bottom-24 sm:bottom-6 right-4 z-50 flex items-center gap-2 pl-3 pr-4 py-3 rounded-full bg-gold text-bg-base shadow-gold-glow font-semibold text-sm hover:scale-105 transition-transform"
        >
          <Sparkles className="w-4 h-4" /> Ask Mira
        </button>
      )}
      {open && (
        <div
          data-testid="booking-chat-panel"
          className="fixed z-50 inset-x-3 bottom-3 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[380px] h-[70vh] sm:h-[560px] max-h-[85vh] bg-[#121212] border border-gold/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gradient-to-r from-gold/15 to-transparent">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gold flex items-center justify-center"><Sparkles className="w-4 h-4 text-bg-base" /></div>
              <div>
                <div className="text-sm font-semibold text-white">{tab === "ai" ? "Mira — AI Beauty Advisor" : "Chat with Salon"}</div>
                <div className="text-[10px] text-gold uppercase tracking-widest">{tab === "ai" ? "Advice · Booking" : "Owner replies here"}</div>
              </div>
            </div>
            <button data-testid="booking-chat-close-btn" onClick={() => setOpen(false)} className="p-1.5 text-white/50 hover:text-white rounded-md hover:bg-white/5">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex border-b border-white/10">
            <button data-testid="chat-tab-ai" onClick={() => setTab("ai")}
              className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${tab === "ai" ? "text-gold border-b-2 border-gold bg-gold/5" : "text-white/50 hover:text-white"}`}>
              <Sparkles className="w-3.5 h-3.5" /> AI Advisor
            </button>
            <button data-testid="chat-tab-owner" onClick={() => setTab("owner")}
              className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${tab === "owner" ? "text-gold border-b-2 border-gold bg-gold/5" : "text-white/50 hover:text-white"}`}>
              <MessageCircle className="w-3.5 h-3.5" /> Message Salon
            </button>
          </div>
          {tab === "ai" ? <AiTab slug={slug} /> : <OwnerTab slug={slug} />}
        </div>
      )}
    </>
  );
};

export default BookingChatWidget;
