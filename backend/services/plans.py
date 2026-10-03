"""Subscription plan catalog — shared by routes and services (no route imports here).

These are the BUILT-IN defaults only. HQ edits (price / label / removal / custom plans) live in the
`plan_overrides` collection and are merged by services.subscription_common.load_plan_overrides(),
so every price shown on the landing, signup, billing and HQ pages is the live catalog, never a hard-coded number.

USD defaults are set just below the US benchmarks (Oct 2026): Fresha $19.95 · GlossGenius $28/$56/$168 ·
Vagaro $30 · Square Appointments $49/$149 · Square for Restaurants $49/$149 · Toast POS $69.
Annual = 10 × monthly (2 months free) so the one-time yearly payment is the cheaper way to pay.
"""

PLAN_CATALOG = {
    # Salon India (INR) — Annual ₹16,000 = 11 months paid + 1 month free → monthly ₹1,455 (16,000 ÷ 11), 3-Month ₹4,365
    "monthly":   {"label": "Monthly Plan (1 branch)", "price": 1455.0,  "duration_days": 31,  "branches": 1},
    "quarter":   {"label": "3-Month Plan (1 branch)", "price": 4365.0,  "duration_days": 92,  "branches": 1},
    "annual":    {"label": "Annual Plan (1 branch) — 1 month free",  "price": 16000.0, "duration_days": 365, "branches": 1, "highlight": True},
    "two_branch_annual":   {"label": "2-Branch Annual",  "price": 40000.0, "duration_days": 365, "branches": 2},
    "three_branch_annual": {"label": "3-Branch Annual",  "price": 60000.0, "duration_days": 365, "branches": 3},
    "multi_branch_annual": {"label": "Multi-Branch Annual (5+ branches)",  "price": 70000.0, "duration_days": 365, "branches": 5},
    # International (outside India) — USD. Monthly + annual only (annual = 10× monthly → 2 months free)
    "intl_starter_monthly":  {"label": "Starter Monthly (USD)",      "price": 19.0,   "duration_days": 31,  "branches": 1, "currency": "USD", "tier": "starter"},
    "intl_starter_annual":   {"label": "Starter Annual (USD)",       "price": 190.0,  "duration_days": 365, "branches": 1, "currency": "USD", "tier": "starter"},
    "intl_pro_monthly":      {"label": "Professional Monthly (USD)", "price": 45.0,   "duration_days": 31,  "branches": 1, "currency": "USD", "tier": "professional"},
    "intl_pro_annual":       {"label": "Professional Annual (USD)",  "price": 450.0,  "duration_days": 365, "branches": 1, "currency": "USD", "tier": "professional", "highlight": True},
    "intl_premium_monthly":  {"label": "Premium AI Monthly (USD)",   "price": 139.0,  "duration_days": 31,  "branches": 1, "currency": "USD", "tier": "premium"},
    "intl_premium_annual":   {"label": "Premium AI Annual (USD)",    "price": 1390.0, "duration_days": 365, "branches": 1, "currency": "USD", "tier": "premium"},
    "intl_enterprise_monthly": {"label": "Enterprise Monthly (USD)", "price": 399.0,  "duration_days": 31,  "branches": 5, "currency": "USD", "tier": "enterprise"},
    # Restaurant vertical (INR) — first month free via the 30-day restaurant trial at signup
    "resto_monthly": {"label": "Restaurant Monthly", "price": 1000.0,  "duration_days": 31,  "branches": 1, "vertical": "restaurant"},
    "resto_quarter": {"label": "Restaurant 3-Month", "price": 3000.0,  "duration_days": 92,  "branches": 1, "vertical": "restaurant"},
    "resto_annual":  {"label": "Restaurant Annual",  "price": 12000.0, "duration_days": 365, "branches": 1, "vertical": "restaurant", "highlight": True},
    # Restaurant vertical (USD) — just below Square for Restaurants Plus ($49) and Toast POS ($69)
    "resto_intl_monthly": {"label": "Restaurant Monthly (USD)", "price": 45.0,  "duration_days": 31,  "branches": 1, "currency": "USD", "vertical": "restaurant"},
    "resto_intl_quarter": {"label": "Restaurant 3-Month (USD)", "price": 129.0, "duration_days": 92,  "branches": 1, "currency": "USD", "vertical": "restaurant"},
    "resto_intl_annual":  {"label": "Restaurant Annual (USD)",  "price": 450.0, "duration_days": 365, "branches": 1, "currency": "USD", "vertical": "restaurant", "highlight": True},
}

# Plans that existed before and may still be attached to live subscriptions — never sold again, but their
# price/duration are kept so renewals, invoices and mid-term upgrade maths for those tenants keep working.
RETIRED_PLANS = {
    "half_year":          {"label": "6-Month Plan (1 branch)", "price": 12000.0, "duration_days": 183, "branches": 1},
    "two_branch_half":    {"label": "2-Branch 6-Month", "price": 24000.0, "duration_days": 183, "branches": 2},
    "three_branch_half":  {"label": "3-Branch 6-Month", "price": 36000.0, "duration_days": 183, "branches": 3},
    "multi_branch_half":  {"label": "Multi-Branch 6-Month (5+ branches)", "price": 45000.0, "duration_days": 183, "branches": 5},
    "resto_half":         {"label": "Restaurant 6-Month", "price": 6000.0, "duration_days": 183, "branches": 1, "vertical": "restaurant"},
    "resto_intl_half":    {"label": "Restaurant 6-Month (USD)", "price": 549.0, "duration_days": 183, "branches": 1, "currency": "USD", "vertical": "restaurant"},
}
RETIRED_PLAN_LABELS = {k: v["label"] for k, v in RETIRED_PLANS.items()}


def plan_info(key: str | None) -> dict:
    """Live catalog entry, else the retired definition (for tenants still on an old plan), else {}."""
    return PLAN_CATALOG.get(key or "") or RETIRED_PLANS.get(key or "") or {}
