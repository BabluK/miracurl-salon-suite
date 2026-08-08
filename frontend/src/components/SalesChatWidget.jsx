import { useEffect, useRef, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { MIRACURL_SUPPORT_WHATSAPP } from "@/components/ChatButton";

const STORE_KEY = "miracurl_sales_chat";
const QUICK_PROMPTS = ["What does it cost?", "Show me the features", "How does the free trial work?"];

function loadSession() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch { return null; }
}

export default function SalesChatWidget() {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(loadSession);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [messages, setMessages] = useState(session?.messages || []);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, open]);

  const greetedRef = useRef(false);
  useEffect(() => {
    if (!open || session || greetedRef.current) return;
    greetedRef.current = true;
    try {
      const u = new SpeechSynthesisUtterance("Hi! I'm Mira. How can I help you? I will guide you for demo booking.");
      u.lang = "en-IN"; u.rate = 0.96; u.pitch = 1.1;
      window.speechSynthesis?.speak(u);
    } catch { /* voice optional */ }
  }, [open, session]);

  useEffect(() => {
    const h = () => setOpen(true);
    window.addEventListener("open-sales-chat", h);
    return () => window.removeEventListener("open-sales-chat", h);
  }, []);

  function persist(next) {
    setSession(next);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  }

  async function start(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const { data } = await api.post("/public/sales-chat/start", form);
      const msgs = [{ role: "assistant", content: data.reply }];
      setMessages(msgs);
      persist({ inquiry_id: data.inquiry_id, name: form.name, messages: msgs });
    } catch (e2) {
      setErr(formatApiError(e2.response?.data?.detail) || "Couldn't start the chat");
    } finally { setBusy(false); }
  }

  async function send(text) {
    const msg = (text || input).trim();
    if (!msg || busy) return;
    setInput("");
    const withUser = [...messages, { role: "user", content: msg }];
    setMessages(withUser);
    setBusy(true); setErr("");
    try {
      const { data } = await api.post("/public/sales-chat/message", { inquiry_id: session.inquiry_id, message: msg });
      const all = [...withUser, { role: "assistant", content: data.reply }];
      setMessages(all);
      persist({ ...session, messages: all.slice(-40) });
    } catch (e2) {
      if (e2.response?.status === 404) { persist(null); setMessages([]); }
      setErr(formatApiError(e2.response?.data?.detail) || "Mira couldn't reply — try again");
    } finally { setBusy(false); }
  }

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        data-testid="sales-chat-fab"
        aria-label="Chat with Mira"
        className="fixed bottom-16 right-6 z-40 rounded-full p-[3px] bg-gradient-to-br from-[#F0D9A5] via-[#e8918f] to-[#C89B52] shadow-2xl hover:scale-110 transition-transform"
      >
        <img src="/assets/mira-avatar-gold.png" alt="Mira" className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover border-2 border-white/70" />
      </button>

      {open && (
        <div data-testid="sales-chat-panel" className="fixed bottom-24 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[380px] max-h-[70vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-fuchsia-100 overflow-hidden">
          <div className="bg-gradient-to-r from-rose-500 to-fuchsia-600 px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-white font-semibold text-sm flex items-center gap-1.5"><img src="/assets/mira-avatar-gold.png" alt="Mira" className="w-6 h-6 rounded-full object-cover border border-white/40" /> Mira — your salon guide</div>
              <div className="text-white/75 text-[11px]">Features · Pricing · Free trial — ask me anything</div>
            </div>
            <button onClick={() => setOpen(false)} data-testid="sales-chat-close" className="text-white/80 hover:text-white"><X className="w-4 h-4" /></button>
          </div>

          {!session ? (
            <form onSubmit={start} className="p-4 space-y-3 overflow-y-auto">
              <div className="flex items-start gap-2.5" data-testid="mira-greeting">
                <img src="/assets/mira-avatar-gold.png" alt="Mira" className="w-9 h-9 rounded-full object-cover border border-amber-200 shrink-0" />
                <div className="bg-amber-50 border border-amber-100 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm text-slate-700">
                  Hi! I'm <b>Mira</b> ✦ How can I help you today? Share your details below and I'll guide you to book a <b>free demo</b> with the Miracurl team.
                </div>
              </div>
              <input required data-testid="sales-chat-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Your name" className="w-full text-sm px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:border-fuchsia-400 outline-none" />
              <input required type="email" data-testid="sales-chat-email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="Email address" className="w-full text-sm px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:border-fuchsia-400 outline-none" />
              <input required data-testid="sales-chat-phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="Phone / WhatsApp number" className="w-full text-sm px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:border-fuchsia-400 outline-none" />
              {err && <p className="text-xs text-rose-600" data-testid="sales-chat-error">{err}</p>}
              <button disabled={busy} data-testid="sales-chat-start-btn"
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-rose-500 to-fuchsia-600 text-white text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />} Start chatting with Mira
              </button>
              <a href={`https://wa.me/${MIRACURL_SUPPORT_WHATSAPP}?text=${encodeURIComponent("Hi Miracurl ✦ I'd like to know more about the salon suite.")}`}
                target="_blank" rel="noreferrer" className="block text-center text-[11px] text-emerald-600 hover:underline">or WhatsApp us directly →</a>
            </form>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-slate-50/70" data-testid="sales-chat-messages">
                {messages.map((m, i) => (
                  <div key={`m${i}-${m.role}`} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === "user" ? "bg-fuchsia-600 text-white rounded-br-sm" : "bg-white border border-slate-200 text-slate-700 rounded-bl-sm"}`}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {busy && <div className="flex items-center gap-1.5 text-xs text-fuchsia-500 pl-1"><Loader2 className="w-3 h-3 animate-spin" /> Mira is typing…</div>}
                {err && <p className="text-xs text-rose-600">{err}</p>}
                <div ref={endRef} />
              </div>
              {messages.length <= 1 && (
                <div className="px-3 pb-1 flex flex-wrap gap-1.5">
                  {QUICK_PROMPTS.map(q => (
                    <button key={q} onClick={() => send(q)} data-testid="sales-quick-prompt"
                      className="text-[11px] px-2.5 py-1 rounded-full border border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-50">{q}</button>
                  ))}
                </div>
              )}
              <div className="p-2.5 border-t border-slate-100 flex items-center gap-2">
                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
                  data-testid="sales-chat-input" placeholder="Ask about features, pricing…"
                  className="flex-1 text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:border-fuchsia-400 outline-none" />
                <button onClick={() => send()} disabled={busy || !input.trim()} data-testid="sales-chat-send-btn"
                  className="p-2.5 rounded-lg bg-fuchsia-600 text-white disabled:opacity-40"><Send className="w-4 h-4" /></button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
