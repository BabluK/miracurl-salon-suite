import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiError } from "@/lib/api";
import { setSelectedBranch, mainSalonLabel } from "@/lib/branch";
import { toast } from "sonner";
import { Check, Loader2, LocateFixed, MapPin, MapPinOff, Store } from "lucide-react";

const PICK_DAYS = 15;
const pickKey = (uid) => `miracurl_branch_pick:${uid}`;

export function readBranchPick(uid) {
  try {
    const raw = localStorage.getItem(pickKey(uid));
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p.until || Date.now() > p.until) { localStorage.removeItem(pickKey(uid)); return null; }
    return p;
  } catch { return null; }
}

function fmt(m) {
  if (m == null) return "";
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km away` : `${m} m away`;
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("unsupported")); return; }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  });
}

// One shared login, many branches: right after sign-in the device picks its branch from a
// luxe card list and remembers it for 15 days. With GPS, only the branch you're standing in
// (≤100 m) is selectable; without GPS every branch is offered (pick is recorded as unverified).
export function GeoBranchGate() {
  const { user, tenant } = useAuth();
  const [open, setOpen] = useState(false);
  const [geo, setGeo] = useState({ state: "idle", data: null }); // idle | locating | ready | off
  const [picking, setPicking] = useState("");

  const branches = tenant?.branches || [];
  const eligible = user && tenant && branches.length > 0
    && ((user.role === "manager" && !user.branch) || user.role === "staff");

  useEffect(() => {
    if (!eligible) return;
    const saved = readBranchPick(user.id);
    if (saved) { setSelectedBranch(saved.branch); return; }
    setOpen(true);
  }, [eligible, user]);

  const locate = useCallback(async () => {
    setGeo({ state: "locating", data: null });
    try {
      const pos = await getPosition();
      const { data } = await api.post("/branch/locate", {
        latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy_m: pos.coords.accuracy,
      });
      setGeo({ state: "ready", data });
    } catch (e) {
      setGeo({ state: "off", data: null, denied: e?.code === 1 });
    }
  }, []);

  useEffect(() => { if (open && geo.state === "idle") locate(); }, [open, geo.state, locate]);

  const gpsOpts = geo.data?.options || [];
  const gpsHit = geo.state === "ready" && geo.data.any_within;
  const byValue = Object.fromEntries(gpsOpts.map(o => [o.value, o]));
  const cards = [
    { value: "__main__", label: tenant?.name || "Main salon", sub: tenant?.location || "Main salon", main: true },
    ...branches.map(b => ({ value: b.name, label: b.name, sub: b.address || b.location || "Branch" })),
  ].map(c => {
    const g = byValue[c.value];
    return { ...c, distance_m: g?.distance_m ?? null, pinned: !!g?.pinned, within: !!g?.within, disabled: gpsHit && !g?.within };
  });

  async function pick(c) {
    setPicking(c.value);
    try {
      await api.post("/branch/pick", { branch: c.value, distance_m: c.distance_m, gps_verified: !!c.within });
      setSelectedBranch(c.value);
      localStorage.setItem(pickKey(user.id), JSON.stringify({ branch: c.value, until: Date.now() + PICK_DAYS * 86400000 }));
      toast.success(`Welcome to ${c.label} ✦ this device stays on this branch for ${PICK_DAYS} days`);
      setOpen(false);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Couldn't select branch");
    } finally { setPicking(""); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" data-testid="geo-branch-gate">
      <div className="relative w-full max-w-lg rounded-3xl border border-[#d4af37]/30 bg-[#0d0b10] shadow-[0_30px_80px_-20px_rgba(212,175,55,0.35)] overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_top,rgba(212,175,55,0.22),transparent_65%)] pointer-events-none" />
        <div className="relative p-7 sm:p-8">
          <div className="text-[10px] uppercase tracking-[0.35em] text-[#d4af37]/80">{tenant?.name}</div>
          <h3 className="font-playfair text-2xl sm:text-3xl text-white mt-2 leading-tight">Which branch are you<br />working from today?</h3>
          <p className="text-xs text-white/50 mt-2">
            Choose once — this device remembers your branch for {PICK_DAYS} days.
            {geo.state === "locating" && <span className="inline-flex items-center gap-1 ml-1 text-[#d4af37]/80" data-testid="geo-branch-locating"><Loader2 className="w-3 h-3 animate-spin" /> checking your location…</span>}
            {gpsHit && <span className="ml-1 text-emerald-300/90">GPS found you — only the branch you&apos;re standing in is open.</span>}
          </p>

          <div className="mt-6 grid gap-3" data-testid="geo-branch-options">
            {cards.map((c, i) => (
              <button key={c.value} type="button" disabled={c.disabled || !!picking} onClick={() => pick(c)}
                data-testid={`geo-branch-option-${c.main ? "main" : c.value}`}
                style={{ animationDelay: `${i * 70}ms` }}
                className={`group relative w-full text-left rounded-2xl border px-4 py-3.5 flex items-center gap-4 transition-[transform,background-color,border-color] duration-200 animate-[fadeUp_.45s_ease-out_both]
                  ${c.disabled ? "border-white/5 bg-white/[0.02] opacity-40 cursor-not-allowed"
                    : "border-white/10 bg-white/[0.04] hover:bg-[#d4af37]/10 hover:border-[#d4af37]/60 hover:-translate-y-0.5"}`}>
                <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 border ${c.within ? "border-emerald-400/60 bg-emerald-500/15" : "border-[#d4af37]/40 bg-[#d4af37]/10"}`}>
                  {c.main ? <Store className={`w-5 h-5 ${c.within ? "text-emerald-300" : "text-[#d4af37]"}`} /> : <MapPin className={`w-5 h-5 ${c.within ? "text-emerald-300" : "text-[#d4af37]"}`} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-playfair text-lg text-white truncate">{c.label}</div>
                  <div className="text-[11px] text-white/45 truncate">
                    {c.main ? "Main salon" : "Branch"}{c.sub && c.sub !== c.label ? ` · ${c.sub}` : ""}
                    {c.pinned && c.distance_m != null && <span className={c.within ? " text-emerald-300/90" : " text-white/40"}> · {c.within ? `you're here (${c.distance_m} m)` : fmt(c.distance_m)}</span>}
                  </div>
                </div>
                {picking === c.value
                  ? <Loader2 className="w-5 h-5 animate-spin text-[#d4af37]" />
                  : <span className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${c.disabled ? "border-white/10 text-white/20" : "border-[#d4af37]/40 text-[#d4af37] group-hover:bg-[#d4af37] group-hover:text-black"}`}><Check className="w-4 h-4" /></span>}
              </button>
            ))}
          </div>

          {geo.state === "off" && (
            <div className="mt-4 flex items-center gap-2 text-[11px] text-white/40" data-testid="geo-branch-denied">
              <MapPinOff className="w-3.5 h-3.5 shrink-0" />
              <span>{geo.denied ? "Location is blocked, so every branch is offered — pick yours honestly." : "Location unavailable — pick your branch."}</span>
              <button type="button" onClick={locate} data-testid="geo-branch-retry" className="ml-auto inline-flex items-center gap-1 text-[#d4af37] hover:text-white"><LocateFixed className="w-3.5 h-3.5" /> Retry GPS</button>
            </div>
          )}
          {geo.state === "ready" && !geo.data.any_within && geo.data.any_pinned && (
            <p className="mt-4 text-[11px] text-white/40" data-testid="geo-branch-none-within">You&apos;re not within {geo.data.radius_m} m of a pinned branch — every branch is offered.</p>
          )}
        </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}

export default GeoBranchGate;
