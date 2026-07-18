import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Bot, Search, Loader2, Send, X, ChevronDown, ChevronUp, Star, Globe, Trash2, MessageCircle, Video, Phone, BellRing, FileText } from "lucide-react";

const STATUS_STYLE = {
  drafted: "bg-amber-100 text-amber-700", no_email: "bg-slate-100 text-slate-500",
  sent: "bg-sky-100 text-sky-700", demo: "bg-violet-100 text-violet-700",
  customer: "bg-emerald-100 text-emerald-700", rejected: "bg-rose-100 text-rose-600",
  researched: "bg-slate-100 text-slate-600",
};

function FunnelCards({ stats }) {
  if (!stats) return null;
  const items = [
    { key: "target_leads", label: "Target Leads" }, { key: "qualified", label: "Qualified" },
    { key: "emails_sent", label: "Emails Sent" }, { key: "demos", label: "Demos" },
    { key: "customers", label: "Customers" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3" data-testid="lead-funnel-cards">
      {items.map(it => (
        <div key={it.key} className="bg-white rounded-2xl border border-slate-200 p-4" data-testid={`funnel-${it.key}`}>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">{it.label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {stats.actual[it.key]}<span className="text-sm font-medium text-slate-400"> / {stats.targets[it.key]}</span>
          </p>
          <div className="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-fuchsia-500 to-pink-500 rounded-full"
              style={{ width: `${Math.min(100, (stats.actual[it.key] / stats.targets[it.key]) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function LeadRow({ lead, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [meetOpen, setMeetOpen] = useState(false);
  const [draft, setDraft] = useState({ email: lead.email || "", email_subject: lead.email_subject || "", email_body: lead.email_body || "" });

  const act = async (fn, label) => {
    setBusy(label);
    try { await fn(); onRefresh(); }
    catch (e) { toast.error(e.response?.data?.detail || `${label} failed`); }
    finally { setBusy(""); }
  };

  const approve = () => act(async () => {
    if (draft.email !== (lead.email || "") || draft.email_subject !== (lead.email_subject || "") || draft.email_body !== (lead.email_body || "")) {
      await api.put(`/super-admin/mira-leads/${lead.id}`, draft);
    }
    const { data } = await api.post(`/super-admin/mira-leads/${lead.id}/approve`);
    toast.success(`Email sent to ${data.sent_to} 🚀`);
  }, "approve");

  const isSent = ["sent", "demo", "customer"].includes(lead.status);

  const sendWhatsApp = () => act(async () => {
    const { data } = await api.get(`/super-admin/mira-leads/${lead.id}/whatsapp`);
    window.open(data.wa_url, "_blank");
    if (!isSent) {
      await api.post(`/super-admin/mira-leads/${lead.id}/whatsapp-sent`);
      toast.success("WhatsApp opened — hit Send there. Lead marked as sent 💬");
    } else {
      toast.success("WhatsApp opened — hit Send there 💬");
    }
  }, "whatsapp");

  const sendSlotPicker = () => act(async () => {
    await api.post(`/super-admin/mira-leads/${lead.id}/send-slot-picker`);
    toast.success(`Time-picker sent to ${lead.email} — they'll choose a demo slot 📅`);
  }, "slot-picker");

  const remind = () => act(async () => {
    await api.post(`/super-admin/mira-leads/${lead.id}/remind`);
    toast.success(`Reminder sent to ${lead.email} 🔔`);
  }, "remind");

  const resendPdf = () => act(async () => {
    await api.post(`/super-admin/mira-leads/${lead.id}/resend`);
    toast.success(`Pitch + brochure re-sent to ${lead.email} 📩`);
  }, "resend");

  const setStage = (stage) => act(async () => {
    await api.post(`/super-admin/mira-leads/${lead.id}/stage`, { stage });
    toast.success("Status updated ✦");
  }, "stage");

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden" data-testid={`lead-row-${lead.id}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50" data-testid={`lead-toggle-${lead.id}`}>
        <span className={`shrink-0 w-11 h-8 rounded-lg text-xs font-bold inline-flex items-center justify-center ${lead.score >= 50 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{lead.score}</span>
        {(lead.reviews || 0) >= 500 && !lead.website && (
          <span data-testid={`lead-hot-badge-${lead.id}`} className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-orange-100 text-orange-700 font-bold border border-orange-200">🔥 HOT</span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{lead.name} <span className="text-slate-400 font-normal">· {lead.city}</span></p>
          <p className="text-[11px] text-slate-400 truncate">
            {lead.rating ? <><Star className="w-3 h-3 inline text-amber-400 -mt-0.5" /> {lead.rating}{lead.reviews ? ` (${lead.reviews})` : ""} · </> : null}
            {lead.email || "no email found"} {lead.phone ? `· ${lead.phone}` : ""} {lead.branches > 1 ? `· ${lead.branches} branches` : ""}
          </p>
        </div>
        <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${STATUS_STYLE[lead.status] || "bg-slate-100 text-slate-500"}`}>{lead.status}</span>
        {lead.opened_at && <span data-testid={`lead-opened-badge-${lead.id}`} className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-sky-100 text-sky-600 font-semibold" title={`Opened ${(lead.opened_at || "").slice(0, 16).replace("T", " ")} — can also be their email scanner`}>👀 Opened</span>}
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
            {lead.website && <a href={lead.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-600"><Globe className="w-3 h-3" /> Website</a>}
            {lead.instagram && <span>IG: {lead.instagram}</span>}
            {(lead.services || []).slice(0, 4).map(s => <span key={s} className="bg-slate-100 px-2 py-0.5 rounded-full">{s}</span>)}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(lead.score_breakdown || []).map(b => <span key={b} className="text-[10px] bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 px-2 py-0.5 rounded-full">{b}</span>)}
          </div>
          {["drafted", "no_email", "researched"].includes(lead.status) && (
            <div className="space-y-2">
              <input value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} placeholder="owner@salon.com"
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm w-full max-w-sm" data-testid={`lead-email-input-${lead.id}`} />
              <input value={draft.email_subject} onChange={e => setDraft({ ...draft, email_subject: e.target.value })} placeholder="Email subject"
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm w-full" data-testid={`lead-subject-input-${lead.id}`} />
              <textarea value={draft.email_body} onChange={e => setDraft({ ...draft, email_body: e.target.value })} rows={6} placeholder="Personalized email body"
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm w-full" data-testid={`lead-body-input-${lead.id}`} />
            </div>
          )}
          {lead.status === "sent" && <p className="text-xs text-sky-600">✅ Sent {lead.sent_at?.slice(0, 16).replace("T", " ")} {lead.sent_via === "whatsapp" ? "via WhatsApp 💬" : `to ${lead.email}`}
          {lead.follow_up_sent_at && <span className="text-fuchsia-600"> · 🔁 Follow-up sent {lead.follow_up_sent_at.slice(0, 10)}</span>}
          {lead.slot_picker_sent_at && <span className="text-amber-600"> · 📅 Time-picker sent {lead.slot_picker_sent_at.slice(0, 10)}</span>}</p>}
          {isSent && (lead.last_reminder_at || lead.pdf_resent_at || lead.meeting?.at_ist) && (
            <p className="text-xs text-slate-500" data-testid={`lead-followup-badges-${lead.id}`}>
              {lead.last_reminder_at && <span className="text-amber-600">🔔 Reminded {lead.last_reminder_at.slice(0, 10)}{(lead.reminder_count || 0) > 1 ? ` ×${lead.reminder_count}` : ""}</span>}
              {lead.pdf_resent_at && <span className="text-emerald-600"> · 📩 PDF re-sent {lead.pdf_resent_at.slice(0, 10)}</span>}
              {lead.meeting?.at_ist && <span className="text-violet-600"> · 🎥 Meet {lead.meeting.at_ist} IST{lead.meeting.meet_link ? " (link sent)" : ""}</span>}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {isSent && (
              <select value={lead.status} onChange={e => setStage(e.target.value)} disabled={!!busy} data-testid={`lead-status-select-${lead.id}`}
                className={`text-xs px-2 py-2 rounded-lg border font-semibold cursor-pointer ${
                  { sent: "bg-amber-50 text-amber-700 border-amber-200", demo: "bg-violet-50 text-violet-700 border-violet-200", customer: "bg-emerald-50 text-emerald-700 border-emerald-200" }[lead.status]}`}>
                <option value="sent">🟡 Contacted</option>
                <option value="demo">🟣 Meeting scheduled</option>
                <option value="customer">🟢 Customer 🎉</option>
              </select>
            )}
            {isSent && lead.email && (
              <button onClick={remind} disabled={!!busy} data-testid={`lead-remind-${lead.id}`}
                title="Send a gentle reminder email now (with brochure PDF) — works whether or not they opened"
                className="text-xs px-3.5 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
                {busy === "remind" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BellRing className="w-3.5 h-3.5" />} Remind
              </button>
            )}
            {isSent && lead.email && (
              <button onClick={resendPdf} disabled={!!busy} data-testid={`lead-resend-pdf-${lead.id}`}
                title="Re-send the original pitch email with all PDFs attached"
                className="text-xs px-3.5 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
                {busy === "resend" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} Resend PDF
              </button>
            )}
            {isSent && lead.email && (
              <button onClick={() => setMeetOpen(o => !o)} disabled={!!busy} data-testid={`lead-meet-invite-${lead.id}`}
                title="Email a Google Meet invite with calendar (.ics) attachment"
                className={`text-xs px-3.5 py-2 rounded-lg font-bold disabled:opacity-50 inline-flex items-center gap-1.5 ${meetOpen ? "bg-violet-600 text-white" : "border border-violet-300 bg-violet-50 text-violet-700"}`}>
                <Video className="w-3.5 h-3.5" /> Meet invite
              </button>
            )}
            {lead.email && (
              <button onClick={sendSlotPicker} disabled={!!busy} data-testid={`lead-slot-picker-${lead.id}`}
                className="text-xs px-4 py-2 rounded-lg bg-amber-500 text-white font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
                {busy === "slot-picker" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "📅"} Send time-picker
              </button>
            )}
            {["drafted", "no_email", "researched", "rejected"].includes(lead.status) && (
              <button onClick={approve} disabled={!!busy || !draft.email} data-testid={`lead-approve-${lead.id}`}
                className="text-xs px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
                {busy === "approve" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Approve & Send
              </button>
            )}
            {lead.phone && ["drafted", "no_email", "researched", "rejected"].includes(lead.status) && (
              <button onClick={sendWhatsApp} disabled={!!busy} data-testid={`lead-whatsapp-${lead.id}`}
                className="text-xs px-4 py-2 rounded-lg bg-[#25D366] text-white font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
                {busy === "whatsapp" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />} Send via WhatsApp
              </button>
            )}
            {isSent && lead.phone && (
              <a href={`tel:${lead.phone}`} data-testid={`lead-call-${lead.id}`} title={`Call ${lead.phone}`}
                className="text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 font-semibold inline-flex items-center gap-1.5 hover:border-sky-400 hover:text-sky-600">
                <Phone className="w-3.5 h-3.5" /> Call
              </a>
            )}
            {isSent && lead.phone && (
              <button onClick={sendWhatsApp} disabled={!!busy} data-testid={`lead-whatsapp-followup-${lead.id}`}
                title="Open WhatsApp with a pre-written follow-up message"
                className="text-xs px-3 py-2 rounded-lg bg-[#25D366] text-white font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
                {busy === "whatsapp" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />} WhatsApp
              </button>
            )}
            {!["sent", "demo", "customer", "rejected"].includes(lead.status) && (
              <button onClick={() => act(() => api.post(`/super-admin/mira-leads/${lead.id}/reject`), "reject")} data-testid={`lead-reject-${lead.id}`}
                className="text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-500 inline-flex items-center gap-1.5"><X className="w-3.5 h-3.5" /> Reject</button>
            )}
            <button onClick={() => act(() => api.delete(`/super-admin/mira-leads/${lead.id}`), "delete")} data-testid={`lead-delete-${lead.id}`}
              className="text-xs px-2.5 py-2 rounded-lg text-rose-400 hover:bg-rose-50 ml-auto"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
          {meetOpen && <MeetInviteForm lead={lead} onSent={() => { setMeetOpen(false); onRefresh(); }} />}
        </div>
      )}
    </div>
  );
}

function MeetInviteForm({ lead, onSent }) {
  const [date, setDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [time, setTime] = useState("11:00");
  const [link, setLink] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      const { data } = await api.post(`/super-admin/mira-leads/${lead.id}/meet-invite`,
        { date, time, duration_min: 30, meet_link: link.trim() });
      toast.success(`Meet invite sent — ${data.when} ✦`);
      onSent();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't send invite"); }
    finally { setSending(false); }
  };

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 space-y-2" data-testid={`lead-meet-form-${lead.id}`}>
      <p className="text-[11px] font-semibold text-violet-700 uppercase tracking-wide">🎥 Google Meet demo invite → {lead.email}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} data-testid={`lead-meet-date-${lead.id}`}
          className="border border-violet-200 rounded-lg px-2.5 py-1.5 text-xs bg-white" />
        <input type="time" value={time} onChange={e => setTime(e.target.value)} data-testid={`lead-meet-time-${lead.id}`}
          className="border border-violet-200 rounded-lg px-2.5 py-1.5 text-xs bg-white" />
        <input value={link} onChange={e => setLink(e.target.value)} placeholder="Google Meet link (meet.google.com/…) — optional" data-testid={`lead-meet-link-${lead.id}`}
          className="border border-violet-200 rounded-lg px-2.5 py-1.5 text-xs bg-white flex-1 min-w-[220px]" />
        <button onClick={send} disabled={sending || !date || !time} data-testid={`lead-meet-send-${lead.id}`}
          className="text-xs px-4 py-2 rounded-lg bg-violet-600 text-white font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send invite
        </button>
      </div>
      <p className="text-[10px] text-violet-500">Time is IST · 30 min · a calendar (.ics) invite is attached so it lands straight in their calendar. Tip: create an instant link at meet.google.com and paste it above.</p>
    </div>
  );
}

export function MiraLeadAgent() {
  const [city, setCity] = useState("Bangalore");
  const [target, setTarget] = useState(10);
  const [runs, setRuns] = useState([]);
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [starting, setStarting] = useState(false);
  const [filter, setFilter] = useState("all");
  const pollRef = useRef(null);

  const refresh = useCallback(async () => {
    const [r, l, s] = await Promise.all([
      api.get("/super-admin/mira-leads/runs"), api.get("/super-admin/mira-leads"), api.get("/super-admin/mira-leads/stats"),
    ]);
    setRuns(r.data); setLeads(l.data); setStats(s.data);
    return r.data;
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
    return () => clearInterval(pollRef.current);
  }, [refresh]);

  const startPolling = useCallback(() => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const r = await refresh().catch(() => []);
      if (!r.some(x => x.status === "running")) clearInterval(pollRef.current);
    }, 6000);
  }, [refresh]);

  const startRun = async () => {
    setStarting(true);
    try {
      await api.post("/super-admin/mira-leads/run", { city, target: Number(target) });
      toast.success(`Mira is hunting for salons in ${city} ✦ (takes a few minutes)`);
      startPolling();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't start run"); }
    finally { setStarting(false); }
  };

  const activeRun = runs.find(r => r.status === "running");

  const isHot = l => (l.reviews || 0) >= 500 && !l.website;
  const FILTERS = [
    { key: "all", label: "All", test: () => true },
    { key: "recent", label: "🕐 Recent search", test: l => runs[0] && l.run_id === runs[0].id },
    { key: "hot", label: "🔥 Hot leads", test: l => isHot(l) },
    { key: "ready", label: "✉️ Ready to send", test: l => ["drafted", "researched"].includes(l.status) && !!l.email },
    { key: "opened", label: "👀 Opened", test: l => !!l.opened_at },
    { key: "no_email", label: "🚫 No email", test: l => l.status === "no_email" || !l.email },
    { key: "sent", label: "✅ Already sent", test: l => ["sent", "demo", "customer"].includes(l.status) },
  ];
  const counts = Object.fromEntries(FILTERS.map(f => [f.key, leads.filter(f.test).length]));
  const shownLeads = leads.filter(FILTERS.find(f => f.key === filter)?.test || (() => true));

  return (
    <div className="space-y-6" data-testid="mira-lead-agent-panel">
      <div>
        <h1 className="font-playfair text-3xl flex items-center gap-3"><Bot className="w-7 h-7 text-fuchsia-500" /> Lead Generation by Mira AI</h1>
        <p className="text-slate-500 text-sm mt-1">Find salons → research → score → personalized email → you approve → Mira sends.</p>
      </div>

      <FunnelCards stats={stats} />

      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-slate-400">City</label>
          <input value={city} onChange={e => setCity(e.target.value)} className="block border border-slate-200 rounded-xl px-3 py-2.5 text-sm mt-1" data-testid="lead-city-input" />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide text-slate-400">How many salons</label>
          <input type="number" min="1" max="25" value={target} onChange={e => setTarget(e.target.value)} className="block border border-slate-200 rounded-xl px-3 py-2.5 text-sm mt-1 w-24" data-testid="lead-target-input" />
        </div>
        <button onClick={startRun} disabled={starting || !!activeRun} data-testid="lead-run-btn"
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50">
          {starting || activeRun ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {activeRun ? "Mira is working…" : "Find salons ✦"}
        </button>
        <button data-testid="lead-followups-btn"
          onClick={async () => {
            try {
              const { data } = await api.post("/super-admin/mira-leads/followups/run");
              toast.success(`Follow-ups: ${data.sent} sent, ${data.due - data.sent} not due yet`);
              refresh().catch(() => {});
            } catch (e) { toast.error(e.response?.data?.detail || "Follow-up run failed"); }
          }}
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:border-fuchsia-400"
          title="Auto-runs daily at 10 AM — sends a gentle nudge to leads with no reply after 5 days">
          🔁 Send due follow-ups
        </button>
      </div>

      {runs[0] && (runs[0].status === "running" || (runs[0].log || []).length > 0) && (
        <div className="bg-slate-900 rounded-2xl p-4 text-xs text-slate-300 font-mono max-h-44 overflow-y-auto" data-testid="lead-run-log">
          {(runs[0].log || []).slice(-14).map((l, i) => <p key={i}>{l}</p>)}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2" data-testid="lead-filter-tabs">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} data-testid={`lead-filter-${f.key}`}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${filter === f.key
                ? "bg-fuchsia-600 text-white border-fuchsia-600"
                : "bg-white text-slate-500 border-slate-200 hover:border-fuchsia-300"}`}>
              {f.label} <span className={`ml-1 ${filter === f.key ? "text-fuchsia-200" : "text-slate-400"}`}>{counts[f.key]}</span>
            </button>
          ))}
        </div>
        {leads.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No leads yet — run Mira above to find your first salons.</p>}
        {leads.length > 0 && shownLeads.length === 0 && <p className="text-sm text-slate-400 text-center py-8" data-testid="lead-filter-empty">No leads in this bucket.</p>}
        {shownLeads.map(l => <LeadRow key={l.id} lead={l} onRefresh={() => refresh().catch(() => {})} />)}
      </div>
    </div>
  );
}
