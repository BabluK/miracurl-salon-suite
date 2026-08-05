import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Bot, Search, Loader2, Send, X, ChevronDown, ChevronUp, Star, Globe, Trash2, MessageCircle, Video, Phone, BellRing, FileText, Target, BadgeCheck, Mail, CalendarCheck, Trophy, Sparkles } from "lucide-react";

const STATUS_STYLE = {
  drafted: "bg-amber-100 text-amber-700", no_email: "bg-slate-100 text-slate-500",
  sent: "bg-sky-100 text-sky-700", demo: "bg-violet-100 text-violet-700",
  customer: "bg-emerald-100 text-emerald-700", rejected: "bg-rose-100 text-rose-600",
  researched: "bg-slate-100 text-slate-600", replied: "bg-orange-100 text-orange-700",
};

function ReplyInbox() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);
  useEffect(() => {
    api.get("/super-admin/lead-replies").then(r => setData(r.data)).catch(() => setData({ count: 0, replies: [] }));
  }, []);
  if (!data) return null;
  return (
    <div className="bg-white rounded-2xl border border-slate-200" data-testid="lead-reply-inbox">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3.5" data-testid="reply-inbox-toggle">
        <span className="flex items-center gap-2 font-semibold text-sm text-slate-800">
          📥 Reply Inbox
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${data.count ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{data.count}</span>
        </span>
        <span className="text-xs text-slate-400">{open ? "Hide ▲" : "Show ▼"}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 divide-y divide-slate-50 max-h-96 overflow-y-auto">
          {data.replies.length === 0 && (
            <p className="text-sm text-slate-400 px-4 py-6 text-center">No replies yet. When a lead writes back, it appears here — nothing stays hidden in the mailbox.</p>
          )}
          {data.replies.map(r => (
            <div key={r.id} className="px-4 py-3" data-testid={`reply-row-${r.id}`}>
              <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="w-full text-left">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm text-slate-800 truncate">{r.name} <span className="text-slate-400 font-normal">· {r.email}</span></span>
                  <span className="text-[10px] text-slate-400 shrink-0">{r.replied_at ? new Date(r.replied_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : ""}</span>
                </div>
                <div className="text-xs text-slate-500 truncate mt-0.5">{r.reply_subject || "(no subject)"}</div>
              </button>
              {expanded === r.id && (
                <div className="mt-2 text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg p-3 whitespace-pre-wrap max-h-44 overflow-y-auto">
                  {r.last_reply_text || "Reply body wasn't captured for this one (older reply) — check the mailbox."}
                  <div className="mt-2">
                    <a href={`mailto:${r.email}?subject=Re: ${encodeURIComponent(r.reply_subject || "Miracurl Suite")}`} className="text-fuchsia-600 font-semibold hover:underline">Reply by email →</a>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RoiPanel({ roi }) {
  if (!roi || !roi.funnel) return null;
  const f = roi.funnel;
  const money = [];
  if (roi.won_annual_usd > 0) money.push(`$${roi.won_annual_usd.toLocaleString("en-US")}`);
  if (roi.won_annual_inr > 0) money.push(`₹${roi.won_annual_inr.toLocaleString("en-IN")}`);
  const steps = [
    ["Contacted", f.contacted, "text-sky-600"],
    ["Replied", f.replied, "text-orange-600"],
    ["Demo booked", f.demos, "text-violet-600"],
    ["Converted", f.converted, "text-emerald-600"],
  ];
  return (
    <div className="bg-gradient-to-br from-slate-900 to-fuchsia-950 rounded-2xl p-5 text-white" data-testid="lead-roi-panel">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="font-playfair text-xl flex items-center gap-2">📈 Lead Agent ROI</h3>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-white/50">Annual revenue won</div>
          <div className="text-2xl font-bold text-emerald-300" data-testid="roi-revenue">{money.length ? money.join(" + ") : "—"}</div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 mt-4">
        {steps.map(([label, val, color], i) => (
          <div key={label} className="relative bg-white/[0.06] border border-white/10 rounded-xl p-3 text-center" data-testid={`roi-step-${label.split(" ")[0].toLowerCase()}`}>
            <div className={`text-2xl font-bold ${color.replace("600", "300")}`}>{val}</div>
            <div className="text-[10px] uppercase tracking-wider text-white/50 mt-1">{label}</div>
            {i < steps.length - 1 && <span className="hidden sm:block absolute -right-1.5 top-1/2 -translate-y-1/2 text-white/30 text-lg">→</span>}
          </div>
        ))}
      </div>
      <div className="mt-3 text-xs text-white/60">
        Conversion rate: <b className="text-white">{roi.conversion_rate}%</b> of contacted leads signed up
        {roi.converted_leads.length > 0 && <span> · {roi.converted_leads.filter(l => l.still_active).length} still active</span>}
      </div>
      {roi.converted_leads.length > 0 && (
        <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
          {roi.converted_leads.map((l, i) => (
            <div key={i} className="flex items-center justify-between text-xs bg-white/[0.04] rounded-lg px-3 py-1.5" data-testid={`roi-won-${i}`}>
              <span className="text-white/80">🎉 {l.name} <span className="text-white/40">· {l.city}</span></span>
              <span className="text-emerald-300 font-semibold">{l.currency === "USD" ? "$" : "₹"}{l.plan_value.toLocaleString(l.currency === "USD" ? "en-US" : "en-IN")}/yr{!l.still_active && <span className="text-rose-300 ml-1" title="cancelled/expired">⚠</span>}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const FUNNEL_ICONS = {
  target_leads: { Icon: Target, bg: "bg-fuchsia-100", fg: "text-fuchsia-600" },
  qualified: { Icon: BadgeCheck, bg: "bg-sky-100", fg: "text-sky-600" },
  emails_sent: { Icon: Mail, bg: "bg-amber-100", fg: "text-amber-600" },
  demos: { Icon: CalendarCheck, bg: "bg-violet-100", fg: "text-violet-600" },
  customers: { Icon: Trophy, bg: "bg-emerald-100", fg: "text-emerald-600" },
};

function FunnelCards({ stats }) {
  if (!stats) return null;
  const items = [
    { key: "target_leads", label: "Leads Found" }, { key: "qualified", label: "Qualified" },
    { key: "emails_sent", label: "Emails Sent" }, { key: "demos", label: "Demos" },
    { key: "customers", label: "Customers" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3" data-testid="lead-funnel-cards">
      <style>{`
        @keyframes funnelSparkle {
          0%, 100% { opacity: 0; transform: scale(0.4) rotate(0deg); }
          50% { opacity: 1; transform: scale(1.1) rotate(25deg); }
        }
        @keyframes funnelGlow {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        .funnel-icon-wrap { animation: funnelGlow 3s ease-in-out infinite; }
        .funnel-sparkle { animation: funnelSparkle 2.2s ease-in-out infinite; }
      `}</style>
      {items.map((it, i) => {
        const actual = stats.actual[it.key] ?? 0;
        const { Icon, bg, fg } = FUNNEL_ICONS[it.key];
        return (
          <div key={it.key} className="bg-white rounded-2xl border border-slate-200 p-4" data-testid={`funnel-${it.key}`}>
            <div className="flex items-center gap-3">
              <div className={`relative funnel-icon-wrap w-11 h-11 rounded-xl ${bg} ${fg} flex items-center justify-center shrink-0`}
                style={{ animationDelay: `${i * 0.35}s` }}>
                <Icon className="w-5 h-5" />
                <Sparkles className={`funnel-sparkle absolute -top-1.5 -right-1.5 w-3.5 h-3.5 ${fg}`}
                  style={{ animationDelay: `${i * 0.45}s` }} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-slate-400 truncate">{it.label}</p>
                <p className="text-2xl font-bold text-slate-900 leading-tight" data-testid={`funnel-count-${it.key}`}>{actual}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AutoCallToggle() {
  const [s, setS] = useState(null);
  useEffect(() => { api.get("/super-admin/mira-calls/auto-settings").then(r => setS(r.data)).catch(() => {}); }, []);
  if (!s) return null;
  const toggle = async () => {
    const next = { ...s, enabled: !s.enabled };
    setS(next);
    try {
      await api.put("/super-admin/mira-calls/auto-settings", next);
      toast.success(next.enabled
        ? `⚡ Auto campaign ON — Mira will call new hot leads within the hour (10 AM–7 PM IST, max ${next.daily_limit}/day)`
        : "Auto campaign paused");
    } catch (e) { setS(s); toast.error(e.response?.data?.detail || "Couldn't save"); }
  };
  return (
    <label data-testid="lead-auto-call-toggle" title="Every 10 minutes Mira checks for freshly discovered hot leads and calls them automatically — business hours only, with a daily cap"
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold cursor-pointer transition-colors ${s.enabled ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-500 hover:border-violet-300"}`}>
      <input type="checkbox" checked={s.enabled} onChange={toggle} className="accent-violet-600 w-4 h-4" />
      ⚡ Auto-call new hot leads
    </label>
  );
}

const CALL_STATUS_STYLE = {
  completed: "bg-emerald-100 text-emerald-700", failed: "bg-rose-100 text-rose-600",
  initiated: "bg-sky-100 text-sky-700", queued: "bg-slate-100 text-slate-500",
  "no-answer": "bg-amber-100 text-amber-700", busy: "bg-amber-100 text-amber-700",
};

function RecordingPlayer({ callId, duration }) {
  const [src, setSrc] = useState("");
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/super-admin/mira-calls/${callId}/recording`, { responseType: "blob" });
      setSrc(URL.createObjectURL(r.data));
    } catch { toast.error("Couldn't load the recording from Twilio"); }
    finally { setLoading(false); }
  };
  if (src) return <audio controls autoPlay src={src} className="h-8 mt-1.5 w-full max-w-xs" data-testid={`call-recording-audio-${callId}`} />;
  return (
    <button onClick={load} disabled={loading} data-testid={`call-recording-btn-${callId}`}
      className="text-[10px] text-emerald-600 font-semibold mt-1 inline-flex items-center gap-1 disabled:opacity-50">
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "🎧"} Play recording{duration ? ` (${duration}s)` : ""}
    </button>
  );
}

function CallHistoryPanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [expand, setExpand] = useState("");
  const [retrying, setRetrying] = useState(false);
  const reload = useCallback(() => api.get("/super-admin/mira-calls").then(r => setData(r.data)).catch(() => {}), []);
  useEffect(() => {
    if (open && !data) reload();
  }, [open, data, reload]);
  const retryFailed = async () => {
    if (!window.confirm("Mira will re-dial everyone whose latest call FAILED (skipping opt-outs and leads who already said yes). Start retrying?")) return;
    setRetrying(true);
    try {
      const { data: res } = await api.post("/super-admin/mira-calls/retry-failed");
      if (!res.queued) { toast.info("No failed calls to retry right now"); return; }
      toast.success(`📞 Retrying ${res.queued} failed call${res.queued !== 1 ? "s" : ""} — refresh in a minute to see results`);
      setTimeout(reload, 5000);
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't start the retries"); }
    finally { setRetrying(false); }
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200" data-testid="call-history-panel">
      <div className="flex items-center gap-2 pr-3">
        <button onClick={() => setOpen(o => !o)} data-testid="call-history-toggle"
          className="flex-1 flex items-center justify-between px-4 py-3 text-sm font-bold text-slate-700">
          <span>📞 Mira Call History {data ? `· ${data.stats.total} calls (${data.stats.interested} 🎉 interested · ${data.stats.failed} failed)` : ""}</span>
          <span className="text-slate-400">{open ? "▲" : "▼"}</span>
        </button>
        {data?.stats?.failed > 0 && (
          <button onClick={retryFailed} disabled={retrying} data-testid="retry-failed-calls-btn"
            title="Re-dial every lead whose latest call failed — perfect after upgrading your Twilio account"
            className="shrink-0 text-xs px-3.5 py-2 rounded-lg bg-gradient-to-r from-rose-500 to-orange-500 text-white font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
            {retrying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "🔁"} Retry {data.stats.failed} failed
          </button>
        )}
      </div>
      {open && (
        <div className="px-4 pb-4 space-y-2 max-h-96 overflow-y-auto">
          <p className="text-[10px] text-slate-400" data-testid="recording-hint">🎧 Recordings appear on <b>answered</b> calls a few seconds after they end — failed and unanswered calls have no audio to record.</p>
          {!data && <p className="text-xs text-slate-400">Loading…</p>}
          {data?.items?.length === 0 && <p className="text-xs text-slate-400">No calls yet — hit "Mira Call Hot Leads" or ask Mira to call.</p>}
          {(data?.items || []).map((c) => (
            <div key={c.id} className="border border-slate-100 rounded-xl px-3 py-2" data-testid={`call-row-${c.id}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-700">{c.lead_name || c.phone}</span>
                <span className="text-[10px] text-slate-400 font-mono">{c.phone}</span>
                <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full ${CALL_STATUS_STYLE[c.status] || "bg-slate-100 text-slate-500"}`}>{c.status}</span>
                {c.result && <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">{c.result.replace("_", " ")}</span>}
                {c.duration > 0 && <span className="text-[10px] text-slate-400">{c.duration}s</span>}
                {c.auto && <span className="text-[9px] font-bold text-amber-600">⚡ auto</span>}
                <span className="ml-auto text-[10px] text-slate-400">{new Date(c.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
              </div>
              {c.error_friendly && <p className="text-[10px] text-rose-500 mt-1">⚠ {c.error_friendly}</p>}
              {c.callback_at && <p className="text-[10px] text-amber-600 mt-0.5" data-testid={`callback-time-${c.id}`}>⏰ Owner asked to call back: {new Date(c.callback_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>}
              {c.recording_url && <RecordingPlayer callId={c.id} duration={c.recording_duration} />}
              {c.convo?.length > 0 && (
                <button onClick={() => setExpand(expand === c.id ? "" : c.id)} data-testid={`call-transcript-btn-${c.id}`}
                  className="text-[10px] text-violet-600 font-semibold mt-1">💬 {expand === c.id ? "Hide" : "Show"} conversation ({Math.ceil(c.convo.length / 2)} turns)</button>
              )}
              {expand === c.id && (
                <div className="mt-2 space-y-1 bg-slate-50 rounded-lg p-2">
                  {c.convo.map((m, i) => (
                    <p key={i} className={`text-[11px] ${m.role === "mira" ? "text-violet-700" : "text-slate-600"}`}>
                      <b>{m.role === "mira" ? "Mira" : "Owner"}:</b> {m.text}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduledCallsPanel() {
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState("");
  const [editVal, setEditVal] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/super-admin/mira-calls/scheduled").then(r => setItems(r.data.items)).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);

  const cancel = async (l) => {
    if (!window.confirm(`Cancel Mira's scheduled call to ${l.name || l.phone}?`)) return;
    try {
      await api.post(`/super-admin/mira-calls/scheduled/${l.id}/cancel`);
      toast.success(`Call to ${l.name || "lead"} cancelled — Mira won't ring them`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't cancel"); }
  };

  const startEdit = (l) => {
    setEditId(l.id);
    const d = new Date(l.callback_at);
    const pad = (n) => String(n).padStart(2, "0");
    setEditVal(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
  };

  const saveReschedule = async (l) => {
    if (!editVal) { toast.error("Pick the new date & time"); return; }
    setSaving(true);
    try {
      await api.post(`/super-admin/mira-calls/scheduled/${l.id}/reschedule`, { callback_at: new Date(editVal).toISOString() });
      toast.success(`Mira will now ring ${l.name || "the lead"} at the new time ⏰`);
      setEditId("");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't reschedule"); }
    finally { setSaving(false); }
  };

  const when = (iso) => {
    try {
      const d = new Date(iso);
      const mins = Math.round((d - Date.now()) / 60000);
      const rel = mins <= 0 ? "due now" : mins < 60 ? `in ${mins}m` : mins < 1440 ? `in ${Math.round(mins / 60)}h` : `in ${Math.round(mins / 1440)}d`;
      return `${d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} IST · ${rel}`;
    } catch { return iso; }
  };

  if (!items || items.length === 0) return null;
  return (
    <div className="bg-white rounded-2xl border border-slate-200" data-testid="scheduled-calls-panel">
      <button onClick={() => setOpen(o => !o)} data-testid="scheduled-calls-toggle"
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-slate-700">
        <span>⏰ Scheduled Calls · {items.length} queued — who Mira will ring next</span>
        <span className="text-slate-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2 max-h-96 overflow-y-auto">
          {items.map(l => (
            <div key={l.id} className="border border-slate-100 rounded-xl px-3 py-2 flex items-center gap-2 flex-wrap" data-testid={`scheduled-call-${l.id}`}>
              <span className="text-xs font-semibold text-slate-700">{l.name || l.phone}</span>
              {l.city && <span className="text-[10px] text-slate-400">{l.city}</span>}
              <span className="text-[10px] text-slate-400 font-mono">{l.phone}</span>
              {typeof l.score === "number" && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-600">🔥 {l.score}</span>}
              <span className="text-[10px] font-semibold text-sky-600 ml-auto">📞 {when(l.callback_at)}</span>
              <button onClick={() => (editId === l.id ? setEditId("") : startEdit(l))} data-testid={`reschedule-scheduled-${l.id}`}
                className="text-[10px] font-bold px-2.5 py-1 rounded-full border border-sky-200 text-sky-600 hover:bg-sky-50">
                ⏰ Move
              </button>
              <button onClick={() => cancel(l)} data-testid={`cancel-scheduled-${l.id}`}
                className="text-[10px] font-bold px-2.5 py-1 rounded-full border border-rose-200 text-rose-600 hover:bg-rose-50">
                ✕ Cancel
              </button>
              {editId === l.id && (
                <div className="w-full flex items-center gap-2 mt-1" data-testid={`reschedule-form-${l.id}`}>
                  <input type="datetime-local" value={editVal} onChange={(e) => setEditVal(e.target.value)}
                    min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                    data-testid={`reschedule-input-${l.id}`}
                    className="text-[11px] px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700" />
                  <button onClick={() => saveReschedule(l)} disabled={saving} data-testid={`reschedule-save-${l.id}`}
                    className="text-[10px] font-bold px-3 py-1.5 rounded-full bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50">
                    {saving ? "Saving…" : "✓ Save new time"}
                  </button>
                  <button onClick={() => setEditId("")} className="text-[10px] text-slate-400 hover:text-slate-600">Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
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

  const miraCall = () => act(async () => {
    if (!window.confirm(`Mira will call ${lead.phone} now and pitch Miracurl Suite. Proceed?`)) return;
    await api.post(`/super-admin/mira-calls/${lead.id}/call`);
    toast.success("📞 Mira is dialing — the result will show on this lead in a minute");
  }, "mira-call");

  const findEmail = () => act(async () => {
    const { data } = await api.post(`/super-admin/mira-leads/${lead.id}/find-email`);
    if (data.found) {
      setDraft(d => ({ ...d, email: data.email, email_subject: data.email_subject || d.email_subject, email_body: data.email_body || d.email_body }));
      toast.success(`Found ${data.email} via ${data.email_source} 🎯 — email drafted`);
    } else {
      toast.info("No email found on website, Instagram or web search — try WhatsApp or a call instead.");
    }
  }, "find-email");

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden" data-testid={`lead-row-${lead.id}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50" data-testid={`lead-toggle-${lead.id}`}>
        <span className={`shrink-0 w-11 h-8 rounded-lg text-xs font-bold inline-flex items-center justify-center ${lead.score >= 50 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{lead.score}</span>
        {(lead.reviews || 0) >= 500 && !lead.website && (
          <span data-testid={`lead-hot-badge-${lead.id}`} className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-orange-100 text-orange-700 font-bold border border-orange-200">🔥 HOT</span>
        )}
        {lead.call_result && (
          <span data-testid={`lead-call-result-${lead.id}`} className={`shrink-0 text-[10px] px-2 py-1 rounded-full font-bold border ${
            { interested: "bg-emerald-100 text-emerald-700 border-emerald-200", callback: "bg-sky-100 text-sky-700 border-sky-200", opt_out: "bg-rose-100 text-rose-600 border-rose-200" }[lead.call_result] || "bg-slate-100 text-slate-500 border-slate-200"}`}>
            📞 {{ interested: "INTERESTED (pressed 1)", callback: "CALL BACK", opt_out: "OPTED OUT" }[lead.call_result] || lead.call_result}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{lead.name} <span className="text-slate-400 font-normal">· {lead.city}</span></p>
          <p className="text-[11px] text-slate-400 truncate">
            {lead.category ? <span data-testid={`lead-category-${lead.id}`} className="text-fuchsia-500 font-semibold">{lead.category} · </span> : null}
            {lead.rating ? <><Star className="w-3 h-3 inline text-amber-400 -mt-0.5" /> {lead.rating}{lead.reviews ? ` (${lead.reviews})` : ""} · </> : null}
            {lead.email || "no email found"} {lead.phone ? `· ${lead.phone}` : ""} {lead.branches > 1 ? `· ${lead.branches} branches` : ""}
          </p>
        </div>
        <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${STATUS_STYLE[lead.status] || "bg-slate-100 text-slate-500"}`}>{lead.status}</span>
        {lead.competitor && <span data-testid={`lead-competitor-badge-${lead.id}`} className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-red-100 text-red-700 font-bold border border-red-200" title={`Currently uses ${lead.competitor} — strong migration lead`}>🔥 {lead.competitor}</span>}
        {lead.converted_at && <span data-testid={`lead-converted-badge-${lead.id}`} className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-bold border border-emerald-200" title={`Signed up for a trial${lead.converted_tenant_slug ? ` as "${lead.converted_tenant_slug}"` : ""} on ${(lead.converted_at || "").slice(0, 10)} — thanks to your outreach!`}>🎉 Converted</span>}
        {lead.demo_slot && <span data-testid={`lead-demo-slot-badge-${lead.id}`} className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-violet-100 text-violet-700 font-bold border border-violet-200" title={`Demo booked${lead.demo_slot.local_time ? ` (${lead.demo_slot.local_time} their time)` : ""}`}>📅 {lead.demo_slot.date} · {lead.demo_slot.time} IST</span>}
        {lead.replied_at && <span data-testid={`lead-replied-badge-${lead.id}`} className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-orange-100 text-orange-700 font-bold border border-orange-200" title={`Replied ${(lead.replied_at || "").slice(0, 16).replace("T", " ")}${lead.reply_subject ? ` — "${lead.reply_subject}"` : ""}`}>💬 Replied</span>}
        {lead.opened_at && <span data-testid={`lead-opened-badge-${lead.id}`} className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-sky-100 text-sky-600 font-semibold" title={`Opened ${(lead.opened_at || "").slice(0, 16).replace("T", " ")} — can also be their email scanner`}>👀 Opened</span>}
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
            {lead.website && <a href={lead.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-600"><Globe className="w-3 h-3" /> Website</a>}
            {lead.competitor && <span className="text-red-600 font-semibold">📅 Booking: {lead.competitor}</span>}
            {lead.instagram && <span>IG: {lead.instagram}{lead.instagram_followers ? ` (${lead.instagram_followers >= 1000 ? (lead.instagram_followers / 1000).toFixed(0) + "k" : lead.instagram_followers})` : ""}</span>}
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
                  { sent: "bg-amber-50 text-amber-700 border-amber-200", demo: "bg-violet-50 text-violet-700 border-violet-200", customer: "bg-emerald-50 text-emerald-700 border-emerald-200", replied: "bg-orange-50 text-orange-700 border-orange-200" }[lead.status]}`}>
                <option value="sent">🟡 Contacted</option>
                <option value="replied">🔥 Replied</option>
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
            {["drafted", "no_email", "researched", "rejected"].includes(lead.status) && !lead.email && (
              <button onClick={findEmail} disabled={!!busy} data-testid={`lead-find-email-${lead.id}`}
                title="Mira re-hunts: deep website crawl → Instagram bio → web search"
                className="text-xs px-4 py-2 rounded-lg bg-gradient-to-r from-fuchsia-600 to-pink-500 text-white font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
                {busy === "find-email" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "🔍"} Find email
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
            {lead.phone && !lead.do_not_call && (
              <button onClick={miraCall} disabled={!!busy} data-testid={`lead-mira-call-${lead.id}`}
                title="Mira voice-calls this lead with the Miracurl pitch — press 1 sends the demo pack"
                className="text-xs px-3.5 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
                {busy === "mira-call" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Phone className="w-3.5 h-3.5" />} Mira Call
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
  const [roi, setRoi] = useState(null);
  const [starting, setStarting] = useState(false);
  const [filter, setFilter] = useState("all");
  const pollRef = useRef(null);

  const refresh = useCallback(async () => {
    const [r, l, s, roiRes] = await Promise.all([
      api.get("/super-admin/mira-leads/runs"), api.get("/super-admin/mira-leads"),
      api.get("/super-admin/mira-leads/stats"), api.get("/super-admin/mira-leads/roi").catch(() => ({ data: null })),
    ]);
    setRuns(r.data); setLeads(l.data); setStats(s.data); setRoi(roiRes.data);
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
    { key: "replied", label: "🔥 Replied", test: l => !!l.replied_at || l.status === "replied" },
    { key: "no_email", label: "🚫 No email", test: l => l.status === "no_email" || !l.email },
    { key: "sent", label: "✅ Already sent", test: l => ["sent", "demo", "customer", "replied"].includes(l.status) },
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

      <RoiPanel roi={roi} />

      <ReplyInbox />

      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-slate-400">City</label>
          <input value={city} onChange={e => setCity(e.target.value)} placeholder="Bangalore · London, UK · New York, US" className="block border border-slate-200 rounded-xl px-3 py-2.5 text-sm mt-1 w-56" data-testid="lead-city-input" />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide text-slate-400">How many salons</label>
          <input type="number" min="1" max="50" value={target} onChange={e => setTarget(e.target.value)} className="block border border-slate-200 rounded-xl px-3 py-2.5 text-sm mt-1 w-24" data-testid="lead-target-input" />
        </div>
        <button onClick={startRun} disabled={starting || !!activeRun} data-testid="lead-run-btn"
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50">
          {starting || activeRun ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {activeRun ? "Mira is working…" : "Find salons ✦"}
        </button>
        {activeRun && (
          <button data-testid="lead-stop-run-btn"
            onClick={async () => {
              if (!window.confirm("Stop the current run? Leads found so far are kept.")) return;
              try {
                await api.post("/super-admin/mira-leads/runs/stop");
                toast.success("Run stopped — you can start a new search");
                refresh().catch(() => {});
              } catch (e) { toast.error(e.response?.data?.detail || "Couldn't stop the run"); }
            }}
            className="px-4 py-2.5 rounded-xl border border-rose-300 text-rose-600 text-sm font-semibold hover:bg-rose-50"
            title="Stop the stuck/running search — leads found so far stay saved">
            ⏹ Stop
          </button>
        )}
        <button data-testid="lead-call-hot-btn"
          onClick={async () => {
            if (!window.confirm("Mira will VOICE-CALL every hot lead with a phone number (max 20, not called in the last 7 days), pitch Miracurl Suite and offer the demo + trial on keypress 1. Start calling?")) return;
            try {
              const { data } = await api.post("/super-admin/mira-calls/call-hot", { limit: 20 });
              if (!data.queued) { toast.info(data.note || "No callable hot leads right now"); return; }
              toast.success(`📞 Mira is calling ${data.queued} hot leads — results appear on each lead card`);
            } catch (e) { toast.error(e.response?.data?.detail || "Couldn't start the calls"); }
          }}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-sm font-bold inline-flex items-center gap-2"
          title="Mira voice-calls all hot leads with your pitch script — press 1 sends the demo pack by email">
          📞 Mira Call Hot Leads
        </button>
        <AutoCallToggle />
        <button data-testid="lead-hunt-all-btn"
          disabled={starting || !!activeRun}
          onClick={async () => {
            try {
              const { data } = await api.post("/super-admin/mira-leads/hunt-all");
              if (!data.started) { toast.info("Every lead already has an email — nothing to hunt 🎉"); return; }
              toast.success(`Hunting emails for ${data.count} leads — watch the log ✦`);
              startPolling();
              refresh().catch(() => {});
            } catch (e) { toast.error(e.response?.data?.detail || "Couldn't start the hunt"); }
          }}
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:border-fuchsia-400 disabled:opacity-50"
          title="Runs Find-email (website → Instagram → web search) across every lead with no inbox">
          🔍 Hunt all emails
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

      <CallHistoryPanel />

      <ScheduledCallsPanel />

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
