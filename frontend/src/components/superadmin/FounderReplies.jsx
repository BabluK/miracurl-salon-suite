import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Flame, Mail, Sparkles, Copy, ExternalLink, Loader2, ChevronDown, ChevronUp } from "lucide-react";

const fmt = (iso) => iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "";

function SetupForm({ r, onDone }) {
  const [form, setForm] = useState({ salon_name: r.salon_name || "", owner_name: r.name || "", city: "", phone: "", business_type: "salon" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const submit = async () => {
    if (form.salon_name.trim().length < 2 || form.owner_name.trim().length < 2) return toast.error("Salon name and owner name are required");
    setBusy(true);
    try {
      const { data } = await api.post(`/super-admin/founder-replies/${r.id}/setup`, form);
      toast.success(`✦ ${form.salon_name} is live with 6 months free — credentials emailed to ${r.email}`);
      onDone(data);
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't set up the salon"); }
    setBusy(false);
  };
  const cls = "border border-white/10 rounded-lg px-2.5 py-1.5 text-xs !bg-white/5 !text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#d4af37]/50";
  return (
    <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2" data-testid={`founder-setup-form-${r.id}`}>
      <input value={form.salon_name} onChange={set("salon_name")} placeholder="Salon name *" className={cls} data-testid="founder-setup-salon" />
      <input value={form.owner_name} onChange={set("owner_name")} placeholder="Owner name *" className={cls} data-testid="founder-setup-owner" />
      <input value={form.city} onChange={set("city")} placeholder="City / country" className={cls} data-testid="founder-setup-city" />
      <input value={form.phone} onChange={set("phone")} placeholder="Phone (optional)" className={cls} data-testid="founder-setup-phone" />
      <div className="flex gap-1">
        <select value={form.business_type} onChange={set("business_type")} className={cls + " flex-1"} data-testid="founder-setup-type">
          <option value="salon">Salon</option><option value="restaurant">Restaurant</option>
        </select>
        <button onClick={submit} disabled={busy} data-testid="founder-setup-submit"
          className="px-3 py-1.5 rounded-lg bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] text-xs font-bold whitespace-nowrap hover:brightness-110 disabled:opacity-50 inline-flex items-center gap-1">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Go live
        </button>
      </div>
    </div>
  );
}

function ReplyCard({ r, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [setup, setSetup] = useState(false);
  const [result, setResult] = useState(null);
  const live = r.tenant || result;
  const copy = (t) => { navigator.clipboard?.writeText(t); toast.success("Copied"); };
  return (
    <div className="rounded-2xl border border-[#d4af37]/40 bg-gradient-to-br from-[#d4af37]/10 to-transparent p-3.5" data-testid={`founder-reply-${r.id}`}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="w-9 h-9 rounded-full bg-[#15151b] border border-[#d4af37]/60 text-[#d4af37] font-playfair flex items-center justify-center text-sm shrink-0">
          {(r.name || r.email)[0].toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-slate-100 truncate">{r.name || r.email}</span>
            {r.salon_name && <span className="text-xs text-[#d4af37]">{r.salon_name}</span>}
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 font-bold inline-flex items-center gap-1"><Flame className="w-3 h-3" /> HOT · replied {fmt(r.last_reply_at || r.replied_at || r.first_sent_at)}</span>
            {live && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold" data-testid={`founder-reply-live-${r.id}`}>✦ Live · 6 months free · {live.slug}</span>}
            {live?.first_login_at && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 font-semibold">Logged in ✓</span>}
            {live?.nudge_sent_at && !live?.first_login_at && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold" title={`Bablu's login nudge sent ${fmt(live.nudge_sent_at)}`}>Nudged {fmt(live.nudge_sent_at)}</span>}
          </div>
          <div className="text-xs text-slate-400 truncate mt-0.5">{r.email}{r.reply_subject ? ` · ${r.reply_subject}` : ""}</div>
          {r.last_reply_text && (
            <button onClick={() => setOpen(o => !o)} className="mt-1.5 text-left text-xs text-slate-300 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 w-full" data-testid={`founder-reply-toggle-${r.id}`}>
              <span className={open ? "whitespace-pre-wrap" : "line-clamp-2"}>{r.last_reply_text}</span>
              <span className="text-[10px] text-slate-500 inline-flex items-center gap-0.5 mt-1">{open ? <><ChevronUp className="w-3 h-3" /> less</> : <><ChevronDown className="w-3 h-3" /> read full reply</>}</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <a href={`mailto:${r.email}?subject=${encodeURIComponent(`Re: ${r.reply_subject || "A personal invitation from Miracurl's founder"}`)}`}
            className="px-2.5 py-1.5 rounded-full border border-white/15 text-slate-300 text-[11px] font-semibold inline-flex items-center gap-1 hover:border-[#d4af37]/60 hover:text-[#d4af37]" data-testid={`founder-reply-mail-${r.id}`}>
            <Mail className="w-3 h-3" /> Reply
          </a>
          {!live && (
            <button onClick={() => setSetup(s => !s)} data-testid={`founder-reply-setup-btn-${r.id}`}
              className="px-3 py-1.5 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] text-[11px] font-bold inline-flex items-center gap-1 hover:brightness-110">
              <Sparkles className="w-3 h-3" /> {setup ? "Close" : "Set up their 6 months"}
            </button>
          )}
        </div>
      </div>
      {setup && !live && <SetupForm r={r} onDone={(d) => { setResult(d); setSetup(false); onRefresh(); }} />}
      {result && (
        <div className="mt-3 rounded-xl bg-emerald-500/10 border border-emerald-400/30 p-3 text-xs text-emerald-100 space-y-1" data-testid={`founder-setup-result-${r.id}`}>
          <div>Salon <b>{result.slug}</b> is live · trial until <b>{result.trial_end_date}</b> · welcome email {result.email_status?.sent ? "sent ✓" : "not sent — share the password below"}.</div>
          {result.temp_password && (
            <div className="flex items-center gap-2 flex-wrap">One-time password: <code className="px-1.5 py-0.5 rounded bg-black/40 text-[#d4af37]">{result.temp_password}</code>
              <button onClick={() => copy(result.temp_password)} className="inline-flex items-center gap-1 text-emerald-300 hover:text-white"><Copy className="w-3 h-3" /> copy</button>
              <a href={`/book/${result.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-300 hover:text-white"><ExternalLink className="w-3 h-3" /> booking page</a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FounderReplies() {
  const [data, setData] = useState(null);
  const [nudging, setNudging] = useState(false);
  const load = () => api.get("/super-admin/founder-replies").then(r => setData(r.data)).catch(() => setData({ count: 0, replies: [] }));
  useEffect(() => { load(); }, []);
  const runNudges = async () => {
    setNudging(true);
    try {
      const { data: d } = await api.post("/super-admin/founder-replies/nudges/run");
      toast.success(`Setup nudges: ${d.sent} sent${d.failed ? ` · ${d.failed} failed` : ""}${d.already_logged_in ? ` · ${d.already_logged_in} already logged in` : ""}`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't run nudges"); }
    setNudging(false);
  };
  if (!data) return null;
  return (
    <div className="border-t border-white/10 pt-4 space-y-2" data-testid="founder-reply-inbox">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-[#d4af37]/80 uppercase flex items-center gap-1.5">
          <Flame className="w-3.5 h-3.5 text-orange-400" /> Founder Reply Inbox
          <span className={`px-1.5 py-0.5 rounded-full font-bold ${data.count ? "bg-orange-500/20 text-orange-300" : "bg-white/10 text-slate-400"}`} data-testid="founder-reply-count">{data.count}</span>
        </p>
        <button onClick={runNudges} disabled={nudging} data-testid="founder-nudges-run-btn"
          title="Owners who got their 6 months but haven't logged in for 3 days get one note from Bablu (also runs daily)"
          className="px-3 py-1.5 rounded-full bg-[#d4af37]/15 border border-[#d4af37]/40 text-[#d4af37] text-[11px] font-semibold inline-flex items-center gap-1.5 hover:bg-[#d4af37]/25 disabled:opacity-50">
          {nudging ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />} {nudging ? "Sending…" : "Send setup nudges now"}
        </button>
      </div>
      <p className="text-[10px] text-slate-500">Replies to Bablu's letter land here automatically (Resend inbound) — or tick ✓ on an invitee above. One tap sets up their salon with 6 months free; if they don't log in within 3 days, Bablu sends one gentle nudge automatically.</p>
      {data.replies.length === 0 && <p className="text-xs text-slate-500 italic px-1">No replies yet — when an owner writes back to the founder letter, their hot-lead card appears here ✦</p>}
      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {data.replies.map(r => <ReplyCard key={r.id} r={r} onRefresh={load} />)}
      </div>
    </div>
  );
}
