import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import api from "@/lib/api";
import { BellRing, Sparkles, Star } from "lucide-react";

const timeAgo = (iso) => {
  try {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 60) return `${mins || 1} min ago`;
    if (mins < 1440) return `${Math.round(mins / 60)} hr ago`;
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch { return ""; }
};

// One-time login notices (temp transfers etc.) — centered popup, shown once then marked seen.
export function NoticePopup() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    api.get("/notices/unseen").then(r => setItems(r.data.items || [])).catch(() => {});
  }, []);

  // Mira speaks the congratulation aloud for 5★ review bonuses
  useEffect(() => {
    const rb = items.find(n => n.kind === "review_bonus");
    if (!rb || !window.speechSynthesis) return undefined;
    try {
      const u = new SpeechSynthesisUtterance(rb.message.replace(/[✦⭐★"]/g, " ").replace(/₹/g, " rupees "));
      u.lang = "en-IN";
      u.rate = 0.98;
      window.speechSynthesis.speak(u);
    } catch { /* speech unsupported */ }
    return () => { try { window.speechSynthesis.cancel(); } catch { /* noop */ } };
  }, [items]);

  if (!items.length) return null;

  const celebration = items.some(n => n.kind === "review_bonus");

  async function dismiss() {
    setItems([]);
    try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
    try { await api.post("/notices/mark-seen"); } catch { /* seen next time */ }
  }

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={dismiss}>
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()} data-testid="notice-popup">
        <div className="relative bg-gradient-to-br from-[#1c1c22] via-[#2a2333] to-[#1c1c22] px-6 pt-7 pb-6 text-center overflow-hidden">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-amber-400/10 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-8 w-36 h-36 rounded-full bg-fuchsia-400/10 blur-2xl pointer-events-none" />
          <div className="relative mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-300 to-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
            {celebration ? <Star className="w-7 h-7 text-[#1c1c22] fill-[#1c1c22]" /> : <BellRing className="w-7 h-7 text-[#1c1c22]" />}
          </div>
          <h3 className="relative text-lg font-semibold text-white mt-3 flex items-center justify-center gap-1.5">
            {celebration ? "Congratulations!" : "While you were away"} <Sparkles className="w-4 h-4 text-amber-300" />
          </h3>
          <p className="relative text-[11px] text-white/60 mt-0.5">
            {celebration ? "Mira has wonderful news for you ✦" : `${items.length} update${items.length === 1 ? "" : "s"} for you — shown just this once`}
          </p>
        </div>

        <div className="px-5 py-4 max-h-[46vh] overflow-y-auto space-y-2.5">
          {items.map(n => (
            <div key={n.id} className="rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50/80 to-white px-4 py-3" data-testid={`notice-item-${n.id}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-[13px] font-semibold text-slate-800">{n.title}</div>
                <div className="text-[10px] text-slate-400 shrink-0">{timeAgo(n.created_at)}</div>
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">{n.message}</p>
            </div>
          ))}
        </div>

        <div className="px-5 pb-5">
          <button data-testid="notice-popup-dismiss" onClick={dismiss}
            className="w-full py-3 rounded-2xl bg-[#1c1c22] hover:bg-[#2a2a33] text-amber-200 text-sm font-semibold tracking-wide transition-colors">
            Got it ✦
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
