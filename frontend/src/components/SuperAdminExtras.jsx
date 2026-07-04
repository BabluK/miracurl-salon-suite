// Super-Admin console extras: profile card, tenant health badge, AI Insights panel.
import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Sparkles, Pencil, X, Camera, Send, Loader2, Phone, Briefcase, HeartPulse, MessageCircle, MailOpen } from "lucide-react";

// ---------- Tenant subscription health ----------
export function healthInfo(t) {
  if (t.status === "cancelled") return { label: "Cancelled", cls: "bg-slate-100 text-slate-500 border-slate-200", days: null };
  if (t.status === "suspended") return { label: "Suspended", cls: "bg-red-100 text-red-700 border-red-300", days: null };
  if (!t.subscription_end_date) {
    if (t.status === "trial") return { label: "Trial · no plan", cls: "bg-slate-100 text-slate-500 border-slate-200", days: null };
    return { label: "No plan", cls: "bg-slate-100 text-slate-500 border-slate-200", days: null };
  }
  const days = Math.ceil((new Date(t.subscription_end_date) - new Date()) / 86400000);
  if (days < 0) return { label: `Expired ${-days}d ago`, cls: "bg-red-100 text-red-700 border-red-300", days };
  if (days <= 7) return { label: `${days}d left`, cls: "bg-red-100 text-red-700 border-red-300", days };
  if (days <= 30) return { label: `${days}d left`, cls: "bg-amber-100 text-amber-700 border-amber-300", days };
  return { label: `${days}d left`, cls: "bg-emerald-100 text-emerald-700 border-emerald-300", days };
}

