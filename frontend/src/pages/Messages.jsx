import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { MessageSquare, Send, Loader2, ArrowLeft, User, Sparkles, MessageCircle, Trash2, CheckCircle2, ChevronDown, ChevronUp, Phone } from "lucide-react";

function timeAgo(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function InquiryCard({ inq, onDone, onDelete }) {
  const [open, setOpen] = useState(false);
  const digits = (inq.phone || "").replace(/\D/g, "");
  const wa = digits ? `https://wa.me/${digits.length === 10 ? "91" + digits : digits}?text=${encodeURIComponent(
    `Hi ${inq.name}! ✨ Good news from our salon — regarding your request: "${inq.concern}". It's now available for you! Would you like to visit or book an appointment? 💖`)}` : null;
  const sms = digits ? `sms:${inq.phone}?body=${encodeURIComponent(
    `Hi ${inq.name}! Good news from our salon - your request "${inq.concern}" is now available. Reply or call us to book!`)}` : null;
  return (
    <div className={`border rounded-2xl p-4 space-y-2 ${inq.status === "handled" ? "border-slate-100 bg-slate-50/60 opacity-70" : "border-violet-200 bg-violet-50/40"}`}
      data-testid={`ai-inquiry-${inq.id}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-sm text-slate-800">{inq.name || "Guest"}</span>
        {inq.phone && <span className="text-xs text-slate-500 inline-flex items-center gap-1"><Phone className="w-3 h-3" /> {inq.phone}</span>}
        {inq.email && <span className="text-xs text-slate-500" data-testid={`inquiry-email-${inq.id}`}>✉️ {inq.email}</span>}
        <span className="text-[10px] text-slate-400">{timeAgo(inq.created_at)}</span>
        {inq.status === "new" && <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-600 text-white font-bold">NEW</span>}
        {inq.status === "handled" && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">✓ Handled</span>}
      </div>
      <p className="text-[13px] text-slate-700"><span className="font-semibold text-violet-700">Wants:</span> {inq.concern}</p>
      {(inq.suggested_products || []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {inq.suggested_products.map(p => (
            <span key={p} className="text-[11px] px-2.5 py-1 rounded-full bg-white border border-violet-200 text-violet-700">💡 {p}</span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {wa && (
          <a href={wa} target="_blank" rel="noreferrer" data-testid={`inquiry-wa-${inq.id}`}
            className="text-[11px] px-3 py-1.5 rounded-full bg-[#25D366] text-white font-bold inline-flex items-center gap-1">
            <MessageCircle className="w-3 h-3" /> WhatsApp
          </a>
        )}
        {sms && (
          <a href={sms} data-testid={`inquiry-sms-${inq.id}`}
            className="text-[11px] px-3 py-1.5 rounded-full bg-sky-600 text-white font-bold inline-flex items-center gap-1">
            <Send className="w-3 h-3" /> Message
          </a>
        )}
        <button onClick={() => setOpen(o => !o)} data-testid={`inquiry-chat-toggle-${inq.id}`}
          className="text-[11px] px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 inline-flex items-center gap-1">
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} Full chat
        </button>
        <button onClick={() => onDone(inq)} data-testid={`inquiry-done-${inq.id}`}
          title={inq.status === "handled" ? "Mark as new" : "Mark as handled"}
          className={`ml-auto ${inq.status === "handled" ? "text-emerald-500" : "text-slate-300 hover:text-emerald-500"}`}>
          <CheckCircle2 className="w-4.5 h-4.5 w-5 h-5" />
        </button>
        <button onClick={() => onDelete(inq)} data-testid={`inquiry-delete-${inq.id}`} className="text-slate-300 hover:text-rose-500">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      {open && (
        <div className="mt-2 max-h-60 overflow-y-auto space-y-1.5 border-t border-violet-100 pt-2" data-testid={`inquiry-transcript-${inq.id}`}>
          {(inq.transcript || []).map((m, i) => (
            <div key={`${inq.id}-t-${i}`} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] px-3 py-1.5 rounded-xl text-[12px] whitespace-pre-wrap ${
                m.role === "user" ? "bg-sky-600 text-white rounded-br-sm" : "bg-white border border-slate-200 text-slate-700 rounded-bl-sm"}`}>
                {m.text}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MiraInquiries() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/ai-inquiries");
      setItems(data.inquiries);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markDone = async (inq) => {
    try {
      const { data } = await api.post(`/ai-inquiries/${inq.id}/done`);
      setItems(list => list.map(x => x.id === inq.id ? { ...x, status: data.status } : x));
    } catch { toast.error("Couldn't update"); }
  };
  const del = async (inq) => {
    try {
      await api.delete(`/ai-inquiries/${inq.id}`);
      setItems(list => list.filter(x => x.id !== inq.id));
      toast.success("Inquiry removed");
    } catch { toast.error("Couldn't delete"); }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-3 overflow-y-auto h-[calc(100vh-14rem)] min-h-[420px]" data-testid="mira-inquiries-panel">
      <p className="text-xs text-slate-500">When a guest asks Mira for a product or service you don't have yet, she collects their name, number and concern — and it lands here with the full chat and her suggested products.</p>
      {loading && <div className="p-6 text-center text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…</div>}
      {!loading && items.length === 0 && (
        <div className="p-10 text-center text-sm text-slate-400">
          No Mira inquiries yet.<br />When a customer wants something you don't stock, Mira will capture it here.
        </div>
      )}
      {items.map(inq => <InquiryCard key={inq.id} inq={inq} onDone={markDone} onDelete={del} />)}
    </div>
  );
}

export default function Messages() {
  const [threads, setThreads] = useState([]);
  const [active, setActive] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("chats");
  const [inqNew, setInqNew] = useState(0);
  const endRef = useRef(null);

  useEffect(() => {
    api.get("/ai-inquiries").then(({ data }) => setInqNew(data.new_count)).catch(() => {});
  }, []);

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
        <h1 className="font-playfair text-4xl sm:text-5xl text-slate-900 leading-[1.05] flex items-center gap-2" data-testid="messages-title">
          <MessageSquare className="w-6 h-6 text-sky-600" /> Customer Messages
        </h1>
        <p className="text-sm text-slate-500 mt-1">Chats started by customers from your booking page.</p>
      </div>

      <div className="flex gap-2 mb-4" data-testid="messages-tabs">
        <button onClick={() => setTab("chats")} data-testid="messages-tab-chats"
          className={`px-4 py-2 rounded-full text-xs font-semibold border transition-colors ${tab === "chats"
            ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-500 border-slate-200 hover:border-sky-300"}`}>
          💬 Direct Chats
        </button>
        <button onClick={() => setTab("inquiries")} data-testid="messages-tab-inquiries"
          className={`px-4 py-2 rounded-full text-xs font-semibold border transition-colors inline-flex items-center gap-1.5 ${tab === "inquiries"
            ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-500 border-slate-200 hover:border-violet-300"}`}>
          <Sparkles className="w-3.5 h-3.5" /> Mira Inquiries &amp; Suggested Products
          {inqNew > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">{inqNew}</span>}
        </button>
      </div>

      {tab === "inquiries" ? <MiraInquiries /> : (
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
      )}
    </div>
  );
}
