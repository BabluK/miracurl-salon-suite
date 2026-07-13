import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Cake, Heart, Send, MessageSquare, Pencil } from "lucide-react";

function PersonRow({ p, icon }) {
  return (
    <div className="flex items-center gap-3 bg-white/60 border border-slate-200 rounded-xl px-3 py-2" data-testid="celebration-row">
      <span className="text-lg">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{p.name}</div>
        <div className="text-[11px] text-slate-400">{p.phone}</div>
      </div>
      {p.wa_link && (
        <a href={p.wa_link} target="_blank" rel="noreferrer" data-testid="celebration-wa-btn"
          className="text-xs px-3 py-1.5 rounded-lg bg-[#25D366]/10 border border-[#25D366]/30 text-emerald-700 font-semibold inline-flex items-center gap-1">
          <Send className="w-3 h-3" /> WhatsApp
        </a>
      )}
      {p.sms_link && (
        <a href={p.sms_link} data-testid="celebration-sms-btn"
          className="text-xs px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 font-semibold inline-flex items-center gap-1">
          <MessageSquare className="w-3 h-3" /> SMS
        </a>
      )}
    </div>
  );
}

export const CelebrationsCard = () => {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);
  const [offerText, setOfferText] = useState("");

  const load = () => api.get("/crm/celebrations-today").then(r => { setData(r.data); setOfferText(r.data.offer_text); }).catch(() => {});
  useEffect(() => { load(); }, []);

  if (!data || (data.birthdays.length === 0 && data.anniversaries.length === 0)) return null;

  const saveOffer = async () => {
    try {
      await api.put("/settings/birthday-offer", { enabled: true, offer_text: offerText });
      toast.success("Celebration offer updated");
      setEditing(false); load();
    } catch { toast.error("Couldn't save"); }
  };

  return (
    <div className="card-light border-pink-200 bg-gradient-to-br from-pink-50/60 to-white" data-testid="celebrations-card">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Cake className="w-4 h-4 text-pink-500" />
          <h3 className="font-playfair text-xl">Today&apos;s Celebrations</h3>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {editing ? (
            <>
              <input className="input-light !w-56 text-xs py-1.5" value={offerText} onChange={e => setOfferText(e.target.value)} maxLength={120} data-testid="celebration-offer-input" />
              <button onClick={saveOffer} className="btn-blue text-xs px-3 py-1.5" data-testid="celebration-offer-save">Save</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="text-slate-500 inline-flex items-center gap-1 hover:text-sky-600" data-testid="celebration-offer-edit">
              Gift: <b className="text-pink-600">{data.offer_text}</b> <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-1">Emails go out automatically every morning — tap WhatsApp/SMS for a personal touch.</p>
      <div className="mt-3 grid sm:grid-cols-2 gap-2">
        {data.birthdays.map(p => <PersonRow key={`b-${p.id}`} p={p} icon="🎂" />)}
        {data.anniversaries.map(p => <PersonRow key={`a-${p.id}`} p={p} icon={<Heart className="w-4 h-4 text-pink-500 inline" />} />)}
      </div>
    </div>
  );
};
