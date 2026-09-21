import { useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { CheckCircle2, Crosshair, Link2, Loader2, MapPin, Store, XCircle } from "lucide-react";

// Owner-only: one GPS pin per location. Managers/staff can then sign in directly at the branch
// they're standing in (≤100 m) — every other branch is disabled for them.
export function BranchLocationsCard() {
  const { tenant, refresh } = useAuth();
  const [busy, setBusy] = useState("");
  const [link, setLink] = useState({}); // value → text
  if (!tenant) return null;

  const rows = [
    { value: "", label: tenant.name, sub: tenant.location || "Main salon", lat: tenant.latitude, lng: tenant.longitude, main: true, address: tenant.address || `${tenant.name} ${tenant.location || ""}` },
    ...(tenant.branches || []).map(b => ({ value: b.name, label: b.name, sub: b.address || "Branch", lat: b.latitude, lng: b.longitude, address: b.address || b.maps_url || b.name })),
  ];

  const done = async (label) => { toast.success(`${label} pinned ✦ managers & staff can now sign in there directly`); await refresh(); };

  async function pinHere(r) {
    if (!navigator.geolocation) return toast.error("This device has no GPS — use 'Set from address' instead");
    setBusy(`gps:${r.value}`);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        await api.put("/tenants/current/geo", { latitude: pos.coords.latitude, longitude: pos.coords.longitude, branch: r.value || undefined });
        await done(r.label);
      } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Couldn't pin"); }
      finally { setBusy(""); }
    }, () => { setBusy(""); toast.error("Location blocked — allow location for this site, or use 'Set from address'"); }, { enableHighAccuracy: true, timeout: 15000 });
  }

  async function pinFromText(r) {
    const url = (link[r.value] ?? (r.address || "")).trim();
    if (!url) return toast.error("Paste a Google Maps link or type the address");
    setBusy(`link:${r.value}`);
    try {
      const { data } = await api.post("/tenants/current/geo/from-link", { url, branch: r.value || undefined });
      toast.success(`${r.label} pinned at ${data.resolved || "the address"} ✦`);
      await refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Couldn't locate that address"); }
    finally { setBusy(""); }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="branch-locations-card">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0"><MapPin className="w-5 h-5" /></span>
        <div className="min-w-0">
          <h3 className="text-base md:text-lg font-semibold text-slate-800">Branch locations for sign-in</h3>
          <p className="text-sm text-slate-500 mt-0.5">Pin each place once. Managers & staff then sign in <b>directly</b> at the branch they&apos;re standing in (within 100 m) — every other branch is disabled for them. Only you (owner) can set or move these pins.</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {rows.map(r => {
          const pinned = r.lat != null && r.lng != null;
          return (
            <div key={r.value || "__main__"} className="rounded-xl border border-slate-200 bg-slate-50 p-3.5" data-testid={`branch-location-${r.value || "main"}`}>
              <div className="flex items-center gap-3 flex-wrap">
                {r.main ? <Store className="w-4 h-4 text-amber-600 shrink-0" /> : <MapPin className="w-4 h-4 text-amber-600 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-800 truncate">{r.label} <span className="text-xs text-slate-400 font-normal">· {r.main ? "Main salon" : "Branch"}</span></div>
                  <div className="text-xs text-slate-500 truncate">{r.sub}</div>
                </div>
                {pinned
                  ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1" data-testid={`branch-location-status-${r.value || "main"}`}><CheckCircle2 className="w-3.5 h-3.5" /> Pinned · {r.lat.toFixed(4)}, {r.lng.toFixed(4)}</span>
                  : <span className="inline-flex items-center gap-1 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-2.5 py-1" data-testid={`branch-location-status-${r.value || "main"}`}><XCircle className="w-3.5 h-3.5" /> Not pinned — staff can&apos;t sign in here</span>}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => pinHere(r)} disabled={!!busy} data-testid={`branch-location-pin-${r.value || "main"}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-black disabled:opacity-60">
                  {busy === `gps:${r.value}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crosshair className="w-3.5 h-3.5" />} {pinned ? "Re-pin — I'm here" : "I'm here — pin it"}
                </button>
                <input value={link[r.value] ?? r.address} onChange={e => setLink(l => ({ ...l, [r.value]: e.target.value }))} data-testid={`branch-location-link-${r.value || "main"}`}
                  placeholder="Google Maps link or full address" className="flex-1 min-w-[200px] text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800" />
                <button type="button" onClick={() => pinFromText(r)} disabled={!!busy} data-testid={`branch-location-link-save-${r.value || "main"}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-60">
                  {busy === `link:${r.value}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />} Set from address
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-400 mt-3">Best accuracy: stand at the reception desk when you tap “I&apos;m here”. Indoor GPS can drift 20–50 m, so the sign-in zone is 100 m.</p>
    </div>
  );
}

export default BranchLocationsCard;
