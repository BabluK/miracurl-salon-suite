import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, X, Send, Loader2, Volume2 } from "lucide-react";
import api from "@/lib/api";

const STOP_RE = /^(stop|bye|bye bye|goodbye|cancel|done|exit|quiet|chup|ruko|band karo|that'?s all|thank you.*|thanks.*)$/i;

export const TenantMiraAssistant = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [convo, setConvo] = useState(false);
  const [needTap, setNeedTap] = useState(false);
  const audioRef = useRef(null);
  const recRef = useRef(null);
  const convoRef = useRef(false);
  const handleVoiceRef = useRef(() => {});
  const noSpeechRef = useRef(0);
  const langRef = useRef(localStorage.getItem("tmira_lang") || "en");
  const [miraLang, setMiraLang] = useState(langRef.current);

  const setConvoMode = useCallback((v) => {
    convoRef.current = v;
    setConvo(v);
    if (!v) { try { recRef.current?.stop(); } catch { /* noop */ } }
  }, []);

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || !convoRef.current) return;
    try { recRef.current?.stop(); } catch { /* noop */ }
    const r = new SR();
    recRef.current = r;
    r.lang = langRef.current === "hi" ? "hi-IN" : "en-IN";
    r.onresult = (e) => {
      noSpeechRef.current = 0;
      setListening(false);
      handleVoiceRef.current(e.results[0][0].transcript);
    };
    r.onend = () => setListening(false);
    r.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { setConvoMode(false); return; }
      if (e.error === "no-speech" && convoRef.current) {
        noSpeechRef.current += 1;
        if (noSpeechRef.current < 3) { setTimeout(() => startListening(), 300); return; }
        setConvoMode(false);
      }
    };
    setListening(true);
    try { r.start(); } catch { setListening(false); }
  }, [setConvoMode]);

  const speak = useCallback(async (text, listenAfter = false) => {
    try {
      const { data } = await api.post("/tenant/mira/speak", { text });
      const audio = new Audio(`data:audio/mp3;base64,${data.audio_b64}`);
      audioRef.current?.pause();
      audioRef.current = audio;
      audio.onended = () => { if (listenAfter && convoRef.current) startListening(); };
      await audio.play();
      setNeedTap(false);
    } catch {
      setNeedTap(true);
      if (listenAfter && convoRef.current) startListening();
    }
  }, [startListening]);

  const ask = async (question) => {
    const text = (question || q).trim();
    if (!text || busy) return;
    setQ("");
    setMsgs((m) => [...m, { role: "you", text }]);
    setBusy(true);
    try {
      const lastMira = [...msgs].reverse().find((m) => m.role === "mira")?.text || "";
      const { data } = await api.post("/tenant/mira/ask", { question: text, last_mira: lastMira });
      setMsgs((m) => [...m, { role: "mira", text: data.answer }]);
      speak(data.answer, true);
      if (data.tab) navigate(data.tab);
    } catch {
      setMsgs((m) => [...m, { role: "mira", text: "Sorry, I couldn't process that — try again." }]);
      if (convoRef.current) startListening();
    } finally { setBusy(false); }
  };

  handleVoiceRef.current = (t) => {
    const clean = (t || "").trim();
    if (STOP_RE.test(clean)) {
      setConvoMode(false);
      setMsgs((m) => [...m, { role: "you", text: clean }, { role: "mira", text: "Okay! I'm right here whenever you need me. 👋" }]);
      speak("Okay! I'm right here whenever you need me.");
      return;
    }
    ask(clean);
  };

  const mic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setMsgs((m) => [...m, { role: "mira", text: "Voice input isn't supported in this browser — please type instead." }]); return; }
    if (convoRef.current || listening) { setConvoMode(false); return; }
    noSpeechRef.current = 0;
    setConvoMode(true);
    startListening();
  };

  const openPanel = () => {
    setOpen(true);
    setMsgs([]);
    noSpeechRef.current = 0;
    setConvoMode(true);
    api.get("/tenant/mira/briefing").then(({ data }) => {
      setMsgs([{ role: "mira", text: data.text }]);
      speak(data.text, true);
    }).catch(() => {});
  };

  useEffect(() => () => { audioRef.current?.pause(); try { recRef.current?.stop(); } catch { /* noop */ } }, []);

  if (!open) {
    return (
      <button onClick={openPanel} data-testid="tenant-mira-fab"
        title="Mira — tap and I'll brief you on today's collection, bookings & staff"
        className="fixed bottom-24 right-5 z-[60] group">
        <span className="absolute inset-0 rounded-full bg-amber-400/40 blur-md opacity-60 group-hover:opacity-100 transition-opacity animate-pulse" />
        <img src="/mira-bot.png" alt="Mira AI"
          className="relative w-14 h-14 rounded-full object-cover border-2 border-amber-400/80 shadow-xl shadow-rose-500/30 transition-transform duration-200 group-hover:scale-110" />
        <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-400 border-2 border-white" />
        <span className="absolute right-full top-1/2 -translate-y-1/2 mr-3 px-3 py-1.5 rounded-full bg-[#121212] border border-amber-400/40 text-amber-300 text-xs font-medium whitespace-nowrap opacity-0 translate-x-2 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 shadow-lg">
          Tap — I&apos;ll brief you ✦
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-24 right-5 z-[60] w-[340px] bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden" data-testid="tenant-mira-panel">
      <div className="bg-gradient-to-r from-amber-500 to-rose-500 px-4 py-3 flex items-center gap-2">
        <img src="/mira-bot.png" alt="Mira" className="w-8 h-8 rounded-full object-cover border border-white/60 shrink-0" />
        <div className="flex-1">
          <p className="text-white text-sm font-bold leading-none">Mira · Your Salon AI</p>
          <p className="text-white/75 text-[10px] mt-0.5" data-testid="tenant-mira-status">
            {convo ? (listening ? "🔴 Listening — just talk to me" : "💬 Conversation on — say 'stop' to end") : "Ask about your salon"}
          </p>
        </div>
        <button onClick={() => { audioRef.current?.pause(); setConvoMode(false); setOpen(false); navigate("/assistant"); }}
          data-testid="tenant-mira-open-assistant" title="Open the full AI Assistant page"
          className="text-[9px] font-bold rounded-full px-2 py-0.5 border bg-white/20 text-white border-white/40 hover:bg-white/30">
          Full chat ↗
        </button>
        <button onClick={() => { const v = langRef.current === "hi" ? "en" : "hi"; langRef.current = v; setMiraLang(v); localStorage.setItem("tmira_lang", v); }}
          data-testid="tenant-mira-lang-toggle"
          className="text-[9px] font-bold rounded-full px-2 py-0.5 border bg-white/20 text-white border-white/40">
          {miraLang === "hi" ? "हिं" : "EN"}
        </button>
        {needTap && msgs.length > 0 && (
          <button onClick={() => speak(msgs[msgs.length - 1].text, true)} data-testid="tenant-mira-tap-hear"
            className="text-white/90 hover:text-white"><Volume2 className="w-4 h-4" /></button>
        )}
        <button onClick={() => { audioRef.current?.pause(); setConvoMode(false); setOpen(false); }} data-testid="tenant-mira-close" className="text-white/80 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
      <div className="max-h-64 overflow-y-auto p-3 space-y-2" data-testid="tenant-mira-messages">
        {msgs.map((m, i) => (
          <div key={i} className={`text-xs leading-relaxed rounded-xl px-3 py-2 ${m.role === "mira" ? "bg-amber-50 text-slate-700" : "bg-slate-100 text-slate-600 ml-8"}`}>
            {m.role === "mira" && <b className="text-rose-600">Mira · </b>}{m.text}
          </div>
        ))}
        {busy && <div className="text-xs text-slate-400 px-3"><Loader2 className="w-3 h-3 animate-spin inline mr-1" /> Mira is thinking…</div>}
      </div>
      <div className="border-t border-slate-100 p-2.5 flex items-center gap-1.5">
        <button onClick={mic} data-testid="tenant-mira-mic"
          title={convo ? "Tap to end the conversation" : "Tap once — Mira keeps listening until you say 'stop'"}
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${listening ? "bg-rose-500 text-white animate-pulse" : convo ? "bg-amber-600 text-white animate-pulse" : "bg-amber-100 text-amber-700 hover:bg-amber-200"}`}>
          <Mic className="w-4 h-4" />
        </button>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder={listening ? "Listening… just speak" : "today's bookings · revenue · ideas…"}
          data-testid="tenant-mira-input" className="flex-1 text-xs border border-slate-200 rounded-full px-3.5 py-2.5 focus:outline-none focus:border-amber-400" />
        <button onClick={() => ask()} disabled={busy || !q.trim()} data-testid="tenant-mira-send"
          className="w-9 h-9 rounded-full bg-rose-500 text-white flex items-center justify-center shrink-0 disabled:opacity-40 hover:bg-rose-400">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default TenantMiraAssistant;
