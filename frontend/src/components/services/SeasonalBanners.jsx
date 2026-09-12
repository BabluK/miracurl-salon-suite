import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { CalendarRange, Trash2, Loader2 } from "lucide-react";

const MOODS = [["festive", "Festive"], ["monsoon", "Monsoon"], ["bridal", "Bridal"], ["summer", "Summer"], ["christmas", "Christmas"], ["valentine", "Valentine"]];
const STATUS = { scheduled: "bg-slate-100 text-slate-600", painting: "bg-amber-100 text-amber-700", active: "bg-emerald-100 text-emerald-700", reverted: "bg-slate-100 text-slate-400" };

export const SeasonalBanners = ({ category, allCats = [] }) => {
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ mood: "festive", start: "", end: "", scope: "one", label: "" });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get("/services/banner-schedules").then(r => setRows(r.data.schedules || [])).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!f.start || !f.end) return toast.error("Pick a start and end date");
    setBusy(true);
    try {
      await api.post("/services/banner-schedules", { mood: f.mood, start: f.start, end: f.end, label: f.label, categories: f.scope === "one" && category ? [category] : [] });
      toast.success(`Scheduled — banners turn ${f.mood} from ${f.start} and revert after ${f.end}`);
      setF(x => ({ ...x, start: "", end: "", label: "" })); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't schedule"); }
    finally { setBusy(false); }
  };
  const remove = async (id) => {
    try { await api.delete(`/services/banner-schedules/${id}`); toast.success("Schedule removed — classic banners restored"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Couldn't remove"); }
  };

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3" data-testid="seasonal-banners">
      <p className="text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"><CalendarRange className="w-3.5 h-3.5 text-amber-500" /> Seasonal auto-switch</p>
      <p className="text-[11px] text-slate-500 mt-0.5">Mira repaints the banner in the mood on the start date and puts the classic one back after the end date — hands-free.</p>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {MOODS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setF({ ...f, mood: k })} data-testid={`seasonal-mood-${k}`}
            className={`text-[11px] px-2.5 py-1 rounded-full border ${f.mood === k ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"}`}>{label}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
        <label className="text-[10px] uppercase tracking-wide text-slate-400">From<input type="date" value={f.start} onChange={e => setF({ ...f, start: e.target.value })} data-testid="seasonal-start" className="input-light !py-1.5 mt-0.5 w-full text-xs" /></label>
        <label className="text-[10px] uppercase tracking-wide text-slate-400">Until<input type="date" value={f.end} onChange={e => setF({ ...f, end: e.target.value })} data-testid="seasonal-end" className="input-light !py-1.5 mt-0.5 w-full text-xs" /></label>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
        <select value={f.scope} onChange={e => setF({ ...f, scope: e.target.value })} data-testid="seasonal-scope" className="input-light !py-1.5">
          <option value="one">Only “{category}”</option>
          <option value="all">All {allCats.length} categories</option>
        </select>
        <button type="button" onClick={add} disabled={busy} data-testid="seasonal-add" className="rounded-lg bg-slate-900 text-white font-semibold px-3 py-1.5 disabled:opacity-60 inline-flex items-center justify-center gap-1">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Schedule
        </button>
      </div>
      <input value={f.label} onChange={e => setF({ ...f, label: e.target.value })} placeholder="Label (e.g. Diwali week)" data-testid="seasonal-label" className="input-light !py-1.5 mt-2 text-xs w-full" />
      {rows.length > 0 && (
        <div className="mt-3 space-y-1.5" data-testid="seasonal-list">
          {rows.map(s => (
            <div key={s.id} className="flex items-center gap-2 text-xs bg-white rounded-lg border border-slate-200 px-2.5 py-1.5" data-testid={`seasonal-row-${s.id}`}>
              <span className="font-semibold capitalize text-slate-800">{s.mood}</span>
              <span className="text-slate-500">{s.start} → {s.end}</span>
              <span className="text-slate-400 truncate">{s.label || (s.categories?.length ? s.categories.join(", ") : "all categories")}</span>
              <span className={`ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${STATUS[s.status] || STATUS.scheduled}`}>{s.status}</span>
              <button type="button" onClick={() => remove(s.id)} title="Remove (restores classic banner)" data-testid={`seasonal-remove-${s.id}`} className="text-slate-400 hover:text-rose-600"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
