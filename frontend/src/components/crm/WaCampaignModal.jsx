import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Sparkles, Send, Loader2, X, ImageOff, MessageCircle, ShieldAlert } from "lucide-react";

export default function WaCampaignModal({ customers, onClose, onQueued }) {
  const [wa, setWa] = useState(null);
  const [usage, setUsage] = useState(null);
  const [brief, setBrief] = useState("");
  const [text, setText] = useState("");
  const [image, setImage] = useState(null);       // {id,label,url} | null
  const [cands, setCands] = useState([]);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState("");
  const [offerType, setOfferType] = useState("general");
  const [services, setServices] = useState([]);
  const [svcIds, setSvcIds] = useState([]);
  const [discount, setDiscount] = useState(15);

  useEffect(() => { api.get("/services").then(r => setServices((Array.isArray(r.data) ? r.data : r.data.items || []).filter(x => x.active !== false))).catch(() => {}); }, []);

  useEffect(() => {
    api.get("/whatsapp-link/status").then(r => setWa(r.data)).catch(() => setWa({ connected: false }));
    api.get("/whatsapp-link/usage").then(r => setUsage(r.data)).catch(() => {});
  }, []);

  const ids = customers.map(c => c.id);
  const first = customers[0]?.name?.split(" ")[0] || "Priya";

  const compose = async () => {
    setBusy("compose");
    try {
      const { data } = await api.post("/whatsapp-link/campaigns/compose", { customer_ids: ids, brief, offer_type: offerType, service_ids: svcIds, discount_pct: offerType === "discount" ? discount : null });
      setText(data.text); setImage(data.image); setCands(data.candidates || []); setWhy(data.why || "");
      toast.success("Mira drafted your campaign ✦");
    } catch (e) { toast.error(e.response?.data?.detail || "Mira couldn't draft this"); }
    finally { setBusy(""); }
  };

  const send = async () => {
    setBusy("send");
    try {
      const { data } = await api.post("/whatsapp-link/campaigns", { customer_ids: ids, text, image_url: image?.url || null, name: brief.slice(0, 60) || "CRM campaign" });
      toast.success(`Queued for ${data.total} guest${data.total === 1 ? "" : "s"} — sending one every 30–45s from your salon WhatsApp`);
      onQueued?.(data); onClose();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't queue campaign"); }
    finally { setBusy(""); }
  };

  const over = usage && customers.length > usage.remaining;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()} data-testid="wa-campaign-modal">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><MessageCircle className="w-5 h-5 text-emerald-600" /></div>
            <div>
              <h3 className="font-semibold text-slate-800">WhatsApp campaign · {customers.length} guest{customers.length === 1 ? "" : "s"}</h3>
              <p className="text-xs text-slate-500">{wa?.connected ? `From your salon number +${wa.phone}` : "Link your WhatsApp in Settings first"}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" data-testid="wa-campaign-close"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-4">
          {usage && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600" data-testid="wa-campaign-usage">
              <div className="flex items-center justify-between"><span>Today's WhatsApp sends</span><b className="text-slate-800">{usage.sent} / {usage.cap}</b></div>
              <div className="h-1.5 rounded-full bg-slate-200 mt-1.5 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (usage.sent / usage.cap) * 100)}%` }} /></div>
              <div className="mt-1.5 flex items-start gap-1.5"><ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                Guardrails: one message every 30–45 s, max {usage.cap}/day. {over ? <b className="text-amber-700">Only {usage.remaining} left today — the rest auto-continue tomorrow.</b> : "Keeps your number safe from WhatsApp restrictions."}</div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-600">Offer type</label>
            <div className="flex gap-1.5 flex-wrap" data-testid="wa-campaign-offer-types">
              {[["general", "✨ General"], ["festive", "🪔 Festive offer"], ["discount", "% Discount"], ["new_service", "🆕 New service"], ["winback", "💌 Win-back"]].map(([k, l]) => (
                <button key={k} onClick={() => setOfferType(k)} data-testid={`wa-offer-${k}`}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${offerType === k ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}>{l}</button>
              ))}
              {offerType === "discount" && (
                <label className="inline-flex items-center gap-1 text-xs text-slate-600 ml-1">Off
                  <select value={discount} onChange={e => setDiscount(Number(e.target.value))} data-testid="wa-campaign-discount" className="border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-800 bg-white [&_option]:text-slate-800">
                    {[10, 15, 20, 25, 30, 40, 50].map(v => <option key={v} value={v}>{v}%</option>)}
                  </select>
                </label>
              )}
            </div>
            {services.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-slate-600">Services to feature <span className="font-normal text-slate-400">(optional, up to 5)</span></label>
                <div className="flex gap-1.5 flex-wrap mt-1 max-h-20 overflow-y-auto" data-testid="wa-campaign-services">
                  {services.slice(0, 40).map(sv => {
                    const on = svcIds.includes(sv.id);
                    return <button key={sv.id} onClick={() => setSvcIds(p => on ? p.filter(x => x !== sv.id) : p.length < 5 ? [...p, sv.id] : p)}
                      className={`px-2.5 py-1 rounded-full text-[11px] border ${on ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400"}`}>{sv.name} · ₹{sv.price}</button>;
                  })}
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">What's the campaign about?</label>
            <div className="flex gap-2 mt-1">
              <input value={brief} onChange={e => setBrief(e.target.value)} data-testid="wa-campaign-brief" placeholder="e.g. Diwali glow facial 20% off this week · or leave blank and let Mira decide"
                className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800" />
              <button onClick={compose} disabled={!!busy} data-testid="wa-campaign-mira" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white text-sm font-semibold disabled:opacity-50">
                {busy === "compose" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Let Mira write & pick image
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Message <span className="font-normal text-slate-400">— use {"{name}"} for the guest's first name</span></label>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={5} data-testid="wa-campaign-text" placeholder="Hi {name}! …"
              className="w-full mt-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800" />
            {text && <div className="text-[11px] text-slate-400">Preview for {first}: <span className="text-slate-600">{text.replace("{name}", first).slice(0, 140)}{text.length > 140 ? "…" : ""}</span></div>}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-600">Image {why && <span className="font-normal text-slate-400">— Mira: {why}</span>}</label>
              <button onClick={() => setImage(null)} className="text-[11px] text-slate-500 hover:text-slate-800 inline-flex items-center gap-1" data-testid="wa-campaign-no-image"><ImageOff className="w-3 h-3" /> Text only</button>
            </div>
            <div className="mt-1 flex gap-3 items-start">
              <div className="w-36 h-36 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center shrink-0" data-testid="wa-campaign-image">
                {image ? <img src={image.url} alt="" className="w-full h-full object-cover" /> : <span className="text-[11px] text-slate-400">No image</span>}
              </div>
              {cands.length > 0 && (
                <div className="flex-1 grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-36 overflow-y-auto">
                  {cands.map(c => (
                    <button key={c.id} onClick={() => setImage(c)} title={c.label} data-testid={`wa-campaign-cand-${c.id.split(":")[0]}`}
                      className={`aspect-square rounded-lg overflow-hidden border-2 ${image?.id === c.id ? "border-emerald-500" : "border-transparent hover:border-slate-300"}`}>
                      <img src={c.url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">Sending to your own guests only. Guests can reply — answer them to keep the number healthy.</p>
          <button onClick={send} disabled={!!busy || !wa?.connected || text.trim().length < 5} data-testid="wa-campaign-send"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
            {busy === "send" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Queue campaign
          </button>
        </div>
      </div>
    </div>
  );
}
