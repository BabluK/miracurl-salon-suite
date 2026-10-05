"""Lead intent scoring — HOT / WARM / COLD from the research signals Mira already collects."""
from services.hq_conversion import country_of

# Booking/POS software seen on salon & restaurant websites — India + US/International.
SOFTWARE_SIGNATURES = {
    # salon — international
    "fresha.com": "Fresha", "fresha": "Fresha", "vagaro.com": "Vagaro", "vagaro": "Vagaro",
    "mindbodyonline.com": "Mindbody", "mindbody": "Mindbody", "booksy.com": "Booksy", "booksy": "Booksy",
    "squareup.com": "Square", "square.site": "Square", "styleseat.com": "StyleSeat", "styleseat": "StyleSeat",
    "schedulicity.com": "Schedulicity", "schedulicity": "Schedulicity", "glossgenius.com": "GlossGenius", "glossgenius": "GlossGenius",
    "phorest.com": "Phorest", "phorest": "Phorest", "saloniris.com": "Salon Iris", "acuityscheduling.com": "Acuity",
    "setmore.com": "Setmore", "treatwell.co.uk": "Treatwell", "treatwell.": "Treatwell", "zenoti.com": "Zenoti", "zenoti": "Zenoti",
    "boulevard": "Boulevard", "blvd.co": "Boulevard", "meevo": "Meevo", "rosy salon": "Rosy", "salonbiz": "SalonBiz", "timely": "Timely",
    # salon — India
    "miosalon": "MioSalon", "salonist": "Salonist", "dingg": "Dingg", "zylu": "Zylu", "respark": "Respark",
    "salonbookings": "SalonBookings", "appointy": "Appointy", "bookmyshow": "", "urbanclap": "", "fresha.in": "Fresha",
    # restaurant — India + international
    "petpooja": "Petpooja", "posist": "Posist", "dotpe": "DotPe", "dineout": "Dineout", "eazydiner": "EazyDiner",
    "zomato.com/restaurant": "Zomato", "swiggy": "Swiggy", "limetray": "LimeTray", "urbanpiper": "UrbanPiper", "torqus": "Torqus",
    "toasttab.com": "Toast", "toasttab": "Toast", "opentable.com": "OpenTable", "opentable": "OpenTable", "resy.com": "Resy", "resy": "Resy",
    "sevenrooms": "SevenRooms", "clover.com": "Clover", "lightspeed": "Lightspeed", "touchbistro": "TouchBistro", "yelp.com/reservations": "Yelp Reservations",
}

_NEW_WORDS = ("newly opened", "now open", "grand opening", "opening soon", "just opened", "new salon", "new restaurant", "coming soon")
_SWITCH_WORDS = ("looking for", "switching", "hiring receptionist", "book via dm", "dm to book", "call to book", "whatsapp to book")


def detect_software(text: str) -> str:
    low = (text or "").lower()
    for needle, label in SOFTWARE_SIGNATURES.items():
        if needle in low and label:
            return label
    return ""


def intent_for(lead: dict) -> tuple[str, list[str]]:
    """Returns (HOT|WARM|COLD, reasons). HOT = actively looking / switching / newly opened.
    WARM = growing (multi-staff / multi-location / booking workflow / strong audience). COLD = normal prospect."""
    reasons: list[str] = []
    text = " ".join(str(lead.get(k) or "") for k in ("notes", "site_text", "description", "about")).lower()
    software = lead.get("current_software") or lead.get("competitor") or ""
    team = int(lead.get("team_size") or 0)
    locations = int(lead.get("locations_count") or lead.get("branches") or 1)
    followers = int(lead.get("instagram_followers") or 0)
    hot = False
    reviews = int(lead.get("reviews") or 0)
    if lead.get("newly_opened") or any(w in text for w in _NEW_WORDS) or (lead.get("new_business") and reviews <= 5):
        hot = True
        reasons.append("newly opened")
    if lead.get("looking_to_switch") or any(w in text for w in _SWITCH_WORDS):
        hot = True
        reasons.append("actively looking / manual booking")
    if software and lead.get("owner_name"):
        hot = True
        reasons.append(f"on {software} · owner identified")
    if hot:
        return "HOT", reasons
    if software:
        reasons.append(f"already uses {software}")
    if lead.get("new_business"):
        reasons.append(f"young business ({reviews} reviews) · no system yet")
    if team >= 5:
        reasons.append(f"team of {team}")
    if locations >= 2:
        reasons.append(f"{locations} locations")
    if lead.get("has_online_booking") or lead.get("booking_link"):
        reasons.append("has booking workflow")
    if followers >= 5000:
        reasons.append(f"{followers:,} followers")
    return ("WARM", reasons) if reasons else ("COLD", ["standard prospect"])


