export const PLANS = [
  { key: "trial", title: "Free Trial", price: "₹0", per: "30 days", cta: "Start trial", primary: false,
    items: ["All features unlocked", "Up to 50 customers", "Email support", "Cancel anytime"] },
  { key: "monthly", title: "Monthly Plan", price: "…", per: "per month · cancel anytime", cta: "Get started", primary: false,
    items: ["Unlimited customers", "Unlimited bookings", "Per-stylist commission", "WhatsApp support", "All features"] },
  { key: "quarter", title: "3-Month Plan", price: "…", per: "for 3 months · flexible", cta: "Pay quarterly", primary: false,
    items: ["Everything in Monthly", "One payment per quarter", "WhatsApp support", "All features"] },
  { key: "annual", title: "Annual Plan", price: "…", per: "for 1 year", cta: "Best value", primary: true,
    items: ["Everything in Monthly", "12 months for the price of 11", "Priority support", "Custom branding next year"] },
  { key: "multi_branch", title: "Multi-Branch", price: "…", per: "annual plans for 2, 3 and 5+ branches", cta: "For salon chains", primary: false,
    items: ["Everything in Annual", "5+ branches, one account", "Branch-wise reports", "Dedicated onboarding"] },
];

export const fmtINR = (n) => "₹" + Number(n).toLocaleString("en-IN");
export const kINR = (n) => "₹" + Math.round(n / 1000) + "k";
export const fmtUSD = (n) => (n == null ? "…" : "$" + Number(n).toLocaleString("en-US"));

// Restaurant plans straight from the HQ catalog (vertical === "restaurant"), filtered by currency.
export function restoPlans(catalog, currency) {
  return Object.entries(catalog || {})
    .filter(([, v]) => v && typeof v === "object" && v.vertical === "restaurant" && (v.currency || "INR") === currency)
    .sort((a, b) => (a[1].duration_days || 0) - (b[1].duration_days || 0))
    .map(([k, v]) => ({
      key: k, label: v.custom ? v.label : (v.duration_days <= 31 ? "Monthly" : v.duration_days >= 365 ? "1 Year" : `${Math.round(v.duration_days / 30.4)} Months`),
      price: currency === "USD" ? fmtUSD(v.price) : fmtINR(v.price), popular: !!v.highlight,
      sub: v.duration_days <= 31 ? "Flexible — cancel anytime" : v.duration_days >= 365 ? "Best value — one payment a year" : "Perfect to try everything",
    }));
}

const INTL_TIERS = [
  { tier: "starter", title: "Starter", tagline: "For independent & small salons", primary: false,
    items: ["Online booking & CRM", "POS billing", "Email & WhatsApp reminders", "Email support"] },
  { tier: "professional", title: "Professional", tagline: "For growing salons", primary: true,
    items: ["Everything in Starter", "Inventory & vendors", "Staff payroll & commissions", "Analytics & reports", "Multi-staff accounts"] },
  { tier: "premium", title: "Premium AI", tagline: "For salons wanting Mira AI + automation", primary: false,
    items: ["Everything in Professional", "Mira AI receptionist", "AI marketing studio", "Review automation", "Staff verification registry"] },
];

export function buildIntlPlans(c) {
  const price = (key) => c?.[key]?.price ?? null;
  const keys = { starter: "intl_starter", professional: "intl_pro", premium: "intl_premium" };
  const anyHl = Object.entries(c || {}).some(([k, v]) => k.startsWith("intl_") && v?.highlight);
  const tiers = INTL_TIERS.filter(t => !c || c[`${keys[t.tier]}_monthly`]).map(t => {
    const k = keys[t.tier];
    const v = c?.[`${k}_monthly`];
    return { ...t, key: `${k}_monthly`, monthly: price(`${k}_monthly`), annual: price(`${k}_annual`),
      items: v?.features?.length ? v.features : t.items, primary: anyHl ? !!v?.highlight : t.primary };
  });
  return [...tiers, ...customPlanCards(c, "USD")];
}

const durLabel = (days) => {
  const m = Math.round((days || 30) / 30.4);
  return m >= 12 && m % 12 === 0 ? `for ${m / 12} year${m > 12 ? "s" : ""}` : m <= 1 ? "per month" : `for ${m} months`;
};

function customPlanCards(c, currency, vertical = "salon") {
  return Object.entries(c || {})
    .filter(([, v]) => v && typeof v === "object" && v.custom && (v.currency || "INR") === currency && (v.vertical || "salon") === vertical)
    .sort((a, b) => (a[1].price || 0) - (b[1].price || 0))
    .map(([key, v]) => ({
      key, title: v.label, price: currency === "USD" ? fmtUSD(v.price) : fmtINR(v.price), monthly: v.price, annual: null,
      per: `${durLabel(v.duration_days)}${(v.branches || 1) > 1 ? ` · ${v.branches} branches` : ""}`, cta: "Get started", primary: !!v.highlight,
      tagline: v.branches > 1 ? "For salon chains" : "All-in-one salon suite",
      items: v.features?.length ? v.features : ["All features included", currency === "USD" ? "Email & chat support" : "WhatsApp support", "Cancel anytime"],
    }));
}

export function buildPlans(c) {
  if (!c) return PLANS;
  const mo = c.monthly?.price, qt = c.quarter?.price, an = c.annual?.price;
  const b2a = c.two_branch_annual?.price, b3a = c.three_branch_annual?.price, b5a = c.multi_branch_annual?.price;
  const anyMulti = b2a || b3a || b5a;
  const kept = PLANS.filter(p => (p.key === "trial") || (p.key === "monthly" ? !!mo : p.key === "quarter" ? !!qt : p.key === "annual" ? !!an : p.key === "multi_branch" ? !!anyMulti : true));
  const catKey = (k) => (k === "multi_branch" ? "two_branch_annual" : k);
  const anyHl = Object.entries(c).some(([k, v]) => v && typeof v === "object" && v.highlight && !k.startsWith("intl_") && !k.startsWith("resto_"));
  const decorate = (p) => {
    const v = c[catKey(p.key)];
    return { ...p, items: v?.features?.length ? v.features : p.items, primary: anyHl ? !!v?.highlight : p.primary };
  };
  return [...kept.map(p => {
    if (p.key === "trial" && c.trial_days) return { ...p, per: `${c.trial_days} days` };
    if (p.key === "monthly" && mo) return { ...p, price: fmtINR(mo) };
    if (p.key === "quarter" && qt) return { ...p, price: fmtINR(qt), per: mo && mo * 3 > qt ? `for 3 months — save ${fmtINR(mo * 3 - qt)}` : "for 3 months · flexible" };
    if (p.key === "annual" && an) return { ...p, price: fmtINR(an), per: mo && mo * 12 > an ? `for 1 year — save ${fmtINR(mo * 12 - an)} (1 month free)` : "for 1 year" };
    if (p.key === "multi_branch" && b2a) return {
      ...p, price: `from ${fmtINR(b2a)}`,
      per: `2 branches ${kINR(b2a)}/yr · 3 branches ${kINR(b3a)}/yr · 5+ ${kINR(b5a)}/yr`,
    };
    return p;
  }).map(decorate), ...customPlanCards(c, "INR")];
}
