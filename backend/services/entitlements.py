"""USD tier entitlements: which app modules a US/international salon can use on each plan.
Indian (INR) tenants are not gated. Trial tenants get the full Premium AI experience."""
from services.plans import PLAN_CATALOG

TIERS = ["starter", "professional", "premium", "enterprise"]

# module key == app route (without the leading slash) used by the sidebar
MODULES = {
    "appointments": "Online booking & calendar", "customers": "CRM & client history", "services": "Service menu",
    "pos": "POS billing & invoices", "cash": "Cash register", "staff": "Staff accounts & payroll",
    "reviews": "Google review automation", "messages": "Customer chat & WhatsApp reminders", "gallery": "Portfolio gallery",
    "refer": "Refer & earn", "entertainment": "Salon music", "plans": "Offers, memberships & gift cards",
    "inventory": "Inventory & vendors", "attendance": "GPS attendance & leave", "reports": "Analytics & reports",
    "staff-activities": "Staff activity log", "hire": "Hiring board", "offers-studio": "AI offer maker",
    "mira-studio": "Mira AI marketing studio", "receptionist": "Mira AI receptionist (WhatsApp/voice)",
    "assistant": "Mira AI assistant", "registry": "Staff verification registry", "cctv": "AI CCTV insights",
}
_STARTER = ["appointments", "customers", "services", "pos", "cash", "staff", "reviews", "messages", "gallery", "refer", "entertainment", "plans"]
_PRO = _STARTER + ["inventory", "attendance", "reports", "staff-activities", "hire"]
_PREMIUM = _PRO + ["offers-studio", "mira-studio", "receptionist", "assistant", "registry", "cctv"]
TIER_MODULES = {"starter": _STARTER, "professional": _PRO, "premium": _PREMIUM, "enterprise": list(MODULES)}

# Sept-2026 US competitor snapshot (vendor pricing pages via codersyapps.com / glossgenius.com) — for HQ comparison view
COMPETITORS = [
    {"name": "Square Appointments", "price": "$0 / $49 / $149 per location", "trial": "30 days", "commission": "None",
     "gaps": ["No AI receptionist", "No WhatsApp marketing", "No inventory/vendors on Free", "No-show fees need Plus"]},
    {"name": "GlossGenius", "price": "$28 / $56 / $168 (2 / 9 / unlimited staff)", "trial": "14 days", "commission": "None",
     "gaps": ["No AI receptionist", "No staff payroll & attendance", "No memberships on Standard", "US only"]},
    {"name": "Vagaro", "price": "$23.99 + $10 per calendar; add-ons $10–$100", "trial": "30 days", "commission": "None",
     "gaps": ["Forms, texts, website & app are paid add-ons", "No AI marketing", "Branded app $100/mo + setup"]},
    {"name": "Booksy", "price": "$29.99 + $20 per staff", "trial": "14 days", "commission": "Boost: 30% of new client's first visit",
     "gaps": ["Per-staff pricing", "No inventory", "No AI", "Commission on marketplace clients"]},
    {"name": "Fresha", "price": "$19.95 solo / $14.95 per team member", "trial": "7 days", "commission": "20% one-off on marketplace clients",
     "gaps": ["Commission", "Basic reports", "No AI receptionist", "Per-seat pricing"]},
    {"name": "Boulevard", "price": "$175 / $325 / $455 per location", "trial": "Demo only", "commission": "None",
     "gaps": ["3–4× Miracurl's price", "No AI receptionist", "Onboarding fees", "Contract-based"]},
]


def tenant_tier(t: dict | None) -> str | None:
    """None → not gated (INR tenants). Trial USD tenants → premium."""
    t = t or {}
    if (t.get("currency") or "INR") != "USD":
        return None
    forced = t.get("entitlement_tier")
    if forced in TIERS:
        return forced
    plan = PLAN_CATALOG.get(t.get("plan") or "") or {}
    return plan.get("tier") or "premium"


def entitlements(t: dict | None) -> dict:
    tier = tenant_tier(t)
    allowed = TIER_MODULES.get(tier, list(MODULES)) if tier else list(MODULES)
    return {"tier": tier, "forced": bool((t or {}).get("entitlement_tier")),
            "locked": [m for m in MODULES if m not in allowed]}
