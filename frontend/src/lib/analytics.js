// GA4 + Microsoft Clarity events and a first-party visit beacon — all safe no-ops when blocked (adblock) or not loaded.
import { currentRegion } from "@/lib/region";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export function track(event, params = {}) {
  try {
    if (typeof window.gtag === "function") window.gtag("event", event, params);
    if (typeof window.clarity === "function") {
      window.clarity("event", event);
      Object.entries(params).forEach(([k, v]) => { if (["string", "number", "boolean"].includes(typeof v)) window.clarity("set", k, String(v)); });
    }
  } catch { /* analytics must never break the app */ }
}

export const trackSignup = ({ slug, business_type, trial_days, region, referred }) =>
  track("sign_up", { method: "salon_signup", tenant_slug: slug, business_type, trial_days, region, referred: !!referred });

export const trackBooking = ({ slug, business_type, value, services, staff_picked }) =>
  track("booking_confirmed", { tenant_slug: slug, business_type, value, currency: "INR", services, staff_picked: !!staff_picked });

export const trackPurchase = ({ transaction_id, value, currency = "INR", plan, gateway, source }) =>
  track("purchase", { transaction_id, value, currency, items: [{ item_id: plan, item_name: plan, price: value, quantity: 1 }], gateway, source });

// Signup funnel: signup_start → signup_step (business/owner/location/confirm) → signup_submit → sign_up | signup_error
export const trackFunnel = (event, { business_type, region, locked, step, step_name, error } = {}) =>
  track(event, { business_type, region, locked: !!locked, step, step_name, error, funnel: "signup" });

export const trackCta = (cta, extra = {}) => track("cta_click", { cta, ...extra });

const MARKETING_PREFIXES = ["/pricing", "/features", "/restaurant", "/signup-", "/blog", "/about-us", "/who-can-use",
  "/contact-us", "/success-stories", "/products", "/ceo", "/demo", "/partner"];
const isMarketing = (p) => p === "/" || MARKETING_PREFIXES.some(x => p.startsWith(x));

function visitorId() {
  let v = localStorage.getItem("miracurl_vid");
  if (!v) {
    v = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, "").slice(0, 32);
    localStorage.setItem("miracurl_vid", v);
  }
  return v;
}

// First-party page visit (HQ "Traffic vs Conversion" card). Not prospects, so skipped: existing customers (tenant slug stored),
// the Boss's own device (HQ login seen), automation browsers, and anyone arriving from the Emergent builder.
const SELF_REFS = ["app.emergent.sh", "emergent.sh", "emergentagent.com"];
export function logVisit(pathname) {
  try {
    if (!isMarketing(pathname) || localStorage.getItem("miracurl_tenant") || localStorage.getItem("miracurl_hq_device")) return;
    if (navigator.webdriver) return;
    const q = new URLSearchParams(window.location.search);
    let ref = "";
    try { ref = document.referrer ? new URL(document.referrer).host : ""; } catch { ref = ""; }
    if (ref === window.location.host) ref = "";
    if (SELF_REFS.some(d => ref === d || ref.endsWith(`.${d}`))) return;
    const body = JSON.stringify({
      vid: visitorId(), path: pathname, ref, region: currentRegion(),
      device: window.matchMedia("(max-width: 640px)").matches ? "mobile" : "desktop",
      utm_source: q.get("utm_source") || undefined, utm_medium: q.get("utm_medium") || undefined,
    });
    fetch(`${BACKEND_URL}/api/public/visit`, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch { /* never break navigation */ }
}