# What usually hurts owners on each platform → the angle Mira leads with. Factual, no invented numbers.
SWITCH_ANGLES = {
    "Fresha": "marketplace commission on new clients and paid add-ons — Miracurl is 0% commission with everything included",
    "Vagaro": "per-location / per-add-on pricing — one Miracurl plan covers booking, POS, payroll and marketing",
    "Treatwell": "per-booking commission and clients who belong to the marketplace, not to you — own your client list again",
    "Booksy": "marketplace fees and limited POS/payroll — Miracurl adds billing, staff pay and an AI receptionist",
    "Mindbody": "enterprise pricing and complexity — same power, set up in 90 seconds, no onboarding calls",
    "Zenoti": "enterprise contracts and heavy setup — a lighter, AI-first suite priced for independent owners",
    "Square": "generic POS with bolt-on booking — purpose-built salon flows, reminders and Mira AI",
    "StyleSeat": "client-facing fees and limited team tools — team scheduling, payroll and zero client fees",
    "GlossGenius": "solo-focused — grows with your team: multi-staff, multi-location, payroll",
    "Boulevard": "premium pricing — the same premium client journey at independent-owner prices",
    "Phorest": "long contracts — month-to-month, cancel anytime, free trial first",
    "Acuity": "scheduling only — add POS, CRM, reminders, payroll and reviews in one place",
    "Setmore": "scheduling only — full salon suite with billing, staff and AI receptionist",
    "Timely": "price per staff member — unlimited staff on every plan",
    "MioSalon": "per-outlet pricing and manual follow-ups — automated WhatsApp reminders, reviews and Mira AI",
    "Salonist": "add-on costs for marketing and SMS — WhatsApp confirmations, review credits and AI posters built in",
    "Dingg": "basic booking — complete GST billing, payroll, inventory and AI marketing",
    "Zylu": "booking-first — add GST POS, payroll and 24/7 AI receptionist",
    "Respark": "legacy desktop feel — mobile-first, works on any phone, Mira AI included",
    "Appointy": "generic scheduling — salon-specific flows, GST bills, staff commission and reviews",
    "Petpooja": "POS-first — Miracurl adds QR table ordering, reservations, WhatsApp offers and an AI menu studio",
    "Posist": "enterprise contracts — one simple plan with QR ordering, kitchen tickets and reservations",
    "DotPe": "payments-first — full kitchen flow, table billing and reservation management",
    "Dineout": "deal-marketplace dependence — own your guests with reservations and WhatsApp offers",
    "EazyDiner": "commission-led discovery — build direct repeat visits with your own reservation page",
    "Zomato": "commission on every order — zero-commission QR table orders and direct reservations",
    "Swiggy": "delivery commission — grow dine-in with QR ordering, reservations and offers you control",
    "LimeTray": "modular add-on pricing — everything in one plan",
    "UrbanPiper": "aggregator middleware — direct guest relationships with reservations and offers",
    "Toast": "hardware lock-in and processing fees — runs on any phone or tablet, no proprietary hardware",
    "OpenTable": "cover fees per diner — unlimited reservations, 0% per-cover fee",
    "Resy": "subscription plus per-cover costs — reservations, QR ordering and kitchen tickets in one price",
    "SevenRooms": "enterprise pricing — independent-restaurant pricing with the same guest CRM",
    "Clover": "hardware-centric POS — QR ordering, kitchen tickets and reservations on any device",
    "Lightspeed": "complex tiers — one plan, 90-second setup",
    "TouchBistro": "iPad-only POS — any device, plus guest-facing QR ordering",
    "Yelp Reservations": "marketplace-tied bookings — your own branded reservation page",
}


