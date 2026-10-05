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
    if lead.get("newly_opened") or any(w in text for w in _NEW_WORDS):
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
    if team >= 5:
        reasons.append(f"team of {team}")
    if locations >= 2:
        reasons.append(f"{locations} locations")
    if lead.get("has_online_booking") or lead.get("booking_link"):
        reasons.append("has booking workflow")
    if followers >= 5000:
        reasons.append(f"{followers:,} followers")
    return ("WARM", reasons) if reasons else ("COLD", ["standard prospect"])


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
    return lead
