import { useCallback, useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Loader2, MapPin, X } from "lucide-react";

const DISMISS_KEY = "miracurl_pin_nudge_dismissed";

// Owner nudge: locations without a GPS pin can't verify staff in the branch picker or check-in.
export function BranchPinNudge() {
  const { refresh } = useAuth();
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState("");
  const [hidden, setHidden] = useState(() => sessionStorage.getItem(DISMISS_KEY) === "1");

  const load = useCallback(() => {
    api.get("/branches/unpinned").then(r => setItems(r.data.items)).catch(() => setItems([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  function pin(loc) {
    if (!navigator.geolocation) { toast.error("This device has no GPS — use Attendance → paste a Google Maps link instead"); return; }
    setBusy(loc.value || "__main__");
    navigator.geolocation.getCurrentPosition(async (p) => {
      try {
        await api.put("/tenants/current/geo", { latitude: p.coords.latitude, longitude: p.coords.longitude, branch: loc.value || null });
        toast.success(`${loc.label} pinned — staff there can now be GPS-verified ✦`);
        load();
        refresh?.();
      } catch (e) {
        toast.error(formatApiError(e.response?.data?.detail) || "Couldn't save location");
      } finally { setBusy(""); }
    }, () => { setBusy(""); toast.error("Location blocked — allow it in the browser, or pin from Attendance with a Maps link"); },
    { enableHighAccuracy: true, timeout: 12000 });
  }

  if (hidden || !items || items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3" data-testid="branch-pin-nudge">
      <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0"><MapPin className="w-5 h-5 text-amber-600" /></div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-amber-900">{items.length === 1 ? "1 location has no GPS pin" : `${items.length} locations have no GPS pin`}</div>
        <p className="text-xs text-amber-800/80">Stand inside the branch and tap its button — the branch picker and check-in can then verify that staff are really there.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {items.map(loc => (
            <button key={loc.value || "__main__"} type="button" disabled={!!busy} onClick={() => pin(loc)}
              data-testid={`pin-branch-${loc.value ? loc.value : "main"}`}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-60">
              {busy === (loc.value || "__main__") ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />} Pin {loc.label} here
            </button>
          ))}
          <Link to="/attendance" className="text-xs px-3 py-1.5 rounded-full border border-amber-300 text-amber-800 hover:bg-amber-100" data-testid="pin-branch-maps-link">Not there? Use a Maps link →</Link>
        </div>
      </div>
      <button type="button" onClick={() => { sessionStorage.setItem(DISMISS_KEY, "1"); setHidden(true); }} className="self-start text-amber-400 hover:text-amber-700" data-testid="branch-pin-nudge-dismiss" title="Hide for now"><X className="w-4 h-4" /></button>
    </div>
  );
}

export default BranchPinNudge;
