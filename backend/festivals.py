"""Indian festival calendar (2026-2027) — powers Mira's festival-aware offers."""
from datetime import date, timedelta

# start date ISO -> (name, emoji, span_days). Lunar dates are best-known panchang values.
FESTIVALS = {
    # ---- 2026 ----
    "2026-01-01": ("New Year", "🎉", 1),
    "2026-01-14": ("Makar Sankranti / Pongal", "🪁", 2),
    "2026-01-26": ("Republic Day", "🇮🇳", 1),
    "2026-02-14": ("Valentine's Day", "💝", 1),
    "2026-02-15": ("Maha Shivratri", "🔱", 1),
    "2026-03-04": ("Holi", "🎨", 2),
    "2026-03-19": ("Ugadi / Gudi Padwa", "🌸", 1),
    "2026-03-20": ("Eid al-Fitr", "🌙", 1),
    "2026-03-26": ("Ram Navami", "🏹", 1),
    "2026-04-14": ("Baisakhi / Tamil New Year", "🌾", 1),
    "2026-04-19": ("Akshaya Tritiya", "✨", 1),
    "2026-05-27": ("Eid al-Adha (Bakrid)", "🌙", 1),
    "2026-08-15": ("Independence Day", "🇮🇳", 1),
    "2026-08-26": ("Onam", "🌼", 1),
    "2026-08-28": ("Raksha Bandhan", "🪢", 1),
    "2026-09-04": ("Janmashtami", "🦚", 1),
    "2026-09-14": ("Ganesh Chaturthi", "🐘", 10),
    "2026-10-11": ("Navratri", "💃", 9),
    "2026-10-20": ("Dussehra", "🏹", 1),
    "2026-10-29": ("Karwa Chauth", "🌙", 1),
    "2026-11-06": ("Dhanteras", "🪔", 1),
    "2026-11-08": ("Diwali", "🪔", 2),
    "2026-11-11": ("Bhai Dooj", "🎁", 1),
    "2026-11-15": ("Chhath Puja", "🌅", 2),
    "2026-11-24": ("Guru Nanak Jayanti", "🙏", 1),
    "2026-12-25": ("Christmas", "🎄", 1),
    "2026-12-31": ("New Year's Eve", "🥂", 1),
    # ---- 2027 ----
    "2027-01-01": ("New Year", "🎉", 1),
    "2027-01-14": ("Makar Sankranti / Pongal", "🪁", 2),
    "2027-01-26": ("Republic Day", "🇮🇳", 1),
    "2027-02-14": ("Valentine's Day", "💝", 1),
    "2027-03-05": ("Maha Shivratri", "🔱", 1),
    "2027-03-10": ("Eid al-Fitr", "🌙", 1),
    "2027-03-22": ("Holi", "🎨", 2),
    "2027-04-08": ("Ugadi / Gudi Padwa", "🌸", 1),
    "2027-04-14": ("Ram Navami", "🏹", 1),
    "2027-05-08": ("Akshaya Tritiya", "✨", 1),
    "2027-05-17": ("Eid al-Adha (Bakrid)", "🌙", 1),
    "2027-08-15": ("Independence Day", "🇮🇳", 1),
    "2027-08-17": ("Raksha Bandhan", "🪢", 1),
    "2027-08-24": ("Janmashtami", "🦚", 1),
    "2027-09-04": ("Ganesh Chaturthi", "🐘", 10),
    "2027-09-30": ("Navratri", "💃", 9),
    "2027-10-09": ("Dussehra", "🏹", 1),
    "2027-10-18": ("Karwa Chauth", "🌙", 1),
    "2027-10-26": ("Dhanteras", "🪔", 1),
    "2027-10-28": ("Diwali", "🪔", 2),
    "2027-10-31": ("Bhai Dooj", "🎁", 1),
    "2027-11-03": ("Chhath Puja", "🌅", 2),
    "2027-12-25": ("Christmas", "🎄", 1),
    "2027-12-31": ("New Year's Eve", "🥂", 1),
}


def festival_today(d: date) -> dict | None:
    """Festival happening on this date (span-aware, e.g. day 3 of Ganesh Chaturthi)."""
    for iso, (name, emoji, span) in FESTIVALS.items():
        start = date.fromisoformat(iso)
        if start <= d < start + timedelta(days=span):
            day_n = (d - start).days + 1
            return {"name": name, "emoji": emoji, "day": day_n, "span": span}
    return None


def next_festival(d: date, window: int = 10) -> dict | None:
    """Nearest festival starting within `window` days (excluding today)."""
    best = None
    for iso, (name, emoji, span) in FESTIVALS.items():
        start = date.fromisoformat(iso)
        away = (start - d).days
        if 0 < away <= window and (best is None or away < best["days_away"]):
            best = {"name": name, "emoji": emoji, "days_away": away, "span": span}
    return best


def festival_info(d: date) -> dict:
    return {"today": festival_today(d), "upcoming": next_festival(d)}


def festival_prompt_line(d: date) -> str:
    """Prompt injection so Mira themes offers around today's / upcoming festivals."""
    ft = festival_today(d)
    if ft:
        day_part = f" (day {ft['day']} of {ft['span']})" if ft["span"] > 1 else ""
        return (f"FESTIVAL ALERT — TODAY IS {ft['name']} {ft['emoji']}{day_part}! "
                f"You MUST theme the offer around {ft['name']}: festive title, festive copy, "
                "and pick services people want for celebrations (glam, grooming, family looks). "
                "Weave the festival name into the title and WhatsApp caption with matching emojis.\n")
    nf = next_festival(d, window=7)
    if nf:
        when = "TOMORROW" if nf["days_away"] == 1 else f"in {nf['days_away']} days"
        return (f"FESTIVAL AHEAD — {nf['name']} {nf['emoji']} is {when}. "
                f"People are booking to get {nf['name']}-ready — theme the offer as a "
                f"pre-{nf['name']} glam/grooming rush and mention the festival in the title and caption.\n")
    return ""
