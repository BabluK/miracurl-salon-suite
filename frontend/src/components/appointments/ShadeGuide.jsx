import { useEffect, useState } from "react";
import api from "@/lib/api";
import { FlaskConical, Droplets, Timer, Scale, Info, Copy } from "lucide-react";

// Stylist reference: shade codes per brand, developer, ratio, timing — one tap to use as the formula note.
export const ShadeGuide = ({ colorId, onUse }) => {
  const [data, setData] = useState(null);
  const [brand, setBrand] = useState(localStorage.getItem("shade_brand") || "igora");
  useEffect(() => {
    if (!colorId) return;
    api.get(`/hair-colors/${colorId}/guide`).then(r => setData(r.data)).catch(() => setData({ guide: null }));
  }, [colorId]);
  if (!data) return null;
  const g = data.guide;
  if (!g) return <p className="mt-2 text-[11px] text-slate-500" data-testid="shade-guide-none">House shade — use the salon's own formula.</p>;
  const b = g.brands[brand];
  const line = `${b.name} ${g.formulas[brand]} · ${g.developer} · ${b.ratio} · ${g.time}`;
  const pick = (k) => { setBrand(k); localStorage.setItem("shade_brand", k); };
  return (
    <div className="mt-2 rounded-lg bg-white border border-amber-200 p-2.5 text-[11px]" data-testid="shade-guide">
      <div className="flex items-center gap-1.5 text-amber-800 font-semibold"><FlaskConical className="w-3.5 h-3.5" /> Pro formula guide · Level {g.level}</div>
      <p className="text-slate-600 mt-1" data-testid="shade-guide-desc">{g.description}</p>
      <div className="flex flex-wrap gap-1 mt-2" data-testid="shade-guide-brands">
        {Object.entries(g.brands).map(([k, v]) => (
          <button key={k} onClick={() => pick(k)} data-testid={`shade-guide-brand-${k}`}
            className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${brand === k ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"}`}>{v.name}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-2">
        {[[<FlaskConical className="w-3 h-3" />, "Shade", g.formulas[brand], "code"], [<Droplets className="w-3 h-3" />, "Developer", g.developer, "dev"],
          [<Scale className="w-3 h-3" />, "Mix ratio", b.ratio, "ratio"], [<Timer className="w-3 h-3" />, "Timing", g.time, "time"]].map(([ic, lb, val, id]) => (
          <div key={lb} className="rounded-md bg-amber-50 border border-amber-100 px-2 py-1.5" data-testid={`shade-guide-${id}`}>
            <p className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-amber-700">{ic} {lb}</p>
            <p className="font-semibold text-slate-900 leading-tight mt-0.5">{val}</p>
          </div>
        ))}
      </div>
      {g.prep && <p className="mt-1.5 text-slate-700" data-testid="shade-guide-prep"><b>Prep:</b> {g.prep}</p>}
      <p className="mt-1 text-slate-600" data-testid="shade-guide-grey"><b>Grey:</b> {g.grey}</p>
      <div className="flex items-center justify-between gap-2 mt-2">
        <p className="flex items-center gap-1 text-[10px] text-slate-400"><Info className="w-3 h-3" /> {g.disclaimer}</p>
        {onUse && <button onClick={() => onUse(line)} data-testid="shade-guide-use" className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500 text-white font-semibold"><Copy className="w-3 h-3" /> Use as formula</button>}
      </div>
    </div>
  );
};
