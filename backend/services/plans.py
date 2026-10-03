"""Subscription plan catalog — shared by routes and services (no route imports here).

These are the BUILT-IN defaults only. HQ edits (price / label / removal / custom plans) live in the
`plan_overrides` collection and are merged by services.subscription_common.load_plan_overrides(),
so every price shown on the landing, signup, billing and HQ pages is the live catalog, never a hard-coded number.

USD defaults are set just below the US benchmarks (Oct 2026): Fresha $19.95 · GlossGenius $28/$56/$168 ·
Vagaro $30 · Square Appointments $49/$149 · Square for Restaurants $49/$149 · Toast POS $69.
Annual = 10 × monthly (2 months free) so the one-time yearly payment is the cheaper way to pay.
"""

PLAN_CATALOG = {
    # Salon India (INR) — HQ edits the MONTHLY price only; 3-Month = 3 × monthly, Annual = 10 × monthly (2 months free)
    "monthly":   {"label": "Monthly Plan (1 branch)", "price": 1455.0,  "duration_days": 31,  "branches": 1},
    "quarter":   {"label": "3-Month Plan (1 branch)", "price": 4365.0,  "duration_days": 92,  "branches": 1},
    "annual":    {"label": "Annual Plan (1 branch) — 2 months free",  "price": 14550.0, "duration_days": 365, "branches": 1, "highlight": True},
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
    "resto_annual":  {"label": "Restaurant Annual — 2 months free",  "price": 10000.0, "duration_days": 365, "branches": 1, "vertical": "restaurant", "highlight": True},
    # Restaurant vertical (USD) — just below Square for Restaurants Plus ($49) and Toast POS ($69)
    "resto_intl_monthly": {"label": "Restaurant Monthly (USD)", "price": 45.0,  "duration_days": 31,  "branches": 1, "currency": "USD", "vertical": "restaurant"},
    "resto_intl_quarter": {"label": "Restaurant 3-Month (USD)", "price": 135.0, "duration_days": 92,  "branches": 1, "currency": "USD", "vertical": "restaurant"},
    "resto_intl_annual":  {"label": "Restaurant Annual (USD)",  "price": 450.0, "duration_days": 365, "branches": 1, "currency": "USD", "vertical": "restaurant", "highlight": True},
}

# Derived pricing — every non-monthly plan in a family is computed from its monthly price (HQ edits monthly only):
#   3-Month = 3 × monthly · Annual = 10 × monthly (2 months free, for every tenant). Multi-branch annuals have no monthly → editable.
DERIVED_PLANS = {
    "quarter": ("monthly", 3), "annual": ("monthly", 10),
    "resto_quarter": ("resto_monthly", 3), "resto_annual": ("resto_monthly", 10),
    "intl_starter_annual": ("intl_starter_monthly", 10), "intl_pro_annual": ("intl_pro_monthly", 10), "intl_premium_annual": ("intl_premium_monthly", 10),
    "resto_intl_quarter": ("resto_intl_monthly", 3), "resto_intl_annual": ("resto_intl_monthly", 10),
}
PAY_AS_YOU_GO_MONTHS = (3, 6)  # a tenant may prepay N months at N × monthly — never a separate "6-month plan"


def apply_derived_prices(catalog: dict) -> None:
    for key, (base, mult) in DERIVED_PLANS.items():
        if key in catalog and base in catalog:
            catalog[key]["price"] = round(float(catalog[base]["price"]) * mult, 2)
            catalog[key]["derived_from"] = base
            catalog[key]["multiplier"] = mult


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
