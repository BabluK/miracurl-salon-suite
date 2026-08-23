import { useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Crown, X, Mail, MessageSquare, MessageCircle, CheckCircle2 } from "lucide-react";

const fmt = (d) => {
  try { return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return d || "—"; }
};
const salute = (g) => (g === "Male" ? "Mr" : g === "Female" ? "Ms" : "");

export default function MembershipCongratsModal({ data, sym, isAdmin, onClose }) {
  const [email, setEmail] = useState(data?.customer?.email || "");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState(data?.list?.[0]?.email_sent ? data?.customer?.email : "");
  if (!data?.list?.length) return null;
  const { customer } = data;
  const m = data.list[0];
  const who = [salute(customer.gender), customer.name].filter(Boolean).join(" ");
  const msgText = `🎉 Congratulations ${who}! Your ${(m.tier || "").toUpperCase()} membership at ${data.salonName || "our salon"} is active.\nMember ID: ${m.member_id}\nValid: ${fmt(m.purchased_at)} → ${fmt(m.expires_at)}\nEnjoy ${m.discount_pct}% off & ${m.cashback_pct}% cashback on every visit! ✦`;
  const phone = (customer.phone || "").replace(/\D/g, "");

  async function sendCard() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return toast.error("Please enter a valid email");
    setSending(true);
    try {
      const { data: r } = await api.post(`/premium-membership/members/${m.customer_membership_id}/send-card`, { email: email.trim() });
      setSentTo(r.sent_to);
      toast.success(`📧 Membership card sent to ${r.sent_to} ✦`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't send the card");
    } finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" data-testid="membership-congrats-modal" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-5 text-white relative">
          <button onClick={onClose} className="absolute top-3 right-3 text-white/70 hover:text-white" data-testid="membership-congrats-close"><X className="w-5 h-5" /></button>
          <Crown className="w-8 h-8 mb-2" />
          <div className="font-bold text-lg leading-snug" data-testid="membership-congrats-title">🎉 Congratulations {who}!</div>
          <div className="text-[12px] opacity-90 mt-1">Your {(m.tier || "").toUpperCase()} membership is generated</div>
        </div>
        <div className="px-5 py-4">
          {data.list.map(x => (
            <div key={x.member_id} className="border border-violet-100 bg-violet-50/50 rounded-xl p-3 mb-3">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-violet-700 text-sm" data-testid="membership-congrats-member-id">{x.member_id}</span>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-violet-600 text-white">{x.tier}</span>
              </div>
              <div className="text-xs text-slate-600 mt-1.5">{x.plan_name} · {sym}{Number(x.amount).toLocaleString("en-IN")}</div>
              <div className="text-xs text-slate-600 mt-0.5" data-testid="membership-congrats-validity">
                Valid <b>{fmt(x.purchased_at)}</b> → <b>{fmt(x.expires_at)}</b>
              </div>
              <div className="text-[11px] text-emerald-600 font-semibold mt-0.5">{x.discount_pct}% off services · {x.cashback_pct}% wallet cashback</div>
            </div>
          ))}
          <label className="text-xs text-slate-500 font-medium">Email the membership card</label>
          <div className="flex gap-2 mt-1">
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="guest@email.com"
              data-testid="membership-congrats-email-input"
              className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-200" />
            <button onClick={sendCard} disabled={sending} data-testid="membership-congrats-send-email"
              className="px-3.5 py-2 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-50 inline-flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" /> {sending ? "Sending…" : "Send Card"}
            </button>
          </div>
          {sentTo && <p className="text-[11px] text-emerald-600 font-semibold mt-1.5 flex items-center gap-1" data-testid="membership-congrats-sent"><CheckCircle2 className="w-3.5 h-3.5" /> Card sent to {sentTo}</p>}
          <div className="flex gap-2 mt-4">
            {isAdmin && phone && (
              <a href={`https://wa.me/${phone.length === 10 ? "91" + phone : phone}?text=${encodeURIComponent(msgText)}`}
                target="_blank" rel="noreferrer" data-testid="membership-congrats-whatsapp"
                className="flex-1 py-2 rounded-lg bg-emerald-500 text-white text-xs font-bold text-center inline-flex items-center justify-center gap-1.5 hover:bg-emerald-600">
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </a>
            )}
            {phone && (
              <a href={`sms:+${phone.length === 10 ? "91" + phone : phone}?&body=${encodeURIComponent(msgText)}`}
                data-testid="membership-congrats-sms"
                className="flex-1 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-bold text-center inline-flex items-center justify-center gap-1.5 hover:bg-slate-50">
                <MessageSquare className="w-3.5 h-3.5" /> Message
              </a>
            )}
            <button onClick={onClose} data-testid="membership-congrats-done"
              className="flex-1 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-700">Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}
