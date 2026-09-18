import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Copy, Download, QrCode, MessageCircle, CalendarCheck, Users, Hand, Coins, ExternalLink, Zap, Languages, Clock, Tag, Calendar, MapPin, Megaphone, MessageSquare, ListChecks, CheckCircle2 } from "lucide-react";

const CHIPS = [
  { icon: Tag, label: "Check services & prices" }, { icon: Calendar, label: "Book an appointment" }, { icon: Clock, label: "Share timings" },
  { icon: MapPin, label: "Give directions" }, { icon: Megaphone, label: "Share offers & promotions" }, { icon: MessageSquare, label: "Answer any question" },
];
const FEATURES = [[Zap, "Instant Replies"], [CalendarCheck, "Books Appointments"], [Languages, "Multi-Language"], [Clock, "24×7 Availability"]];
const STEPS = [
  [MessageSquare, "Customer Says Hi", "Guest messages on WhatsApp", "bg-emerald-500"], [ListChecks, "Mira Answers", "Shares services, prices, timings & slots", "bg-pink-500"],
  [CalendarCheck, "Books Appointment", "Confirms booking on WhatsApp", "bg-sky-500"], [CheckCircle2, "You Relax", "No manual work needed!", "bg-violet-500"],
];

const Spark = ({ tone }) => (
  <svg viewBox="0 0 60 20" className={`w-14 h-5 ${tone}`} fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 15 Q10 14 15 10 T30 12 T45 5 T59 3" /></svg>
);