export function HealthBadge({ t }) {
  const h = healthInfo(t);
  return (
    <span data-testid={`health-badge-${t.id}`} title={t.subscription_end_date ? `Subscription ends ${t.subscription_end_date}` : "No paid subscription"}
      className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border ${h.cls}`}>
      <HeartPulse className="w-3 h-3" /> {h.label}
    </span>
  );
}

// WhatsApp renewal nudge → owner's PERSONAL phone, shown when subscription/trial is expiring
export function RenewalNudge({ t }) {
  const h = healthInfo(t);
  const phone = String(t.owner_phone || "").replace(/\D/g, "");
  const expiring = (h.days !== null && h.days <= 30) || t.status === "trial";
  if (!phone || !expiring) return null;
  const wa = phone.length === 10 ? `91${phone}` : phone;
  const when = t.subscription_end_date || (t.trial_ends_at || "").slice(0, 10);
  const msg = `Hello! 💜 A gentle reminder from Miracurl — the subscription for *${t.name}* ${h.days !== null && h.days < 0 ? "has expired" : `ends on ${when}`}. Kindly renew so your salon services continue without any interruption. Need help or extra time? Just reply here — we're happy to assist! — Miracurl team`;
  return (
    <a data-testid={`renew-nudge-${t.id}`} href={`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`}
      target="_blank" rel="noreferrer" title="Send renewal reminder on WhatsApp (owner's personal phone)"
      className="inline-flex ml-1.5 p-1 rounded-full bg-green-50 border border-green-200 text-green-600 hover:bg-green-100 align-middle transition">
      <MessageCircle className="w-3.5 h-3.5" />
    </a>
  );
}

// ---------- HQ Inbox — messages/requests from salon owners (Contact HQ) ----------
export function HqInbox({ onUnreadChange }) {
  const [items, setItems] = useState(null);
  const load = useCallback(async () => {
    const { data } = await api.get("/super-admin/hq-messages");
    setItems(data.items);
    onUnreadChange?.(data.unread || 0);
  }, [onUnreadChange]);
  useEffect(() => { load(); }, [load]);

  async function markRead(m) {
    await api.patch(`/super-admin/hq-messages/${m.id}/read`);
    await load();
  }

  if (!items) return <div className="text-slate-500 p-4">Loading inbox…</div>;
  return (
    <div className="card-light" data-testid="hq-inbox">
      <div className="flex items-center gap-2 mb-1">
        <MailOpen className="w-5 h-5 text-violet-500" />
        <h3 className="font-playfair text-xl text-slate-800">HQ Inbox</h3>
      </div>
      <p className="text-xs text-slate-500 mb-4">Messages, modification &amp; deletion requests from salon owners (sent via their "Contact Miracurl HQ" section). Also delivered to your email.</p>
      {items.length === 0 && <div className="text-sm text-slate-400 py-8 text-center border border-dashed border-slate-200 rounded-xl">No messages yet.</div>}
      <div className="space-y-3">
        {items.map(m => (
          <div key={m.id} data-testid={`hq-msg-${m.id}`} className={`rounded-xl border p-4 ${m.read ? "border-slate-200 bg-white" : "border-violet-200 bg-violet-50/60"}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800 flex items-center gap-2 flex-wrap">
                  {!m.read && <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />}
                  {m.subject}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  <b className="text-slate-600">{m.tenant_name}</b> · {m.from_email} · {new Date(m.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
              {!m.read && (
                <button data-testid={`hq-mark-read-${m.id}`} onClick={() => markRead(m)}
                  className="text-xs px-3 py-1.5 rounded-full bg-violet-100 border border-violet-200 text-violet-700 hover:bg-violet-200 transition shrink-0">
                  Mark read
                </button>
              )}
            </div>
            <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{m.message}</p>
            {(m.attachments || []).length > 0 && (
              <div className="text-[11px] text-slate-500 mt-2">📎 {m.attachments.join(", ")} <span className="text-slate-400">(attached in the email copy)</span></div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Super-admin profile card ----------
export function SuperProfileCard() {
  const { user, refresh } = useAuth();
  const [edit, setEdit] = useState(false);
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0f1420] via-[#141c30] to-[#0d1220] text-white p-5 sm:p-6" data-testid="super-profile-card">
      {[["6%", "20%", "0s"], ["40%", "75%", "0.8s"], ["75%", "15%", "1.5s"], ["92%", "60%", "0.4s"]].map(([l, t, d]) => (
        <Sparkles key={`${l}-${t}`} className="sparkle-twinkle absolute w-3.5 h-3.5 text-sky-300/70 pointer-events-none" style={{ left: l, top: t, animationDelay: d }} />
      ))}
      <div className="relative flex items-center gap-4 sm:gap-5">
        <img
          src={user?.photo_url || "https://ui-avatars.com/api/?background=0ea5e9&color=fff&size=160&name=" + encodeURIComponent(user?.name || "SA")}
          alt={user?.name} data-testid="super-profile-photo"
          className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-sky-400/60 shadow-[0_0_30px_rgba(56,189,248,0.25)]"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-playfair text-xl sm:text-2xl truncate" data-testid="super-profile-name">{user?.name || "Super Admin"}</h2>
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold bg-gradient-to-r from-fuchsia-500/20 to-sky-500/20 border border-sky-400/40 text-sky-300 px-2.5 py-1 rounded-full" data-testid="super-ai-badge">
              <Sparkles className="w-3 h-3" /> AI Powered
            </span>
          </div>
          <div className="flex items-center gap-4 flex-wrap mt-1.5 text-xs text-slate-300">
            {user?.occupation && <span className="flex items-center gap-1.5" data-testid="super-profile-occupation"><Briefcase className="w-3.5 h-3.5 text-sky-400" /> {user.occupation}</span>}
            {user?.phone && <span className="flex items-center gap-1.5" data-testid="super-profile-phone"><Phone className="w-3.5 h-3.5 text-sky-400" /> {user.phone}</span>}
            <span className="text-slate-400">{user?.email}</span>
          </div>
        </div>
        <button data-testid="super-profile-edit-btn" onClick={() => setEdit(true)}
          className="shrink-0 p-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 transition" title="Edit profile">
          <Pencil className="w-4 h-4" />
        </button>
      </div>
      {edit && <ProfileEditModal user={user} onClose={() => setEdit(false)} onSaved={async () => { setEdit(false); await refresh(); toast.success("Profile updated"); }} />}
    </div>
  );
}

function ProfileEditModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: user?.name || "", phone: user?.phone || "",
    occupation: user?.occupation || "", photo_url: user?.photo_url || "",
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  async function uploadPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/super-admin/uploads/photo", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm(f => ({ ...f, photo_url: data.url }));
    } catch (err) {
      toast.error(err.response?.data?.detail || "Photo upload failed");
    } finally { setUploading(false); }
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put("/super-admin/profile", form);
      onSaved();
    } catch (err) {
      toast.error(typeof err.response?.data?.detail === "string" ? err.response.data.detail : "Couldn't save profile");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3" onClick={onClose}>
      <form onSubmit={save} className="card-light w-full max-w-md" onClick={e => e.stopPropagation()} data-testid="super-profile-modal">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-playfair text-xl text-slate-800">Edit Profile</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex justify-center mb-4">
          <button type="button" onClick={() => fileRef.current?.click()} className="relative group" data-testid="super-photo-upload-btn">
            <img
              src={form.photo_url || "https://ui-avatars.com/api/?background=0ea5e9&color=fff&size=160&name=" + encodeURIComponent(form.name || "SA")}
              alt="profile" className="w-24 h-24 rounded-2xl object-cover border-2 border-sky-300"
            />
            <span className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
              {uploading ? <Loader2 className="w-6 h-6 text-white animate-spin" /> : <Camera className="w-6 h-6 text-white" />}
            </span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadPhoto} data-testid="super-photo-file-input" />
        </div>
        <div className="space-y-3">
          <div><label className="label-light block mb-1">Full name *</label>
            <input data-testid="super-profile-name-input" required minLength={2} className="input-light w-full" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label-light block mb-1">Phone</label>
              <input data-testid="super-profile-phone-input" className="input-light w-full" placeholder="+91 98…" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><label className="label-light block mb-1">Occupation</label>
              <input data-testid="super-profile-occupation-input" className="input-light w-full" placeholder="Founder & CEO" value={form.occupation} onChange={e => setForm(f => ({ ...f, occupation: e.target.value }))} /></div>
          </div>
          <button data-testid="super-profile-save-btn" disabled={busy || uploading} className="btn-blue w-full">{busy ? "Saving…" : "Save Profile"}</button>
        </div>
      </form>
    </div>
  );
}

// ---------- AI Insights (HQ Analyst chat) ----------
const QUICK_QUESTIONS = [
  "How much collection this month in each salon?",
  "How much was collected in AECS Layout?",
  "Which salon earned the most all-time?",
  "Which subscriptions are expiring soon?",
];

function renderBold(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={`${i}-${part}`}>{part.slice(2, -2)}</strong> : part);
}

export function AiInsightsPanel() {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId] = useState(() => `s-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  async function ask(text) {
    const q = (text || input).trim();
    if (!q || busy) return;
    setInput("");
    setMsgs(m => [...m, { role: "user", content: q }]);
    setBusy(true);
    try {
      const { data } = await api.post("/super-admin/ai-chat", { message: q, session_id: sessionId });
      setMsgs(m => [...m, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setMsgs(m => [...m, { role: "assistant", content: err.response?.data?.detail || "Sorry — I couldn't fetch that right now. Please try again." }]);
    } finally { setBusy(false); }
  }

  return (
    <div className="card-light p-0 overflow-hidden" data-testid="ai-insights-panel">
      <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-[#0f1420] to-[#141c30] text-white flex items-center gap-3">
        <div className="relative">
          <img src="/mira-bot.png" alt="HQ Analyst" className="w-10 h-10 rounded-full object-cover border-2 border-sky-400/60" />
          <Sparkles className="sparkle-twinkle absolute -top-1 -right-1 w-3.5 h-3.5 text-sky-300" />
        </div>
        <div>
          <div className="font-semibold text-sm">Miracurl HQ Analyst</div>
          <div className="text-[11px] text-slate-400">Ask anything — collections by location, bookings, subscription health…</div>
        </div>
      </div>

      <div className="h-[420px] overflow-y-auto px-5 py-4 space-y-3 bg-slate-50" data-testid="ai-insights-messages">
        {msgs.length === 0 && (
          <div className="text-center pt-8">
            <p className="text-sm text-slate-500 mb-4">Try one of these:</p>
            <div className="flex flex-wrap justify-center gap-2 max-w-xl mx-auto">
              {QUICK_QUESTIONS.map(q => (
                <button key={q} data-testid="ai-quick-question" onClick={() => ask(q)}
                  className="text-xs px-3 py-2 rounded-full bg-white border border-sky-200 text-sky-700 hover:bg-sky-50 transition">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={`${i}-${m.role}`} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
              m.role === "user" ? "bg-sky-600 text-white rounded-br-md" : "bg-white border border-slate-200 text-slate-700 rounded-bl-md shadow-sm"}`}>
              {renderBold(m.content)}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-2.5 shadow-sm flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-500" /> Crunching the numbers…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={e => { e.preventDefault(); ask(); }} className="px-4 py-3 border-t border-slate-200 bg-white flex gap-2">
        <input
          data-testid="ai-insights-input"
          value={input} onChange={e => setInput(e.target.value)}
          placeholder='e.g. "How much business collection in Munnekolal this month?"'
          className="input-light flex-1"
        />
        <button data-testid="ai-insights-send-btn" disabled={busy || !input.trim()}
          className="px-4 rounded-lg bg-gradient-to-r from-sky-500 to-blue-500 text-white disabled:opacity-50 flex items-center justify-center">
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
