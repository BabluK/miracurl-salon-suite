import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Send, Bot, UserRound, Hand, CalendarCheck, Inbox, ArrowLeft } from "lucide-react";

const fmt = (iso) => iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

const ThreadRow = ({ t, active, onClick }) => (
  <button onClick={onClick} className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-50 ${active ? "bg-emerald-50/60" : ""}`} data-testid={`thread-${t.wa_id}`}>
    <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center shrink-0">{(t.name || "?")[0]}</div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-slate-800 text-sm truncate">{t.name}</span>
        {t.visits ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{t.visits} visits</span> : null}
        {t.booked && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 inline-flex items-center gap-0.5"><CalendarCheck className="w-3 h-3" /> booked</span>}
        {t.human && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 inline-flex items-center gap-0.5" data-testid="thread-human-badge"><Hand className="w-3 h-3" /> your team</span>}
      </div>
      <p className="text-xs text-slate-600 truncate mt-0.5">{t.last_dir === "outbound" ? "Mira: " : ""}{t.last_text}</p>
    </div>
    <span className="text-[10px] text-slate-400 shrink-0">{fmt(t.last_at)}</span>
  </button>
);

const ThreadView = ({ wa_id, name, onBack, onChange }) => {
  const [d, setD] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => api.get(`/whatsapp-link/receptionist/threads/${wa_id}`).then(r => setD(r.data)).catch(() => {});
  useEffect(() => { load(); }, [wa_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const human = async (on) => {
    try { await api.put(`/whatsapp-link/receptionist/threads/${wa_id}/human`, { on }); toast.success(on ? "You've taken over — Mira is paused for 2h" : "Handed back to Mira"); load(); onChange(); }
    catch (e) { toast.error(e.response?.data?.detail || "Couldn't update"); }
  };
  const reply = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try { await api.post(`/whatsapp-link/receptionist/threads/${wa_id}/reply`, { text: text.trim() }); setText(""); toast.success("Sent on WhatsApp (1 credit)"); load(); onChange(); }
    catch (er) { toast.error(er.response?.data?.detail || "Couldn't send"); }
    finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col h-[520px]" data-testid="thread-view">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
        <button onClick={onBack} className="text-slate-500 hover:text-slate-800" data-testid="thread-back"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1 min-w-0"><div className="font-semibold text-slate-800 text-sm truncate">{name}</div><div className="text-[11px] text-slate-500">+{wa_id}</div></div>
        {d?.human
          ? <button onClick={() => human(false)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold inline-flex items-center gap-1" data-testid="thread-handback"><Bot className="w-3.5 h-3.5" /> Hand back to Mira</button>
          : <button onClick={() => human(true)} className="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 text-xs font-semibold inline-flex items-center gap-1" data-testid="thread-takeover"><Hand className="w-3.5 h-3.5" /> Take over</button>}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#f4f7f5]" data-testid="thread-messages">
        {(d?.messages || []).map((m, i) => (
          <div key={i} className={`flex ${m.dir === "inbound" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap shadow-sm ${m.dir === "inbound" ? "bg-white rounded-bl-sm" : "bg-[#d9fdd3] rounded-br-sm"} text-slate-800`}>
              {m.text}
              <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 justify-end">
                {m.dir === "outbound" && (m.sent_by === "mira" ? <Bot className="w-3 h-3" /> : <UserRound className="w-3 h-3" />)}
                {fmt(m.at)}{m.dir === "outbound" && m.status ? ` · ${m.status}` : ""}{m.booked ? " · booked ✓" : ""}
              </div>
            </div>
          </div>
        ))}
        {d && !d.messages.length && <div className="text-xs text-slate-500 text-center pt-8">No messages yet.</div>}
      </div>
      <form onSubmit={reply} className="p-3 border-t border-slate-100 flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Reply as your team (uses 1 credit, Mira pauses 2h)…" className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-400" data-testid="thread-reply-input" />
        <button type="submit" disabled={busy || !text.trim()} className="w-10 h-10 rounded-full bg-slate-900 disabled:opacity-40 text-white flex items-center justify-center" data-testid="thread-reply-send"><Send className="w-4 h-4" /></button>
      </form>
    </div>
  );
};

export const ReceptionistThreads = ({ threads, onChange }) => {
  const [open, setOpen] = useState(null);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden" data-testid="receptionist-threads">
      {open ? <ThreadView wa_id={open.wa_id} name={open.name} onBack={() => setOpen(null)} onChange={onChange} /> : (
        <>
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <Inbox className="w-4 h-4 text-slate-500" /><div className="text-sm font-semibold text-slate-800">Live WhatsApp conversations</div>
            <span className="text-[11px] text-slate-400 ml-auto">{threads.length} guests</span>
          </div>
          {!threads.length
            ? <div className="p-8 text-center text-sm text-slate-500" data-testid="threads-empty">No WhatsApp chats yet. Share your link or QR above — the first guest who says hi will appear here.</div>
            : <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">{threads.map(t => <ThreadRow key={t.wa_id} t={t} active={false} onClick={() => setOpen(t)} />)}</div>}
        </>
      )}
    </div>
  );
};
