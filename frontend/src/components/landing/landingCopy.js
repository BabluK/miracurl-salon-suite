// Region-aware marketing copy. India keeps every original string; US/International visitors get the same
// product described in their terms (USD, local sales tax, email/WhatsApp reminders, no GST/₹ references).
export const US_FEATURE_OVERRIDES = {
  "Online Booking 24/7": { desc: "Clients self-book in 5 taps — share your link anywhere, stylist-level slots, zero double-booking." },
  "WhatsApp Confirmations": { title: "Email & WhatsApp Reminders", desc: "Automatic confirmations, reminders & review requests — fewer no-shows without lifting a finger." },
  "Reviews → ₹ Credits": { title: "Reviews → $ Credits", desc: "4★+ reviews earn a $5 credit — lifts your Google rating on autopilot." },
  "POS Billing & CRM": { desc: "Multi-tab checkout, card or cash, receipts with your local sales tax, tips, and full client visit history." },
  "Staff Payroll": { desc: "Automated pay, commissions, tips and downloadable pay stubs." },
  "Verified Staff Registry": { desc: "Cross-salon staff verification with badges, ID cards and work history." },
};

export const COPY = {
  in: {
    navCta: "Sign Up",
    bullets: ["Unlimited bookings", "GST billing built-in", "WhatsApp share built-in"],
    stats: [{ v: "₹0", l: "Setup cost" }, { v: "90 sec", l: "To go live" }, { v: "24/7", l: "AI receptionist" }, { v: "0%", l: "Booking commission" }],
    featuresH2: ["Built for how Indian salons ", "actually", " work"],
    miraDesc: "Voice briefings in English & Hindi, AI poster studio, review replies — and a 24/7 booking agent that chats with your clients and fills your calendar.",
    posDesc: "GST billing, thermal receipts with Google-review QR, multi-stylist invoices.",
    registryDesc: "Aadhaar-verified cross-salon history, geo-fenced attendance, auto badges + PDF.",
    demoBookPath: "/book/miracurl-marathahalli",
    trustLabel: "Trusted by salons across India",
    finalH2: "Ready to bring your salon online?",
    finalSub: "Set up in 90 seconds. Cancel anytime in your trial. Pay only when it works.",
  },
  intl: {
    navCta: "Start free trial",
    bullets: ["Unlimited bookings & staff", "Card or cash POS · local sales tax", "Email & WhatsApp reminders built-in"],
    stats: [{ v: "$0", l: "Setup cost" }, { v: "90 sec", l: "To go live" }, { v: "24/7", l: "AI receptionist" }, { v: "0%", l: "Booking commission" }],
    featuresH2: ["Built for how US salons & restaurants ", "actually", " work"],
    miraDesc: "Voice briefings, AI poster studio, review replies — and a 24/7 booking agent that chats with your clients and fills your calendar.",
    posDesc: "Card or cash checkout, tips, receipts with your local sales tax and a Google-review QR, multi-stylist tickets.",
    registryDesc: "ID-verified cross-salon work history, geo-fenced clock-in, auto badges + PDF.",
    demoBookPath: "/book/glow-studio-austin",
    trustLabel: "Live platform numbers",
    finalH2: "Ready to bring your salon or restaurant online?",
    finalSub: "Set up in 90 seconds. 30-day free trial, no credit card. Cancel anytime.",
  },
};

export const localizeFeatures = (features, region) =>
  region === "intl" ? features.map(f => ({ ...f, ...(US_FEATURE_OVERRIDES[f.title] || {}) })) : features;
