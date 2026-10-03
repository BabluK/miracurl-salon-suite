import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, X, HeartHandshake } from "lucide-react";
import { MIRACURL_SUPPORT_WHATSAPP } from "@/components/ChatButton";
import { trackFunnel } from "@/lib/analytics";

const SEEN_KEY = "miracurl_signup_nudge";
const IDLE_MS = 45000;

// Gentle "need help?" prompt when a visitor abandons the signup midway:
// desktop → mouse leaves toward the browser bar · mobile → comes back after tabbing away, or idles 45s with a half-filled form.
export function SignupExitNudge({ dirty, step, stepName, businessName, resto, region, locked, submitting }) {
  const [open, setOpen] = useState(false);
  const idle = useRef(null);
  const hiddenAt = useRef(0);
  const armed = dirty && !submitting;

  useEffect(() => {
    if (!armed) return undefined;
    const fire = (reason) => {
      if (sessionStorage.getItem(SEEN_KEY)) return;
      sessionStorage.setItem(SEEN_KEY, "1");
      setOpen(true);
      trackFunnel("signup_exit_nudge", { business_type: resto ? "restaurant" : "salon", region, locked, step: step + 1, step_name: stepName, error: reason });
    };
    const resetIdle = () => { clearTimeout(idle.current); idle.current = setTimeout(() => fire("idle"), IDLE_MS); };
    const onMouseOut = (e) => { if (!e.relatedTarget && e.clientY <= 0) fire("mouse_exit"); };
    const onVis = () => {
      if (document.visibilityState === "hidden") hiddenAt.current = Date.now();
      else if (hiddenAt.current && Date.now() - hiddenAt.current > 3000) fire("tab_return");
    };
    document.addEventListener("mouseout", onMouseOut);
    document.addEventListener("visibilitychange", onVis);
    ["keydown", "pointerdown", "scroll", "touchstart"].forEach(ev => window.addEventListener(ev, resetIdle, { passive: true }));
    resetIdle();
    return () => {
      clearTimeout(idle.current);
      document.removeEventListener("mouseout", onMouseOut);
      document.removeEventListener("visibilitychange", onVis);
      ["keydown", "pointerdown", "scroll", "touchstart"].forEach(ev => window.removeEventListener(ev, resetIdle));
    };
  }, [armed, step, stepName, resto, region, locked]);

  if (!open) return null;
  const noun = resto ? "restaurant" : "salon";
  const who = businessName.trim() ? ` "${businessName.trim()}"` : "";
  const text = `Hi Miracurl ✦ I was signing up my ${noun}${who} (step ${step + 1} of 4) and could use a little help.`;
  const wa = `https://wa.me/${MIRACURL_SUPPORT_WHATSAPP}?text=${encodeURIComponent(text)}`;
  const close = (how) => { setOpen(false); trackFunnel(how === "wa" ? "signup_exit_nudge_whatsapp" : "signup_exit_nudge_dismiss", { business_type: noun, region, locked, step: step + 1, step_name: stepName }); };
  return createPortal(
    <div className="fixed inset-0 z-[998] flex items-end sm:items-center justify-center p-4 bg-slate-950/40 backdrop-blur-[2px]" data-testid="signup-exit-nudge" onClick={() => close("dismiss")}>
      <div className="relative w-full max-w-sm rounded-3xl bg-white shadow-2xl border border-[#d4af37]/30 p-6 animate-fade-up" onClick={e => e.stopPropagation()}>
        <button type="button" onClick={() => close("dismiss")} aria-label="Close" data-testid="signup-exit-nudge-close"
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center"><X className="w-4 h-4" /></button>
        <div className="w-12 h-12 rounded-2xl bg-[#d4af37]/15 border border-[#d4af37]/40 flex items-center justify-center text-[#8a6d1f]"><HeartHandshake className="w-6 h-6" /></div>
        <h3 className="font-playfair text-xl text-slate-900 mt-4">Stuck somewhere? We&apos;ve got you.</h3>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">
          Our team will finish setting up your {noun} <b>for you — free</b>. Just say hi on WhatsApp and we&apos;ll take it from here. No pressure, your progress here is kept.
        </p>
        <a href={wa} target="_blank" rel="noreferrer" onClick={() => close("wa")} data-testid="signup-exit-nudge-whatsapp"
          className="mt-5 w-full inline-flex items-center justify-center gap-2 py-3 rounded-full bg-[#25D366] text-white text-sm font-bold hover:brightness-105 active:scale-[0.98] transition-[filter,transform]">
          <MessageCircle className="w-4 h-4" /> WhatsApp us — we&apos;ll help
        </a>
        <button type="button" onClick={() => close("dismiss")} data-testid="signup-exit-nudge-continue"
          className="mt-2 w-full py-2.5 rounded-full text-sm font-semibold text-slate-600 hover:bg-slate-50">I&apos;ll continue myself</button>
      </div>
    </div>,
    document.body,
  );
}
