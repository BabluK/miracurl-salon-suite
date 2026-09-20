import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiError } from "@/lib/api";
import { getSelectedBranch, setSelectedBranch } from "@/lib/branch";
import { toast } from "sonner";
import { Loader2, LocateFixed, MapPin, MapPinOff, Store } from "lucide-react";

const doneKey = (uid) => `miracurl_geo_branch_done:${uid}`;

function fmt(m) {
  if (m == null) return "";
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km away` : `${m} m away`;
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("unsupported")); return; }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  });
}

// Shown once per session to staff / unlocked managers of multi-branch businesses:
// asks for GPS, then only the branch within the radius can be picked — the rest are disabled.
export function GeoBranchGate() {
  const { user, tenant } = useAuth();
  const [state, setState] = useState("idle"); // idle | locating | ready | denied | error
  const [data, setData] = useState(null);
  const [picking, setPicking] = useState("");
  const [open, setOpen] = useState(false);

  const eligible = user && tenant && (tenant.branches || []).length > 0
    && ((user.role === "manager" && !user.branch) || user.role === "staff");

  useEffect(() => {
    if (!eligible) return;
    if (sessionStorage.getItem(doneKey(user.id)) === "1") return;
    setOpen(true);
  }, [eligible, user]);

  const locate = useCallback(async () => {
    setState("locating");
    try {
      const pos = await getPosition();
      const { data: d } = await api.post("/branch/locate", {
        latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy_m: pos.coords.accuracy,
      });
      setData(d);
      setState("ready");
    } catch (e) {
      if (e?.code === 1) setState("denied");
      else { setState("error"); if (e?.response) toast.error(formatApiError(e.response.data?.detail)); }
    }
  }, []);

  useEffect(() => { if (open && state === "idle") locate(); }, [open, state, locate]);

  async function pick(o) {
    setPicking(o.value);
    try {
      await api.post("/branch/pick", { branch: o.value, distance_m: o.distance_m });
      setSelectedBranch(o.value);
      sessionStorage.setItem(doneKey(user.id), "1");
      toast.success(`Signed in at ${o.label} ✦`);
      setOpen(false);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Couldn't select branch");
    } finally { setPicking(""); }
  }

  function skip() {
    sessionStorage.setItem(doneKey(user.id), "1");
    setOpen(false);
  }

  if (!open) return null;
  const options = data?.options || [];
  const withinList = options.filter(o => o.within);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" data-testid="geo-branch-gate">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0"><LocateFixed className="w-5 h-5 text-amber-600" /></div>
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Which branch are you at?</h3>
            <p className="text-xs text-slate-500">Your location picks the branch — only the one within {data?.radius_m ?? 100} m can be selected.</p>
          </div>
        </div>

        {state === "locating" && (
          <div className="mt-5 flex items-center gap-2 text-sm text-slate-600" data-testid="geo-branch-locating"><Loader2 className="w-4 h-4 animate-spin text-amber-500" /> Finding your location… allow the location prompt if asked.</div>
        )}

        {(state === "denied" || state === "error") && (
          <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2" data-testid="geo-branch-denied">
            <MapPinOff className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{state === "denied" ? "Location access was blocked. Allow location for this site in your browser settings, then tap Retry." : "Couldn't read your location. Move near a window or turn GPS on, then tap Retry."} Without GPS a branch can only be switched with the owner&apos;s PIN/OTP from the header.</span>
          </div>
        )}

        {state === "ready" && (
          <div className="mt-5 space-y-2">
            {options.map(o => (
              <button key={o.value} type="button" disabled={!o.within || !!picking} onClick={() => pick(o)}
                data-testid={`geo-branch-option-${o.value === "__main__" ? "main" : o.value}`}
                className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${o.within ? "border-emerald-300 bg-emerald-50 hover:bg-emerald-100" : "border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed"}`}>
                {o.value === "__main__" ? <Store className={`w-4 h-4 shrink-0 ${o.within ? "text-emerald-600" : "text-slate-400"}`} /> : <MapPin className={`w-4 h-4 shrink-0 ${o.within ? "text-emerald-600" : "text-slate-400"}`} />}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800 truncate">{o.label}</div>
                  <div className="text-[11px] text-slate-500">
                    {!o.pinned ? "No GPS pin yet — ask the owner to pin it" : o.within ? `You're here · ${o.distance_m} m` : `Too far · ${fmt(o.distance_m)}`}
                  </div>
                </div>
                {picking === o.value ? <Loader2 className="w-4 h-4 animate-spin text-emerald-600" /> : o.within && <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Select</span>}
              </button>
            ))}
            {!data.any_pinned && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5" data-testid="geo-branch-unpinned">No branch has a GPS pin yet. The owner can pin each branch from Attendance → GPS check-in fence.</p>}
            {data.any_pinned && withinList.length === 0 && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5" data-testid="geo-branch-none-within">You&apos;re not within {data.radius_m} m of any branch. Sign in from the salon, or ask the owner to switch the branch for you.</p>}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-2">
          <button type="button" onClick={skip} data-testid="geo-branch-skip" className="text-xs text-slate-500 hover:text-slate-800">Not now</button>
          {state !== "locating" && (
            <button type="button" onClick={locate} data-testid="geo-branch-retry" className="text-xs px-3.5 py-1.5 rounded-full bg-slate-800 text-white font-semibold hover:bg-slate-700 inline-flex items-center gap-1.5">
              <LocateFixed className="w-3.5 h-3.5" /> {state === "ready" ? "Refresh location" : "Retry"}
            </button>
          )}
        </div>
        {getSelectedBranch() && state === "ready" && <p className="mt-2 text-[10px] text-slate-400">Currently showing: {getSelectedBranch() === "__main__" ? "main salon" : getSelectedBranch()}</p>}
      </div>
    </div>
  );
}

export default GeoBranchGate;
