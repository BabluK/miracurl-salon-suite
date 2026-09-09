// GA4 conversion events — safe no-op when gtag is blocked (adblock) or not loaded.
export function track(event, params = {}) {
  try {
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", event, params);
    }
  } catch { /* analytics must never break the app */ }
}

export const trackSignup = ({ slug, business_type, trial_days, region, referred }) =>
  track("sign_up", { method: "salon_signup", tenant_slug: slug, business_type, trial_days, region, referred: !!referred });

export const trackBooking = ({ slug, business_type, value, services, staff_picked }) =>
  track("booking_confirmed", { tenant_slug: slug, business_type, value, currency: "INR", services, staff_picked: !!staff_picked });

export const trackPurchase = ({ transaction_id, value, currency = "INR", plan, gateway, source }) =>
  track("purchase", { transaction_id, value, currency, items: [{ item_id: plan, item_name: plan, price: value, quantity: 1 }], gateway, source });
