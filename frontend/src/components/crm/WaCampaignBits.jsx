import api from "@/lib/api";
import { Phone, Video, MoreVertical, ChevronLeft, CalendarCheck, Send } from "lucide-react";

export function Step({ n, title, right, children }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm" data-testid={`wa-step-${n}`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-full bg-rose-600 text-white text-xs font-bold flex items-center justify-center">{n}</span>
          <h3 className="font-semibold text-slate-800">{title}</h3>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

export function PhonePreview({ salon, text, image, firstName, testPhone, setTestPhone, onTest, busy, disabled }) {
  const body = (text || "Your message preview appears here…").replace(/\{name\}/g, firstName);
  const time = new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return (
    <div className="space-y-3" data-testid="wa-preview">
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between border-b border-slate-100">
          <div className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Phone className="w-4 h-4 text-slate-400" /> Preview (Customer View)</div>
        </div>
        <div className="bg-[#075E54] text-white px-3 py-2.5 flex items-center gap-2">
          <ChevronLeft className="w-4 h-4" />
          <div className="w-8 h-8 rounded-full bg-rose-200 text-rose-800 text-xs font-bold flex items-center justify-center">{(salon || "S")[0]}</div>
          <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{salon} <span className="text-emerald-300">●</span></div><div className="text-[10px] text-white/70">Online</div></div>
          <Video className="w-4 h-4" /><Phone className="w-4 h-4" /><MoreVertical className="w-4 h-4" />
        </div>
        <div className="bg-[#ECE5DD] p-3 min-h-[320px]" style={{ backgroundImage: "radial-gradient(#d9d2c5 0.6px, transparent 0.6px)", backgroundSize: "12px 12px" }}>
          <div className="bg-white rounded-xl rounded-tl-sm shadow-sm p-1.5 max-w-[95%]">
            {image && <img src={image.url} alt="" className="w-full rounded-lg max-h-56 object-cover mb-1.5" data-testid="wa-preview-image" />}
            <div className="px-1.5 pb-1 text-[13px] text-slate-800 whitespace-pre-wrap leading-relaxed" data-testid="wa-preview-text">{body}</div>
            <div className="mt-1 border-t border-slate-100 pt-1.5 text-center text-sky-600 text-sm font-medium inline-flex w-full justify-center items-center gap-1.5"><CalendarCheck className="w-4 h-4" /> Book Now</div>
            <div className="text-right text-[10px] text-slate-400 pr-1.5">{time}</div>
          </div>
        </div>
      </div>
      <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
        <div className="text-xs font-semibold text-slate-700 mb-2">Test on my number</div>
        <div className="flex gap-2">
          <input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="91XXXXXXXXXX" data-testid="wa-test-phone" className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800" />
          <button onClick={onTest} disabled={disabled || busy || testPhone.replace(/\D/g, "").length < 10} data-testid="wa-test-send" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 text-white text-xs font-semibold disabled:opacity-50"><Send className="w-3.5 h-3.5" /> {busy ? "…" : "Send test"}</button>
        </div>
      </div>
      <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4 text-center font-playfair italic text-rose-600">Happy Clients<br />Beautiful Journeys ♡</div>
    </div>
  );
}

const TONE = { done: "bg-emerald-100 text-emerald-700", running: "bg-sky-100 text-sky-700", queued: "bg-sky-100 text-sky-700", capped: "bg-amber-100 text-amber-700", paused: "bg-slate-100 text-slate-600", cancelled: "bg-slate-100 text-slate-500" };

export function CampaignHistory({ camps, onChange }) {
  const rows = camps?.campaigns || [];
  if (!rows.length) return <div className="rounded-2xl bg-white border border-slate-200 p-5 text-sm text-slate-500" data-testid="wa-history-empty">No campaigns yet — your first one will show up here.</div>;
  const act = (id, a) => api.post(`/whatsapp-link/campaigns/${id}/${a}`).then(onChange).catch(() => {});
  return (
    <ul className="rounded-2xl bg-white border border-slate-200 divide-y divide-slate-100 shadow-sm" data-testid="wa-history">
      {rows.map(c => (
        <li key={c.id} className="px-4 py-3 flex items-center gap-3 text-sm" data-testid={`wa-history-${c.id}`}>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${TONE[c.status] || TONE.paused}`}>{c.status === "capped" ? "daily limit" : c.status === "queued" && c.scheduled_at && new Date(c.scheduled_at) > new Date() ? "scheduled" : c.status}</span>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-slate-800 truncate">{c.name}</div>
            <div className="text-[11px] text-slate-400">{new Date(c.scheduled_at || c.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}{c.failed ? ` · ${c.failed} failed` : ""}</div>
          </div>
          <span className="text-xs text-slate-600 shrink-0 text-right" data-testid={`wa-history-results-${c.id}`}>
            {c.sent}/{c.total} sent
            {c.sent > 0 && <span className="block text-[11px] text-slate-400"><span className="text-sky-600">✓✓ {c.read ?? 0} read</span> · {c.delivered ?? 0} delivered · <span className={c.booked ? "text-emerald-600 font-semibold" : ""}>{c.booked ?? 0} booked</span></span>}
          </span>
          {["queued", "running", "capped"].includes(c.status) && <button onClick={() => act(c.id, "pause")} className="text-xs text-slate-500 hover:text-slate-800">Pause</button>}
          {c.status === "paused" && <button onClick={() => act(c.id, "resume")} className="text-xs text-emerald-700 font-semibold">Resume</button>}
          {["queued", "paused", "capped"].includes(c.status) && <button onClick={() => act(c.id, "cancel")} className="text-xs text-rose-600">Cancel</button>}
        </li>
      ))}
    </ul>
  );
}
