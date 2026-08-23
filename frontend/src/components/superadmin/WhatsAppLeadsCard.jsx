import { useEffect, useState } from "react";
import api from "@/lib/api";
import { MessageCircle, Mail } from "lucide-react";

export function WhatsAppLeadsCard() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api.get("/super-admin/wa-leads").then(r => setItems(r.data.items || [])).catch(() => {});
  }, []);
  if (!items.length) return null;
  return (
    <div className="rounded-3xl p-6 bg-[#15151b] border border-emerald-400/25 shadow-[0_14px_44px_-14px_rgba(0,0,0,0.55)]" data-testid="wa-leads-card">
      <h3 className="font-playfair text-xl text-emerald-300 flex items-center gap-2 tracking-wide">
        <MessageCircle className="w-4 h-4" /> WhatsApp Leads
        <span className="text-[11px] font-sans font-bold bg-emerald-500 text-[#15151b] px-2 py-0.5 rounded-full">{items.length}</span>
      </h3>
      <div className="h-px w-16 bg-gradient-to-r from-emerald-400 to-transparent mt-2 mb-3" />
      <p className="text-xs text-slate-400 mb-3">Visitors who filled the connect form before opening WhatsApp — warm leads, reach out fast ✦</p>
      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
        {items.map(l => (
          <div key={l.id} className="flex flex-wrap items-center gap-2 text-xs bg-white/5 border border-white/5 hover:bg-white/10 rounded-lg px-3 py-2 transition-colors" data-testid={`wa-lead-${l.id}`}>
            <span className="font-semibold text-slate-200">{l.name}</span>
            {l.salon_name && <span className="text-[#d4af37]">{l.salon_name}{l.city ? ` · ${l.city}` : ""}</span>}
            <span className="text-slate-500">{l.email}</span>
            <span className="text-[10px] text-slate-500">{(l.created_at || "").slice(0, 10)}</span>
            <span className="ml-auto flex items-center gap-1.5">
              <a href={`https://wa.me/${l.phone?.length === 10 ? "91" + l.phone : l.phone}`} target="_blank" rel="noreferrer"
                data-testid={`wa-lead-chat-${l.id}`}
                className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 font-bold hover:bg-emerald-500/25">
                💬 {l.phone}
              </a>
              <a href={`mailto:${l.email}`} className="text-slate-500 hover:text-[#d4af37]" data-testid={`wa-lead-mail-${l.id}`}>
                <Mail className="w-3.5 h-3.5" />
              </a>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
