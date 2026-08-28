import { useEffect, useRef, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Bot, Send, MessageSquarePlus, Bug, Lightbulb, Trash2, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const RESTO_SUGGESTION_GROUPS = [
  {
    label: "📊 Today & reports",
    items: [
      "How is my restaurant doing today?",
      "How much business did we do last week and who was the top performer?",
      "Compare this month's revenue with last month",
      "Which dishes sell the most?",
    ],
  },
  {
    label: "📣 Marketing & growth",
    items: [
      "Give me 3 ideas to fill more tables this month",
      "Draft a WhatsApp message for a weekend combo offer",
      "How do I win back diners who haven't visited in 60 days?",
    ],
  },
  {
    label: "🛠 How do I…",
    items: [
      "How does QR table ordering reach my kitchen?",
      "How do I mark a dish sold-out?",
      "How do I publish an offer to my ordering page?",
      "How do I approve a staff week-off change?",
    ],
  },
];
const SUGGESTION_GROUPS = [
  {
    label: "📊 Today & reports",
    items: [
      "How is my salon doing today?",
      "How much business did we do last week and who was the top performer?",
      "Compare this month's revenue with last month",
      "Which services sell the most?",
    ],
  },
  {
    label: "📣 Marketing & growth",
    items: [
      "Give me 3 ideas to get more bookings this month",
      "Draft a WhatsApp message for a weekend offer",
      "How do I win back customers who haven't visited in 60 days?",
    ],
  },
  {
    label: "🛠 How do I…",
    items: [
      "How do I confirm a booking and notify the client?",
      "Why is a customer not showing in CRM?",
      "How do I publish an offer to my booking page?",
      "How do I approve a staff week-off change?",
    ],
  },
];

function newSessionId() {
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const STATUS_STYLES = {
  open: "bg-amber-100 text-amber-700",
  planned: "bg-sky-100 text-sky-700",
  done: "bg-emerald-100 text-emerald-700",
};

export default function Assistant() {
  const [tab, setTab] = useState("chat");
  const { tenant } = useAuth();
  const resto = tenant?.business_type === "restaurant";
  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
            <Bot className="w-6 h-6 text-violet-600" /> AI Assistant
          </h1>
          <p className="text-sm text-slate-500 mt-1">Ask Mira anything about your {resto ? "restaurant" : "salon"} — or log ideas &amp; issues on the board.</p>
        </div>
        <div className="flex bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
          <button data-testid="assistant-tab-chat" onClick={() => setTab("chat")} className={`px-4 py-1.5 text-xs rounded-md font-semibold transition ${tab === "chat" ? "bg-violet-600 text-white" : "text-slate-500 hover:text-slate-800"}`}>Chat with Mira</button>
          <button data-testid="assistant-tab-feedback" onClick={() => setTab("feedback")} className={`px-4 py-1.5 text-xs rounded-md font-semibold transition ${tab === "feedback" ? "bg-violet-600 text-white" : "text-slate-500 hover:text-slate-800"}`}>Feedback Board</button>
        </div>
      </div>
      {tab === "chat" ? <ChatPanel /> : <FeedbackBoard />}
    </div>
  );
}

function ChatPanel() {
  const { tenant } = useAuth();
  const resto = tenant?.business_type === "restaurant";
  const groups = resto ? RESTO_SUGGESTION_GROUPS : SUGGESTION_GROUPS;
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [snap, setSnap] = useState(null);
  const endRef = useRef(null);
  // Fresh session every time the chat opens (tab switch / page revisit = clean slate)
  const sidRef = useRef(newSessionId());
  const sid = sidRef.current;

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { api.get("/tenant/mira/briefing").then(r => setSnap(r.data.data)).catch(() => {}); }, []);

  async function send(text) {
    const msg = (text || input).trim();
    if (!msg || busy) return;
    setInput("");
    setBusy(true);
    setMessages(m => [...m, { id: crypto.randomUUID(), role: "user", content: msg }, { id: crypto.randomUUID(), role: "assistant", content: "" }]);
    try {
      const res = await fetch(`${BACKEND_URL}/api/assistant/chat`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: msg, session_id: sid }),
      });
      if (!res.ok) throw new Error("chat failed");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        setMessages(m => {
          const copy = [...m];
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: copy[copy.length - 1].content + chunk };
          return copy;
        });
      }
    } catch {
      toast.error("Mira couldn't reply — please try again");
      setMessages(m => m.slice(0, -1));
    } finally { setBusy(false); }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col" style={{ height: "calc(100vh - 240px)", minHeight: 420 }} data-testid="assistant-chat-panel">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="relative w-20 h-20 mx-auto mb-3">
              <span className="absolute inset-0 rounded-full bg-violet-400/30 blur-lg animate-pulse" />
              <img src="/mira-bot.png" alt="Mira" className="relative w-20 h-20 rounded-full object-cover border-2 border-violet-300 shadow-lg" />
              <span className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full bg-emerald-400 border-2 border-white" />
            </div>
            <p className="text-sm text-slate-600 font-medium">Hi, I&apos;m Mira ✦ your {resto ? "restaurant" : "salon"} assistant</p>
            <p className="text-xs text-slate-400 mt-1 mb-4">I know your live stats and every app feature.</p>
            {snap && (
              <div className="flex flex-wrap justify-center gap-2 mb-5" data-testid="assistant-live-chips">
                <span className="px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">₹{(snap.revenue_today || 0).toLocaleString("en-IN")} today · {snap.invoices_today || 0} bills</span>
                <span className="px-3 py-1.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-xs font-semibold">{snap.bookings_today || 0} bookings today</span>
                <span className="px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">{(snap.staff_on_floor || []).length} staff on the floor</span>
                {(snap.staff_week_off_today || []).length > 0 && (
                  <span className="px-3 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-xs font-semibold">🌴 {snap.staff_week_off_today.join(", ")} on week-off</span>
                )}
                {(snap.unread_reviews || 0) > 0 && (
                  <span className="px-3 py-1.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 text-xs font-semibold">⭐ {snap.unread_reviews} unread reviews</span>
                )}
              </div>
            )}
            <div className="max-w-2xl mx-auto space-y-4 text-left">
              {groups.map(g => (
                <div key={g.label}>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-semibold mb-2 text-center sm:text-left">{g.label}</p>
                  <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                    {g.items.map(s => (
                      <button key={s} data-testid="assistant-suggestion" onClick={() => send(s)}
                        className="px-3 py-1.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 text-xs hover:bg-violet-100 transition">{s}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={m.id || i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} items-end gap-2`}>
            {m.role !== "user" && <img src="/mira-bot.png" alt="" className="w-7 h-7 rounded-full object-cover border border-violet-200 shrink-0 mb-0.5" />}
            <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-violet-600 text-white rounded-br-sm" : "bg-slate-100 text-slate-800 rounded-bl-sm"}`}>
              {m.content || <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="border-t border-slate-100 p-3 flex gap-2">
        <input
          data-testid="assistant-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Ask Mira anything…"
          className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
        />
        <button data-testid="assistant-send-btn" onClick={() => send()} disabled={busy} className="px-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 flex items-center">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function FeedbackBoard() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ type: "enhancement", title: "", details: "", priority: "medium" });
  const load = useCallback(async () => { const { data } = await api.get("/feedback"); setList(data); }, []);
  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (form.title.trim().length < 3) { toast.error("Give it a short title"); return; }
    await api.post("/feedback", form);
    toast.success("Added to the board ✦ Share it with your Emergent chat to get it built!");
    setForm({ type: "enhancement", title: "", details: "", priority: "medium" });
    load();
  }

  async function setStatus(id, status) { await api.put(`/feedback/${id}`, { status }); load(); }
  async function remove(id) {
    try { await api.delete(`/feedback/${id}`); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Delete failed"); }
  }

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm h-fit" data-testid="feedback-form">
        <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-4"><MessageSquarePlus className="w-4 h-4 text-violet-600" /> Log an idea or issue</h2>
        <div className="flex gap-2 mb-3">
          {[{ v: "enhancement", l: "Enhancement", I: Lightbulb }, { v: "bug", l: "Bug / Issue", I: Bug }].map(({ v, l, I }) => (
            <button key={v} data-testid={`feedback-type-${v}`} onClick={() => setForm({ ...form, type: v })} className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition ${form.type === v ? "bg-violet-50 border-violet-300 text-violet-700" : "border-slate-200 text-slate-500"}`}><I className="w-3.5 h-3.5" /> {l}</button>
          ))}
        </div>
        <input data-testid="feedback-title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Short title…" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-violet-300" />
        <textarea data-testid="feedback-details" value={form.details} onChange={e => setForm({ ...form, details: e.target.value })} placeholder="Describe what you want or what went wrong…" rows={4} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-violet-300" />
        <select data-testid="feedback-priority" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-4 bg-white text-slate-800 [&_option]:bg-white [&_option]:text-slate-800">
          <option value="low">Low priority</option>
          <option value="medium">Medium priority</option>
          <option value="high">High priority</option>
        </select>
        <button data-testid="feedback-submit" onClick={submit} className="w-full py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold">Add to board</button>
        <p className="text-[11px] text-slate-400 mt-3">Tip: copy items from this board into your Emergent build chat — that&apos;s where code changes happen.</p>
      </div>

      <div className="lg:col-span-2 space-y-3" data-testid="feedback-list">
        {list.length === 0 && <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-400">No feedback yet — log your first idea!</div>}
        {list.map(f => (
          <div key={f.id} data-testid={`feedback-item-${f.id}`} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${f.type === "bug" ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-600"}`}>
                  {f.type === "bug" ? <Bug className="w-4 h-4" /> : <Lightbulb className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">{f.title}</div>
                  {f.details && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{f.details}</p>}
                  <div className="text-[10px] text-slate-400 mt-1">{f.by} · {new Date(f.created_at).toLocaleDateString()} · {f.priority} priority</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <select value={f.status} onChange={e => setStatus(f.id, e.target.value)} className={`text-[10px] font-semibold rounded-full px-2 py-1 border-0 ${STATUS_STYLES[f.status] || STATUS_STYLES.open}`} data-testid={`feedback-status-${f.id}`}>
                  <option value="open">Open</option>
                  <option value="planned">Planned</option>
                  <option value="done">Done</option>
                </select>
                <button onClick={() => remove(f.id)} className="p-1.5 text-slate-300 hover:text-rose-500 rounded" data-testid={`feedback-delete-${f.id}`}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
