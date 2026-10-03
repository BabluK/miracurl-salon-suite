export function detectRegion() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    return tz === "Asia/Kolkata" || tz === "Asia/Calcutta" ? "in" : "intl";
  } catch {
    return "in";
  }
}

export function currentRegion() {
  try { return localStorage.getItem("miracurl_region") || detectRegion(); } catch { return "in"; }
}

// Dedicated signup page for the visitor's vertical + region: /signup-{salon|restaurant}-{india|us}
export function signupHref(vertical = "salon", region = currentRegion()) {
  return `/signup-${vertical === "restaurant" ? "restaurant" : "salon"}-${region === "intl" ? "us" : "india"}`;
}
