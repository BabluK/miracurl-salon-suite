import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import api, { formatApiError, setTenantSlug } from "@/lib/api";
import { setSelectedBranch } from "@/lib/branch";
import { toast } from "sonner";
import { ChevronRight, Loader2, LocateFixed, LogOut, MapPin, Smartphone, Star, Store } from "lucide-react";

const PICK_DAYS = 15;
const pickKey = (uid) => `miracurl_branch_pick:${uid}`;

const store = (strict) => (strict ? sessionStorage : localStorage);

export function readBranchPick(uid, strict = true) {
  try {
    const raw = store(strict).getItem(pickKey(uid));
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p.until || Date.now() > p.until) { store(strict).removeItem(pickKey(uid)); return null; }
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
  const { user, tenant, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [geo, setGeo] = useState({ state: "idle", data: null }); // idle | locating | ready | off
  const [picking, setPicking] = useState("");

  const norm = (x) => (x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const otherSalons = (user?.salons || []).filter(s => s.id !== tenant?.id);
  // A branch that is ALSO a linked business (same name) → show the business card only, never twice
  const branches = (tenant?.branches || []).filter(b => !otherSalons.some(sl => norm(sl.name) === norm(b.name) || norm(sl.name).includes(norm(b.name).slice(0, 24))));
  const eligible = user && tenant && (branches.length > 0 || otherSalons.length > 0)
    && ((user.role === "manager" && !user.branch) || user.role === "staff");

  useEffect(() => {
    if (!eligible) return;
    const saved = readBranchPick(user.id, user.role !== "admin");
    if (saved && saved.tenant_id && saved.tenant_id !== tenant.id) { store(user.role !== "admin").removeItem(pickKey(user.id)); setOpen(true); return; }
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
  const SCRIPTS = ["Your Go-To Salon ♡", "More Beauty Moments ♡", "Glow Starts Here ♡", "Style, Every Day ♡"];
  const chipsFor = (t) => (t?.service_categories || t?.categories || []).map(x => (typeof x === "string" ? x : x?.name)).filter(Boolean).slice(0, 4);
  const cards = [
    { value: "__main__", label: tenant?.name || "Main salon", sub: tenant?.location || "Main salon", main: true, badge: "Main salon", chips: chipsFor(tenant) },
    ...branches.map(b => ({ value: b.name, label: b.name, sub: b.address || b.location || "Branch", image: b.image_url || b.photo_url, badge: `${(b.short_name || b.name.split(/[-–—]/).pop() || "").trim().split(/\s+/).slice(0, 2).join(" ") || "Branch"} branch`, chips: chipsFor(tenant) })),
    ...otherSalons.map(sl => ({ value: `salon:${sl.id}`, label: sl.name, sub: sl.location || "Another business on your login", salon: sl, badge: "Salon", chips: [] })),
  ].map((c, i) => {
    const g = byValue[c.value];
    const thumb = c.main ? (tenant?.hero_image || "/assets/branch-gate/thumb-main.jpg") : (c.salon?.hero_image || c.image || `/assets/branch-gate/thumb-${i % 2 ? "branch" : "main"}.jpg`);
    const disabled = strict ? !g?.within : (gpsHit && !g?.within);
    return { ...c, thumb, script: SCRIPTS[i % SCRIPTS.length], distance_m: g?.distance_m ?? null, pinned: !!g?.pinned, within: !!g?.within, disabled };
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
        store(strict).setItem(pickKey(user.id), JSON.stringify({ branch: "__main__", tenant_id: data.switched.id, until }));
        toast.success(strict ? `Welcome to ${data.switched.name} ✦ GPS verified` : `Welcome to ${data.switched.name} ✦ this device stays here for ${PICK_DAYS} days`);
        setOpen(false);
        queryClient.clear();
        await refresh();
        navigate("/dashboard", { replace: true });
        return;
      }
      setSelectedBranch(c.value);
      store(strict).setItem(pickKey(user.id), JSON.stringify({ branch: c.value, tenant_id: tenant.id, until }));
      toast.success(strict ? `Welcome to ${c.label} ✦ GPS verified` : `Welcome to ${c.label} ✦ this device stays on this branch for ${PICK_DAYS} days`);
      setOpen(false);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Couldn't select branch");
    } finally { setPicking(""); }
  }

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  // Strict roles outside every branch (or with GPS off / no pins): no picker at all — a clear refusal + sign out.
  const denied = strict && geo.state !== "locating" && !gpsHit;
  if (denied) {
    const reason = geo.state === "off"
      ? "We couldn't read your phone's location. Turn on location for this site and try again."
      : geo.state === "ready" && geo.data.any_pinned
        ? "You are trying to sign in from a different location — we can't find you at any place where this business operates."
        : "We can't find the location where this business operates yet — ask the owner to pin the branch GPS.";
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md" data-testid="geo-branch-gate">
        <div className="relative w-full max-w-lg rounded-[28px] overflow-hidden border border-[#e8c97a]/30 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)] bg-[#0b0a0c]" data-testid="geo-branch-denied">
          <img src="/assets/branch-gate/thumb-main.jpg" alt="" className="w-full h-44 object-cover opacity-80" />
          <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-transparent to-[#0b0a0c]" />
          <div className="relative -mt-10 px-7 pb-7 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-[#1a160d] border-2 border-[#d4af37] flex items-center justify-center shadow-[0_0_25px_rgba(232,201,122,0.45)]"><MapPin className="w-8 h-8 text-[#e8c97a]" /></div>
            <h3 className="font-playfair text-2xl sm:text-3xl text-white mt-4 leading-tight">Sorry, you can&apos;t sign in<br /><span className="text-[#e8c97a]">from this location</span></h3>
            <p className="mt-3 text-sm sm:text-base text-white/80" data-testid="geo-branch-denied-reason">{reason}</p>
            <p className="mt-2 text-xs text-white/55">Manager & staff logins open only inside a branch (within {geo.data?.radius_m || 100} m). Owners can sign in from anywhere.</p>
            <div className="mt-6 flex flex-col sm:flex-row gap-2.5 justify-center">
              <button type="button" onClick={locate} data-testid="geo-branch-retry" className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[#e8c97a]/60 text-[#e8c97a] hover:bg-[#e8c97a]/10 px-5 py-2.5 text-sm font-semibold"><LocateFixed className="w-4 h-4" /> Retry GPS</button>
              <button type="button" onClick={async () => { setOpen(false); await logout(); navigate("/login", { replace: true }); }} data-testid="geo-branch-logout"
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#e8c97a] text-[#1a160d] hover:bg-[#f3d98a] px-5 py-2.5 text-sm font-bold"><LogOut className="w-4 h-4" /> Sign out</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md" data-testid="geo-branch-gate" onWheel={e => e.stopPropagation()}>
      <div className="relative w-full max-w-4xl max-h-[94vh] overflow-y-auto rounded-[32px] border border-[#e8c97a]/30 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9),0_0_60px_-10px_rgba(232,201,122,0.25)] bg-[#0b0a0c]" data-testid="geo-branch-modal">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(/assets/branch-gate/bg.jpg)" }} />
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.1),rgba(0,0,0,0.8)_90%)]" />

      <button type="button" onClick={async () => { setOpen(false); await logout(); navigate("/login", { replace: true }); }} data-testid="geo-branch-logout"
        className="absolute top-4 right-4 z-10 inline-flex items-center gap-1.5 text-xs font-semibold text-white/80 hover:text-white bg-black/50 hover:bg-black/70 border border-white/15 rounded-full px-3 py-1.5 backdrop-blur transition-colors">
        <LogOut className="w-3.5 h-3.5" /> Sign out
      </button>
      <div className="relative flex flex-col items-center px-4 sm:px-8 py-8 sm:py-10">
        <div className="relative inline-block py-1 px-3" data-testid="geo-branch-logo">
          <img src="/assets/brand/gold-lockup-transparent.png" alt="Miracurl AI Salon Suite" className="h-14 sm:h-16 w-auto relative z-10 drop-shadow-[0_6px_24px_rgba(212,175,55,0.4)] logo-sparkle-anim animate-[logoGlow_3.6s_ease-in-out_infinite]" />
          <span className="sparkle-particle absolute top-0 left-3 text-[#e8c97a] text-xs pointer-events-none animate-[sparkleFloat1_2.5s_ease-in-out_infinite]">✦</span>
          <span className="sparkle-particle absolute top-2 right-2 text-[#fff4d6] text-sm pointer-events-none animate-[sparkleFloat2_3.2s_ease-in-out_0.5s_infinite]">✦</span>
          <span className="sparkle-particle absolute -bottom-1 left-1/3 text-[#d4af37] text-xs pointer-events-none animate-[sparkleFloat3_2.8s_ease-in-out_1s_infinite]">✦</span>
          <span className="sparkle-particle absolute bottom-2 right-1/4 text-[#e8c97a] text-[10px] pointer-events-none animate-[sparkleFloat1_3.6s_ease-in-out_1.6s_infinite]">✦</span>
        </div>
        <div className="mt-1 text-[10px] sm:text-[11px] tracking-[0.42em] text-white/85 font-semibold">MANAGE · AUTOMATE · GROW</div>

        <h3 className="font-playfair text-center text-3xl sm:text-4xl lg:text-5xl text-white mt-6 leading-[1.08]">
          {gateTitle[0]}<br /><span className="text-[#e8c97a]">{gateTitle[1]}</span>
        </h3>
        <p className="mt-4 text-base sm:text-lg text-white/80 text-center">{strict ? "We check your location every time you open the app — only the branch you're standing in can be opened." : `Choose once — this device remembers your branch for ${PICK_DAYS} days.`}</p>

        <div className="mt-7 w-full grid gap-4" data-testid="geo-branch-options">
          {cards.map((c, i) => {
            const hot = !c.disabled && (c.within || (!strict && !gpsHit && i === 0));
            const cardCls = c.disabled
              ? "border border-white/10 bg-black/40 backdrop-blur-md opacity-45 cursor-not-allowed grayscale"
              : hot
                ? "border-2 border-[#e8c97a] bg-gradient-to-br from-[#fff4d6] to-[#f3d98a] shadow-[0_0_25px_rgba(232,201,122,0.6),0_15px_40px_rgba(0,0,0,0.5)] hover:-translate-y-1"
                : "border border-white/20 bg-black/60 backdrop-blur-xl hover:border-[#e8c97a]/70 hover:bg-black/75 hover:-translate-y-1 shadow-[0_10px_30px_rgba(0,0,0,0.45)]";
            const chips = c.chips || [];
            return (
              <button key={c.value} type="button" disabled={c.disabled || !!picking} onClick={() => pick(c)}
                data-testid={`geo-branch-option-${c.main ? "main" : c.value}`}
                style={{ animationDelay: `${i * 90}ms` }}
                className={`group relative w-full text-left rounded-[26px] p-3.5 sm:p-4 flex items-center gap-4 sm:gap-5 transition-[transform,box-shadow,border-color,background-color] duration-300 animate-[fadeUp_.5s_ease-out_both] ${cardCls}`}>
                <div className="relative hidden sm:block shrink-0">
                  <img src={c.thumb} alt="" className="w-44 h-32 object-cover rounded-[18px] border border-white/10" />
                  <span className={`absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full flex items-center gap-1 ${hot ? "bg-[#e8c97a] text-[#1a160d] shadow-sm" : "bg-black/75 text-white/90 border border-white/20"}`}>
                    {c.main ? <Star className="w-3 h-3 fill-current" /> : <MapPin className="w-3 h-3" />}{c.badge}
                  </span>
                </div>
                <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center shrink-0 ${hot ? "border-2 border-[#d4af37] bg-[#1a160d] text-[#e8c97a]" : "border border-[#e8c97a]/50 bg-[#e8c97a]/10 text-[#e8c97a]"}`}>
                  {c.main ? <Store className="w-6 h-6" /> : <MapPin className="w-6 h-6" />}
                </div>
                <div className="min-w-0 flex-1 py-0.5">
                  <div className={`font-playfair text-xl sm:text-[28px] font-semibold leading-tight ${hot ? "text-[#1a160d]" : "text-white"}`}>{c.label}</div>
                  <div className={`mt-1.5 text-sm sm:text-base flex items-start gap-1.5 ${hot ? "text-[#3a2f18]" : "text-white/75"}`}>
                    <MapPin className={`w-4 h-4 mt-0.5 shrink-0 ${hot ? "text-[#b8912e]" : "text-[#e8c97a]"}`} />
                    <span className="lg:pr-40">
                      {c.main ? "Main salon" : c.salon ? "Salon" : "Branch"}{c.sub && c.sub !== c.label ? ` · ${c.sub}` : ""}
                      {c.pinned && c.distance_m != null && <span className={c.within ? (hot ? " text-emerald-700 font-medium" : " text-emerald-300") : (hot ? " text-[#6b5a2e]" : " text-white/60")}> · {c.within ? `you're here (${c.distance_m} m)` : fmt(c.distance_m)}</span>}
                    </span>
                  </div>
                  {chips.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {chips.map(ch => <span key={ch} className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${hot ? "bg-black/10 border-black/15 text-[#2c2211]" : "bg-white/10 border-white/15 text-white/85"}`}>{ch}</span>)}
                    </div>
                  )}
                </div>
                <span className={`font-caveat text-lg hidden lg:block absolute right-24 bottom-3 -rotate-6 leading-tight select-none pointer-events-none ${hot ? "text-[#b8912e]" : "text-[#e8c97a]/80"}`}>{c.script}</span>
                {picking === c.value
                  ? <Loader2 className={`w-6 h-6 animate-spin shrink-0 mr-2 ${hot ? "text-[#1a160d]" : "text-[#e8c97a]"}`} />
                  : <span className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center shrink-0 transition-[transform,background-color,color] ${c.disabled ? "border border-white/10 text-white/25" : hot ? "bg-[#1a160d] text-[#e8c97a] border border-[#d4af37] shadow-md group-hover:scale-105" : "bg-white/5 border border-white/30 text-white group-hover:bg-[#e8c97a] group-hover:border-[#e8c97a] group-hover:text-black"}`}><ChevronRight className="w-6 h-6" /></span>}
              </button>
            );
          })}
        </div>

        <div className="mt-6 w-full flex items-center gap-3 text-white/85 text-sm sm:text-base bg-black/40 border border-white/10 backdrop-blur-lg rounded-2xl py-3.5 px-5 shadow-lg" data-testid={geo.state === "off" ? "geo-branch-denied" : geo.state === "ready" && !geo.data.any_within && geo.data.any_pinned ? "geo-branch-none-within" : "geo-branch-status"}>
          {geo.state === "locating" ? <Loader2 className="w-8 h-8 animate-spin text-[#e8c97a] shrink-0" data-testid="geo-branch-locating" /> : <Smartphone className="w-9 h-9 text-white/85 shrink-0" strokeWidth={1.4} />}
          <span>{footNote}</span>
          {showRetry && <button type="button" onClick={locate} data-testid="geo-branch-retry" className="ml-auto inline-flex items-center gap-1 text-[#e8c97a] hover:text-white whitespace-nowrap"><LocateFixed className="w-4 h-4" /> Retry GPS</button>}
        </div>

        <div className="mt-8 flex items-center gap-4 text-white/85 text-[10px] sm:text-xs tracking-[0.3em] sm:tracking-[0.38em] font-semibold whitespace-nowrap">
          <span className="h-px w-16 sm:w-28 bg-white/50" />MANAGE · AUTOMATE · GROW<span className="h-px w-16 sm:w-28 bg-white/50" />
        </div>
      </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes logoGlow{0%,100%{filter:drop-shadow(0 0 6px rgba(232,201,122,.35))}50%{filter:drop-shadow(0 0 18px rgba(232,201,122,.85)) brightness(1.12)}}
@keyframes sparkleFloat1{0%,100%{transform:translate(0,0) scale(.6);opacity:.2}50%{transform:translate(-6px,-10px) scale(1.1);opacity:1}}
@keyframes sparkleFloat2{0%,100%{transform:translate(0,0) scale(.5);opacity:.3}50%{transform:translate(8px,-12px) scale(1.2);opacity:.9}}
@keyframes sparkleFloat3{0%,100%{transform:translate(0,0) scale(.7);opacity:.1}50%{transform:translate(4px,-8px) scale(1);opacity:.95}}
@media (prefers-reduced-motion: reduce){.logo-sparkle-anim,.sparkle-particle{animation:none !important}}`}</style>
    </div>
  );
}

export default GeoBranchGate;
