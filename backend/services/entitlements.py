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


# Salons onboarded before this moment keep every feature (unless HQ forces a tier or unticks a module).
GATING_FROM = "2026-09-23T06:00:00+00:00"

# API paths that belong to a gated module (middleware returns 403 MODULE_LOCKED for locked ones)
MODULE_API_PREFIXES = {
    "inventory": ("/api/products", "/api/vendors", "/api/inventory"),
    "attendance": ("/api/attendance", "/api/leave-requests", "/api/week-off-requests", "/api/reports/attendance-month"),
    "reports": ("/api/reports/sales", "/api/reports/staff-tips", "/api/reports/export", "/api/reports/commission"),
    "staff-activities": ("/api/activity-logs",),
    "hire": ("/api/hiring",),
    "offers-studio": ("/api/offers/flyer", "/api/offers/flyers"),
    "mira-studio": ("/api/mira-studio",),
    "receptionist": ("/api/receptionist",),
    "assistant": ("/api/assistant",),
    "registry": ("/api/registry",),
    "cctv": ("/api/cctv",),
    "plans": ("/api/packages", "/api/memberships", "/api/gift-cards"),
    "reviews": ("/api/reviews",),
    "gallery": ("/api/gallery",),
    "customers": ("/api/customers",),
    "services": ("/api/services",),
    "cash": ("/api/cash-register",),
}


def module_for_path(path: str) -> str | None:
    for m, prefixes in MODULE_API_PREFIXES.items():
        if path.startswith(prefixes):
            return m
    return None


def is_grandfathered(t: dict | None) -> bool:
    created = str((t or {}).get("created_at") or "")
    return bool(created) and created < GATING_FROM


def tenant_tier(t: dict | None) -> str | None:
    """None → no plan-tier gating (INR tenants, grandfathered salons). USD trial → premium."""
    t = t or {}
    forced = t.get("entitlement_tier")
    if forced in TIERS:
        return forced
    if (t.get("currency") or "INR") != "USD" or is_grandfathered(t):
        return None
    plan = PLAN_CATALOG.get(t.get("plan") or "") or {}
    return plan.get("tier") or "premium"


def entitlements(t: dict | None) -> dict:
    t = t or {}
    tier = tenant_tier(t)
    by_tier = [m for m in MODULES if tier and m not in TIER_MODULES.get(tier, MODULES)]
    manual = [m for m in (t.get("module_locks") or []) if m in MODULES]
    return {"tier": tier, "forced": bool(t.get("entitlement_tier")), "grandfathered": is_grandfathered(t),
            "tier_locked": by_tier, "module_locks": manual,
            "locked": [m for m in MODULES if m in by_tier or m in manual]}
