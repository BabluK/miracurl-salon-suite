import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Send, RotateCcw, Sparkles, Loader2, CalendarCheck, Hand } from "lucide-react";

const SESSION = "owner-test";
const salonHints = ["Are you open now?", "Haircut price?", "Book keratin tomorrow 5 pm", "Kal subah 11 baje facial book karo"];
const restoHints = ["Table for 4 tonight at 8?", "Veg starters?", "Kya aap abhi open ho?", "Reserve outdoor table Sunday 1 pm"];

export const ReceptionistSim = ({ resto }) => {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = async (t) => {
    const body = (t ?? text).trim();
    if (!body || busy) return;
    setText(""); setBusy(true);
    setMsgs(m => [...m, { dir: "in", text: body }]);
    try {
      const r = await api.post("/whatsapp-link/receptionist/simulate", { text: body, session: SESSION });
      setMsgs(m => [...m, { dir: "out", text: r.data.reply, booked: r.data.booked, handoff: r.data.handoff }]);
    } catch (e) { toast.error(e.response?.data?.detail || "Mira couldn't reply"); }
    finally { setBusy(false); }
  };
  const reset = async () => { await api.delete(`/whatsapp-link/receptionist/simulate/${SESSION}`).catch(() => {}); setMsgs([]); };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col" data-testid="receptionist-sim">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"><Sparkles className="w-4 h-4" /></div>
          <div><div className="text-sm font-semibold text-slate-800">Try Mira as a guest</div><div className="text-[11px] text-slate-500">Same brain, live {resto ? "menu & tables" : "prices & slots"} · free, no credits used</div></div>
        </div>
        <button onClick={reset} className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1" data-testid="sim-reset"><RotateCcw className="w-3.5 h-3.5" /> New chat</button>
      </div>
      <div className="h-[420px] overflow-y-auto p-4 space-y-2 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22><circle cx=%222%22 cy=%222%22 r=%221%22 fill=%22%23e2e8f0%22/></svg>')] bg-[#f4f7f5]" data-testid="sim-messages">
        {!msgs.length && (
          <div className="text-center text-xs text-slate-500 pt-10 space-y-3">
            <p>Send anything a guest might type on WhatsApp.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {(resto ? restoHints : salonHints).map(h => <button key={h} onClick={() => send(h)} className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-700 hover:border-emerald-400" data-testid="sim-hint">{h}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.dir === "in" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap shadow-sm ${m.dir === "in" ? "bg-[#d9fdd3] text-slate-800 rounded-br-sm" : "bg-white text-slate-800 rounded-bl-sm"}`} data-testid={m.dir === "in" ? "sim-guest-msg" : "sim-mira-msg"}>
              {m.text}
              {m.booked && <div className="mt-1.5 text-[11px] font-semibold text-emerald-700 inline-flex items-center gap-1" data-testid="sim-booked-badge"><CalendarCheck className="w-3.5 h-3.5" /> Real {resto ? "reservation" : "appointment"} created in your calendar</div>}
              {m.handoff && <div className="mt-1.5 text-[11px] font-semibold text-amber-700 inline-flex items-center gap-1" data-testid="sim-handoff-badge"><Hand className="w-3.5 h-3.5" /> Handed to your team — Mira pauses</div>}
            </div>
          </div>
        ))}
        {busy && <div className="flex justify-start"><div className="bg-white rounded-2xl px-3 py-2 text-xs text-slate-500 inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Mira is typing…</div></div>}
        <div ref={endRef} />
      </div>
      <form onSubmit={e => { e.preventDefault(); send(); }} className="p-3 border-t border-slate-100 flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Type like a guest…" className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-800 focus:outline-none focus:border-emerald-400" data-testid="sim-input" />
        <button type="submit" disabled={busy || !text.trim()} className="w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white flex items-center justify-center" data-testid="sim-send"><Send className="w-4 h-4" /></button>
      </form>
    </div>
  );
};
