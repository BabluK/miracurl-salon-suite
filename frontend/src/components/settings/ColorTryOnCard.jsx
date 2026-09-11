import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Palette, Download, QrCode, ExternalLink, Loader2 } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

export const ColorTryOnCard = () => {
  const [picks, setPicks] = useState([]);
  const [colors, setColors] = useState([]);
  const [busy, setBusy] = useState(false);
  const slug = localStorage.getItem("miracurl_tenant") || "";

  useEffect(() => {
    api.get("/color-picks?limit=8").then(r => setPicks(r.data.picks || [])).catch(() => {});
    api.get("/hair-colors").then(r => setColors(r.data.colors || [])).catch(() => {});
  }, []);

  const download = async () => {
    setBusy(true);
    try {
      const res = await api.get("/color/poster", { responseType: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(res.data); a.download = `colour-tryon-${slug}.png`; a.click();
      toast.success("Poster downloaded — print it for the colour bar & reception");
    } catch { toast.error("Couldn't build the poster"); }
    setBusy(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6" data-testid="color-tryon-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-300 to-rose-400 flex items-center justify-center"><Palette className="w-5 h-5 text-white" /></div>
        <div className="flex-1">
          <h3 className="font-semibold text-slate-900">Hair Colour Try-On QR</h3>
          <p className="text-xs text-slate-500 mt-0.5">Guests scan → front camera reads their skin undertone → the professional shades that suit them are highlighted (balayage, mocha, copper, ash…). Their pick lands in your bell and here, with a code for the stylist.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        <button onClick={download} disabled={busy} data-testid="color-poster-download" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />} Download QR poster
        </button>
        <a href={`/color/${slug}`} target="_blank" rel="noreferrer" data-testid="color-tryon-open" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold">
          <ExternalLink className="w-4 h-4" /> Open try-on page
        </a>
      </div>
      {colors.length > 0 && (
        <div className="flex gap-1.5 mt-4 overflow-x-auto pb-1" data-testid="color-catalog-strip">
          {colors.map(c => (
            <div key={c.id} title={c.name} className="shrink-0 w-14 h-[70px] rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
              {c.image_url ? <img src={`${BACKEND}${c.image_url}`} alt={c.name} className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{ background: `linear-gradient(160deg, ${c.swatch.join(",")})` }} />}
            </div>
          ))}
        </div>
      )}
      {picks.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3" data-testid="color-picks-list">
          <p className="text-[11px] font-semibold text-slate-500 tracking-wide mb-2">RECENT PICKS</p>
          {picks.map(p => (
            <div key={p.id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
              <span className="text-slate-800"><b className="font-mono text-amber-700">{p.code}</b> · {p.name || "Guest"} {p.phone && <span className="text-slate-400">· {p.phone}</span>}</span>
              <span className="text-slate-600 text-xs text-right">{p.color_name}{p.undertone && <span className="text-slate-400"> · {p.undertone}</span>}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-3 inline-flex items-center gap-1"><Download className="w-3 h-3" /> Also works for staff: tick "Scanned by salon staff" when you scan for a walk-in.</p>
    </div>
  );
};
