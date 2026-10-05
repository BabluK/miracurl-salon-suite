export function detectRegion() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    return tz === "Asia/Kolkata" || tz === "Asia/Calcutta" ? "in" : "intl";
  } catch {
    return "in";
  }
}

// Only an EXPLICIT choice (pricing toggle / signup switch) is remembered — merely opening a /…-us page never
// re-routes a visitor. The legacy "miracurl_region" key was polluted that way, so it is ignored and cleared.
const CHOICE_KEY = "miracurl_region_choice";

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

// Dedicated signup page for the visitor's vertical + region: /signup-{salon|restaurant}-{india|us}
export function signupHref(vertical = "salon", region = currentRegion()) {
  return `/signup-${vertical === "restaurant" ? "restaurant" : "salon"}-${region === "intl" ? "us" : "india"}`;
}
