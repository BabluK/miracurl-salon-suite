import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import api, { formatApiError, setTenantSlug } from "@/lib/api";
import { setSelectedBranch } from "@/lib/branch";
import { toast } from "sonner";
import { ChevronRight, Loader2, LocateFixed, MapPin, Smartphone, Store } from "lucide-react";

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
// luxe card list and remembers it for 15 days. Managers & staff can ONLY open the branch GPS
// confirms (≤100 m) — everything else is disabled. Owners are never gated (header switcher).
export function GeoBranchGate() {
  const { user, tenant, refresh } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [geo, setGeo] = useState({ state: "idle", data: null }); // idle | locating | ready | off
  const [picking, setPicking] = useState("");

  const branches = tenant?.branches || [];
  const otherSalons = (user?.salons || []).filter(s => s.id !== tenant?.id);
  const eligible = user && tenant && (branches.length > 0 || otherSalons.length > 0)
    && ((user.role === "manager" && !user.branch) || user.role === "staff");

  useEffect(() => {
    if (!eligible) return;
    const saved = readBranchPick(user.id);
    if (saved && saved.tenant_id && saved.tenant_id !== tenant.id) { localStorage.removeItem(pickKey(user.id)); setOpen(true); return; }
    if (saved) { setSelectedBranch(saved.branch); return; }
    setOpen(true);
  }, [eligible, user, tenant]);

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
  const strict = user?.role !== "admin"; // managers & staff: GPS must confirm the branch; owners switch freely from the header
  const byValue = Object.fromEntries(gpsOpts.map(o => [o.value, o]));
  const cards = [
    { value: "__main__", label: tenant?.name || "Main salon", sub: tenant?.location || "Main salon", main: true },
    ...branches.map(b => ({ value: b.name, label: b.name, sub: b.address || b.location || "Branch", image: b.image_url || b.photo_url })),
    ...otherSalons.map(sl => ({ value: `salon:${sl.id}`, label: sl.name, sub: sl.location || "Another business on your login", salon: sl })),
  ].map((c, i) => {
    const g = byValue[c.value];
    const thumb = c.main ? (tenant?.hero_image || "/assets/branch-gate/thumb-main.jpg") : (c.salon?.hero_image || c.image || `/assets/branch-gate/thumb-${i % 2 ? "branch" : "main"}.jpg`);
    const disabled = strict ? !g?.within : (gpsHit && !g?.within);
    return { ...c, thumb, distance_m: g?.distance_m ?? null, pinned: !!g?.pinned, within: !!g?.within, disabled };
  });

  async function pick(c) {
    setPicking(c.value);
    try {
      const { data } = await api.post("/branch/pick", { branch: c.value, distance_m: c.distance_m, gps_verified: !!c.within });
      const until = Date.now() + PICK_DAYS * 86400000;
      if (data.switched) {
        setTenantSlug(data.switched.slug);
        localStorage.setItem("miracurl_tenant", data.switched.slug);
        setSelectedBranch("__main__");
        localStorage.setItem(pickKey(user.id), JSON.stringify({ branch: "__main__", tenant_id: data.switched.id, until }));
        toast.success(`Welcome to ${data.switched.name} ✦ this device stays here for ${PICK_DAYS} days`);
        setOpen(false);
        queryClient.clear();
        await refresh();
        navigate("/dashboard", { replace: true });
        return;
      }
      setSelectedBranch(c.value);
      localStorage.setItem(pickKey(user.id), JSON.stringify({ branch: c.value, tenant_id: tenant.id, until }));
      toast.success(`Welcome to ${c.label} ✦ this device stays on this branch for ${PICK_DAYS} days`);
      setOpen(false);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Couldn't select branch");
    } finally { setPicking(""); }
  }

  if (!open) return null;

  const gateTitle = otherSalons.length && !branches.length ? ["Which salon are you", "working from today?"] : ["Which branch are you", "working from today?"];
  const footNote = geo.state === "locating" ? "Checking your location…"
    : gpsHit ? "GPS found you — only the branch you're standing in is open."
    : geo.state === "ready" && geo.data.any_pinned ? (strict
      ? `You're not within ${geo.data.radius_m} m of any branch — walk in to your branch and tap Retry GPS.`
      : `You're not within ${geo.data.radius_m} m of a pinned branch — every branch is offered.`)
    : geo.state === "off" ? (strict
      ? "Location is required to open a branch — allow location for this site and tap Retry GPS."
      : (geo.denied ? "Location is blocked, so every branch is offered — pick yours honestly." : "Location unavailable — pick your branch."))
    : strict ? "No GPS pin set for your branches yet — ask the owner to pin them (Dashboard → Pin this branch)." : "No GPS pins yet — every branch is offered.";
  const showRetry = geo.state === "off" || (strict && geo.state === "ready" && !gpsHit);

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto" data-testid="geo-branch-gate">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(/assets/branch-gate/bg.jpg)" }} />
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.15),rgba(0,0,0,0.75)_85%)]" />

      <span className="hidden md:block absolute left-[3%] top-[22%] font-caveat text-2xl leading-tight text-[#e8c97a]/85 -rotate-6 select-none">Beautiful<br />Salons<br />Brighter<br />Businesses<br /><span className="text-xl">♡</span></span>
      <span className="hidden md:block absolute right-[3%] top-[6%] font-caveat text-2xl leading-tight text-[#e8c97a]/85 rotate-6 text-right select-none">Empowering<br />Salon Owners<br />Worldwide ♡</span>
      <span className="hidden md:block absolute right-[5%] bottom-[9%] font-caveat text-3xl leading-tight text-[#e8c97a]/90 -rotate-6 text-right select-none">Salon Smarter<br />Everyday ♡</span>

      <div className="relative min-h-full flex flex-col items-center px-4 py-8 sm:py-10">
        <img src="/assets/brand/gold-lockup-transparent.png" alt="Miracurl AI Salon Suite" className="h-16 sm:h-20 w-auto drop-shadow-[0_6px_24px_rgba(212,175,55,0.35)]" />
        <div className="mt-1 text-[10px] sm:text-[11px] tracking-[0.42em] text-white/85 font-semibold">MANAGE · AUTOMATE · GROW</div>

        <h3 className="font-playfair text-center text-4xl sm:text-5xl lg:text-6xl text-white mt-8 leading-[1.05]">
          {gateTitle[0]}<br /><span className="text-[#e8c97a]">{gateTitle[1]}</span>
        </h3>
        <p className="mt-4 text-base sm:text-lg text-white/80 text-center">Choose once — this device remembers your branch for {PICK_DAYS} days.</p>

        <div className="mt-8 w-full max-w-3xl grid gap-4" data-testid="geo-branch-options">
          {cards.map((c, i) => {
            const hot = c.within || (!strict && !gpsHit && i === 0 && !c.disabled);
            return (
              <button key={c.value} type="button" disabled={c.disabled || !!picking} onClick={() => pick(c)}
                data-testid={`geo-branch-option-${c.main ? "main" : c.value}`}
                style={{ animationDelay: `${i * 90}ms` }}
                className={`group relative w-full text-left rounded-[26px] border-2 p-3 sm:p-3.5 flex items-center gap-4 sm:gap-5 backdrop-blur-xl transition-[transform,box-shadow,border-color] duration-300 animate-[fadeUp_.5s_ease-out_both]
                  ${c.disabled ? "border-white/10 bg-black/40 opacity-45 cursor-not-allowed"
                    : hot ? "border-[#e8c97a] bg-black/55 shadow-[0_0_0_1px_rgba(232,201,122,0.35),0_18px_60px_-15px_rgba(232,201,122,0.55)] hover:-translate-y-0.5"
                    : "border-white/15 bg-black/55 hover:border-[#e8c97a]/70 hover:-translate-y-0.5"}`}>
                <img src={c.thumb} alt="" className="hidden sm:block w-40 h-28 object-cover rounded-2xl shrink-0 border border-white/10" />
                <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center shrink-0 border ${c.within || hot ? "border-[#e8c97a]/70 bg-[#e8c97a]/10" : "border-white/25 bg-white/5"}`}>
                  {c.main ? <Store className="w-6 h-6 text-[#e8c97a]" /> : <MapPin className="w-6 h-6 text-[#e8c97a]" />}
                </div>
                <div className="min-w-0 flex-1 py-1">
                  <div className="font-playfair text-xl sm:text-3xl text-white leading-tight truncate">{c.label}</div>
                  <div className="mt-1.5 text-sm sm:text-base text-white/75 flex items-start gap-1.5">
                    <MapPin className="w-4 h-4 mt-0.5 text-[#e8c97a] shrink-0" />
                    <span className="line-clamp-2">
                      {c.main ? "Main salon" : c.salon ? "Salon" : "Branch"}{c.sub && c.sub !== c.label ? ` · ${c.sub}` : ""}
                      {c.pinned && c.distance_m != null && <span className={c.within ? " text-emerald-300" : " text-white/60"}> · {c.within ? `you're here (${c.distance_m} m)` : fmt(c.distance_m)}</span>}
                    </span>
                  </div>
                </div>
                {picking === c.value
                  ? <Loader2 className="w-6 h-6 animate-spin text-[#e8c97a] shrink-0 mr-2" />
                  : <span className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full border flex items-center justify-center shrink-0 mr-1 transition-colors ${c.disabled ? "border-white/10 text-white/25" : hot ? "bg-[#e8c97a] border-[#e8c97a] text-black" : "border-white/30 text-white group-hover:bg-[#e8c97a] group-hover:border-[#e8c97a] group-hover:text-black"}`}><ChevronRight className="w-6 h-6" /></span>}
              </button>
            );
          })}
        </div>

        <div className="mt-8 w-full max-w-3xl flex items-center gap-4 text-white/80 text-sm sm:text-base px-2" data-testid={geo.state === "off" ? "geo-branch-denied" : geo.state === "ready" && !geo.data.any_within && geo.data.any_pinned ? "geo-branch-none-within" : "geo-branch-status"}>
          {geo.state === "locating" ? <Loader2 className="w-8 h-8 animate-spin text-[#e8c97a] shrink-0" data-testid="geo-branch-locating" /> : <Smartphone className="w-9 h-9 text-white/85 shrink-0" strokeWidth={1.4} />}
          <span>{footNote}</span>
          {showRetry && <button type="button" onClick={locate} data-testid="geo-branch-retry" className="ml-auto inline-flex items-center gap-1 text-[#e8c97a] hover:text-white whitespace-nowrap"><LocateFixed className="w-4 h-4" /> Retry GPS</button>}
        </div>

        <div className="mt-10 flex items-center gap-4 text-white/85 text-[11px] sm:text-xs tracking-[0.38em] font-semibold">
          <span className="h-px w-16 sm:w-28 bg-white/50" />MANAGE · AUTOMATE · GROW<span className="h-px w-16 sm:w-28 bg-white/50" />
        </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}

export default GeoBranchGate;
