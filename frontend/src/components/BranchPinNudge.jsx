import { useCallback, useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Globe, Loader2, MapPin, X } from "lucide-react";

const DISMISS_KEY = "miracurl_pin_nudge_dismissed";

function LocationRow({ loc, onPinned }) {
  const [busy, setBusy] = useState("");
  const [remote, setRemote] = useState(false);
  const [text, setText] = useState(loc.address || "");
  const key = loc.value || "main";

  function pinHere() {
    if (!navigator.geolocation) { toast.error("This device has no GPS — use 'Set from anywhere' instead"); setRemote(true); return; }
    setBusy("here");
    navigator.geolocation.getCurrentPosition(async (p) => {
      try {
        await api.put("/tenants/current/geo", { latitude: p.coords.latitude, longitude: p.coords.longitude, branch: loc.value || null });
        toast.success(`${loc.label} pinned — staff there can now be GPS-verified ✦`);
        onPinned();
      } catch (e) {
        toast.error(formatApiError(e.response?.data?.detail) || "Couldn't save location");
      } finally { setBusy(""); }
    }, () => { setBusy(""); setRemote(true); toast.error("Location blocked on this device — set it from anywhere below"); },
    { enableHighAccuracy: true, timeout: 12000 });
  }

  async function pinRemote() {
    const url = text.trim();
    if (!url) { toast.error("Paste the Google Maps link or type the salon name + area"); return; }
    setBusy("remote");
    try {
      const { data } = await api.post("/tenants/current/geo/from-link", { url, branch: loc.value || null });
      toast.success(`${loc.label} pinned${data.resolved ? ` at ${data.resolved}` : ""} (${data.latitude.toFixed(4)}, ${data.longitude.toFixed(4)}) ✦`, { duration: 7000 });
      onPinned();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Couldn't locate that address");
    } finally { setBusy(""); }
  }

  return (
    <div className="rounded-xl bg-white/70 border border-amber-200/70 p-2.5" data-testid={`pin-location-${key}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-amber-900 flex-1 min-w-[120px] truncate">{loc.label}</span>
        <button type="button" disabled={!!busy} onClick={pinHere} data-testid={`pin-branch-${key}`}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-60">
          {busy === "here" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />} I&apos;m here — pin it
        </button>
        <button type="button" onClick={() => setRemote(r => !r)} data-testid={`pin-branch-remote-toggle-${key}`}
          className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-semibold ${remote ? "bg-amber-100 border-amber-400 text-amber-900" : "border-amber-300 text-amber-800 hover:bg-amber-100"}`}>
          <Globe className="w-3.5 h-3.5" /> Set from anywhere
        </button>
      </div>
      {remote && (
        <div className="mt-2 flex flex-col sm:flex-row gap-2">
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") pinRemote(); }}
            data-testid={`pin-branch-remote-input-${key}`}
            placeholder="Google Maps link, or salon name + area (e.g. Miracurl Salon AECS Layout)"
            className="flex-1 px-3 py-2 rounded-lg bg-white border border-amber-200 text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-amber-200" />
          <button type="button" disabled={!!busy} onClick={pinRemote} data-testid={`pin-branch-remote-save-${key}`}
            className="inline-flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-slate-800 text-white font-semibold hover:bg-slate-700 disabled:opacity-60">
            {busy === "remote" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />} Locate &amp; pin
          </button>
        </div>
      )}
    </div>
  );
}

// Owner nudge: locations without a GPS pin can't verify staff in the branch picker or check-in.
// Pin from the spot (phone GPS) or from anywhere (Maps link / address — pre-filled with the branch address).
export function BranchPinNudge() {
  const { refresh } = useAuth();
  const [items, setItems] = useState(null);
  const [hidden, setHidden] = useState(() => sessionStorage.getItem(DISMISS_KEY) === "1");

  const load = useCallback(() => {
    api.get("/branches/unpinned").then(r => setItems(r.data.items)).catch(() => setItems([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (hidden || !items || items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 p-4 flex gap-3" data-testid="branch-pin-nudge">
      <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0"><MapPin className="w-5 h-5 text-amber-600" /></div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-amber-900">{items.length === 1 ? "1 location has no GPS pin" : `${items.length} locations have no GPS pin`}</div>
        <p className="text-xs text-amber-800/80">Pin each branch once — the login branch picker and check-in can then verify staff are really there. Pin from the spot, or from anywhere with a Maps link / address.</p>
        <div className="mt-2 space-y-2">
          {items.map(loc => <LocationRow key={loc.value || "main"} loc={loc} onPinned={() => { load(); refresh?.(); }} />)}
        </div>
        <Link to="/attendance" className="inline-block mt-2 text-[11px] text-amber-800 underline underline-offset-2" data-testid="pin-branch-maps-link">Manage all pins &amp; the check-in radius in Attendance →</Link>
      </div>
      <button type="button" onClick={() => { sessionStorage.setItem(DISMISS_KEY, "1"); setHidden(true); }} className="self-start text-amber-400 hover:text-amber-700" data-testid="branch-pin-nudge-dismiss" title="Hide for now"><X className="w-4 h-4" /></button>
    </div>
  );
}

export default BranchPinNudge;