const Stat = ({ icon: Icon, label, value, tone, testid, bar }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={testid}>
    <div className={`text-xs font-semibold flex items-center gap-1.5 ${tone}`}><Icon className="w-4 h-4" /> {label}</div>
    <div className="flex items-end justify-between mt-1">
      <div className="text-3xl font-bold text-slate-900 leading-none">{value}</div>
      {bar === undefined ? <Spark tone={tone} /> : <span className="text-xs font-semibold text-slate-500">{bar}%</span>}
    </div>
    {bar !== undefined && <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-pink-400" style={{ width: `${bar}%` }} /></div>}
  </div>
);

export const ReceptionistHero = ({ data, resto, onChange }) => {
  const [busy, setBusy] = useState(false);
  const [showQr, setShowQr] = useState(true);
  const [qrUrl, setQrUrl] = useState("");
  const s = data.stats || {};
  const own = data.own_number;
  const live = data.enabled && data.feature_on && data.channel_ready && (own || data.credits > 0);
  const number = data.display_number || (data.platform_number ? `+${data.platform_number}` : "—");

  const toggle = async () => {
    setBusy(true);
    try {
      const r = await api.put("/sms-packs/wa-auto-reply", { enabled: !data.enabled });
      toast.success(r.data.wa_auto_reply ? "Mira is answering your WhatsApp" : "Mira paused — messages will wait for your team");
      onChange();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't update"); }
    finally { setBusy(false); }
  };
  const copy = async () => { await navigator.clipboard.writeText(data.invite_link); toast.success("WhatsApp link copied"); };
  useEffect(() => {
    if (!showQr || qrUrl) return;
    api.get("/whatsapp-link/receptionist/qr.png", { responseType: "blob" }).then(r => setQrUrl(URL.createObjectURL(r.data))).catch(() => toast.error("Couldn't load QR"));
  }, [showQr, qrUrl]);

  return (
    <div className="space-y-4" data-testid="receptionist-hero">
      <div className="relative rounded-3xl bg-gradient-to-br from-[#fff7fb] via-white to-[#f0fbf6] border border-slate-100 overflow-hidden">
        <div className="grid lg:grid-cols-[1fr_260px_auto] gap-4 items-end p-6 lg:pb-0">
          <div className="pb-6">
            <span className="inline-block text-[11px] font-bold tracking-[0.2em] text-emerald-700 bg-emerald-50 rounded-md px-2.5 py-1">WHATSAPP • 24×7 AI RECEPTIONIST</span>
            <h1 className="mt-3 font-playfair text-4xl sm:text-5xl font-bold tracking-tight"><span className="text-emerald-600">Mira</span> <span className="text-slate-900">Receptionist</span></h1>
            <p className="text-lg text-slate-700 mt-1">Your AI receptionist on WhatsApp</p>
            <p className="text-sm text-slate-500 mt-2 max-w-xl">Guests message your WhatsApp. Mira answers instantly — in English, Hindi, Kannada or Hinglish — shares your {resto ? "menu" : "services"}, prices, timings and real-time availability, and {resto ? "reserves the table" : "books the appointment"} herself. No staff needed.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {FEATURES.map(([Icon, l]) => <span key={l} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-full px-3 py-1.5 shadow-sm"><Icon className="w-3.5 h-3.5 text-emerald-600" /> {l}</span>)}
            </div>
          </div>
          <div className="hidden lg:flex items-end justify-center relative h-[310px] self-end">
            <div className="absolute inset-x-4 top-6 bottom-0 rounded-t-full bg-gradient-to-b from-pink-100/70 to-emerald-50/40" />
            <img src="/assets/mira/mira-receptionist.png" alt="Mira" className="relative h-[290px] w-auto drop-shadow-xl" data-testid="receptionist-avatar" />
            <div className="absolute -left-28 top-10 w-40 font-playfair italic text-slate-700 text-sm leading-snug rotate-[-8deg] text-right">“Hi! I'm Mira<br />How can I help you<br />today?” ♡</div>
          </div>
          <div className="hidden lg:flex flex-col gap-2 pb-6 pl-6">
            {CHIPS.map(({ icon: Icon, label }) => <span key={label} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-full px-3 py-2 shadow-sm w-max"><Icon className="w-3.5 h-3.5 text-emerald-600" /> {label}</span>)}
          </div>
        </div>
      </div>

      <div className="rounded-3xl bg-[#0b3d2e] text-white p-5 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <span className={`inline-flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-full ${live ? "bg-emerald-500 text-[#06281d]" : "bg-amber-400 text-amber-950"}`} data-testid="receptionist-live-badge">
            <MessageCircle className="w-4 h-4" /> {live ? "Mira is live on WhatsApp" : !data.enabled ? "Paused by you" : !own && data.credits <= 0 ? "Needs WhatsApp credits" : "Channel not ready"}
            <span className={`w-2 h-2 rounded-full ${live ? "bg-white animate-pulse" : "bg-amber-900/60"}`} />
          </span>
          <span className="text-sm text-emerald-100">Number: <b className="text-white">{number}</b>{own && <span className="ml-2 text-[11px] bg-white/15 rounded-full px-2 py-0.5">your own number</span>}</span>
          <div className="md:ml-auto flex items-center gap-3 text-xs text-emerald-100">Share your WhatsApp link
            <span className="text-emerald-300 text-xl leading-none">↷</span>
          </div>
          <div className="flex items-center gap-2 md:pl-3">
            <span className="text-xs font-semibold text-emerald-100">Active</span>
            <button onClick={toggle} disabled={busy} className={`relative w-14 h-8 rounded-full transition-colors ${data.enabled ? "bg-emerald-400" : "bg-slate-500"}`} aria-pressed={data.enabled} data-testid="receptionist-toggle">
              <span className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-transform ${data.enabled ? "translate-x-7" : "translate-x-1"}`} />
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-col sm:flex-row items-stretch gap-2">
          <code className="flex-1 min-w-0 truncate rounded-xl bg-white text-slate-800 px-4 py-2.5 text-xs" data-testid="receptionist-invite-link">{data.invite_link}</code>
          <button onClick={copy} className="px-4 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-[#06281d] text-xs font-bold inline-flex items-center gap-1.5" data-testid="receptionist-copy-link"><Copy className="w-4 h-4" /> Copy Link</button>
          <a href={data.invite_link} target="_blank" rel="noreferrer" className="px-4 py-2.5 rounded-xl border border-white/30 hover:bg-white/10 text-xs font-semibold inline-flex items-center gap-1.5" data-testid="receptionist-open-link"><ExternalLink className="w-4 h-4" /> Try Link</a>
          <button onClick={() => setShowQr(v => !v)} className="px-4 py-2.5 rounded-xl border border-white/30 hover:bg-white/10 text-xs font-semibold inline-flex items-center gap-1.5" data-testid="receptionist-qr-btn"><QrCode className="w-4 h-4" /> QR Code</button>
        </div>
        <p className="text-[11px] text-emerald-100/80 mt-2">💡 {own ? "Guests message your own WhatsApp number — Mira answers from it, and you keep using the WhatsApp Business app." : <>The link pre-fills “Hi {"{"}your name{"}"}! #{data.slug}” so every guest lands with <b>your</b> {resto ? "restaurant" : "salon"}, even on Miracurl's shared number.</>}</p>
      </div>

      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-4">
        {showQr && (
          <div className="rounded-3xl border border-slate-200 bg-white p-5 flex items-center gap-5 shadow-sm" data-testid="receptionist-qr-panel">
            {qrUrl ? <img src={qrUrl} alt="WhatsApp QR" className="w-32 h-32 rounded-xl border border-slate-200 shrink-0" data-testid="receptionist-qr-img" /> : <div className="w-32 h-32 rounded-xl bg-slate-100 animate-pulse shrink-0" />}
            <div className="text-sm text-slate-600 min-w-0">
              <div className="font-bold text-slate-900 text-base">Scan to chat with Mira</div>
              <p className="text-xs mt-1">Print it on your counter card, table tents and bills. Guests scan, say hi, and Mira takes it from there.</p>
              {qrUrl && <a href={qrUrl} download={`${data.slug}-whatsapp-qr.png`} className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 text-slate-800 text-xs font-bold hover:bg-slate-50" data-testid="receptionist-qr-download"><Download className="w-3.5 h-3.5" /> Download QR Code</a>}
            </div>
          </div>
        )}
        <div className="rounded-3xl border border-violet-100 bg-gradient-to-br from-violet-50/70 to-white p-5" data-testid="receptionist-how-it-works">
          <div className="font-bold text-slate-900">How it works?</div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {STEPS.map(([Icon, t, d, tone], i) => (
              <div key={t} className="relative rounded-2xl bg-white/80 border border-white p-3 text-center">
                <span className={`absolute -top-2 left-3 w-6 h-6 rounded-full ${tone} text-white text-[11px] font-bold flex items-center justify-center`}>{i + 1}</span>
                <div className="mx-auto w-11 h-11 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center"><Icon className="w-5 h-5" /></div>
                <div className="text-xs font-bold text-slate-900 mt-2">{t}</div>
                <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat icon={MessageCircle} label="Messages (30 Days)" value={s.messages ?? 0} tone="text-emerald-600" testid="stat-messages" />
        <Stat icon={Users} label="Guests" value={s.guests ?? 0} tone="text-sky-600" testid="stat-guests" />
        <Stat icon={CalendarCheck} label={resto ? "Tables Reserved" : "Bookings Made"} value={s.booked ?? 0} tone="text-violet-600" testid="stat-booked" />
        <Stat icon={Hand} label="Handed to Team" value={s.handoffs ?? 0} tone="text-amber-600" testid="stat-handoffs" />
        <Stat icon={Coins} label={own ? "Credits (not needed)" : "Credits Left"} value={own ? "∞" : data.credits} tone="text-rose-600" testid="stat-credits" bar={own ? undefined : Math.min(100, Math.round((data.credits / Math.max(data.credits, 100)) * 100))} />
      </div>
    </div>
  );
};
