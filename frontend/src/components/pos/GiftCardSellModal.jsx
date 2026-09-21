import { useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { X, Gift } from "lucide-react";

const OCCASIONS = [
  { key: "birthday", label: "Birthday", emoji: "🎂" },
  { key: "anniversary", label: "Anniversary", emoji: "💍" },
  { key: "valentine", label: "Valentine's", emoji: "❤️" },
  { key: "mothers-day", label: "Mother's Day", emoji: "💐" },
  { key: "fathers-day", label: "Father's Day", emoji: "👔" },
  { key: "diwali", label: "Diwali", emoji: "🪔" },
  { key: "christmas", label: "Christmas", emoji: "🎄" },
  { key: "new-year", label: "New Year", emoji: "🎉" },
  { key: "wedding", label: "Wedding", emoji: "👰" },
  { key: "thank-you", label: "Thank You", emoji: "🙏" },
  { key: "congratulations", label: "Congrats", emoji: "🎊" },
  { key: "just-because", label: "Just Because", emoji: "✨" },
];
const PRESETS = [500, 1000, 2000, 5000];
const VALIDITY = [[0, "Salon default"], [7, "7 days"], [15, "15 days"], [30, "1 month"], [90, "3 months"], [180, "6 months"], [365, "1 year"]];

export function GiftCardSellModal({ buyerName = "", onAdd, onClose }) {
  const [occ, setOcc] = useState("birthday");
  const [amount, setAmount] = useState(1000);
  const [custom, setCustom] = useState("");
  const [validity, setValidity] = useState(0);
  const [f, setF] = useState({ recipient_name: "", recipient_email: "", recipient_whatsapp: "", message: "" });

  const amt = custom !== "" ? Number(custom) : amount;

  function add() {
    if (!f.recipient_name.trim()) { toast.error("Who is the gift card for? Enter the recipient's name"); return; }
    if (!amt || amt < 100) { toast.error("Amount must be at least ₹100"); return; }
    if (f.recipient_email && !/^\S+@\S+\.\S+$/.test(f.recipient_email)) { toast.error("Recipient email looks invalid"); return; }
    const o = OCCASIONS.find(x => x.key === occ);
    onAdd({
      occasion: occ, occLabel: o.label,
      recipient_name: f.recipient_name.trim(),
      recipient_email: f.recipient_email.trim(),
      recipient_whatsapp: f.recipient_whatsapp.trim(),
      message: f.message.trim(),
      buyer_name: buyerName,
      validity_days: validity || null,
    }, Math.round(amt));
  }

  const inputCls = "w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-fuchsia-400";

  return createPortal(
    <div className="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md p-5 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid="gift-sell-modal">
        <div className="flex items-center justify-between mb-3">
          <div className="font-playfair text-xl text-slate-900 flex items-center gap-2"><Gift className="w-5 h-5 text-fuchsia-500" /> Sell a Gift Card</div>
          <button onClick={onClose} data-testid="gift-sell-close" className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1.5">Occasion</div>
        <div className="grid grid-cols-4 gap-1.5 mb-4">
          {OCCASIONS.map(o => (
            <button key={o.key} onClick={() => setOcc(o.key)} data-testid={`gift-occ-${o.key}`}
              className={`rounded-xl border px-1 py-2 text-center transition ${occ === o.key ? "border-fuchsia-400 bg-fuchsia-50" : "border-slate-200 hover:border-slate-300"}`}>
              <div className="text-lg leading-none">{o.emoji}</div>
              <div className="text-[9px] font-semibold text-slate-600 mt-1 leading-tight">{o.label}</div>
            </button>
          ))}
        </div>

        <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1.5">Amount</div>
        <div className="flex flex-wrap gap-2 mb-4">
          {PRESETS.map(p => (
            <button key={p} onClick={() => { setAmount(p); setCustom(""); }} data-testid={`gift-amt-${p}`}
              className={`rounded-full border px-4 py-2 text-sm font-bold transition ${custom === "" && amount === p ? "border-fuchsia-400 bg-fuchsia-500 text-white" : "border-slate-200 text-slate-700 hover:border-slate-300"}`}>
              ₹{p}
            </button>
          ))}
          <input value={custom} onChange={e => setCustom(e.target.value.replace(/\D/g, ""))} placeholder="Custom ₹" data-testid="gift-amt-custom"
            className="w-24 rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-fuchsia-400" />
        </div>

        <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1.5">Valid for</div>
        <div className="flex flex-wrap gap-1.5 mb-4" data-testid="gift-validity-options">
          {VALIDITY.map(([d, l]) => (
            <button key={d} type="button" onClick={() => setValidity(d)} data-testid={`gift-validity-${d}`}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${validity === d ? "border-fuchsia-400 bg-fuchsia-500 text-white" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
              {l}
            </button>
          ))}
        </div>

        <div className="space-y-2.5">
          <input className={inputCls} placeholder="Recipient's name *" value={f.recipient_name}
            onChange={e => setF({ ...f, recipient_name: e.target.value })} data-testid="gift-recipient-name" />
          <input className={inputCls} placeholder="Recipient's email (card is emailed here — optional)" value={f.recipient_email}
            onChange={e => setF({ ...f, recipient_email: e.target.value })} data-testid="gift-recipient-email" />
          <input className={inputCls} placeholder="Recipient's WhatsApp (optional)" value={f.recipient_whatsapp}
            onChange={e => setF({ ...f, recipient_whatsapp: e.target.value.replace(/[^\d+ ]/g, "") })} data-testid="gift-recipient-whatsapp" />
          <textarea className={`${inputCls} resize-none`} rows={2} placeholder='Personal message — e.g. "Happy Birthday! 💛"' value={f.message}
            onChange={e => setF({ ...f, message: e.target.value })} data-testid="gift-message" />
        </div>

        <button onClick={add} data-testid="gift-sell-add-btn"
          className="mt-4 w-full bg-fuchsia-600 text-white font-bold py-3 rounded-2xl hover:bg-fuchsia-500 transition">
          Add ₹{(amt || 0).toLocaleString("en-IN")} Gift Card to bill
        </button>
        <p className="text-[10px] text-slate-400 text-center mt-2">The card code is generated &amp; sent automatically once the bill is paid{validity ? ` · valid ${VALIDITY.find(v => v[0] === validity)?.[1]}` : ""}</p>
      </div>
    </div>,
    document.body
  );
}
