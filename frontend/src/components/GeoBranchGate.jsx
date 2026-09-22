import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import api, { formatApiError, setTenantSlug } from "@/lib/api";
import { setSelectedBranch } from "@/lib/branch";
import { toast } from "sonner";
import { ShieldCheck, Store, Users } from "lucide-react";
import { DeniedView, PickerView } from "@/components/geo/GateViews";

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
  const [query, setQuery] = useState("");

  const norm = (x) => (x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const otherSalons = (user?.salons || []).filter(s => s.id !== tenant?.id);
  // A branch that is ALSO a linked business (same name) → show the business card only, never twice
  const branches = (tenant?.branches || []).filter(b => !otherSalons.some(sl => norm(sl.name) === norm(b.name) || norm(sl.name).includes(norm(b.name).slice(0, 24))));
  // Staff are never gated: they sign in from anywhere and GPS is enforced only at attendance
  // check-in (fenced to their tagged branch — staff_portal.py). Only floating managers pick.
  const eligible = user && tenant && (branches.length > 0 || otherSalons.length > 0)
    && user.role === "manager" && !user.branch;

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

  const autoRef = useRef(false);
  useEffect(() => {
    if (!open || !strict || geo.state !== "ready" || picking || autoRef.current) return;
    const within = cards.filter(c => c.within && !c.disabled);
    if (within.length === 1) { autoRef.current = true; pick(within[0]); }
  }, [open, strict, geo.state, cards, picking]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const signOut = async () => { setOpen(false); await logout(); navigate("/login", { replace: true }); };
  const hours = tenant?.hours || "Open today";

  // Strict roles outside every branch (or with GPS off / no pins): no picker at all — a clear refusal + sign out.
  const denied = strict && geo.state !== "locating" && !gpsHit;
  if (denied) {
    const reason = geo.state === "off"
      ? "We couldn't read your phone's location. Turn on location for this site and try again."
      : geo.state === "ready" && geo.data.any_pinned
        ? "You are trying to sign in from a different location — we can't find you at any place where this business operates."
        : "We can't find the location where this business operates yet — ask the owner to pin the branch GPS.";
    const pinned = gpsOpts.filter(o => o.pinned).sort((a, b) => a.distance_m - b.distance_m);
    const nearest = pinned[0];
    const nearestLabel = nearest ? (nearest.value === "__main__" ? (tenant?.name || "Main salon") : nearest.label) : null;
    const nearestSub = nearest ? (nearest.value === "__main__" ? (tenant?.location || "Main salon") : (nearest.salon?.location || "Branch")) : "";
    const dirUrl = nearest ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(nearestLabel + " " + nearestSub)}` : null;
    const radius = geo.data?.radius_m || 100;
    const features = [
      [Users, `Manager logins open only inside a branch (within ${radius} m). Staff sign in anywhere — GPS applies at check-in.`],
      [Store, "Owners can sign in from anywhere."],
      [ShieldCheck, "This keeps your salon data safe and secure."],
    ];
    return <DeniedView reason={reason} features={features} nearest={nearest} nearestLabel={nearestLabel} nearestSub={nearestSub} dirUrl={dirUrl}
      onRetry={locate} onLogout={signOut} locating={geo.state === "locating"} />;
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
  const statusTestId = geo.state === "off" ? "geo-branch-denied" : geo.state === "ready" && !geo.data.any_within && geo.data.any_pinned ? "geo-branch-none-within" : "geo-branch-status";
  const subtitle = strict ? "We check your location every time you open the app — only the branch you're standing in can be opened." : `Choose once — this device remembers your branch for ${PICK_DAYS} days.`;

  return <PickerView user={user} cards={cards} gateTitle={gateTitle} subtitle={subtitle} footNote={footNote} locating={geo.state === "locating"} showRetry={showRetry}
    picking={picking} hours={hours} query={query} setQuery={setQuery} onPick={pick} onRetry={locate} onLogout={signOut} statusTestId={statusTestId} />;
}

export default GeoBranchGate;
