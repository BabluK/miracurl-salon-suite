// Super-Admin console extras: profile card, tenant health badge, AI Insights panel.
import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Sparkles, Pencil, X, Camera, Send, Loader2, Phone, Briefcase, HeartPulse, MessageCircle, MailOpen, Crown, Mail, ShieldCheck, Lock, UserCog, CalendarDays, Building2, IdCard, Globe2, BadgeCheck, PhoneCall } from "lucide-react";

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

  const [fbSent, setFbSent] = useState({});
  async function sendFeedback(m) {
    try {
      const { data } = await api.post("/super-admin/feedback-requests", {
        tenant_id: m.tenant_id, context: (m.subject || "").slice(0, 120) });
      setFbSent(s => ({ ...s, [m.id]: true }));
      toast.success(data.email_sent ? "Feedback link emailed to the owner 💛" : "Feedback link created (email delivery failed) — copy: " + data.link);
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't send the feedback link"); }
  }

  async function setTicketStatus(m, status) {
    try {
      await api.patch(`/super-admin/hq-messages/${m.id}/status`, { status });
      toast.success(status === "resolved" ? `Ticket #${m.ticket_no} resolved ✅` : `Ticket #${m.ticket_no} reopened`);
      await load();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't update the ticket"); }
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
                  {m.kind === "ticket" && (
                    <span data-testid={`hq-ticket-badge-${m.id}`} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 border border-sky-200">
                      🎫 #{m.ticket_no} · {m.inbox}@
                    </span>
                  )}
                  {m.kind === "ticket" && (
                    <span data-testid={`hq-ticket-status-${m.id}`} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${m.status === "resolved"
                      ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                      {m.status === "resolved" ? "✓ Resolved" : "● Open"}
                    </span>
                  )}
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
            {m.kind === "ticket" && (
              <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                {m.status !== "resolved" ? (
                  <button data-testid={`hq-ticket-resolve-${m.id}`} onClick={() => setTicketStatus(m, "resolved")}
                    className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition">
                    ✓ Mark resolved
                  </button>
                ) : (
                  <button data-testid={`hq-ticket-reopen-${m.id}`} onClick={() => setTicketStatus(m, "open")}
                    className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100 transition">
                    ↺ Reopen
                  </button>
                )}
                <a data-testid={`hq-ticket-reply-${m.id}`} href={`mailto:${m.from_email}?subject=${encodeURIComponent(`Re: ${m.subject || ""} [Ticket #${m.ticket_no}]`)}`}
                  className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition">
                  ✉️ Reply
                </a>
                {m.status === "resolved" && m.resolved_at && (
                  <span className="text-[10px] text-slate-400">resolved {new Date(m.resolved_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                )}
              </div>
            )}
            {m.tenant_id && m.tenant_id !== "superadmin" && (
              <button data-testid={`hq-send-feedback-${m.id}`} onClick={() => sendFeedback(m)} disabled={fbSent[m.id]}
                className={`mt-2.5 text-[11px] font-bold px-3 py-1.5 rounded-full border transition ${fbSent[m.id]
                  ? "bg-emerald-50 text-emerald-600 border-emerald-200 cursor-default"
                  : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"}`}>
                {fbSent[m.id] ? "✓ Feedback link sent" : "💛 Resolved — send feedback link"}
              </button>
            )}
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
function _relJoined(iso) {
  if (!iso) return "";
  const months = Math.floor((Date.now() - new Date(iso)) / (30.44 * 86400000));
  if (months < 1) return "this month";
  if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`;
  const y = Math.floor(months / 12);
  return `${y} year${y > 1 ? "s" : ""} ago`;
}

function _fmtLastLogin(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).toUpperCase();
  return {
    line1: sameDay ? `Today, ${time}` : `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}, ${time}`,
    line2: d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }),
  };
}

export function SuperProfileCard() {
  const { user, refresh } = useAuth();
  const [edit, setEdit] = useState(false);
  const [lastLogin, setLastLogin] = useState(null);
  useEffect(() => {
    api.get("/auth/sessions").then(({ data }) => {
      const cur = (data.sessions || []).find(s => s.current);
      if (cur?.created_at) setLastLogin(_fmtLastLogin(cur.created_at));
    }).catch(() => {});
  }, []);

  const chips = [
    { icon: null, label: "Active", cls: "bg-emerald-500/10 border-emerald-400/30 text-emerald-300", dot: true, tid: "chip-active" },
    { icon: ShieldCheck, label: "Full System Access", cls: "bg-amber-500/10 border-amber-400/30 text-amber-300", tid: "chip-full-access" },
    { icon: Lock, label: "PIN Secured", cls: "bg-sky-500/10 border-sky-400/30 text-sky-300", tid: "chip-pin" },
    { icon: UserCog, label: "Super Admin", cls: "bg-violet-500/10 border-violet-400/30 text-violet-300", tid: "chip-super-admin" },
  ];
  const tiles = [
    { icon: Building2, iconCls: "text-sky-400 bg-sky-500/10", label: "Organization", value: "Miracurl AI Salon Suite", tid: "tile-org" },
    { icon: IdCard, iconCls: "text-violet-400 bg-violet-500/10", label: "Admin ID", value: `ADM-${(user?.id || "00001").replace(/\D/g, "").slice(0, 5).padStart(5, "0")}`, tid: "tile-admin-id" },
    {
      icon: CalendarDays, iconCls: "text-indigo-400 bg-indigo-500/10", label: "Joined On",
      value: user?.created_at ? new Date(user.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—",
      sub: user?.created_at ? `(${_relJoined(user.created_at)})` : "", tid: "tile-joined",
    },
    { icon: BadgeCheck, iconCls: "text-amber-400 bg-amber-500/10", label: "Email Verified", value: "Verified", verified: true, tid: "tile-email-verified" },
    { icon: PhoneCall, iconCls: "text-emerald-400 bg-emerald-500/10", label: "Phone Verified", value: user?.phone ? "Verified" : "Not added", verified: !!user?.phone, tid: "tile-phone-verified" },
    { icon: Globe2, iconCls: "text-fuchsia-400 bg-fuchsia-500/10", label: "Timezone", value: "Asia/Kolkata", sub: "(UTC +5:30)", tid: "tile-timezone" },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b0f1a] via-[#10182b] to-[#0a0e18] text-white p-5 sm:p-6" data-testid="super-profile-card">
      {[["8%", "12%", "0s"], ["46%", "70%", "0.8s"], ["72%", "10%", "1.5s"], ["93%", "55%", "0.4s"]].map(([l, t, d]) => (
        <Sparkles key={`${l}-${t}`} className="sparkle-twinkle absolute w-3.5 h-3.5 text-sky-300/60 pointer-events-none" style={{ left: l, top: t, animationDelay: d }} />
      ))}

      <div className="relative flex flex-col lg:flex-row gap-6">
        {/* Avatar + owner pill */}
        <div className="flex lg:flex-col items-center gap-4 lg:gap-3 shrink-0">
          <div className="relative">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full p-[3px] bg-gradient-to-tr from-fuchsia-500 via-sky-400 to-violet-500 shadow-[0_0_35px_rgba(99,102,241,0.35)]">
              <img
                src={user?.photo_url || "https://ui-avatars.com/api/?background=0ea5e9&color=fff&size=200&name=" + encodeURIComponent(user?.name || "SA")}
                alt={user?.name} data-testid="super-profile-photo"
                className="w-full h-full rounded-full object-cover border-2 border-[#0b0f1a]"
              />
            </div>
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 border border-violet-400/50 flex items-center justify-center shadow-lg">
              <Crown className="w-4 h-4 text-amber-300" />
            </span>
          </div>
          <span data-testid="system-owner-pill" className="text-[10px] font-bold uppercase tracking-[0.18em] px-3.5 py-1.5 rounded-full bg-violet-500/15 border border-violet-400/40 text-violet-200 lg:mt-2">
            System Owner
          </span>
        </div>

        {/* Identity */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight truncate" data-testid="super-profile-name">{user?.name || "Super Admin"}</h2>
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold bg-gradient-to-r from-fuchsia-500/20 to-sky-500/20 border border-sky-400/40 text-sky-300 px-2.5 py-1 rounded-full" data-testid="super-ai-badge">
              <Sparkles className="w-3 h-3" /> AI Powered
            </span>
          </div>
          {user?.occupation && <p className="text-sm font-semibold text-violet-300 mt-1.5" data-testid="super-profile-occupation">{user.occupation}</p>}
          <p className="text-sm text-slate-200 mt-0.5 font-medium">Miracurl AI Salon Suite</p>
          <div className="flex items-center gap-4 flex-wrap mt-2.5 text-sm text-slate-300">
            {user?.phone && (
              <span className="flex items-center gap-1.5" data-testid="super-profile-phone"><Phone className="w-4 h-4 text-sky-400" /> {user.phone}</span>
            )}
            {user?.phone && <span className="text-slate-600">|</span>}
            <span className="flex items-center gap-1.5" data-testid="super-profile-email"><Mail className="w-4 h-4 text-sky-400" /> {user?.email}</span>
            {user?.notify_email && <><span className="text-slate-600">|</span><span className="flex items-center gap-1.5 text-emerald-300" title="Support / notification inbox" data-testid="super-profile-notify-email">✉ {user.notify_email}</span></>}
            {user?.instagram && <><span className="text-slate-600">|</span><a href={`https://instagram.com/${user.instagram}`} target="_blank" rel="noreferrer" className="text-pink-300 hover:underline" data-testid="super-profile-instagram">@{user.instagram}</a></>}
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-4">
            {chips.map(c => (
              <span key={c.tid} data-testid={c.tid} className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full border ${c.cls}`}>
                {c.dot && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                {c.icon && <c.icon className="w-3.5 h-3.5" />}
                {c.label}
              </span>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="lg:w-72 shrink-0 lg:border-l lg:border-white/10 lg:pl-6 space-y-4">
          <div className="flex items-center justify-end gap-2">
            <button data-testid="super-profile-edit-btn" onClick={() => setEdit(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600/20 hover:bg-violet-600/35 border border-violet-400/40 text-violet-100 text-sm font-semibold transition">
              <Pencil className="w-3.5 h-3.5" /> Edit Profile
            </button>
          </div>
          <div className="flex items-start gap-3" data-testid="super-last-login">
            <span className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-400/20 flex items-center justify-center shrink-0">
              <CalendarDays className="w-4.5 h-4.5 text-sky-300" style={{ width: 18, height: 18 }} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400">Last Login</p>
              <p className="text-sm font-bold text-white">{lastLogin?.line1 || "—"}</p>
              {lastLogin?.line2 && <p className="text-[11px] text-slate-400 mt-0.5">{lastLogin.line2} · Bengaluru, India</p>}
            </div>
          </div>
          <div className="flex items-start gap-3 pt-3 border-t border-white/10" data-testid="super-account-security">
            <span className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center shrink-0">
              <ShieldCheck style={{ width: 18, height: 18 }} className="text-emerald-300" />
            </span>
            <div>
              <p className="text-[11px] text-slate-400">Account Security</p>
              <p className="text-sm font-bold text-emerald-400">High</p>
              <p className="text-[11px] text-slate-400 mt-0.5">All security checks passed</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom tiles */}
      <div className="relative grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mt-6">
        {tiles.map(t => (
          <div key={t.tid} data-testid={t.tid} className="rounded-xl bg-white/[0.04] border border-white/10 p-3.5 flex items-start gap-3 hover:bg-white/[0.07] transition-colors">
            <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${t.iconCls}`}>
              <t.icon style={{ width: 17, height: 17 }} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400 leading-tight">{t.label}</p>
              <p className={`text-[12px] font-bold mt-0.5 leading-snug ${t.verified === false ? "text-slate-400" : "text-white"}`}>
                {t.value} {t.verified && <span className="text-emerald-400">✓</span>}
              </p>
              {t.sub && <p className="text-[10px] text-slate-500">{t.sub}</p>}
            </div>
          </div>
        ))}
      </div>

      {edit && <ProfileEditModal user={user} onClose={() => setEdit(false)} onSaved={async () => { setEdit(false); await refresh(); toast.success("Profile updated"); }} />}
    </div>
  );
}

const PF_INPUT = "w-full h-11 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 text-[14px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#d4af37]/50 focus:border-[#d4af37] focus:bg-white transition";
const PfField = ({ label, hint, children, testId }) => (
  <label className="block" data-testid={testId}>
    <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 mb-1.5">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-slate-400 mt-1 leading-snug">{hint}</span>}
  </label>
);
const PfSection = ({ title, accent, children }) => (
  <section className="rounded-2xl border border-slate-200/80 bg-white p-5">
    <div className={`text-[10px] font-bold uppercase tracking-[0.22em] mb-4 ${accent || "text-slate-500"}`}>{title}</div>
    {children}
  </section>
);

function ProfileEditModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({ name: user?.name || "", phone: user?.phone || "", occupation: user?.occupation || "", photo_url: user?.photo_url || "" });
  const [contact, setContact] = useState({ notify_email: user?.notify_email || "", instagram: user?.instagram || "" });
  const [login, setLogin] = useState({ new_email: "", current_password: "" });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const fileRef = useRef(null);

  // Always prefill from the server so a stale/slim session object can never wipe saved fields.
  useEffect(() => {
    api.get("/auth/me").then(({ data }) => {
      setForm({ name: data.name || "", phone: data.phone || "", occupation: data.occupation || "", photo_url: data.photo_url || "" });
      setContact({ notify_email: data.notify_email || "", instagram: data.instagram || "" });
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);

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
    if (!form.name.trim()) return toast.error("Name is required");
    setBusy(true);
    try {
      await api.put("/super-admin/profile", form);
      await api.put("/auth/me/profile", { name: form.name, phone: form.phone, ...contact });
      if (login.new_email.trim()) {
        if (!login.current_password) { toast.error("Enter your current password to change the login email"); setBusy(false); return; }
        if (!window.confirm(`Change your login email from ${user?.email} to ${login.new_email.trim()}? You'll sign in with the new address from now on.`)) { setBusy(false); return; }
        const { data } = await api.put("/auth/me/login-email", { new_email: login.new_email.trim(), current_password: login.current_password });
        toast.success(`Login email is now ${data.email} ✦`);
      }
      onSaved();
    } catch (err) {
      const d = err.response?.data?.detail;
      const msg = typeof d === "string" ? d
        : Array.isArray(d) ? d.map(x => `${(x.loc || []).slice(-1)[0]}: ${x.msg}`).join(" · ")
        : `Couldn't save profile (${err.response?.status || "network"})`;
      setErrMsg(msg);
      toast.error(msg);
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto" onClick={onClose} data-testid="super-profile-modal">
      <form onSubmit={save} onClick={e => e.stopPropagation()} className="relative w-full max-w-2xl rounded-3xl bg-[#f6f5f1] shadow-2xl overflow-hidden my-auto">
        <div className="relative h-28 bg-[#15151b]">
          <div className="absolute inset-0 opacity-60" style={{ backgroundImage: "radial-gradient(circle at 15% 20%, rgba(212,175,55,.55), transparent 45%), radial-gradient(circle at 90% 90%, rgba(122,45,78,.6), transparent 50%)" }} />
          <div className="absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,#C89B52,#F0D9A5,#C89B52,transparent)]" />
          <button type="button" onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center" data-testid="super-profile-close-btn">✕</button>
          <div className="absolute left-7 top-6 text-white">
            <div className="text-[10px] tracking-[0.35em] uppercase text-[#F0D9A5]">Miracurl HQ</div>
            <div className="font-playfair text-2xl leading-tight">Edit profile</div>
          </div>
        </div>
        <div className="px-7 -mt-12 flex items-end gap-5">
          <button type="button" onClick={() => fileRef.current?.click()} className="relative group shrink-0" data-testid="super-photo-upload-btn">
            <div className="w-24 h-24 rounded-full ring-4 ring-[#f6f5f1] bg-white shadow-lg overflow-hidden flex items-center justify-center">
              {form.photo_url ? <img src={form.photo_url} alt="" className="w-full h-full object-cover" /> : <span className="font-playfair text-3xl text-[#C89B52]">{(form.name || "S")[0]}</span>}
            </div>
            <span className="absolute inset-0 rounded-full bg-black/45 text-white text-[11px] font-semibold flex items-center justify-center opacity-0 group-hover:opacity-100 transition">{uploading ? "Uploading…" : "Change photo"}</span>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadPhoto} data-testid="super-photo-input" />
          </button>
          <div className="pb-2 min-w-0">
            <div className="font-playfair text-xl text-slate-800 truncate">{form.name || "Super Admin"}</div>
            <div className="text-xs text-slate-500 truncate">{user?.email}{form.occupation ? ` · ${form.occupation}` : ""}</div>
          </div>
        </div>

        <div className="p-7 pt-5 space-y-4">
          <PfSection title="Profile">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><PfField label="Full name *"><input data-testid="super-profile-name-input" className={PF_INPUT} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></PfField></div>
              <PfField label="Phone / WhatsApp"><input data-testid="super-profile-phone-input" className={PF_INPUT} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 …" /></PfField>
              <PfField label="Occupation"><input data-testid="super-profile-occupation-input" className={PF_INPUT} value={form.occupation} onChange={e => setForm(f => ({ ...f, occupation: e.target.value }))} placeholder="Founder & CEO" /></PfField>
            </div>
          </PfSection>
          <PfSection title="Contact & inbox">
            <div className="grid sm:grid-cols-2 gap-4">
              <PfField label="Support / notification email" hint="Real inbox for HQ alerts & reset links — login IDs like @miracurl.com can't receive mail.">
                <input data-testid="super-profile-notify-email-input" type="email" className={PF_INPUT} placeholder="admin@miracurl-suite.com" value={contact.notify_email} onChange={e => setContact(c => ({ ...c, notify_email: e.target.value }))} />
              </PfField>
              <PfField label="Instagram ID">
                <div className="relative"><span className="absolute left-3.5 top-0 h-11 flex items-center text-slate-400 text-sm">@</span><input data-testid="super-profile-instagram-input" className={PF_INPUT + " pl-8"} placeholder="miracurl.ai" value={contact.instagram} onChange={e => setContact(c => ({ ...c, instagram: e.target.value }))} /></div>
              </PfField>
            </div>
          </PfSection>
          <PfSection title={<>Login email · <span className="normal-case tracking-normal text-slate-700">currently {user?.email}</span></>} accent="text-amber-700">
            <div className="grid sm:grid-cols-2 gap-4">
              <PfField label="New login email"><input data-testid="super-profile-login-email-input" type="email" className={PF_INPUT} placeholder="admin@miracurl-suite.com" value={login.new_email} onChange={e => setLogin(l => ({ ...l, new_email: e.target.value }))} /></PfField>
              <PfField label="Current password" hint={<>Leave both blank to keep <b>{user?.email}</b>. Password & sessions stay the same; the old ID stops working immediately.</>}>
                <input data-testid="super-profile-login-password-input" type="password" className={PF_INPUT} autoComplete="current-password" value={login.current_password} onChange={e => setLogin(l => ({ ...l, current_password: e.target.value }))} />
              </PfField>
            </div>
          </PfSection>
          <div className="flex items-center justify-end gap-3 pt-1">
            {errMsg && <span className="text-xs text-rose-600 mr-auto" data-testid="super-profile-error">{errMsg}</span>}
            <button type="button" onClick={onClose} className="h-11 px-5 rounded-full text-sm font-semibold text-slate-600 hover:bg-slate-200/60" data-testid="super-profile-cancel-btn">Cancel</button>
            <button data-testid="super-profile-save-btn" disabled={busy || uploading || !loaded} className="h-11 px-7 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] text-sm font-bold shadow-[0_10px_30px_-12px_rgba(212,175,55,.9)] hover:brightness-110 disabled:opacity-50">{busy ? "Saving…" : "Save profile"}</button>
          </div>
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
          <img src="/mira-neural.png" alt="HQ Analyst" className="w-10 h-10 rounded-full object-cover border-2 border-sky-400/60" />
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
