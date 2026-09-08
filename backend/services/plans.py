"""Subscription plan catalog — shared by routes and services (no route imports here)."""

PLAN_CATALOG = {
    "half_year": {"label": "6-Month Plan (1 branch)", "price": 12000.0, "duration_days": 183, "branches": 1},
    "annual":    {"label": "Annual Plan (1 branch)",  "price": 20000.0, "duration_days": 365, "branches": 1},
    "two_branch_half":     {"label": "2-Branch 6-Month", "price": 24000.0, "duration_days": 183, "branches": 2},
    "two_branch_annual":   {"label": "2-Branch Annual",  "price": 40000.0, "duration_days": 365, "branches": 2},
    "three_branch_half":   {"label": "3-Branch 6-Month", "price": 36000.0, "duration_days": 183, "branches": 3},
    "three_branch_annual": {"label": "3-Branch Annual",  "price": 60000.0, "duration_days": 365, "branches": 3},
    "multi_branch_half":   {"label": "Multi-Branch 6-Month (5+ branches)", "price": 45000.0, "duration_days": 183, "branches": 5},
    "multi_branch_annual": {"label": "Multi-Branch Annual (5+ branches)",  "price": 70000.0, "duration_days": 365, "branches": 5},
    # International (outside India) — USD
    "intl_starter_monthly":  {"label": "Starter Monthly (USD)",      "price": 79.0,   "duration_days": 31,  "branches": 1, "currency": "USD", "tier": "starter"},
    "intl_starter_half":     {"label": "Starter 6-Month (USD)",      "price": 399.0,  "duration_days": 183, "branches": 1, "currency": "USD", "tier": "starter"},
    "intl_starter_annual":   {"label": "Starter Annual (USD)",       "price": 699.0,  "duration_days": 365, "branches": 1, "currency": "USD", "tier": "starter"},
    "intl_pro_monthly":      {"label": "Professional Monthly (USD)", "price": 149.0,  "duration_days": 31,  "branches": 1, "currency": "USD", "tier": "professional"},
    "intl_pro_half":         {"label": "Professional 6-Month (USD)", "price": 799.0,  "duration_days": 183, "branches": 1, "currency": "USD", "tier": "professional"},
    "intl_pro_annual":       {"label": "Professional Annual (USD)",  "price": 1399.0, "duration_days": 365, "branches": 1, "currency": "USD", "tier": "professional"},
    "intl_premium_monthly":  {"label": "Premium AI Monthly (USD)",   "price": 249.0,  "duration_days": 31,  "branches": 1, "currency": "USD", "tier": "premium"},
    "intl_premium_half":     {"label": "Premium AI 6-Month (USD)",   "price": 1299.0, "duration_days": 183, "branches": 1, "currency": "USD", "tier": "premium"},
    "intl_premium_annual":   {"label": "Premium AI Annual (USD)",    "price": 2399.0, "duration_days": 365, "branches": 1, "currency": "USD", "tier": "premium"},
    "intl_enterprise_monthly": {"label": "Enterprise Monthly (USD)", "price": 499.0,  "duration_days": 31,  "branches": 5, "currency": "USD", "tier": "enterprise"},
    # Restaurant vertical (INR) — first month free via the 30-day restaurant trial at signup
    "resto_quarter": {"label": "Restaurant 3-Month", "price": 3000.0,  "duration_days": 92,  "branches": 1, "vertical": "restaurant"},
    "resto_half":    {"label": "Restaurant 6-Month", "price": 6000.0,  "duration_days": 183, "branches": 1, "vertical": "restaurant"},
    "resto_annual":  {"label": "Restaurant Annual",  "price": 12000.0, "duration_days": 365, "branches": 1, "vertical": "restaurant"},
    # Restaurant vertical (USD) — international pricing
    "resto_intl_quarter": {"label": "Restaurant 3-Month (USD)", "price": 299.0, "duration_days": 92,  "branches": 1, "currency": "USD", "vertical": "restaurant"},
    "resto_intl_half":    {"label": "Restaurant 6-Month (USD)", "price": 549.0, "duration_days": 183, "branches": 1, "currency": "USD", "vertical": "restaurant"},
    "resto_intl_annual":  {"label": "Restaurant Annual (USD)",  "price": 999.0, "duration_days": 365, "branches": 1, "currency": "USD", "vertical": "restaurant"},
}
