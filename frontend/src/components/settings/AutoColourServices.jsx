import { useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Wand2, Loader2 } from "lucide-react";

export const AutoColourServices = ({ onDone, linkedCount, total }) => {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ women_price: 2499, men_price: 799, women_duration: 120, men_duration: 45, overwrite: false });
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const run = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/hair-colors/auto-services", f);
      setRes(data);
      toast.success(`Linked ${data.linked.women} women's + ${data.linked.men} men's shades`);
      onDone?.();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };
  const Num = ({ k, label, step = 1 }) => (
    <label className="text-xs text-slate-600">{label}
      <input type="number" min="0" step={step} value={f[k]} onChange={e => setF({ ...f, [k]: Number(e.target.value) })} data-testid={`auto-colour-${k}`}
        className="mt-0.5 w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white text-slate-800" />
    </label>
  );
  return (
    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3" data-testid="auto-colour-services">
      <div className="flex items-center gap-2 flex-wrap">
        <Wand2 className="w-4 h-4 text-emerald-600" />
        <p className="text-xs text-slate-700 flex-1 min-w-[200px]"><b>Auto colour services</b> — create "Women's Global Colour" &amp; "Men's Global Colour" and link every shade so each booking carries a price.
          {typeof linkedCount === "number" && <span className="text-slate-500"> {linkedCount}/{total} shades linked.</span>}</p>
        <button onClick={() => setOpen(v => !v)} data-testid="auto-colour-toggle" className="text-xs font-semibold text-emerald-700 bg-white border border-emerald-200 rounded-full px-3 py-1.5">{open ? "Close" : "Set up"}</button>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Num k="women_price" label="Women's price ₹" step={50} />
            <Num k="women_duration" label="Women's mins" step={15} />
            <Num k="men_price" label="Men's price ₹" step={50} />
            <Num k="men_duration" label="Men's mins" step={15} />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={f.overwrite} onChange={e => setF({ ...f, overwrite: e.target.checked })} data-testid="auto-colour-overwrite" /> Also relink shades already linked to another service</label>
          <button onClick={run} disabled={busy} data-testid="auto-colour-run" className="inline-flex items-center gap-1.5 text-xs font-bold bg-emerald-600 text-white rounded-full px-4 py-2 disabled:opacity-60">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} Create services &amp; link all shades
          </button>
          {res && <p className="text-xs text-emerald-700" data-testid="auto-colour-result">✓ {res.women_service.name} ₹{res.women_service.price} · {res.men_service.name} ₹{res.men_service.price} — linked {res.linked.women} + {res.linked.men}{res.linked.skipped ? `, kept ${res.linked.skipped} existing links` : ""}</p>}
        </div>
      )}
    </div>
  );
};
