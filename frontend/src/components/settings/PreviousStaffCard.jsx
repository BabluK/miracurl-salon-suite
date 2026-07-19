import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { UserMinus, RotateCcw, Trash2, Loader2 } from "lucide-react";

export const PreviousStaffCard = () => {
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/staff/previous");
      setItems(data.items || []);
    } catch { /* non-admin or error — hide */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rehire = async (s) => {
    if (!window.confirm(`Rehire ${s.name}? A fresh staff ID will be created and their registry history stays linked.`)) return;
    setBusyId(s.id);
    try {
      const { data } = await api.post(`/staff/previous/${s.id}/rehire`);
      toast.success(`${s.name} is back on the team ✦${data.registry_linked ? " Registry history linked." : ""}`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Rehire failed"); }
    finally { setBusyId(""); }
  };

  const remove = async (s) => {
    if (!window.confirm(`Remove ${s.name} from this list? Their registry history is permanent and stays intact.`)) return;
    setBusyId(s.id);
    try {
      await api.delete(`/staff/previous/${s.id}`);
      toast.success("Entry removed");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Delete failed"); }
    finally { setBusyId(""); }
  };

  if (items.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 mt-6 shadow-sm" data-testid="previous-staff-card">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center"><UserMinus className="w-5 h-5" /></div>
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Previous staff</h2>
          <p className="text-xs text-slate-500 mt-1">Staff who left your salon — kept here for 6 months. Their verified registry history is permanent; rehiring creates a fresh staff ID linked to that same history.</p>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {items.map(s => (
          <div key={s.id} className="py-3 flex flex-wrap items-center gap-3" data-testid={`previous-staff-row-${s.id}`}>
            <div className="flex-1 min-w-[180px]">
              <p className="text-sm font-medium text-slate-800">{s.name} <span className="text-slate-400 font-normal">· {s.role || "Staff"}</span></p>
              <p className="text-[11px] text-slate-400">📱 {s.phone || "—"} · Left on {s.left_on || "—"}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => rehire(s)} disabled={busyId === s.id} data-testid={`previous-staff-rehire-${s.id}`}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-500 disabled:opacity-50">
                {busyId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Rehire
              </button>
              <button onClick={() => remove(s)} disabled={busyId === s.id} data-testid={`previous-staff-delete-${s.id}`}
                className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
