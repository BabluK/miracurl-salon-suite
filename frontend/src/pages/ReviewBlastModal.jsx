// Review-request blast modal — opens a list of customers who haven't reviewed yet
// and lets the salon owner blast WhatsApp messages one-tap per row.
import { useEffect, useState } from "react";
import { X, MessageSquare, Send, CheckCircle2, Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { openWhatsApp } from "@/lib/share";
import { useAuth } from "@/context/AuthContext";

const REVIEW_MESSAGE = (firstName, link) =>
  `Hi ${firstName} ✦ Thank you for visiting Miracurl today!

We'd love your feedback — it takes 10 seconds:
${link}

Give us 4★ or 5★ and we'll add ₹50 credit to your account ✦`;

export default function ReviewBlastModal({ onClose }) {
  const { user } = useAuth();
  const isManager = user?.role === "manager";
  const [loading, setLoading] = useState(true);
  const [targets, setTargets] = useState([]);
  const [sent, setSent] = useState(new Set());
  const [busy, setBusy] = useState("");
  const [waLinked, setWaLinked] = useState(false);

  useEffect(() => {
    api.get("/whatsapp-link/status").then(r => setWaLinked(!!r.data?.connected)).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    api.get("/reviews/blast-targets")
      .then(r => { if (alive) { setTargets(r.data.targets); setLoading(false); } })
      .catch(e => {
        if (alive) {
          toast.error(`Couldn't load list: ${e?.message || "network error"}`);
          setLoading(false);
        }
      });
    return () => { alive = false; };
  }, []);

  function send(t) {
    if (waLinked) return sendVia(t, "whatsapp");
    const link = `${window.location.origin}/review/${t.appointment_id}`;
    const firstName = (t.customer_name || "there").split(" ")[0];
    const ok = openWhatsApp(REVIEW_MESSAGE(firstName, link), t.phone.replace(/\D/g, ""));
    if (ok) setSent(prev => new Set(prev).add(t.appointment_id));
  }

  async function sendVia(t, channel) {
    setBusy(t.appointment_id + channel);
    try {
      const { data } = await api.post("/reviews/blast-send", { target_id: t.appointment_id, channel });
      toast.success(channel === "sms"
        ? `SMS sent to ${t.customer_name}${data.points_left != null ? ` · ${data.points_left} SMS points left` : ""}`
        : channel === "whatsapp" ? `WhatsApp sent to ${t.customer_name} from your salon number ✦`
        : `Email sent to ${t.customer_name}`);
      setSent(prev => new Set(prev).add(t.appointment_id));
    } catch (e) {
      toast.error(e.response?.data?.detail || `Couldn't send ${channel}`);
    } finally { setBusy(""); }
  }

  async function sendAll() {
    if (isManager) {
      for (const t of targets.slice(0, 10)) {
        if (!sent.has(t.appointment_id)) await sendVia(t, "sms");
      }
      return;
    }
    if (waLinked) {
      for (const t of targets.slice(0, 10)) {
        if (!sent.has(t.appointment_id)) await sendVia(t, "whatsapp");
      }
      return;
    }
    if (targets.length > 10) {
      toast.error("Pop-ups are blocked beyond 10 tabs. Send first 10 and continue manually.");
    }
    targets.slice(0, 10).forEach(send);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()} data-testid="review-blast-modal">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">Review Request Blast</h3>
              <p className="text-xs text-slate-500">Customers whose visit completed in the last 14 days but haven&apos;t reviewed yet.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" data-testid="review-blast-close-btn"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
          ) : targets.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-14 h-14 rounded-full bg-emerald-100 mx-auto flex items-center justify-center mb-3">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              </div>
              <p className="text-slate-700 font-medium">Nothing to send right now.</p>
              <p className="text-sm text-slate-500 mt-1">Every recent visit already has a review — well done!</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {targets.map(t => {
                const isSent = sent.has(t.appointment_id);
                return (
                  <li key={t.appointment_id} className="py-3 flex items-center justify-between gap-3" data-testid={`review-blast-row-${t.appointment_id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-800 text-sm">{t.customer_name}</div>
                      <div className="text-xs text-slate-500 truncate">
                        {t.service_names.join(", ")} · {new Date(t.scheduled_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                      </div>
                      <div className="text-xs text-sky-600 font-mono mt-0.5">{t.phone}</div>
                    </div>
                    <button
                      onClick={() => sendVia(t, "sms")}
                      disabled={isSent || busy === t.appointment_id + "sms"}
                      data-testid={`review-blast-sms-${t.appointment_id}`}
                      title="Send review link by SMS"
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                        isSent ? "bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-default"
                               : "bg-gradient-to-r from-sky-500 to-blue-500 text-white hover:from-sky-600 hover:to-blue-600 shadow-sm"
                      }`}
                    >
                      {isSent ? <><CheckCircle2 className="w-3.5 h-3.5" /> Sent</> : <><Send className="w-3.5 h-3.5" /> SMS</>}
                    </button>
                    {(!isManager || waLinked) && (
                      <button onClick={() => send(t)} disabled={isSent || busy === t.appointment_id + "whatsapp"}
                        data-testid={`review-blast-send-${t.appointment_id}`} title={waLinked ? "Send from your salon's linked WhatsApp" : "Open WhatsApp with the review message"}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition disabled:opacity-40">
                        <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
                      </button>
                    )}
                    {!isManager && t.email && (
                      <button onClick={() => sendVia(t, "email")} disabled={isSent || busy === t.appointment_id + "email"}
                        data-testid={`review-blast-email-${t.appointment_id}`} title={`Email the review link to ${t.email}`}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition disabled:opacity-40">
                        ✉️ Email
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {!loading && targets.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              Each 4★+ review earns the customer ₹50 credit · raises your Google rating
            </div>
            <button
              data-testid="review-blast-send-all-btn"
              onClick={sendAll}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-sky-500 to-blue-500 text-white text-sm font-semibold hover:from-sky-600 hover:to-blue-600 shadow-sm flex items-center gap-2"
            >
              <Send className="w-4 h-4" /> Send to all ({Math.min(targets.length, 10)})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
