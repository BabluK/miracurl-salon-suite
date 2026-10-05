import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles, Send, CheckCircle2, MessageCircle } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { LeadSourceBadges } from "@/components/superadmin/LeadSourceBadges";
import { ToneMemoryChip } from "@/components/superadmin/ToneMemoryChip";

const when = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

function ReplyRow({ r, onChanged }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(r.demo_draft || null);
  const [busy, setBusy] = useState("");
  const sent = !!r.demo_invite_sent_at;
  const doDraft = async () => {
    setBusy("draft");
    try { const { data } = await api.post(`/super-admin/mira-leads/${r.id}/draft-demo-reply`); setDraft(data); setOpen(true); }
    catch (e) { toast.error(e.response?.data?.detail || "Mira couldn't draft just now"); }
    finally { setBusy(""); }
  };
  const doSendWa = async () => {
    setBusy("wa");
    try {
      const { data } = await api.post(`/super-admin/mira-leads/${r.id}/send-demo-whatsapp`, { body: draft.body });
      toast.success(`📅 Demo poster + invite sent on WhatsApp to ${data.sent_to} ✦`); onChanged(false);
    } catch (e) { toast.error(e.response?.data?.detail || "WhatsApp send failed"); }
    finally { setBusy(""); }
  };
  const doSend = async () => {
    setBusy("send");
    try {
      const { data } = await api.post(`/super-admin/mira-leads/${r.id}/send-demo-reply`, { subject: draft.subject, body: draft.body });
      toast.success(data.learned ? `📅 Demo invite sent to ${r.email} · 🧠 Mira noted your edits for next time` : `📅 Demo invite sent to ${r.email}`); onChanged(data.learned);
    } catch (e) { toast.error(e.response?.data?.detail || "Send failed"); }
    finally { setBusy(""); }
  };
  return (
    <div className="px-4 py-3" data-testid={`reply-row-${r.id}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full text-left" data-testid={`reply-toggle-${r.id}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-sm text-slate-800 truncate">
            <span className="mr-1">{r.channel === "whatsapp" ? "💬" : "📧"}</span>{r.vertical === "restaurant" ? "🍽️" : "💇"} {r.name}
            <span className="text-slate-400 font-normal"> · {r.email || r.phone}</span>
            <LeadSourceBadges lead={r} className="ml-1.5" />
          </span>
          <span className="flex items-center gap-2 shrink-0">
            {sent ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 inline-flex items-center gap-1" data-testid={`reply-sent-${r.id}`}><CheckCircle2 className="w-3 h-3" /> demo invite sent</span>
              : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">awaiting your tap</span>}
            <span className="text-[10px] text-slate-400">{when(r.replied_at)}</span>
          </span>
        </div>
        <div className="text-xs text-slate-500 truncate mt-0.5">{r.reply_subject || (r.channel === "whatsapp" ? "WhatsApp reply" : "(no subject)")} — {(r.reply_text || "").slice(0, 90)}</div>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="text-xs text-slate-700 bg-slate-50 border border-slate-100 rounded-lg p-3 whitespace-pre-wrap max-h-44 overflow-y-auto" data-testid={`reply-text-${r.id}`}>
            {r.reply_text || "Reply body wasn't captured (older reply) — check the mailbox."}
          </div>
          {!sent && !draft && (
            <button onClick={doDraft} disabled={!!busy} data-testid={`reply-draft-${r.id}`}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
              {busy === "draft" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Mira, draft the demo invite
            </button>
          )}
          {!sent && draft && (
            <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50/40 p-3 space-y-2" data-testid={`reply-draft-box-${r.id}`}>
              <div className="text-[10px] uppercase tracking-wide text-fuchsia-600 font-bold">✨ Mira's draft — edit if you like, then send</div>
              <input value={draft.subject} onChange={e => setDraft(d => ({ ...d, subject: e.target.value }))} data-testid={`reply-draft-subject-${r.id}`}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white text-slate-800" />
              <textarea value={draft.body} onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} rows={7} data-testid={`reply-draft-body-${r.id}`}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-800 leading-relaxed" />
              <div className="flex flex-wrap gap-2">
                {r.email && (
                  <button onClick={doSend} disabled={!!busy} data-testid={`reply-send-${r.id}`}
                    className="px-4 py-2 rounded-xl bg-[#1c1c22] text-[#e8c37f] text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                    {busy === "send" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send demo invite by email ✦
                  </button>
                )}
                {r.phone && (
                  <button onClick={doSendWa} disabled={!!busy} data-testid={`reply-send-wa-${r.id}`}
                    title="One click from the Meta number: polished poster + demo link, signup page, admin email & number, Instagram"
                    className="px-4 py-2 rounded-xl bg-[#25D366] text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                    {busy === "wa" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />} Send demo on WhatsApp 🖼️ ✦
                  </button>
                )}
                <button onClick={doDraft} disabled={!!busy} data-testid={`reply-redraft-${r.id}`} className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold">Redraft</button>
                {!r.email && <span className="text-[11px] text-slate-500 self-center" data-testid={`reply-no-email-${r.id}`}>No email on this lead — WhatsApp sends the poster with demo link, signup page, admin email & number, Instagram</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Reply Inbox — every lead who wrote back (email or WhatsApp); Mira drafts the demo invite, Boss sends in one tap.
export function ReplyInbox() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [toneKey, setToneKey] = useState(0);
  const load = useCallback((learned) => { if (learned) setToneKey(k => k + 1); return api.get("/super-admin/mira/replies").then(r => setData(r.data)).catch(() => setData({ count: 0, awaiting: 0, replies: [] })); }, []);
  useEffect(() => { load(); }, [load]);
  if (!data) return null;
  return (
    <div className="bg-white rounded-2xl border border-slate-200" data-testid="lead-reply-inbox">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3.5" data-testid="reply-inbox-toggle">
        <span className="flex items-center gap-2 font-semibold text-sm text-slate-800 flex-wrap">
          📥 Reply Inbox
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${data.count ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`} data-testid="reply-inbox-count">{data.count}</span>
          {data.awaiting > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700" data-testid="reply-inbox-awaiting">{data.awaiting} awaiting demo invite</span>}
          <ToneMemoryChip refreshKey={toneKey} />
        </span>
        <span className="text-xs text-slate-400">{open ? "Hide ▲" : "Show ▼"}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 divide-y divide-slate-50 max-h-[520px] overflow-y-auto">
          {data.replies.length === 0 && (
            <p className="text-sm text-slate-400 px-4 py-6 text-center">No replies yet. When a lead writes back by email or WhatsApp it appears here — Mira drafts the demo invite for you.</p>
          )}
          {data.replies.map(r => <ReplyRow key={r.id} r={r} onChanged={load} />)}
        </div>
      )}
    </div>
  );
}
