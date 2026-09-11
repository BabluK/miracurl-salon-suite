import { useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Palette, Save, Loader2 } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

// Stylist colour card — shown on appointments booked through the Hair Colour Try-On.
export const ColorPickCard = ({ appt, onSaved }) => {
  const cp = appt.color_pick;
  const [formula, setFormula] = useState(cp?.formula || "");
  const [busy, setBusy] = useState(false);
  if (!cp) return null;

  const save = async () => {
    setBusy(true);
    try {
      await api.patch(`/appointments/${appt.id}/color-formula`, { formula });
      toast.success("Formula saved for this guest");
      onSaved?.(formula);
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't save"); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-2 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-rose-50 p-3 flex gap-3" data-testid={`color-card-${appt.id}`}>
      <div className="w-16 h-20 rounded-lg overflow-hidden border border-amber-300 shrink-0" style={{ background: `linear-gradient(160deg, ${(cp.swatch || ["#777"]).join(",")})` }}>
        {cp.image_url && <img src={`${BACKEND}${cp.image_url}`} alt={cp.color_name} className="w-full h-full object-cover" />}
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
        <div className="flex gap-2 mt-2">
          <input value={formula} onChange={e => setFormula(e.target.value)} maxLength={600} data-testid="color-card-formula"
            placeholder="Formula / mix notes, e.g. 6.35 + 7.3 (1:1.5) 20 vol, 35 min"
            className="flex-1 text-xs rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-slate-800" />
          <button onClick={save} disabled={busy} data-testid="color-card-save"
            className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-900 text-white disabled:opacity-60">
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
          </button>
        </div>
      </div>
    </div>
  );
};
