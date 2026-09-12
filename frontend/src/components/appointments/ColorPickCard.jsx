import { useState, useEffect } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Palette, Save, Loader2, Camera, Clapperboard, Check } from "lucide-react";
import { ShadeGuide } from "./ShadeGuide";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

// Stylist colour card — shown on appointments booked through the Hair Colour Try-On.
export const ColorPickCard = ({ appt, onSaved }) => {
  const cp = appt.color_pick;
  const [formula, setFormula] = useState(cp?.formula || "");
  const [busy, setBusy] = useState(false);
  const [shots, setShots] = useState({ front: cp?.front_url, back: cp?.back_url });
  const [consent, setConsent] = useState(!!cp?.consent);
  const [reel, setReel] = useState(cp?.reel_url ? { image_url: cp.reel_url } : null);
  const [reelBusy, setReelBusy] = useState(false);
  const [past, setPast] = useState([]);
  const [price, setPrice] = useState(cp?.quoted_price ?? "");
  useEffect(() => {
    if (!appt?.customer_id || !cp) return;
    api.get(`/customers/${appt.customer_id}/color-history`)
      .then(r => setPast((r.data.appointments || []).filter(a => a.id !== appt.id && a.color_pick?.formula)))
      .catch(() => {});
  }, [appt?.customer_id, appt?.id, cp]);
  if (!cp) return null;

  const upload = async (which, file) => {
    if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    try {
      const { data } = await api.post(`/appointments/${appt.id}/color-result?which=${which}&consent=${consent}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setShots(s => ({ ...s, [which]: data.url })); toast.success(which === "front" ? "Client's face photo saved" : "Back-of-hair photo saved");
    } catch (e) { toast.error(e.response?.data?.detail || "Upload failed"); }
  };
  const postReel = async () => {
    if (!consent) return toast.error("Tick guest consent first");
    setReelBusy(true);
    try {
      const { data } = await api.post(`/appointments/${appt.id}/color-reel`, { consent: true, platforms: ["instagram", "facebook"] });
      setReel(data);
      const ok = Object.values(data.results || {}).filter(r => r.ok).length;
      toast.success(ok ? `Mira posted the before/after reel to ${ok} channel${ok > 1 ? "s" : ""}` : "Reel card ready in Mira Studio → Post History (connect Instagram/Facebook to auto-post)");
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't post"); }
    finally { setReelBusy(false); }
  };

  const save = async () => {
    setBusy(true);
    try {
      const body = { formula };
      if (price !== "" && Number(price) !== Number(cp?.quoted_price ?? NaN)) body.price = Number(price);
      const { data } = await api.patch(`/appointments/${appt.id}/color-formula`, body);
      toast.success(body.price != null ? `Saved — colour quoted at ₹${body.price}, appointment total ₹${data.total}` : "Formula saved for this guest");
      onSaved?.(formula);
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't save"); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-2 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-rose-50 p-3 flex gap-3" data-testid={`color-card-${appt.id}`}>
      <div className="w-16 h-20 rounded-lg overflow-hidden border border-amber-300 shrink-0" style={{ background: `linear-gradient(160deg, ${(cp.swatch || ["#777"]).join(",")})` }}>
        {cp.image_url && <img src={`${BACKEND}${cp.image_url}?w=160`} alt={cp.color_name} className="w-full h-full object-cover" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Palette className="w-3.5 h-3.5 text-amber-600" />
          <span className="text-[10px] tracking-[0.2em] font-semibold text-amber-700">COLOUR APPOINTMENT</span>
          <span className="font-mono text-xs font-bold text-slate-900 bg-white border border-amber-200 rounded px-1.5" data-testid="color-card-code">{cp.code}</span>
        </div>
        <p className="text-sm font-semibold text-slate-900 mt-0.5" data-testid="color-card-name">{cp.color_name}</p>
        <p className="text-[11px] text-slate-500">
          {cp.undertone ? `Skin: ${cp.undertone} undertone` : "Skin: not scanned"}{cp.depth ? ` · ${cp.depth}` : ""}
        </p>
        <div className="flex items-center gap-2 mt-2 text-xs" data-testid="color-card-price-row">
          <span className={cp.quoted_price == null && price === "" ? "text-rose-600 font-semibold" : "text-slate-600"}>
            {cp.quoted_price == null && price === "" ? "No price quoted — set the colour price:" : "Colour price ₹"}
          </span>
          <input type="number" min="0" step="50" value={price} onChange={e => setPrice(e.target.value)} placeholder="e.g. 2499" data-testid="color-card-price"
            className="w-24 rounded-lg border border-amber-200 bg-white px-2 py-1 text-slate-800" />
          {cp.quoted_price != null && <span className="text-slate-400">in total ₹{appt.total}</span>}
        </div>
        <div className="flex gap-2 mt-2">
          <input value={formula} onChange={e => setFormula(e.target.value)} maxLength={600} data-testid="color-card-formula"
            placeholder="Formula / mix notes, e.g. 6.35 + 7.3 (1:1.5) 20 vol, 35 min"
            className="flex-1 text-xs rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-slate-800" />
          <button onClick={save} disabled={busy} data-testid="color-card-save"
            className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-900 text-white disabled:opacity-60">
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
          </button>
        </div>
        <ShadeGuide colorId={cp.color_id} onUse={(line) => setFormula(line)} />
        {past.length > 0 && (
          <div className="mt-2 rounded-lg bg-white/70 border border-amber-200 p-2 text-[11px]" data-testid="color-card-past">
            <p className="font-semibold text-amber-800 mb-1">Previous colour formulas for this guest</p>
            {past.slice(0, 3).map(a => (
              <p key={a.id} className="text-slate-700"><b>{a.color_pick.color_name}</b> · {a.color_pick.formula} <span className="text-slate-400">· {new Date(a.scheduled_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}{a.staff_name ? ` · ${a.staff_name}` : ""}</span></p>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px]" data-testid="color-card-reel-row">
          {["front", "back"].map(w => (
            <label key={w} title={w === "front" ? "Client's face, from the front" : "Hair from behind"} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border cursor-pointer ${shots[w] ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-amber-200 text-slate-600"}`} data-testid={`color-card-${w}-upload`}>
              {shots[w] ? <Check className="w-3 h-3" /> : <Camera className="w-3 h-3" />} {w === "front" ? "Front (face)" : "Back (hair)"} photo
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => upload(w, e.target.files?.[0])} />
            </label>
          ))}
          <label className="inline-flex items-center gap-1 text-slate-600"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} data-testid="color-card-consent" /> Guest consents to posting</label>
          <button onClick={postReel} disabled={reelBusy || !shots.front || !shots.back || !consent} data-testid="color-card-post-reel"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white font-semibold disabled:opacity-40">
            {reelBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clapperboard className="w-3 h-3" />} {reel ? "Re-post" : "Mira: post front & back result"}
          </button>
          {reel?.image_url && <a href={`${BACKEND}${reel.image_url}`} target="_blank" rel="noreferrer" className="text-fuchsia-700 underline">view card</a>}
        </div>
      </div>
    </div>
  );
};
