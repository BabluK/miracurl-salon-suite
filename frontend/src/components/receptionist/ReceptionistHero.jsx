import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Copy, Download, QrCode, MessageCircle, CalendarCheck, Users, Hand, Coins, ExternalLink } from "lucide-react";

const Stat = ({ icon: Icon, label, value, tone, testid }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3" data-testid={testid}>
    <div className={`text-[10px] uppercase tracking-widest font-semibold flex items-center gap-1 ${tone}`}><Icon className="w-3.5 h-3.5" /> {label}</div>
    <div className="text-2xl font-bold text-slate-900 mt-0.5">{value}</div>
  </div>
);

export const ReceptionistHero = ({ data, resto, onChange }) => {
  const [busy, setBusy] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const s = data.stats || {};
  const live = data.enabled && data.feature_on && data.channel_ready && data.credits > 0;

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
  const [qrUrl, setQrUrl] = useState("");
  useEffect(() => {
    if (!showQr || qrUrl) return;
    api.get("/whatsapp-link/receptionist/qr.png", { responseType: "blob" }).then(r => setQrUrl(URL.createObjectURL(r.data))).catch(() => toast.error("Couldn't load QR"));
  }, [showQr, qrUrl]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden" data-testid="receptionist-hero">
      <div className="p-5 bg-[#0b1f17] text-white flex flex-col lg:flex-row lg:items-center gap-5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full ${live ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40" : "bg-amber-500/20 text-amber-200 border border-amber-400/40"}`} data-testid="receptionist-live-badge">
              <span className={`w-2 h-2 rounded-full ${live ? "bg-emerald-400 animate-pulse" : "bg-amber-300"}`} />
              {live ? "Mira is live on WhatsApp" : !data.enabled ? "Paused by you" : data.credits <= 0 ? "Needs WhatsApp credits" : "Channel not ready"}
            </span>
            <span className="text-xs text-emerald-100/70">Number: +{data.platform_number || "—"}</span>
          </div>
          <div className="mt-4 text-[11px] uppercase tracking-widest text-emerald-200/70 font-semibold">Your WhatsApp link — share on Instagram, Google, bills, posters</div>
          <div className="mt-1.5 flex items-stretch gap-2">
            <code className="flex-1 min-w-0 truncate rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-xs text-emerald-50" data-testid="receptionist-invite-link">{data.invite_link}</code>
            <button onClick={copy} className="px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#0b1f17] text-xs font-bold inline-flex items-center gap-1" data-testid="receptionist-copy-link"><Copy className="w-3.5 h-3.5" /> Copy</button>
            <a href={data.invite_link} target="_blank" rel="noreferrer" className="px-3 rounded-lg border border-white/20 hover:bg-white/10 text-xs font-semibold inline-flex items-center gap-1" data-testid="receptionist-open-link"><ExternalLink className="w-3.5 h-3.5" /> Try</a>
          </div>
          <p className="text-[11px] text-emerald-100/60 mt-2">The link pre-fills “Hi {"{"}your name{"}"}! #{data.slug}” so every guest lands with <b>your</b> {resto ? "restaurant" : "salon"}, even on Miracurl's shared number.</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={() => setShowQr(v => !v)} className="px-3 py-2 rounded-lg border border-white/20 hover:bg-white/10 text-xs font-semibold inline-flex items-center gap-1.5" data-testid="receptionist-qr-btn"><QrCode className="w-4 h-4" /> QR</button>
          <button onClick={toggle} disabled={busy} className={`relative w-14 h-8 rounded-full transition-colors ${data.enabled ? "bg-emerald-500" : "bg-slate-500"}`} aria-pressed={data.enabled} data-testid="receptionist-toggle">
            <span className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-transform ${data.enabled ? "translate-x-7" : "translate-x-1"}`} />
          </button>
        </div>
      </div>
      {showQr && (
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row items-center gap-4" data-testid="receptionist-qr-panel">
          {qrUrl ? <img src={qrUrl} alt="WhatsApp QR" className="w-40 h-40 rounded-xl border border-slate-200" data-testid="receptionist-qr-img" /> : <div className="w-40 h-40 rounded-xl bg-slate-100 animate-pulse" />}
          <div className="text-sm text-slate-600">
            <div className="font-semibold text-slate-800">Scan → chat with Mira</div>
            <p className="text-xs mt-1">Print it on your counter card, table tents and bills. Guests scan, say hi, and Mira takes it from there.</p>
            {qrUrl && <a href={qrUrl} download={`${data.slug}-whatsapp-qr.png`} className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold" data-testid="receptionist-qr-download"><Download className="w-3.5 h-3.5" /> Download QR</a>}
          </div>
        </div>
      )}
      <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat icon={MessageCircle} label="Messages · 30d" value={s.messages ?? 0} tone="text-emerald-700" testid="stat-messages" />
        <Stat icon={Users} label="Guests" value={s.guests ?? 0} tone="text-sky-700" testid="stat-guests" />
        <Stat icon={CalendarCheck} label={resto ? "Tables reserved" : "Bookings made"} value={s.booked ?? 0} tone="text-violet-700" testid="stat-booked" />
        <Stat icon={Hand} label="Handed to team" value={s.handoffs ?? 0} tone="text-amber-700" testid="stat-handoffs" />
        <Stat icon={Coins} label="Credits left" value={data.credits} tone="text-rose-700" testid="stat-credits" />
      </div>
    </div>
  );
};