def outreach_angle(lead: dict) -> str:
    """One-line 'Suggested outreach angle' — software switch first, then intent, then vertical defaults."""
    resto = (lead.get("vertical") or "salon") == "restaurant"
    sw = lead.get("current_software") or lead.get("competitor") or ""
    if sw and sw in SWITCH_ANGLES:
        return f"Moving from {sw}? Lead with: {SWITCH_ANGLES[sw]}."
    if sw:
        return f"Moving from {sw}? Lead with 0% commission, everything in one plan and Mira — the 24/7 AI receptionist."
    if lead.get("intent") == "HOT":
        return ("New-restaurant setup: QR table ordering, kitchen tickets, reservations and WhatsApp offers from day one."
                if resto else "New-salon setup with Mira AI, online booking, CRM and automated follow-up from day one.")
    if int(lead.get("locations_count") or lead.get("branches") or 1) >= 2 or int(lead.get("team_size") or 0) >= 5:
        return ("Multi-outlet control: live tables per branch, kitchen tickets, staff payroll and one dashboard."
                if resto else "Pitch premium client journey + CRM + staff payroll + marketing automation across the team.")
    return ("Fill quiet hours: QR ordering, reservations, WhatsApp offers and Google-review growth."
            if resto else "Retention + reminders + CRM + promotions — fewer no-shows, more repeat visits.")


def fit_reason(lead: dict) -> str:
    bits = []
    if lead.get("owner_name"):
        bits.append("owner-led")
    if lead.get("intent") == "HOT":
        bits.append("strong new-business / switching signal")
    if int(lead.get("team_size") or 0) >= 5:
        bits.append(f"team of {lead['team_size']}")
    if int(lead.get("locations_count") or lead.get("branches") or 1) >= 2:
        bits.append(f"{lead.get('locations_count') or lead.get('branches')} locations")
    if lead.get("rating"):
        bits.append(f"{lead['rating']}★ · {lead.get('reviews') or 0} reviews")
    if lead.get("current_software") or lead.get("competitor"):
        bits.append(f"already pays for {lead.get('current_software') or lead.get('competitor')}")
    if lead.get("has_online_booking") or lead.get("booking_link"):
        bits.append("has a booking workflow")
    return ("; ".join(bits) or "standard prospect with public contact details").capitalize() + "."


def platform_signal(lead: dict) -> str:
    sw = lead.get("current_software") or lead.get("competitor") or ""
    if sw:
        return f"Uses {sw}"
    if lead.get("booking_link"):
        return "Own online booking page"
    if lead.get("has_online_booking"):
        return "Online booking on site"
    if lead.get("looking_to_switch"):
        return "Books by DM / call"
    return "Contact by email" if (lead.get("email") or lead.get("public_email")) else "No online booking found"


def enrich_profile(lead: dict) -> dict:
    """Fill the full prospect profile Mira should hold on every lead, then score intent."""
    lead["country"] = lead.get("country") or country_of(lead.get("city"))
    lead["current_software"] = lead.get("current_software") or lead.get("competitor") or ""
    lead["locations_count"] = int(lead.get("locations_count") or lead.get("branches") or 1)
    lead["team_size"] = int(lead.get("team_size") or 0)
    lead["booking_link"] = lead.get("booking_link") or ""
    lead["public_email"] = lead.get("public_email") or lead.get("email") or ""
    lead["whatsapp"] = lead.get("whatsapp") or lead.get("phone") or ""
    lead["intent"], lead["intent_reasons"] = intent_for(lead)
    lead["intent_score"] = {"HOT": 90, "WARM": 60, "COLD": 30}[lead["intent"]]
    lead["outreach_angle"] = outreach_angle(lead)
    lead["fit_reason"] = fit_reason(lead)
    lead["platform_signal"] = platform_signal(lead)
    return lead
