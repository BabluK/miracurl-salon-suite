import { Instagram, Globe, MapPin, Search, UserRoundPen, Bot, FileText } from "lucide-react";

// Normalises every historical `email_source` / `phone_source` value into one of a few named sources.
export function sourceInfo(raw) {
  const s = String(raw || "").toLowerCase();
  if (!s) return null;
  if (s.includes("instagram")) return { key: "instagram", label: "Instagram", Icon: Instagram, tone: "bg-pink-50 text-pink-700 border-pink-200" };
  if (s.includes("google") || s.includes("maps") || s.includes("places")) return { key: "google", label: "Google", Icon: MapPin, tone: "bg-sky-50 text-sky-700 border-sky-200" };
  if (s.includes("contact")) return { key: "contact_page", label: "Contact page", Icon: FileText, tone: "bg-indigo-50 text-indigo-700 border-indigo-200" };
  if (s.includes("web search") || s.includes("duckduckgo")) return { key: "web_search", label: "Web search", Icon: Search, tone: "bg-amber-50 text-amber-700 border-amber-200" };
  if (s === "manual" || s.includes("boss")) return { key: "manual", label: "You added", Icon: UserRoundPen, tone: "bg-slate-100 text-slate-600 border-slate-200" };
  if (s.startsWith("ai") || s.includes("research")) return { key: "ai", label: "Mira research", Icon: Bot, tone: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" };
  return { key: "website", label: "Website", Icon: Globe, tone: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

const Badge = ({ kind, info, leadId, detail }) => (
  <span data-testid={`lead-${kind}-source-${leadId}`} title={`${kind} found via ${info.label}${detail ? ` (${detail})` : ""}`}
    className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border align-middle ${info.tone}`}>
    <info.Icon className="w-2.5 h-2.5" /> {kind} · {info.label}
  </span>
);

// "email · Instagram" / "phone · Google" chips showing where Mira found each contact.
const FOUND_ON = { instagram: ["📸", "Instagram"], facebook: ["📘", "Facebook"], linkedin: ["💼", "LinkedIn"], web: ["🌐", "Web"], email: ["✉️", "Email footprint"] };

export function LeadSourceBadges({ lead, className = "" }) {
  const email = lead.email ? sourceInfo(lead.email_source) : null;
  const phone = lead.phone ? sourceInfo(lead.phone_source || (lead.source === "google_maps" ? "google" : "")) : null;
  const found = FOUND_ON[lead.source];
  if (!email && !phone && !found) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`} data-testid={`lead-sources-${lead.id}`}>
      {found && (
        <a href={lead.social_url || undefined} target="_blank" rel="noreferrer" data-testid={`lead-found-on-${lead.id}`}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#fdf8ec] text-[#8a6d1f] border border-[#d4af37]/40" title={`Mira found this lead on ${found[1]}`}>
          {found[0]} found on {found[1]}
        </a>
      )}
      {email && <Badge kind="email" info={email} leadId={lead.id} detail={lead.instagram_handle ? `@${lead.instagram_handle}` : ""} />}
      {phone && <Badge kind="phone" info={phone} leadId={lead.id} detail={lead.instagram_handle && phone.key === "instagram" ? `@${lead.instagram_handle}` : ""} />}
    </span>
  );
}
