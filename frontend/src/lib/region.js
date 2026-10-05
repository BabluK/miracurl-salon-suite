const GEO_KEY = "miracurl_geo_region";

// Synchronous best guess: last server geo result → timezone → browser locale.
export function detectRegion() {
  try {
    const geo = sessionStorage.getItem(GEO_KEY);
    if (geo === "in" || geo === "intl") return geo;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz === "Asia/Kolkata" || tz === "Asia/Calcutta") return "in";
    if (tz) return "intl";
    return /-IN$/i.test(navigator.language || "") ? "in" : "intl";
  } catch {
    return "in";
  }
}

// Only an EXPLICIT choice (pricing toggle / signup switch) is remembered — merely opening a /…-us page never
// re-routes a visitor. The legacy "miracurl_region" key was polluted that way, so it is ignored and cleared.
const CHOICE_KEY = "miracurl_region_choice";

export function hasRegionChoice() {
  try { const c = localStorage.getItem(CHOICE_KEY); return c === "in" || c === "intl"; } catch { return false; }
}

export function currentRegion() {
  try {
    localStorage.removeItem("miracurl_region");
    const c = localStorage.getItem(CHOICE_KEY);
    return c === "in" || c === "intl" ? c : detectRegion();
  } catch { return detectRegion(); }
}

export function rememberRegion(k) {
  try { localStorage.setItem(CHOICE_KEY, k); } catch { /* private mode */ }
}

// Server-side IP country (edge header / IP lookup). Cached per tab; resolves to "in" | "intl" | null.
let _geoPromise = null;
export function resolveGeoRegion() {
  if (_geoPromise) return _geoPromise;
  try {
    const cached = sessionStorage.getItem(GEO_KEY);
    if (cached === "in" || cached === "intl") return Promise.resolve(cached);
  } catch { /* private mode */ }
  _geoPromise = fetch(`${process.env.REACT_APP_BACKEND_URL}/api/public/geo`)
    .then(r => (r.ok ? r.json() : null))
    .then(d => {
      const region = d?.region === "in" || d?.region === "intl" ? d.region : null;
      if (region) { try { sessionStorage.setItem(GEO_KEY, region); } catch { /* private mode */ } }
      return region;
    })
    .catch(() => null);
  return _geoPromise;
}

// Dedicated signup page for the visitor's vertical + region: /signup-{salon|restaurant}-{india|us}
export function signupHref(vertical = "salon", region = currentRegion()) {
  return `/signup-${vertical === "restaurant" ? "restaurant" : "salon"}-${region === "intl" ? "us" : "india"}`;
}
