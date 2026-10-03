import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Bot, Search, Loader2, Send, X, ChevronDown, ChevronUp, Star, Globe, Trash2, MessageCircle, Video, Phone, BellRing, FileText, Target, BadgeCheck, Mail, CalendarCheck, Trophy, Sparkles } from "lucide-react";
import { confirmAsync } from "@/components/ConfirmDialog";
import { WaQuickInvite } from "@/components/superadmin/WaQuickInvite";
import { CityWatchCard } from "@/components/superadmin/CityWatchCard";
import { ReplyInbox } from "@/components/superadmin/ReplyInbox";
import { MiraOutreachCard } from "@/components/superadmin/MiraOutreachCard";
import { WaBlastModal } from "@/components/superadmin/WaBlastModal";
import { LeadEmailFix } from "@/components/superadmin/LeadEmailFix";
import { AutoWaToggle } from "@/components/superadmin/AutoWaToggle";
import { LeadSourceBadges } from "@/components/superadmin/LeadSourceBadges";
import { SearchPanel, LastRunCard, CleanupMenu } from "@/components/superadmin/LeadSearchSection";

const STATUS_STYLE = {
  drafted: "bg-amber-100 text-amber-700", no_email: "bg-slate-100 text-slate-500",
  sent: "bg-sky-100 text-sky-700", demo: "bg-violet-100 text-violet-700",
  customer: "bg-emerald-100 text-emerald-700", rejected: "bg-rose-100 text-rose-600",
  researched: "bg-slate-100 text-slate-600", replied: "bg-orange-100 text-orange-700",
};


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

  const sendWaIntro = () => act(async () => {
    if (!await confirmAsync(`Mira will send her WhatsApp intro (approved Meta template) to ${lead.phone} now. Proceed?`)) return;
    await api.post(`/super-admin/mira-leads/${lead.id}/wa-intro`);
    toast.success("💬 WhatsApp intro sent from the Miracurl number — replies show on this lead");
  }, "wa-intro");

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
      <div role="button" tabIndex={0} onClick={() => setOpen(o => !o)} onKeyDown={e => e.key === "Enter" && setOpen(o => !o)} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 cursor-pointer" data-testid={`lead-toggle-${lead.id}`}>
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
          <p className="text-sm font-semibold text-slate-800 truncate">
            {lead.name} <span className="text-slate-400 font-normal">· {lead.city}</span>
            {lead.vertical === "restaurant" && <span className="ml-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-orange-600 align-middle">🍽️ Restaurant</span>}
            {lead.signal && <span data-testid={`lead-signal-${lead.id}`} className={`ml-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border align-middle ${lead.new_business ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-sky-50 border-sky-200 text-sky-700"}`}>{lead.signal}</span>}
            <span data-testid={`lead-region-${lead.id}`} className="ml-1.5 text-[10px] align-middle" title={((lead.phone || "").replace(/[\s()-]/g, "").startsWith("+") && !(lead.phone || "").replace(/[\s()-]/g, "").startsWith("+91")) ? "Foreign lead" : "Indian lead"}>
              {((lead.phone || "").replace(/[\s()-]/g, "").startsWith("+") && !(lead.phone || "").replace(/[\s()-]/g, "").startsWith("+91")) ? "🌍" : "🇮🇳"}
            </span>
          </p>
          <p className="text-[11px] text-slate-400 truncate flex flex-wrap items-center gap-x-1">
            {lead.category ? <span data-testid={`lead-category-${lead.id}`} className="text-fuchsia-500 font-semibold">{lead.category} · </span> : null}
            {lead.rating ? <><Star className="w-3 h-3 inline text-amber-400 -mt-0.5" /> {lead.rating}{lead.reviews ? ` (${lead.reviews})` : ""} · </> : null}
            {lead.email_real === false ? <LeadEmailFix lead={lead} onSaved={onRefresh} /> : (lead.email || "no email found")} {lead.phone ? `· ${lead.phone}` : ""} {lead.branches > 1 ? `· ${lead.branches} branches` : ""}
            <LeadSourceBadges lead={lead} className="ml-1" />
          </p>
        </div>
        <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${STATUS_STYLE[lead.status] || "bg-slate-100 text-slate-500"}`}>{lead.status}</span>
        {lead.competitor && <span data-testid={`lead-competitor-badge-${lead.id}`} className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-red-100 text-red-700 font-bold border border-red-200" title={`Currently uses ${lead.competitor} — strong migration lead`}>🔥 {lead.competitor}</span>}
        {lead.converted_at && <span data-testid={`lead-converted-badge-${lead.id}`} className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-bold border border-emerald-200" title={`Signed up for a trial${lead.converted_tenant_slug ? ` as "${lead.converted_tenant_slug}"` : ""} on ${(lead.converted_at || "").slice(0, 10)} — thanks to your outreach!`}>🎉 Converted</span>}
        {lead.demo_slot && <span data-testid={`lead-demo-slot-badge-${lead.id}`} className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-violet-100 text-violet-700 font-bold border border-violet-200" title={`Demo booked${lead.demo_slot.local_time ? ` (${lead.demo_slot.local_time} their time)` : ""}`}>📅 {lead.demo_slot.date} · {lead.demo_slot.time} IST</span>}
        {lead.nudge_sent_at && <span data-testid={`lead-nudged-badge-${lead.id}`} className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-bold border border-amber-200" title={`Mira auto-nudged a trial invite on ${(lead.nudge_sent_at || "").slice(0, 16).replace("T", " ")} — WhatsApp got no reply within a day`}>📧 Nudged</span>}
        {lead.replied_at && <span data-testid={`lead-replied-badge-${lead.id}`} className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-orange-100 text-orange-700 font-bold border border-orange-200" title={`Replied ${(lead.replied_at || "").slice(0, 16).replace("T", " ")}${lead.reply_subject ? ` — "${lead.reply_subject}"` : ""}`}>💬 Replied</span>}
        {lead.opened_at && <span data-testid={`lead-opened-badge-${lead.id}`} className="shrink-0 text-[10px] px-2 py-1 rounded-full bg-sky-100 text-sky-600 font-semibold" title={`Opened ${(lead.opened_at || "").slice(0, 16).replace("T", " ")} — can also be their email scanner`}>👀 Opened</span>}
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </div>

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
            {lead.phone && !lead.do_not_call && !lead.wa_opt_out && !lead.wa_intro_sent_at && (
              <button onClick={sendWaIntro} disabled={!!busy} data-testid={`lead-wa-intro-${lead.id}`}
                title="Mira sends her WhatsApp intro from the Miracurl business number (Meta template) — replies land here"
                className="text-xs px-3.5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
                {busy === "wa-intro" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />} WA Intro
              </button>
            )}
            {lead.wa_intro_sent_at && (
              <span data-testid={`lead-wa-intro-sent-${lead.id}`} className={`text-[10px] font-bold px-2 py-1 rounded-full ${lead.wa_intro_replied_at ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {lead.wa_intro_replied_at ? "💬 replied on WhatsApp" : "💬 WA intro sent"}
              </span>
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


const SECTIONS = [
  { key: "search", label: "🔍 Find & review leads", hint: "search → results → approve" },
  { key: "autopilot", label: "🤖 Autopilot & outreach", hint: "Mira emails leads herself" },
  { key: "inbox", label: "📥 Replies, funnel & tools", hint: "replies · ROI · WhatsApp tools" },
];

export function MiraLeadAgent() {
  const [city, setCity] = useState("Bangalore");
  const [target, setTarget] = useState(10);
  const [vertical, setVertical] = useState("salon");
  const [runs, setRuns] = useState([]);
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [roi, setRoi] = useState(null);
  const [starting, setStarting] = useState(false);
  const [scope, setScope] = useState("all");
  const [filter, setFilter] = useState("all");
  const [section, setSection] = useState("search");
  const [blastOpen, setBlastOpen] = useState(false);
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
      await api.post("/super-admin/mira-leads/run", { city, target: Number(target), vertical });
      toast.success(`Mira is hunting for ${vertical === "restaurant" ? "restaurants" : "salons"} in ${city} ✦ (takes a few minutes)`);
      setScope("recent"); setFilter("all");
      startPolling();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't start run"); }
    finally { setStarting(false); }
  };

  const stopRun = async () => {
    if (!await confirmAsync("Stop the current run? Leads found so far are kept.")) return;
    try {
      await api.post("/super-admin/mira-leads/runs/stop");
      toast.success("Run stopped — you can start a new search");
      refresh().catch(() => {});
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't stop the run"); }
  };

  const activeRun = runs.find(r => r.status === "running");
  const lastSearch = runs.find(r => r.vertical) || runs[0];

  const isHot = l => (l.reviews || 0) >= 500 && !l.website;
  const isIndian = l => {
    const ph = (l.phone || "").replace(/[\s()-]/g, "");
    if (ph.startsWith("+91")) return true;
    if (ph.startsWith("+")) return false;
    const m = (l.city || "").trim().match(/,\s*([A-Za-z]{2,3})$/);
    if (m) return ["IN", "IND"].includes(m[1].toUpperCase());
    return true;
  };
  // Scope = WHICH leads (vertical / region / latest search). Filter = WHERE they are in the journey.
  const SCOPES = [
    { key: "all", label: "All", test: () => true },
    { key: "recent", label: "🕐 Latest search", test: l => lastSearch && l.run_id === lastSearch.id },
    { key: "salon", label: "💇 Salons", test: l => (l.vertical || "salon") !== "restaurant" },
    { key: "resto", label: "🍽️ Restaurants", test: l => l.vertical === "restaurant" },
    { key: "india", label: "🇮🇳 Indian", test: l => isIndian(l) },
    { key: "intl", label: "🌍 Foreign", test: l => !isIndian(l) },
  ];
  const FILTERS = [
    { key: "all", label: "Any status", test: () => true },
    { key: "ready", label: "✉️ Ready to send", test: l => ["drafted", "researched"].includes(l.status) && !!l.email },
    { key: "hot", label: "🔥 Hot", test: l => isHot(l) },
    { key: "newbiz", label: "🆕 Newly opened", test: l => !!l.new_business },
    { key: "sent", label: "✅ Contacted", test: l => ["sent", "demo", "customer", "replied"].includes(l.status) },
    { key: "opened", label: "👀 Opened", test: l => !!l.opened_at },
    { key: "replied", label: "💬 Replied", test: l => !!l.replied_at || l.status === "replied" },
    { key: "nudged", label: "📧 Nudged", test: l => !!l.nudge_sent_at },
    { key: "no_email", label: "🚫 No email", test: l => l.status === "no_email" || !l.email },
  ];
  const scopeTest = SCOPES.find(s => s.key === scope)?.test || (() => true);
  const scoped = leads.filter(scopeTest);
  const scopeCounts = Object.fromEntries(SCOPES.map(s => [s.key, leads.filter(s.test).length]));
  const counts = Object.fromEntries(FILTERS.map(f => [f.key, scoped.filter(f.test).length]));
  const shownLeads = scoped.filter(FILTERS.find(f => f.key === filter)?.test || (() => true));

  const Chip = ({ on, onClick, children, count, testid, tone = "fuchsia" }) => (
    <button onClick={onClick} data-testid={testid}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${on
        ? (tone === "dark" ? "bg-[#1c1c22] text-[#e8c37f] border-[#1c1c22]" : "bg-fuchsia-600 text-white border-fuchsia-600")
        : "bg-white text-slate-500 border-slate-200 hover:border-fuchsia-300"}`}>
      {children} <span className={`ml-1 ${on ? "opacity-70" : "text-slate-400"}`}>{count}</span>
    </button>
  );

  return (
    <div className="space-y-5" data-testid="mira-lead-agent-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-playfair text-3xl flex items-center gap-3"><Bot className="w-7 h-7 text-fuchsia-500" /> Lead Generation by Mira AI</h1>
          <p className="text-slate-500 text-sm mt-1">Find salons & restaurants → research → score → personalized email → you approve (or Autopilot sends).</p>
        </div>
        <div className="flex gap-1 p-1 rounded-2xl bg-white border border-slate-200" data-testid="lead-section-tabs">
          {SECTIONS.map(sct => (
            <button key={sct.key} onClick={() => setSection(sct.key)} data-testid={`lead-section-${sct.key}`} title={sct.hint}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${section === sct.key ? "bg-[#1c1c22] text-[#e8c37f]" : "text-slate-500 hover:text-slate-800"}`}>
              {sct.label}
            </button>
          ))}
        </div>
      </div>

      {section === "search" && (
        <>
          <SearchPanel city={city} setCity={setCity} target={target} setTarget={setTarget} vertical={vertical} setVertical={setVertical}
            onRun={startRun} onStop={stopRun} starting={starting} activeRun={activeRun} />
          <LastRunCard run={lastSearch} leads={leads} showing={scope === "recent"} onShowLeads={() => { setScope(scope === "recent" ? "all" : "recent"); setFilter("all"); }} />

          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3" data-testid="lead-results">
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-slate-800 text-white text-[11px] font-bold inline-flex items-center justify-center">3</span>
              <h2 className="text-base font-semibold text-slate-800">Review leads <span className="text-slate-400 font-normal text-sm" data-testid="lead-shown-count">· {shownLeads.length} of {leads.length}</span></h2>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <AutoWaToggle />
                <CleanupMenu onDone={() => refresh().catch(() => {})} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2" data-testid="lead-scope-tabs">
              <span className="text-[10px] uppercase tracking-wide text-slate-400 w-14">Which</span>
              {SCOPES.map(s => <Chip key={s.key} tone="dark" on={scope === s.key} onClick={() => setScope(s.key)} count={scopeCounts[s.key]} testid={`lead-scope-${s.key}`}>{s.label}</Chip>)}
            </div>
            <div className="flex flex-wrap items-center gap-2" data-testid="lead-filter-tabs">
              <span className="text-[10px] uppercase tracking-wide text-slate-400 w-14">Status</span>
              {FILTERS.map(f => <Chip key={f.key} on={filter === f.key} onClick={() => setFilter(f.key)} count={counts[f.key]} testid={`lead-filter-${f.key}`}>{f.label}</Chip>)}
            </div>
            <div className="space-y-2 pt-1">
              {leads.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No leads yet — run Mira above to find your first salons or restaurants.</p>}
              {leads.length > 0 && shownLeads.length === 0 && <p className="text-sm text-slate-400 text-center py-8" data-testid="lead-filter-empty">No leads match this view{scope === "recent" ? " — the latest search found no leads yet" : ""}.</p>}
              {shownLeads.slice(0, 150).map(l => <LeadRow key={l.id} lead={l} onRefresh={() => refresh().catch(() => {})} />)}
              {shownLeads.length > 150 && <p className="text-xs text-slate-400 text-center py-2">Showing the first 150 — narrow the view to see the rest.</p>}
            </div>
          </div>
        </>
      )}

      {section === "autopilot" && (
        <>
          <MiraOutreachCard />
          <CityWatchCard />
        </>
      )}

      {section === "inbox" && (
        <>
          <ReplyInbox />
          <FunnelCards stats={stats} />
          <RoiPanel roi={roi} />
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3" data-testid="lead-tools">
            <h2 className="text-base font-semibold text-slate-800">WhatsApp & follow-up tools</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button data-testid="wa-blast-open-btn" onClick={() => setBlastOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold inline-flex items-center gap-2 hover:bg-emerald-700"
                title="Mira composes a personalized WhatsApp message for every uncontacted lead — you tap through and send">
                <MessageCircle className="w-4 h-4" /> WhatsApp Blast
              </button>
              <button data-testid="lead-hunt-all-btn" disabled={starting || !!activeRun}
                onClick={async () => {
                  try {
                    const { data } = await api.post("/super-admin/mira-leads/hunt-all", null, { params: { vertical, city } });
                    if (!data.started) { toast.info(`Every ${vertical} lead in ${city} already has an email — nothing to hunt 🎉`); return; }
                    toast.success(`Hunting emails for ${data.count} ${vertical} lead${data.count === 1 ? "" : "s"} in ${city} — watch the log in Find & review ✦`);
                    startPolling(); refresh().catch(() => {});
                  } catch (e) { toast.error(e.response?.data?.detail || "Couldn't start the hunt"); }
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:border-fuchsia-400 disabled:opacity-50"
                title="Runs Find-email (website → Instagram → web search) across every lead of the selected business type & city with no inbox">🔍 Hunt emails · {vertical === "restaurant" ? "restaurants" : "salons"} in {city || "…"}</button>
              <button data-testid="lead-followups-btn"
                onClick={async () => {
                  try {
                    const { data } = await api.post("/super-admin/mira-leads/followups/run");
                    toast.success(`Follow-ups: ${data.sent} sent, ${data.due - data.sent} not due yet`);
                    refresh().catch(() => {});
                  } catch (e) { toast.error(e.response?.data?.detail || "Follow-up run failed"); }
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:border-fuchsia-400"
                title="Auto-runs daily at 10 AM — sends a gentle nudge to leads with no reply after 5 days">🔁 Send due follow-ups</button>
            </div>
          </div>
          <WaQuickInvite onLead={refresh} />
        </>
      )}
      {blastOpen && <WaBlastModal vertical={vertical} runId={lastSearch?.id} onClose={() => setBlastOpen(false)} onRefresh={() => refresh().catch(() => {})} />}
    </div>
  );
}
