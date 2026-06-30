// Cross-device "share" helper. wa.me/?text=… (no recipient) is unreliable
// on mobile browsers; api.whatsapp.com/send works everywhere, and Web Share
// API is the best experience when available.
import { toast } from "sonner";

const WA_FALLBACK = "https://api.whatsapp.com/send";

/** Open a share sheet for text. Returns true if the share was initiated. */
export async function shareText({ title, text, url, preferWhatsApp = false }) {
  const merged = [text, url].filter(Boolean).join("\n");
  // Web Share API — only on secure contexts and supporting browsers
  if (!preferWhatsApp && typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return true;
    } catch (e) {
      if (e?.name === "AbortError") return false; // user cancelled
      // fall through to WhatsApp link
    }
  }
  return openWhatsApp(merged);
}

/** Open WhatsApp's contact-picker pre-filled with text. Returns true if opened. */
export function openWhatsApp(text, phone) {
  const t = encodeURIComponent(text || "");
  const url = phone
    ? `${WA_FALLBACK}?phone=${encodeURIComponent(phone)}&text=${t}`
    : `${WA_FALLBACK}?text=${t}`;
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) {
    toast.error("Pop-up blocked — please allow pop-ups to share on WhatsApp");
    return false;
  }
  return true;
}
