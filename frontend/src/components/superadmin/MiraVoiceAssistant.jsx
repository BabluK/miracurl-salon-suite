import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, X, Send, Loader2, Volume2 } from "lucide-react";
import api from "@/lib/api";

let _greetPromise = null;

const STOP_RE = /^(stop|bye|bye bye|goodbye|cancel|done|exit|quiet|chup|ruko|band karo|that'?s all|thank you.*|thanks.*)$/i;

export const MiraVoiceAssistant = ({ onGoTab }) => {
  const [open, setOpen] = useState(() => sessionStorage.getItem("mira_open") === "1");
  const [msgs, setMsgs] = useState(() => {
    const t = sessionStorage.getItem("mira_greeting_text");
    return t ? [{ role: "mira", text: t }] : [];
  });
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
    r.lang = "en-IN";
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
        setMsgs((m) => [...m, { role: "mira", text: "I'll stop listening for now — tap the mic when you need me again 🎙️" }]);
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
      sessionStorage.setItem("mira_greeting_text", data.text);
      setMsgs([{ role: "mira", text: data.text }]);
      setOpen(true);
      speak(data.text, true);
    });
    return () => { alive = false; };
  }, [speak]);

  useEffect(() => {
    let greetBusy = false;
    const onMapGreet = async () => {
      if (greetBusy) return;
      greetBusy = true;
      try {
        const { data } = await api.get("/super-admin/mira/map-briefing");
        sessionStorage.setItem("mira_open", "1");
        sessionStorage.setItem("mira_greeted", "1");
        setOpen(true);
        setMsgs((m) => [...m, { role: "mira", text: data.text }]);
        setConvoMode(true);
        speak(data.text, true);
      } catch { /* ignore */ }
      greetBusy = false;
    };
    const onLiveEvent = (e) => {
      const text = e.detail;
      if (!text) return;
      sessionStorage.setItem("mira_open", "1");
      setOpen(true);
      setMsgs((m) => [...m, { role: "mira", text }]);
      speak(text, true);
    };
    window.addEventListener("mira-map-briefing", onMapGreet);
    window.addEventListener("mira-live-event", onLiveEvent);
    return () => {
      window.removeEventListener("mira-map-briefing", onMapGreet);
      window.removeEventListener("mira-live-event", onLiveEvent);
    };
  }, [speak, setConvoMode]);

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
    noSpeechRef.current = 0;
    setConvoMode(true);
    if (!msgs.length) {
      api.get("/super-admin/mira/briefing").then(({ data }) => {
        sessionStorage.setItem("mira_greeting_text", data.text);
        setMsgs([{ role: "mira", text: data.text }]);
        speak(data.text, true);
      }).catch(() => {});
    } else {
      startListening();
    }
  };

  if (!open) {
    return (
      <button onClick={openPanel}
        data-testid="mira-assistant-fab"
        className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-xl shadow-fuchsia-500/30 flex items-center justify-center text-2xl hover:scale-105 transition-transform">
        🎙️
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 w-[340px] bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden" data-testid="mira-assistant-panel">
      <div className="bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3 flex items-center gap-2">
        <span className="text-lg">🎙️</span>
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
        <button onClick={() => { audioRef.current?.pause(); setConvoMode(false); sessionStorage.removeItem("mira_open"); setOpen(false); }} data-testid="mira-assistant-close" className="text-white/80 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
      <div className="max-h-64 overflow-y-auto p-3 space-y-2" data-testid="mira-assistant-messages">
        {msgs.map((m, i) => (
          <div key={i} className={`text-xs leading-relaxed rounded-xl px-3 py-2 ${m.role === "mira" ? "bg-violet-50 text-slate-700" : "bg-slate-100 text-slate-600 ml-8"}`}>
            {m.role === "mira" && <b className="text-violet-600">Mira · </b>}{m.text}
          </div>
        ))}
        {busy && <div className="text-xs text-slate-400 px-3"><Loader2 className="w-3 h-3 animate-spin inline mr-1" /> Mira is thinking…</div>}
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
