import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, X, Send, Loader2, Volume2 } from "lucide-react";
import api from "@/lib/api";

let _greetPromise = null;

export const MiraVoiceAssistant = ({ onGoTab }) => {
  const [open, setOpen] = useState(() => sessionStorage.getItem("mira_open") === "1");
  const [msgs, setMsgs] = useState(() => {
    const t = sessionStorage.getItem("mira_greeting_text");
    return t ? [{ role: "mira", text: t }] : [];
  });
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [needTap, setNeedTap] = useState(false);
  const audioRef = useRef(null);
  const recRef = useRef(null);

  const speak = useCallback(async (text) => {
    try {
      const { data } = await api.post("/super-admin/mira/speak", { text });
      const audio = new Audio(`data:audio/mp3;base64,${data.audio_b64}`);
      audioRef.current?.pause();
      audioRef.current = audio;
      await audio.play();
      setNeedTap(false);
    } catch { setNeedTap(true); }
  }, []);

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
      speak(data.text);
    });
    return () => { alive = false; };
  }, [speak]);

  const ask = async (question) => {
    const text = (question || q).trim();
    if (!text || busy) return;
    setQ("");
    setMsgs((m) => [...m, { role: "you", text }]);
    setBusy(true);
    try {
      const { data } = await api.post("/super-admin/mira/ask", { question: text });
      setMsgs((m) => [...m, { role: "mira", text: data.answer }]);
      speak(data.answer);
      if (data.tab && onGoTab) onGoTab(data.tab);
    } catch {
      setMsgs((m) => [...m, { role: "mira", text: "Sorry, I couldn't process that — try again." }]);
    } finally { setBusy(false); }
  };

  const mic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setMsgs((m) => [...m, { role: "mira", text: "Voice input isn't supported in this browser — please type instead." }]); return; }
    if (listening) { recRef.current?.stop(); return; }
    const r = new SR();
    recRef.current = r;
    r.lang = "en-IN";
    r.onresult = (e) => { const t = e.results[0][0].transcript; setListening(false); ask(t); };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    setListening(true);
    r.start();
  };

  if (!open) {
    return (
      <button onClick={() => { sessionStorage.setItem("mira_open", "1"); setOpen(true); if (!msgs.length) api.get("/super-admin/mira/briefing").then(({ data }) => { sessionStorage.setItem("mira_greeting_text", data.text); setMsgs([{ role: "mira", text: data.text }]); speak(data.text); }).catch(() => {}); }}
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
          <p className="text-white/70 text-[10px] mt-0.5">Ask me anything about your platform</p>
        </div>
        {needTap && msgs.length > 0 && (
          <button onClick={() => speak(msgs[msgs.length - 1].text)} data-testid="mira-tap-to-hear"
            className="text-white/90 hover:text-white" title="Tap to hear Mira"><Volume2 className="w-4 h-4" /></button>
        )}
        <button onClick={() => { audioRef.current?.pause(); sessionStorage.removeItem("mira_open"); setOpen(false); }} data-testid="mira-assistant-close" className="text-white/80 hover:text-white"><X className="w-4 h-4" /></button>
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
        <button onClick={mic} data-testid="mira-mic-btn" title="Speak to Mira"
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${listening ? "bg-rose-500 text-white animate-pulse" : "bg-violet-100 text-violet-600 hover:bg-violet-200"}`}>
          <Mic className="w-4 h-4" />
        </button>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder={listening ? "Listening…" : "show hot leads · revenue yesterday…"}
          data-testid="mira-ask-input" className="flex-1 text-xs border border-slate-200 rounded-full px-3.5 py-2.5 focus:outline-none focus:border-violet-400" />
        <button onClick={() => ask()} disabled={busy || !q.trim()} data-testid="mira-ask-send"
          className="w-9 h-9 rounded-full bg-violet-600 text-white flex items-center justify-center shrink-0 disabled:opacity-40 hover:bg-violet-500">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
