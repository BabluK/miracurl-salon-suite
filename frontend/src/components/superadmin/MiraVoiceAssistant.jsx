import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, X, Send, Volume2 } from "lucide-react";
import api from "@/lib/api";
import { MiraThinkingStages } from "./MiraNeuralAvatar";

let _greetPromise = null;

const STOP_RE = /^(stop|bye|bye bye|goodbye|cancel|done|exit|quiet|chup|ruko|band karo|that'?s all|thank you.*|thanks.*)$/i;

export const MiraVoiceAssistant = ({ onGoTab }) => {
  const [open, setOpen] = useState(() => sessionStorage.getItem("mira_open") === "1");
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
  const wakeRef = useRef(null);
  const wakeOnRef = useRef(localStorage.getItem("mira_wake") === "1");
  const [wakeOn, setWakeOn] = useState(wakeOnRef.current);
  const langRef = useRef(localStorage.getItem("mira_lang") || "en");
  const [miraLang, setMiraLang] = useState(langRef.current);
  const openPanelRef = useRef(() => {});

  const toggleLang = () => {
    const v = langRef.current === "hi" ? "en" : "hi";
    langRef.current = v;
    setMiraLang(v);
    localStorage.setItem("mira_lang", v);
  };

  const stopWake = useCallback(() => {
    const w = wakeRef.current;
    wakeRef.current = null;
    try { w?.abort?.(); w?.stop?.(); } catch { /* noop */ }
  }, []);

  const startWake = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || !wakeOnRef.current || convoRef.current || wakeRef.current) return;
    const r = new SR();
    wakeRef.current = r;
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-IN";
    r.onresult = (e) => {
      const t = Array.from(e.results).map((res) => res[0].transcript).join(" ").toLowerCase();
      if (/(hey|hi|hello|hay|ok|okay|oye|a)[\s,]*(mira|meera|mera|myra|maira|mirra)\b/.test(t)) {
        stopWake();
        openPanelRef.current();
      }
    };
    r.onend = () => {
      if (wakeRef.current === r) wakeRef.current = null;
      if (wakeOnRef.current && !convoRef.current) setTimeout(() => startWake(), 900);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        wakeOnRef.current = false;
        setWakeOn(false);
      }
    };
    try { r.start(); } catch { wakeRef.current = null; }
  }, [stopWake]);

  const toggleWake = () => {
    const v = !wakeOnRef.current;
    wakeOnRef.current = v;
    setWakeOn(v);
    localStorage.setItem("mira_wake", v ? "1" : "0");
    if (v) startWake(); else stopWake();
  };

  useEffect(() => {
    // Do NOT auto-start the mic on mount — browsers (esp. mobile) crash/kill tabs
    // that grab the mic + autoplay audio without a user gesture. Wake word starts
    // only after the user explicitly toggles it on (toggleWake = a user gesture).
    return () => { stopWake(); };
  }, [stopWake]);

  const setConvoMode = useCallback((v) => {
    convoRef.current = v;
    setConvo(v);
    if (v) {
      stopWake();
    } else {
      try { recRef.current?.stop(); } catch { /* noop */ }
      setTimeout(() => startWake(), 900);
    }
  }, [startWake, stopWake]);

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || !convoRef.current) return;
    try { recRef.current?.stop(); } catch { /* noop */ }
    const r = new SR();
    recRef.current = r;
    r.lang = langRef.current === "hi" ? "hi-IN" : "en-IN";
    r.onresult = (e) => {
      noSpeechRef.current = 0;
      const t = e.results[0][0].transcript;
      setListening(false);
      handleVoiceRef.current(t);
    };
    r.onend = () => setListening(false);
    r.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { setConvoMode(false); return; }
      if (e.error === "no-speech" && convoRef.current) {
        noSpeechRef.current += 1;
        if (noSpeechRef.current < 3) { setTimeout(() => startListening(), 300); return; }
        setConvoMode(false);
        setMsgs((m) => m[m.length - 1]?.text?.startsWith("I'll stop listening")
          ? m : [...m, { role: "mira", text: "I'll stop listening for now — tap the mic when you need me again 🎙️" }]);
      }
    };
    setListening(true);
    try { r.start(); } catch { setListening(false); }
  }, [setConvoMode]);

  const speak = useCallback(async (text, listenAfter = false) => {
    try {
      const { data } = await api.post("/super-admin/mira/speak", { text });
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

  useEffect(() => {
    if (sessionStorage.getItem("mira_greeted")) return;
    if (!_greetPromise) _greetPromise = api.get("/super-admin/mira/briefing").then((r) => r.data).catch(() => null);
    let alive = true;
    _greetPromise.then((data) => {
      if (!alive || !data || sessionStorage.getItem("mira_greeted")) return;
      sessionStorage.setItem("mira_greeted", "1");
      sessionStorage.setItem("mira_open", "1");
      setMsgs([{ role: "mira", text: data.text }]);
      setOpen(true);
      // No autoplay on login — show the greeting; user taps 🔊 to hear it (avoids mobile tab crash).
    });
    return () => { alive = false; };
  }, [speak]);

  useEffect(() => {
    const onLiveEvent = (e) => {
      const text = e.detail;
      if (!text) return;
      sessionStorage.setItem("mira_open", "1");
      setOpen(true);
      setMsgs((m) => [...m, { role: "mira", text }]);
      speak(text, true);
    };
    window.addEventListener("mira-live-event", onLiveEvent);
    return () => {
      window.removeEventListener("mira-live-event", onLiveEvent);
    };
  }, [speak]);

  const ask = async (question) => {
    const text = (question || q).trim();
    if (!text || busy) return;
    setQ("");
    setMsgs((m) => [...m, { role: "you", text }]);
    setBusy(true);
    try {
      const lastMira = [...msgs].reverse().find((m) => m.role === "mira")?.text || "";
      const { data } = await api.post("/super-admin/mira/ask", { question: text, last_mira: lastMira });
      setMsgs((m) => [...m, { role: "mira", text: data.answer }]);
      speak(data.answer, true);
      if (data.tab && onGoTab) onGoTab(data.tab);
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
    sessionStorage.setItem("mira_open", "1");
    setOpen(true);
    setMsgs([]);
    noSpeechRef.current = 0;
    setConvoMode(true);
    api.get("/super-admin/mira/briefing").then(({ data }) => {
      setMsgs([{ role: "mira", text: data.text }]);
      speak(data.text, true);
    }).catch(() => {});
  };
  openPanelRef.current = openPanel;

  if (!open) {
    return (
      <button onClick={openPanel}
        data-testid="mira-assistant-fab"
        title='Tap — or just say "Hey Mira"'
        className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full shadow-xl shadow-fuchsia-500/30 hover:scale-105 transition-transform">
        <span className="absolute inset-0 rounded-full border-2 border-fuchsia-400/50 animate-ping" style={{ animationDuration: "2.4s" }} />
        <img src="/mira-bot.png" alt="Mira" className="w-14 h-14 rounded-full object-cover border-2 border-fuchsia-400" />
        <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 border-2 border-white flex items-center justify-center text-[9px]">🎙️</span>
        {wakeOn && <span className="absolute -top-1.5 -left-10 text-[8px] bg-slate-900 text-fuchsia-300 border border-fuchsia-500/40 rounded-full px-2 py-0.5 whitespace-nowrap">"Hey Mira" 👂</span>}
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 w-[340px] bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden" data-testid="mira-assistant-panel">
      <div className="bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3 flex items-center gap-2">
        <span className="relative w-8 h-8 shrink-0">
          {(busy || listening) && <span className="absolute -inset-0.5 rounded-full border border-white/70 animate-ping" />}
          <img src="/mira-bot.png" alt="Mira" className="w-8 h-8 rounded-full object-cover border border-white/60" />
        </span>
        <div className="flex-1">
          <p className="text-white text-sm font-bold leading-none">Mira · HQ Assistant</p>
          <p className="text-white/70 text-[10px] mt-0.5" data-testid="mira-convo-status">
            {convo ? (listening ? "🔴 Listening — just talk to me" : "💬 Conversation on — say 'stop' to end") : "Ask me anything about your platform"}
          </p>
        </div>
        {needTap && msgs.length > 0 && (
          <button onClick={() => speak(msgs[msgs.length - 1].text, true)} data-testid="mira-tap-to-hear"
            className="text-white/90 hover:text-white" title="Tap to hear Mira"><Volume2 className="w-4 h-4" /></button>
        )}
        <button onClick={toggleLang} data-testid="mira-lang-toggle"
          title={miraLang === "hi" ? "मैं हिंदी सुन रही हूँ — tap for English" : "Listening in English — हिंदी के लिए टैप करें"}
          className="text-[9px] font-bold rounded-full px-2 py-0.5 border bg-white/20 text-white border-white/40">
          {miraLang === "hi" ? "हिं" : "EN"}
        </button>
        <button onClick={toggleWake} data-testid="mira-wake-toggle"
          title={wakeOn ? 'Wake word ON — say "Hey Mira" anywhere to wake me' : 'Wake word OFF — tap to enable "Hey Mira"'}
          className={`text-[9px] font-bold rounded-full px-2 py-0.5 border ${wakeOn ? "bg-white/20 text-white border-white/40" : "bg-transparent text-white/50 border-white/25"}`}>
          👂 {wakeOn ? "ON" : "OFF"}
        </button>
        <button onClick={() => { audioRef.current?.pause(); setConvoMode(false); sessionStorage.removeItem("mira_open"); setOpen(false); }} data-testid="mira-assistant-close" className="text-white/80 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
      <div className="max-h-64 overflow-y-auto p-3 space-y-2" data-testid="mira-assistant-messages">
        {msgs.map((m, i) => (
          <div key={i} className={`text-xs leading-relaxed rounded-xl px-3 py-2 ${m.role === "mira" ? "bg-violet-50 text-slate-700" : "bg-slate-100 text-slate-600 ml-8"}`}>
            {m.role === "mira" && <b className="text-violet-600">Mira · </b>}{m.text}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 px-3" data-testid="mira-assistant-thinking">
            <span className="relative w-6 h-6 shrink-0">
              <span className="absolute -inset-1 rounded-full border border-sky-400/60 animate-ping" />
              <img src="/mira-bot.png" alt="" className="w-6 h-6 rounded-full object-cover border border-fuchsia-400/60" />
            </span>
            <MiraThinkingStages className="text-xs text-violet-500" />
          </div>
        )}
      </div>
      <div className="border-t border-slate-100 p-2.5 flex items-center gap-1.5">
        <button onClick={mic} data-testid="mira-mic-btn" title={convo ? "Tap to end the conversation" : "Tap once — Mira keeps listening until you say 'stop'"}
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${listening ? "bg-rose-500 text-white animate-pulse" : convo ? "bg-violet-600 text-white animate-pulse" : "bg-violet-100 text-violet-600 hover:bg-violet-200"}`}>
          <Mic className="w-4 h-4" />
        </button>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder={listening ? "Listening… just speak" : convo ? "Conversation on — or type here" : "show hot leads · revenue yesterday…"}
          data-testid="mira-ask-input" className="flex-1 text-xs border border-slate-200 rounded-full px-3.5 py-2.5 focus:outline-none focus:border-violet-400" />
        <button onClick={() => ask()} disabled={busy || !q.trim()} data-testid="mira-ask-send"
          className="w-9 h-9 rounded-full bg-violet-600 text-white flex items-center justify-center shrink-0 disabled:opacity-40 hover:bg-violet-500">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
