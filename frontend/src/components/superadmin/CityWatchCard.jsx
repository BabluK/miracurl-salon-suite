import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Satellite, Loader2, Trash2, Plus } from "lucide-react";

export function CityWatchCard() {
  const [items, setItems] = useState([]);
  const [city, setCity] = useState("");
  const [vertical, setVertical] = useState("salon");
  const [everyDays, setEveryDays] = useState(7);
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/super-admin/city-watch").then(r => setItems(r.data.items || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const add = async () => {
    setBusy(true);
    try {
      await api.post("/super-admin/city-watch", { city: city.trim(), vertical, every_days: everyDays });
      setCity("");
      toast.success("City added to watch 🛰️ — Mira will search it automatically");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't add city"); }
    finally { setBusy(false); }
  };

  const toggle = async (w) => {
    setItems(xs => xs.map(x => x.id === w.id ? { ...x, enabled: !x.enabled } : x));
    try { await api.put(`/super-admin/city-watch/${w.id}/toggle`); } catch { load(); }
  };

  const remove = async (w) => {
    setItems(xs => xs.filter(x => x.id !== w.id));
    try { await api.delete(`/super-admin/city-watch/${w.id}`); toast.success(`${w.city} removed from watch`); }
    catch { load(); }
  };

  const nextRun = (w) => {
    if (!w.enabled) return "paused";
    if (!w.last_run_at) return "due — runs on next daily sweep";
    const next = new Date(new Date(w.last_run_at).getTime() + (w.every_days || 7) * 86400000);
    return next <= new Date() ? "due — runs on next daily sweep" : `next ~${next.toISOString().slice(0, 10)}`;
  };

  return (
    <div className="bg-white rounded-2xl border border-indigo-200 p-4" data-testid="city-watch-card">
      <h3 className="font-semibold text-sm text-slate-800 flex items-center gap-2">
        <Satellite className="w-4 h-4 text-indigo-500" /> Auto City Watch
      </h3>
      <p className="text-xs text-slate-500 mt-0.5 mb-3">
        Mira automatically re-searches your favourite cities on schedule (max one auto-search per day) — newly opened
        salons get flagged 🆕, scored, and you receive the New-Salon Alert email the moment they&apos;re found.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200">
          {[["salon", "💇 Salons"], ["restaurant", "🍽️ Restaurants"]].map(([k, l]) => (
            <button key={k} onClick={() => setVertical(k)} data-testid={`city-watch-vertical-${k}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${vertical === k ? "bg-white shadow text-indigo-600" : "text-slate-500 hover:text-slate-700"}`}>
              {l}
            </button>
          ))}
        </div>
        <input value={city} onChange={e => setCity(e.target.value)} placeholder="City e.g. Bangalore"
          data-testid="city-watch-city-input"
          className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm w-44" />
        <select value={everyDays} onChange={e => setEveryDays(Number(e.target.value))}
          data-testid="city-watch-frequency-select"
          className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white">
          <option value={3}>Every 3 days</option>
          <option value={7}>Every week</option>
          <option value={14}>Every 2 weeks</option>
          <option value={30}>Every month</option>
        </select>
        <button onClick={add} disabled={busy || city.trim().length < 2} data-testid="city-watch-add-btn"
          className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold inline-flex items-center gap-2 hover:bg-indigo-700 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Watch this city
        </button>
      </div>
      {items.length > 0 && (
        <div className="mt-3 divide-y divide-slate-100">
          {items.map(w => (
            <div key={w.id} className="py-2 flex items-center gap-3" data-testid={`city-watch-row-${w.id}`}>
              <span className="text-sm">{w.vertical === "restaurant" ? "🍽️" : "💇"}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{w.city}</p>
                <p className="text-[11px] text-slate-500">
                  every {w.every_days}d · {w.last_run_at ? `last run ${w.last_run_at.slice(0, 10)}` : "never run"} · {nextRun(w)}
                </p>
              </div>
              <button onClick={() => toggle(w)} data-testid={`city-watch-toggle-${w.id}`}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${w.enabled ? "bg-indigo-500" : "bg-slate-300"}`}
                title={w.enabled ? "Watching — click to pause" : "Paused — click to resume"}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${w.enabled ? "left-4.5 translate-x-0" : "left-0.5"}`}
                  style={{ left: w.enabled ? "18px" : "2px" }} />
              </button>
              <button onClick={() => remove(w)} data-testid={`city-watch-delete-${w.id}`}
                className="p-1.5 rounded-full hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
