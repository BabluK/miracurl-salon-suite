import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Phone, MessageCircle, CalendarPlus, Trash2, ChevronDown, ChevronUp, Users, UserPlus, Mail, Loader2, Video } from "lucide-react";

const STATUS_STYLE = {
  new: "bg-rose-50 text-rose-700 border-rose-200",
  contacted: "bg-amber-50 text-amber-700 border-amber-200",
  meeting_scheduled: "bg-violet-50 text-violet-700 border-violet-200",
  converted: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function gcalLink(i) {
  const start = new Date(Date.now() + 24 * 3600 * 1000);
  start.setHours(11, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60000);
  const fmt = d => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Miracurl demo — ${i.name}`)}&add=${encodeURIComponent(i.email)}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(`Demo call with ${i.name} (${i.phone}). Inquiry from the Miracurl website chat.`)}`;
}

export function InquiriesPanel({ onNewCount, onConvert }) {
  const [items, setItems] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [inviteFor, setInviteFor] = useState(null);
  const [busyId, setBusyId] = useState("");

  const sendThankYou = async (i) => {
    setBusyId(i.id);
    try {
      await api.post(`/super-admin/inquiries/${i.id}/send-thankyou`);
      toast.success(`Thank-you email + brochure PDF sent to ${i.email} ✦`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Send failed"); }
    finally { setBusyId(""); }
  };

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/super-admin/inquiries");
      setItems(data.items || []);
      onNewCount?.(data.new_count || 0);
    } catch { toast.error("Couldn't load inquiries"); }
  }, [onNewCount]);
  useEffect(() => { load(); }, [load]);

  async function setStatus(i, status) {
    try {
      await api.patch(`/super-admin/inquiries/${i.id}`, { status });
      setItems(prev => {
        const next = prev.map(x => x.id === i.id ? { ...x, status } : x);
        onNewCount?.(next.filter(x => x.status === "new").length);
        return next;
      });
    } catch { toast.error("Couldn't update status"); }
  }

  async function remove(i) {
    if (!window.confirm(`Delete inquiry from ${i.name}?`)) return;
    try {
      await api.delete(`/super-admin/inquiries/${i.id}`);
      setItems(prev => prev.filter(x => x.id !== i.id));
    } catch { toast.error("Couldn't delete"); }
  }

  return (
    <div data-testid="inquiries-panel">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-playfair text-3xl">Tenant Inquiries</h1>
          <p className="text-slate-500 text-sm mt-1">Prospects who chatted with Sales Mira on the website — call, WhatsApp or schedule a demo.</p>
        </div>
        <span className="text-xs text-slate-400">{items.length} total · {items.filter(i => i.status === "new").length} new</span>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 text-slate-400 border border-dashed border-slate-200 rounded-2xl">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No inquiries yet — they'll appear here when visitors chat with Mira on the landing page.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(i => (
            <div key={i.id} className="bg-white rounded-xl border border-slate-200 shadow-sm" data-testid={`inquiry-row-${i.id}`}>
              <div className="px-4 py-3 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-800 text-sm">{i.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {i.email} · {i.phone} · {new Date(i.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {i.source === "partner_page" && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200">Partner page lead</span>}
                    {i.salon_name && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">🏠 {i.salon_name}</span>}
                    {i.preferred_time && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">🕐 Prefers: {i.preferred_time}</span>}
                    {i.referred_by?.salon_name && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300" data-testid={`inquiry-referred-by-${i.id}`}>
                        ✦ Referred by {i.referred_by.salon_name}{i.referred_by.owner_name ? ` — ${i.referred_by.owner_name}` : ""}
                      </span>
                    )}
                    {i.referral_bonus_credited && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">₹1,000 Circle bonus paid</span>}
                    {i.thankyou_sent_at && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">✓ Brochure sent</span>}
                    {i.meeting?.at_ist && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">📅 Meet: {i.meeting.at_ist} IST</span>}
                  </div>
                </div>
                <select value={i.status} onChange={e => setStatus(i, e.target.value)} data-testid={`inquiry-status-${i.id}`}
                  className={`text-xs px-2 py-1.5 rounded-lg border font-medium ${STATUS_STYLE[i.status] || STATUS_STYLE.new}`}>
                  <option value="new">🔴 New</option>
                  <option value="contacted">🟡 Contacted</option>
                  <option value="meeting_scheduled">🟣 Meeting scheduled</option>
                  <option value="converted">🟢 Converted</option>
                </select>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => sendThankYou(i)} disabled={busyId === i.id} title="Send thank-you email with brochure PDF"
                    data-testid={`inquiry-thankyou-${i.id}`}
                    className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-[11px] font-semibold ${i.thankyou_sent_at ? "border border-emerald-200 text-emerald-600 bg-emerald-50" : "bg-slate-900 text-white hover:bg-slate-700"} disabled:opacity-50`}>
                    {busyId === i.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                    {i.thankyou_sent_at ? "Resend PDF" : "Thank-You + PDF"}
                  </button>
                  <button onClick={() => setInviteFor(inviteFor === i.id ? null : i.id)} title="Send Google Meet invite email"
                    data-testid={`inquiry-invite-${i.id}`}
                    className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg bg-violet-600 text-white text-[11px] font-semibold hover:bg-violet-500">
                    <Video className="w-3.5 h-3.5" /> Meet invite
                  </button>
                  {i.status !== "converted" && (
                    <button onClick={() => { setStatus(i, "converted"); onConvert?.(i); }} title="Convert to tenant — opens a pre-filled New Salon form"
                      data-testid={`inquiry-convert-${i.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-500">
                      <UserPlus className="w-3.5 h-3.5" /> Convert
                    </button>
                  )}
                  <a href={`tel:+91${i.phone}`} title="Call" data-testid={`inquiry-call-${i.id}`}
                    className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-sky-50 hover:text-sky-600"><Phone className="w-4 h-4" /></a>
                  <a href={`https://wa.me/91${i.phone}?text=${encodeURIComponent(`Hi ${i.name.split(" ")[0]}! This is the Miracurl team — thanks for your interest in our salon suite. 🎥 60-sec walkthrough: https://miracurl-suite.com/miracurl-demo-60s.mp4\n🎬 Try the live demo right now: https://miracurl-suite.com/demo\n🏪 Register your salon: https://miracurl-suite.com/signup-salon\n📱 App screens tour: https://miracurl-suite.com/miracurl-screens-tour.pdf\n\nWhen's a good time for a quick guided demo?`)}`}
                    target="_blank" rel="noreferrer" title="WhatsApp" data-testid={`inquiry-wa-${i.id}`}
                    className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-600"><MessageCircle className="w-4 h-4" /></a>
                  <a href={gcalLink(i)} target="_blank" rel="noreferrer" title="Schedule Google Calendar demo invite" data-testid={`inquiry-gcal-${i.id}`}
                    className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-amber-50 hover:text-amber-600"><CalendarPlus className="w-4 h-4" /></a>
                  <button onClick={() => remove(i)} title="Delete" data-testid={`inquiry-delete-${i.id}`}
                    className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                  <button onClick={() => setExpanded(expanded === i.id ? null : i.id)} data-testid={`inquiry-toggle-${i.id}`}
                    className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                    {expanded === i.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {inviteFor === i.id && <MeetInviteForm inquiry={i} onSent={() => { setInviteFor(null); load(); }} />}
              {expanded === i.id && (
                <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 space-y-2 max-h-72 overflow-y-auto" data-testid={`inquiry-transcript-${i.id}`}>
                  {(i.messages || []).map((m, idx) => (
                    <div key={`${i.id}-m${idx}-${m.role}`} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] px-3 py-1.5 rounded-xl text-xs leading-relaxed ${
                        m.role === "user" ? "bg-fuchsia-600 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {(!i.messages || i.messages.length === 0) && <p className="text-xs text-slate-400">No messages.</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MeetInviteForm({ inquiry, onSent }) {
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const [date, setDate] = useState(tomorrow);
  const [time, setTime] = useState("11:00");
  const [link, setLink] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      const { data } = await api.post(`/super-admin/inquiries/${inquiry.id}/send-invite`, {
        date, time, duration_min: 30, meet_link: link.trim(),
      });
      toast.success(`Meet invite sent — ${data.when} ✦`);
      onSent();
    } catch (e) { toast.error(e.response?.data?.detail || "Invite failed"); }
    finally { setSending(false); }
  };

  return (
    <div className="border-t border-violet-100 bg-violet-50/50 px-4 py-3" data-testid={`invite-form-${inquiry.id}`}>
      <p className="text-xs font-semibold text-violet-800 mb-2">📅 Schedule Google Meet with {inquiry.name}{inquiry.preferred_time ? ` — prefers ${inquiry.preferred_time}` : ""}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} data-testid="invite-date"
          className="text-xs px-2.5 py-2 rounded-lg border border-slate-200 bg-white" />
        <input type="time" value={time} onChange={e => setTime(e.target.value)} data-testid="invite-time"
          className="text-xs px-2.5 py-2 rounded-lg border border-slate-200 bg-white" />
        <input value={link} onChange={e => setLink(e.target.value)} placeholder="Google Meet link (meet.google.com/…) — optional" data-testid="invite-link"
          className="flex-1 min-w-[220px] text-xs px-2.5 py-2 rounded-lg border border-slate-200 bg-white" />
        <button onClick={send} disabled={sending} data-testid="invite-send"
          className="text-xs px-4 py-2 rounded-lg bg-violet-600 text-white font-semibold disabled:opacity-50 inline-flex items-center gap-1">
          {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Video className="w-3 h-3" />} Send invite email
        </button>
      </div>
      <p className="text-[10px] text-slate-400 mt-1.5">Time is IST. The email includes a calendar (.ics) attachment — it adds the meeting to their calendar automatically. Tip: create an instant link at meet.google.com and paste it here.</p>
    </div>
  );
}
