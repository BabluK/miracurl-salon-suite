import { useEffect, useState } from "react";
import axios from "axios";
import { CreditCard, Mail, MessageSquare, Clock } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;
const EMAILS = ["admin@miracurl-suite.com", "contact@miracurl-suite.com"];

const COPY = {
  trial_expired: {
    title: "Your Free Trial Has Ended",
    icon: Clock,
    tone: "from-amber-400 to-rose-500",
  },
  subscription_expired: {
    title: "Subscription Expired",
    icon: CreditCard,
    tone: "from-rose-500 to-red-600",
  },
  suspended: {
    title: "Account Suspended",
    icon: Clock,
    tone: "from-slate-500 to-slate-700",
  },
};

export const SubscriptionBlockModal = ({ info, onClose }) => {
  const [whatsapp, setWhatsapp] = useState("919180379552");

  useEffect(() => {
    axios.get(`${API}/api/public/site-info`)
      .then(({ data }) => { if (data.whatsapp) setWhatsapp(String(data.whatsapp).replace(/\D/g, "")); })
      .catch(() => {});
  }, []);

  if (!info) return null;
  const c = COPY[info.code] || COPY.subscription_expired;
  const Icon = c.icon;
  const waText = encodeURIComponent(
    info.code === "trial_expired"
      ? "Hi Miracurl team! My free trial has ended and I'd like to activate a subscription."
      : "Hi Miracurl team! My subscription has expired and I'd like to renew.");

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" data-testid="subscription-block-modal">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 text-center">
        <div className={`w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br ${c.tone} flex items-center justify-center text-white mb-4 shadow-lg`}>
          <Icon className="w-8 h-8" />
        </div>
        <h3 className="font-playfair text-2xl text-slate-800" data-testid="block-modal-title">{c.title}</h3>
        <p className="text-sm text-slate-600 mt-3 leading-relaxed" data-testid="block-modal-message">{info.message}</p>
        <div className="mt-6 space-y-2.5">
          <a href={`https://wa.me/${whatsapp}?text=${waText}`} target="_blank" rel="noreferrer" data-testid="block-modal-whatsapp"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition">
            <MessageSquare className="w-4 h-4" /> WhatsApp the Miracurl Team
          </a>
          {EMAILS.map(em => (
            <a key={em} href={`mailto:${em}`} data-testid={`block-modal-email-${em.split("@")[0]}`}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">
              <Mail className="w-4 h-4 text-amber-600" /> {em}
            </a>
          ))}
        </div>
        <button onClick={onClose} data-testid="block-modal-close"
          className="mt-5 text-xs text-slate-400 hover:text-slate-600 transition">Close</button>
      </div>
    </div>
  );
};
