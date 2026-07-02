import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { MessageSquare, Send, Loader2, ArrowLeft, User } from "lucide-react";

function timeAgo(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function Messages() {
  const [threads, setThreads] = useState([]);
  const [active, setActive] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const endRef = useRef(null);

  const loadThreads = useCallback(async () => {
    try {
      const { data } = await api.get("/owner-chats");
      setThreads(data);
    } finally { setLoading(false); }
  }, []);

  const loadMsgs = useCallback(async (threadId) => {
    const { data } = await api.get(`/owner-chats/${threadId}/messages`);
    setMsgs(data.messages);
  }, []);

  useEffect(() => {
    loadThreads();
    const t = setInterval(loadThreads, 15000);
    return () => clearInterval(t);
  }, [loadThreads]);

  useEffect(() => {
    if (!active) return;
    loadMsgs(active.id);
    const t = setInterval(() => loadMsgs(active.id), 8000);
    return () => clearInterval(t);
  }, [active, loadMsgs]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function reply() {
    const text = input.trim();
    if (!text || sending || !active) return;
    setInput("");
    setSending(true);
    try {
      const { data } = await api.post(`/owner-chats/${active.id}/reply`, { message: text });
      setMsgs(m => [...m, data]);
      loadThreads();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to send"); }
    finally { setSending(false); }
  }

  function openThread(t) {
    setActive(t);
    setThreads(list => list.map(x => x.id === t.id ? { ...x, unread_admin: 0 } : x));
  }

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-slate-800 flex items-center gap-2" data-testid="messages-title">
          <MessageSquare className="w-6 h-6 text-sky-600" /> Customer Messages
        </h1>
        <p className="text-sm text-slate-500 mt-1">Chats started by customers from your booking page.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex h-[calc(100vh-14rem)] min-h-[420px]">
        {/* Thread list */}
        <div className={`w-full sm:w-80 border-r border-slate-100 flex-col overflow-y-auto ${active ? "hidden sm:flex" : "flex"}`} data-testid="chat-thread-list">
          {loading && <div className="p-6 text-center text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…</div>}
          {!loading && threads.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-400">
              No messages yet.<br />When a customer chats from your booking page, it appears here.
            </div>
          )}
          {threads.map(t => (
            <button key={t.id} data-testid={`chat-thread-${t.id}`} onClick={() => openThread(t)}
              className={`text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${active?.id === t.id ? "bg-sky-50" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-sm text-slate-800 truncate">{t.customer_name}</div>
                <div className="text-[10px] text-slate-400 flex-shrink-0">{timeAgo(t.last_at)}</div>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <div className="text-xs text-slate-500 truncate">{t.last_message || "New conversation"}</div>
                {t.unread_admin > 0 && (
                  <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center" data-testid={`unread-badge-${t.id}`}>
                    {t.unread_admin}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">📞 {t.customer_phone}</div>
            </button>
          ))}
        </div>

        {/* Conversation */}
        <div className={`flex-1 flex-col ${active ? "flex" : "hidden sm:flex"}`}>
          {!active ? (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400">Select a conversation</div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
                <button className="sm:hidden p-1 text-slate-500" onClick={() => setActive(null)} data-testid="chat-back-btn"><ArrowLeft className="w-4 h-4" /></button>
                <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center"><User className="w-4 h-4" /></div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">{active.customer_name}</div>
                  <div className="text-[11px] text-slate-400">{active.customer_phone}</div>
                </div>
                <a href={`tel:${active.customer_phone}`} className="ml-auto text-xs text-sky-600 hover:underline" data-testid="chat-call-link">Call</a>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-slate-50/50" data-testid="chat-conversation">
                {msgs.map(m => (
                  <div key={m.id} className={`flex ${m.sender === "owner" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${
                      m.sender === "owner" ? "bg-sky-600 text-white rounded-br-sm" : "bg-white border border-slate-200 text-slate-700 rounded-bl-sm"}`}>
                      {m.text}
                      <div className={`text-[9px] mt-1 ${m.sender === "owner" ? "text-sky-200" : "text-slate-400"}`}>{timeAgo(m.created_at)}</div>
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              <div className="p-3 border-t border-slate-100 flex gap-2">
                <input
                  data-testid="chat-reply-input"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && reply()}
                  placeholder={`Reply to ${active.customer_name}…`}
                  className="flex-1 px-4 py-2.5 rounded-full border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
                <button data-testid="chat-reply-send-btn" onClick={reply} disabled={sending}
                  className="w-10 h-10 rounded-full bg-sky-600 hover:bg-sky-700 text-white flex items-center justify-center disabled:opacity-50 flex-shrink-0">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
