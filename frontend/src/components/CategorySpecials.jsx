import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Tags, Trash2, Plus } from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const CategorySpecials = () => {
  const [specials, setSpecials] = useState([]);
  const [cats, setCats] = useState([]);
  const [cat, setCat] = useState("");
  const [pct, setPct] = useState(10);
  const [days, setDays] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/category-specials").then(({ data }) => setSpecials(data)).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    api.get("/services").then(({ data }) => {
      const c = [...new Set(data.map(s => s.category || "Menu"))];
      setCats(c);
      if (c.length) setCat(c[0]);
    }).catch(() => {});
  }, [load]);

  async function add() {
    if (!cat || days.length === 0) { toast.error("Pick a category and at least one day"); return; }
    setBusy(true);
    try {
      await api.post("/category-specials", { category: cat, discount_pct: Number(pct), days });
      toast.success(`✨ ${pct}% off ${cat} scheduled`);
      setDays([]);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't save"); }
    finally { setBusy(false); }
  }
  async function del(id) {
    try { await api.delete(`/category-specials/${id}`); load(); toast.success("Special removed"); }
    catch { toast.error("Couldn't remove"); }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6" data-testid="category-specials-card">
      <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Tags className="w-4 h-4 text-emerald-600" /> Category Specials</h3>
      <p className="text-xs text-slate-500 mt-1">Day-wise discounts per menu category — e.g. 15% off Barbecue every Wednesday. Applies automatically on the QR menu and kitchen bills.</p>

      <div className="flex flex-wrap items-end gap-3 mt-4">
        <div>
          <label className="text-[10px] font-bold uppercase text-slate-400">Category</label>
          <select value={cat} onChange={e => setCat(e.target.value)} data-testid="special-category-select"
            className="block mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white text-slate-800 min-w-[160px] [&_option]:bg-white [&_option]:text-slate-800">
            {cats.filter(c => (c || "").trim()).length === 0 && <option value="">No categories yet</option>}
            {cats.filter(c => (c || "").trim()).map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-slate-400">Discount</label>
          <div className="flex gap-1.5 mt-1">
            {[5, 10, 15, 20].map(p => (
              <button key={p} onClick={() => setPct(p)} data-testid={`special-pct-${p}`}
                className={`px-3 py-2 rounded-lg text-xs font-bold border ${pct === p ? "bg-emerald-600 text-white border-emerald-600" : "border-slate-200 text-slate-500 hover:border-emerald-300"}`}>{p}%</button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-slate-400">Days</label>
          <div className="flex gap-1 mt-1">
            {DAYS.map((d, i) => (
              <button key={d} data-testid={`special-day-${i}`}
                onClick={() => setDays(v => v.includes(i) ? v.filter(x => x !== i) : [...v, i])}
                className={`w-9 h-9 rounded-full text-[10px] font-bold border ${days.includes(i) ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}>{d}</button>
            ))}
          </div>
        </div>
        <button onClick={add} disabled={busy} data-testid="special-add-btn"
          className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add special</button>
      </div>

      <div className="mt-4 space-y-1.5">
        {specials.map(s => (
          <div key={s.id} data-testid={`special-row-${s.id}`} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
            <p className="text-xs text-slate-700"><b className="text-emerald-700">{s.discount_pct}% off {s.category}</b> · {s.days.map(d => DAYS[d]).join(", ")}</p>
            <button onClick={() => del(s.id)} data-testid={`special-del-${s.id}`} className="text-rose-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        {specials.length === 0 && <p className="text-xs text-slate-400">No specials yet — add your first one above.</p>}
      </div>
    </div>
  );
};
