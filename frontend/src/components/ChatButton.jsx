import { MessageCircle } from "lucide-react";

/**
 * Floating WhatsApp chat button — bottom-right on marketing pages.
 * Lets new prospects message the Miracurl support number directly.
 * The number is centralised here so it's a one-line change to update.
 */
export const MIRACURL_SUPPORT_WHATSAPP = "918217072523";

export default function ChatButton({
  number = MIRACURL_SUPPORT_WHATSAPP,
  message = "Hi Miracurl ✦ I'd like to know more about getting my salon on the platform.",
  label = "Chat with us",
}) {
  const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      data-testid="floating-whatsapp-btn"
      aria-label="Chat on WhatsApp"
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 pl-4 pr-5 py-3 rounded-full bg-emerald-500 text-white font-medium text-sm shadow-2xl hover:bg-emerald-600 hover:scale-105 transition-transform"
    >
      <span className="relative flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
        <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
      </span>
      <MessageCircle className="w-5 h-5" />
      <span className="hidden sm:inline">{label}</span>
    </a>
  );
}
