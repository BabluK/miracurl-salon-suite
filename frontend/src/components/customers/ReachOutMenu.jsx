import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { MessageCircle, MessageSquare, Instagram, Facebook, Send, Mail, Phone, Copy, Plus } from "lucide-react";
import { phoneDisplay } from "@/lib/countryCodes";
import { useAuth } from "@/context/AuthContext";

const handle = (v) => (v || "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?(instagram\.com|facebook\.com|m\.me|t\.me|ig\.me\/m)\//i, "").replace(/\/.*$/, "");

export const buildE164 = (c) => {
  const p = phoneDisplay(c);
  return `${p.code}${p.number}`;
};

const CHANNELS = (c, msg, isIOS) => {
  const e164 = buildE164(c);
  const enc = encodeURIComponent(msg);
  const ig = handle(c.instagram), fb = handle(c.facebook), tg = handle(c.telegram);
  return [
    { id: "sms", label: isIOS ? "iMessage / Text" : "Text (SMS)", hint: "Opens your phone's Messages app — no gateway needed", icon: MessageSquare, tone: "text-emerald-600 bg-emerald-50",
      href: `sms:${e164}${isIOS ? "&" : "?"}body=${enc}`, ready: true },
    { id: "whatsapp", label: "WhatsApp", hint: "Pre-filled chat", icon: MessageCircle, tone: "text-green-600 bg-green-50",
      href: `https://wa.me/${e164.replace("+", "")}?text=${enc}`, ready: true },
    { id: "instagram", label: "Instagram DM", hint: ig ? `@${ig} · message copied for you to paste` : "Add their @handle first", icon: Instagram, tone: "text-pink-600 bg-pink-50",
      href: ig ? `https://ig.me/m/${ig}` : null, ready: !!ig, copy: true },
    { id: "messenger", label: "Facebook Messenger", hint: fb ? `m.me/${fb}` : "Add their Facebook username first", icon: Facebook, tone: "text-blue-600 bg-blue-50",
      href: fb ? `https://m.me/${fb}?text=${enc}` : null, ready: !!fb },
    { id: "telegram", label: "Telegram", hint: tg ? `@${tg}` : "Add their Telegram username first", icon: Send, tone: "text-sky-600 bg-sky-50",
      href: tg ? `https://t.me/${tg}?text=${enc}` : null, ready: !!tg },
    { id: "email", label: "Email", hint: c.email || "No email on file", icon: Mail, tone: "text-amber-600 bg-amber-50",
      href: c.email ? `mailto:${c.email}?subject=${encodeURIComponent("A note from us")}&body=${enc}` : null, ready: !!c.email },
    { id: "call", label: "Call", hint: e164, icon: Phone, tone: "text-slate-600 bg-slate-100", href: `tel:${e164}`, ready: true },
  ];
};

export const ReachOutMenu = ({ customer, onAddHandles }) => {
  const { tenant } = useAuth();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const ref = useRef(null);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (!ref.current?.contains(e.target) && !menuRef.current?.contains(e.target)) setOpen(false); };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", h);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { document.removeEventListener("mousedown", h); window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [open]);
  const toggle = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      const below = window.innerHeight - r.bottom > 380;
      setPos({ top: below ? r.bottom + 4 : Math.max(8, r.top - 380), right: Math.max(8, window.innerWidth - r.right) });
    }
    setOpen(o => !o);
  };

  const first = (customer.name || "").split(" ")[0];
  const msg = `Hi ${first}, this is ${tenant?.name || "your salon"}. `;
  const isIOS = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
  const channels = CHANNELS(customer, msg, isIOS);

  const go = async (ch) => {
    if (!ch.ready) { setOpen(false); onAddHandles?.(customer); return; }
    if (ch.copy) { try { await navigator.clipboard.writeText(msg); toast.success("Message copied — paste it in the Instagram chat"); } catch { /* ignore */ } }
    window.open(ch.href, ch.id === "sms" || ch.id === "call" || ch.id === "email" ? "_self" : "_blank", "noopener");
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button data-testid={`reach-customer-${customer.id}`} onClick={toggle} title="Message this guest"
        className="p-2 hover:bg-emerald-50 rounded text-slate-500 hover:text-emerald-600 transition">
        <MessageCircle className="w-4 h-4" />
      </button>
      {open && createPortal(
        <div ref={menuRef} data-testid={`reach-menu-${customer.id}`} style={{ position: "fixed", top: pos.top, right: pos.right }}
          className="w-72 bg-white rounded-xl shadow-2xl border border-slate-200 z-[1000] overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700 truncate">Message {customer.name}</p>
            <button data-testid={`reach-copy-${customer.id}`} onClick={() => { navigator.clipboard?.writeText(msg); toast.success("Greeting copied"); }} className="text-slate-400 hover:text-slate-700" title="Copy greeting"><Copy className="w-3.5 h-3.5" /></button>
          </div>
          <div className="py-1">
            {channels.map(ch => (
              <button key={ch.id} data-testid={`reach-${ch.id}-${customer.id}`} onClick={() => go(ch)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 transition-colors ${ch.ready ? "" : "opacity-70"}`}>
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${ch.tone}`}><ch.icon className="w-4 h-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-slate-800">{ch.label}</span>
                  <span className="block text-[11px] text-slate-400 truncate">{ch.hint}</span>
                </span>
                {!ch.ready && <Plus className="w-3.5 h-3.5 text-slate-400" />}
              </button>
            ))}
          </div>
          <p className="px-3 py-2 text-[10px] text-slate-400 bg-slate-50 border-t border-slate-100">Opens the app on your device — nothing is sent automatically.</p>
        </div>,
        document.body
      )}
    </div>
  );
};
