import { useState } from "react";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import axios from "axios";

/**
 * Floating "Need help?" button — opens a Mira callback card.
 * Collects name / phone / email → /api/public/demo-request; also offers WhatsApp.
 */
export const MIRACURL_SUPPORT_WHATSAPP = "919180261256";
const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Direct number link — the old wa.me/message/… business short-link belonged to the
// salon's (tenant) WhatsApp account and redirected to the wrong number.
const WA_BUSINESS_LINK = `https://wa.me/${MIRACURL_SUPPORT_WHATSAPP}`;

export default function ChatButton({
  number = MIRACURL_SUPPORT_WHATSAPP,
  message = "Hi Miracurl ✦ I'd like to know more about getting my salon on the platform.",
  label = "Chat with us",
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!form.name.trim() || !form.phone.trim() || !form.email.trim()) {
      setErr("Please fill your name, phone and email"); return;
    }
    setBusy(true); setErr("");
    try {
      await axios.post(`${API}/public/demo-request`, { ...form, source: "contact_us_page" });
      setDone(true);
    } catch {
      setErr("Couldn't send — please try WhatsApp below");
    } finally { setBusy(false); }
  };

  const openWhatsApp = async () => {
    if (!form.name.trim() || form.phone.trim().length < 7 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
      setErr("Please fill your name, phone and a valid email first — then we'll connect you on WhatsApp"); return;
    }
    setBusy(true); setErr("");
    try {
      await axios.post(`${API}/public/demo-request`, { ...form, source: "whatsapp_gate" });
    } catch { /* still connect them */ }
    setBusy(false);
    window.open(`${WA_BUSINESS_LINK}?text=${encodeURIComponent(message)}`, "_blank");
    setDone(true);
  };

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[320px] rounded-3xl bg-white border border-slate-200 shadow-2xl p-5" data-testid="mira-help-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <img src="/assets/mira-avatar-gold.png" alt="Mira" className="w-10 h-10 rounded-full object-cover border-2 border-amber-300" />
              <div>
                <div className="font-semibold text-slate-900 text-sm">Mira ✦ Miracurl Suite</div>
                <div className="text-[11px] text-slate-500">We're here to help</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} data-testid="mira-help-close" className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
          </div>
          {done ? (
            <div className="text-center py-4" data-testid="mira-help-done">
              <div className="text-3xl mb-2">💛</div>
              <p className="text-sm font-semibold text-slate-900">Thanks for your patience!</p>
              <p className="text-xs text-slate-600 mt-1.5">The Miracurl team will contact you shortly.</p>
              <p className="text-[11px] italic text-amber-700 mt-3 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                "Great things in business are never done by one person — they're done by a team." ✦
              </p>
              <a href={WA_BUSINESS_LINK} target="_blank" rel="noreferrer" data-testid="mira-help-whatsapp-done"
                className="mt-3 w-full flex items-center justify-center gap-2 border border-emerald-300 text-emerald-700 text-sm font-semibold py-2.5 rounded-xl hover:bg-emerald-50">
                <MessageCircle className="w-4 h-4" /> Continue on WhatsApp
              </a>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-xs text-slate-600">Share your details and our team will call you back shortly:</p>
              {["name", "phone", "email"].map((k) => (
                <input key={k} type={k === "email" ? "email" : "text"} placeholder={k === "name" ? "Your name" : k === "phone" ? "Phone number" : "Email"}
                  value={form[k]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))}
                  data-testid={`mira-help-${k}`}
                  className="w-full bg-white text-slate-900 placeholder:text-slate-400 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500" style={{ backgroundColor: "#fff", color: "#0f172a" }} />
              ))}
              {err && <p className="text-xs text-rose-600">{err}</p>}
              <button onClick={submit} disabled={busy} data-testid="mira-help-submit"
                className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-slate-800 disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Request callback
              </button>
              <button onClick={openWhatsApp} disabled={busy} data-testid="mira-help-whatsapp"
                className="w-full flex items-center justify-center gap-2 border border-emerald-300 text-emerald-700 text-sm font-semibold py-2.5 rounded-xl hover:bg-emerald-50 disabled:opacity-50">
                <MessageCircle className="w-4 h-4" /> Chat on WhatsApp
              </button>
              <p className="text-[10px] text-slate-400 text-center">Fill your details above — we connect you to WhatsApp instantly ✦</p>
            </div>
          )}
        </div>
      )}
      <button onClick={() => setOpen((v) => !v)} data-testid="floating-whatsapp-btn" aria-label="Need help"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 pl-2 pr-5 py-2 rounded-full bg-emerald-500 text-white font-medium text-sm shadow-2xl hover:bg-emerald-600 hover:scale-105 transition-transform">
        <img src="/assets/mira-avatar-gold.png" alt="Mira" className="w-9 h-9 rounded-full object-cover border-2 border-white/60" />
        <span className="hidden sm:inline">{label}</span>
      </button>
    </>
  );
}
