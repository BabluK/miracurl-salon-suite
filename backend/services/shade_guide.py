"""Reference colourist guide per shade: guest description + pro formula (brand codes, developer, ratio, timing).
Always a starting point — stylists strand-test and adjust for natural level, porosity and % grey."""

BRANDS = {
    "igora": {"name": "Schwarzkopf Igora Royal", "ratio": "1:1"},
    "majirel": {"name": "L'Oréal Majirel", "ratio": "1:1.5"},
    "wella": {"name": "Wella Koleston Perfect", "ratio": "1:1"},
    "matrix": {"name": "Matrix SoColor", "ratio": "1:1"},
}

_DIRECT = "Direct dye — no developer. Apply on clean, dry pre-lightened hair; 20–30 min, cool rinse."
_PRELIGHT_10 = "Pre-lighten to a clean level 10 (pale yellow) with lightener + 20/30 vol, then tone."
_PRELIGHT_9 = "Pre-lighten to level 9 (yellow) with lightener + 20/30 vol, then apply."
_PRELIGHT_8 = "Pre-lighten mid-lengths & ends to level 8–9 first if the natural base is darker than level 6."


def _g(level, desc, igora, majirel, wella, matrix, dev="20 vol (6%)", time="35–45 min", prep=None, grey=None):
    return {"level": level, "description": desc, "developer": dev, "time": time, "prep": prep,
            "grey": grey or "For 50%+ grey, mix 1/3 of the same-level natural (-0 / .0 / /0 / N) series.",
            "formulas": {"igora": igora, "majirel": majirel, "wella": wella, "matrix": matrix}}


GUIDE = {
    # ── Women ─────────────────────────────────────────────────────────────────
    "natural-black": _g(1, "Deep, glossy true black with a blue-neutral shine — timeless and low-maintenance.", "1-0", "1", "2/0", "1N"),
    "soft-black": _g(2, "A softer, lived-in black with natural warmth — gentler than jet black.", "3-0", "3", "3/0", "3N"),
    "dark-brown": _g(3, "Rich espresso-dark brown, neutral tone — elegant and flattering on every skin.", "4-0", "4", "4/0", "4N"),
    "chocolate-brown": _g(4, "Warm chocolate with gold-brown reflect and glossy finish.", "4-65", "4.35", "4/77", "4BC"),
    "mocha-brown": _g(5, "Smooth coffee-mocha brown, slightly cool — sophisticated and modern.", "5-1 + 5-0 (1:1)", "5.8", "5/71", "5M"),
    "caramel-brown": _g(6, "Warm caramel with golden glow — radiant on warm undertones.", "6-55", "6.34", "6/73", "6G", dev="20–30 vol"),
    "hazel-brown": _g(5, "Multi-tonal hazel brown with soft gold dimension.", "5-63", "5.3", "5/3", "5G"),
    "golden-brown": _g(6, "Sun-kissed golden brown — bright, healthy-looking warmth.", "6-5", "6.3", "6/3", "6G", dev="20–30 vol"),
    "honey-blonde": _g(8, "Warm honey-gold blonde — bright and vibrant.", "8-55", "8.3", "8/3", "8G", dev="30 vol (9%)", prep=_PRELIGHT_8),
    "beige-blonde": _g(9, "Soft neutral beige blonde — refined and easy to wear.", "9-4 + 9-1 (1:1)", "9.13", "9/17", "9NA", dev="30 vol (9%)", prep=_PRELIGHT_8),
    "ash-blonde": _g(9, "Cool, smoky ash blonde — chic on cool undertones.", "9-1", "9.1", "9/1", "9A", dev="30 vol (9%)", prep=_PRELIGHT_9),
    "platinum-blonde": _g(10, "Icy near-white platinum — bold, luxe, high-maintenance.", "9,5-1", "10.1", "12/81", "10A", dev="20 vol toner", time="20–25 min toner", prep=_PRELIGHT_10),
    "pearl-blonde": _g(10, "Luminous pearl-iridescent blonde with a soft pink-violet sheen.", "9,5-22", "10.21", "10/81", "10P", dev="20 vol toner", time="20 min toner", prep=_PRELIGHT_10),
    "sandy-blonde": _g(8, "Natural sandy blonde — beachy and effortless.", "8-4", "8.13", "8/07", "8N", dev="30 vol (9%)", prep=_PRELIGHT_8),
    "champagne-blonde": _g(10, "Smooth champagne — pale gold-beige with a classy sheen.", "9,5-4", "9.31", "10/38", "10G", dev="20 vol toner", time="20–25 min", prep=_PRELIGHT_10),
    "butter-bronde": _g(8, "Creamy butter blonde-brown blend — light, warm, soft.", "7-55 + 8-0 (1:1)", "7.31", "8/38", "8NW", dev="30 vol (9%)", prep=_PRELIGHT_8),
    "mushroom-blonde": _g(8, "Cool, natural mushroom-taupe blonde with dimension.", "8-11 + 8-0 (1:1)", "8.11", "8/17", "8AA", dev="30 vol (9%)", prep=_PRELIGHT_8),
    "mushroom-mocha-balayage": _g(7, "Cool mushroom-mocha with hand-painted lighter ribbons.", "7-12 (tone) over balayage", "7.1", "7/17", "7A", dev="30 vol lightener · 20 vol tone", time="Lightener 30–45 min · tone 15–20 min", prep="Balayage lightener on mid-lengths & ends to level 8, then tone."),
    "rose-brown": _g(6, "Soft mauve-rose brown — feminine and trendy.", "6-29 + 6-0 (1:1)", "6.20", "6/75", "5RV + 6N (1:1)"),
    "copper-brown": _g(6, "Warm bold copper-brown — radiant and rich.", "6-77", "6.45", "6/43", "6CG", dev="20–30 vol"),
    "ginger-copper": _g(7, "Vivid fiery ginger copper — high shine, statement warmth.", "7-77", "7.44", "7/43", "7CC", dev="30 vol (9%)"),
    "auburn-red": _g(5, "Rich red-brown auburn — eye-catching depth.", "5-88", "5.60", "55/46", "5RR"),
    "mahogany-brown": _g(5, "Deep red-violet mahogany — luxurious brown with a wine glow.", "4-68", "5.52", "5/5", "5M"),
    "burgundy": _g(4, "Deep violet-red burgundy — bold and modern.", "4-99", "4.26", "44/65", "4VR"),
    "wine-red": _g(5, "Intense wine red with violet undertone.", "5-99", "5.62", "55/65", "5RV"),
    "cherry-red": _g(6, "Bright, playful cherry red.", "6-88", "6.66", "66/46", "6RR", dev="30 vol (9%)", prep=_PRELIGHT_8),
    "violet": _g(7, "Trendy deep violet — unique fashion tone.", "Chroma ID Purple", "Colorful Hair Violet", "Color Fresh Create Ultra Purple", "SoColor Cult Royal Purple", dev="None (direct dye)", time="20–30 min", prep=_PRELIGHT_9 + " " + _DIRECT, grey="Grey lifts unevenly — pre-lighten evenly first."),
    "plum": _g(4, "Deep mysterious plum — violet-red on a dark base.", "4-99 + 5-99 (1:1)", "4.20", "44/65", "4VR"),
    "rose-gold": _g(9, "Radiant rose gold — warm blonde with a pink shimmer.", "9,5-17", "9.21 + Colorful Hair Pink (10%)", "10/95", "SoColor Cult Rosé over 9G", dev="20 vol toner", time="20 min", prep=_PRELIGHT_9),
    "pastel-pink": _g(10, "Playful soft pastel pink.", "Chroma ID Pink (pastel)", "Colorful Hair Pink Sorbet", "Color Fresh Create Pastel Pink", "SoColor Cult Bubblegum Pink (diluted)", dev="None (direct dye)", time="20 min", prep=_PRELIGHT_10 + " " + _DIRECT, grey="Not for grey coverage."),
    "lilac": _g(10, "Soft dreamy lilac — pastel violet.", "Chroma ID Lavender", "Colorful Hair Lilac", "Color Fresh Create Pure Violet + Clear (1:3)", "SoColor Cult Lavender", dev="None (direct dye)", time="20 min", prep=_PRELIGHT_10 + " " + _DIRECT, grey="Not for grey coverage."),
    "pastel-blue": _g(10, "Unique expressive pastel blue.", "Chroma ID Ice Blue (pastel)", "Colorful Hair Navy Blue + Clear (1:4)", "Color Fresh Create Nu-dist Blue", "SoColor Cult Admiral Navy + Clear (1:4)", dev="None (direct dye)", time="20 min", prep=_PRELIGHT_10 + " " + _DIRECT, grey="Not for grey coverage."),
    "teal-blue": _g(8, "Bold teal blue — unconventional and striking.", "Chroma ID Turquoise", "Colorful Hair Pacific Blue", "Color Fresh Create New Blue", "SoColor Cult Marine Blue", dev="None (direct dye)", time="25–30 min", prep=_PRELIGHT_9 + " " + _DIRECT, grey="Not for grey coverage."),
    "emerald-green": _g(8, "Vibrant emerald green — stylish and rare.", "Chroma ID Green", "Colorful Hair Iridescent Green", "Color Fresh Create Neverseen Green", "SoColor Cult Emerald Green", dev="None (direct dye)", time="25–30 min", prep=_PRELIGHT_9 + " " + _DIRECT, grey="Not for grey coverage."),
    "smoky-grey": _g(9, "Modern smoky grey with a cool matte finish.", "SilverWhite Dove Grey", "9.12 + Silver (1:1)", "10/81 + 0/88 (3:1)", "9AA + Cult Dusty Silver", dev="20 vol toner", time="20–30 min", prep=_PRELIGHT_10, grey="Works with natural grey — blend, don't cover."),
    "silver-grey": _g(10, "Sleek metallic silver grey.", "SilverWhite Silver", "10.11 + Colorful Hair Silver", "12/81", "SoColor Cult Dusty Silver", dev="20 vol toner", time="20–30 min", prep=_PRELIGHT_10, grey="Works with natural grey — blend, don't cover."),
    "ash-brown": _g(6, "Cool natural ash brown — neutralises brassiness.", "6-12", "6.1", "6/1", "6A"),
    "balayage": _g(8, "Hand-painted sun-kissed dimension — soft, natural grow-out.", "BlondMe lightener → tone 9-4", "Blond Studio → tone 9.13", "Blondor → tone 9/16", "Light Master → tone 9NA", dev="20–30 vol lightener · 20 vol tone", time="Lightener 30–45 min · tone 15–20 min", prep="Free-hand paint lightener on surface & ends; leave depth at the root.", grey="Blend greys into the painted ribbons."),
    "ombre": _g(8, "Seamless dark-to-light blend from roots to ends.", "BlondMe lightener → tone 8-55", "Blond Studio → tone 8.3", "Blondor → tone 8/38", "Light Master → tone 8G", dev="30 vol lightener · 20 vol tone", time="Lightener 35–45 min · tone 15–20 min", prep="Back-comb & lighten mid-lengths to ends; feather the transition line.", grey="Root depth covers greys naturally."),
    "money-piece": _g(10, "Bright face-framing highlight that lifts the whole look.", "BlondMe lightener → tone 9,5-1", "Blond Studio → tone 10.1", "Blondor → tone 10/81", "Light Master → tone 10A", dev="30 vol lightener · 20 vol tone", time="Lightener 30–40 min · tone 15 min", prep="Two 1–2 cm foils framing the face; keep the rest of the hair natural.", grey="Works on any base."),

    # ── Men ───────────────────────────────────────────────────────────────────
    "men-jet-black": _g(1, "Sharp, high-shine jet black — full grey coverage.", "1-0", "1", "2/0", "1N", time="30–35 min"),
    "men-natural-black": _g(3, "Soft natural black that doesn't look 'dyed' — great first-time grey coverage.", "3-0", "3", "3/0", "3N", dev="10–20 vol", time="25–35 min"),
    "men-espresso": _g(4, "Deep espresso brown — everyday natural coverage.", "3-0 + 4-0 (1:1)", "4", "4/0", "4N", time="30–35 min"),
    "men-dark-brown": _g(4, "Rich dark brown with subtle grey blending.", "4-0", "4", "4/0", "4N", time="30–35 min"),
    "men-chestnut": _g(5, "Warm chestnut brown with a natural sun-touched glow.", "5-63", "5.3", "5/3", "5G", time="30–35 min"),
    "men-ash-brown": _g(6, "Cool matte ash brown — modern, no warmth.", "6-12", "6.1", "6/1", "6A", time="30–35 min"),
    "men-salt-pepper": _g(5, "Distinguished natural grey blend — softens grey by ~50%, no harsh line.", "5-1 + 5-0 (1:1)", "5.1 + Cool Cover 5", "5/1", "5A", dev="10 vol (3%)", time="10–15 min (blend only)", grey="Designed for grey blending — do not aim for full coverage."),
    "men-silver-fox": _g(10, "Premium steel-silver — bold and polished.", "SilverWhite Silver", "10.11 + Colorful Hair Silver", "12/81", "SoColor Cult Dusty Silver", dev="20 vol toner", time="20–30 min", prep=_PRELIGHT_10, grey="Perfect on 70%+ natural grey — just tone."),
    "men-ash-grey": _g(9, "Smoky ash grey — the trend tone.", "9,5-22 + SilverWhite Slate Grey", "9.12", "9/81", "9AA", dev="20 vol toner", time="20–30 min", prep=_PRELIGHT_9, grey="Blend, don't cover."),
    "men-platinum": _g(10, "Icy platinum — editorial statement.", "9,5-1", "10.1", "12/81", "10A", dev="20 vol toner", time="20–25 min", prep=_PRELIGHT_10),
    "men-sandy-blonde": _g(8, "Natural beachy sandy blonde.", "8-4", "8.13", "8/07", "8N", dev="30 vol (9%)", prep=_PRELIGHT_8),
    "men-copper": _g(7, "Vivid warm copper — confident and bright.", "7-77", "7.44", "7/43", "7CC", dev="30 vol (9%)"),
    "men-mahogany": _g(5, "Red-brown mahogany with a subtle wine shine.", "4-68", "5.52", "5/5", "5M"),
    "men-burgundy": _g(4, "Deep wine burgundy — bold low-light.", "4-99", "4.26", "44/65", "4VR"),
    "men-blue-black": _g(1, "Cool glossy blue-black — sharp and clean.", "1-1", "1 + 2.10 (1:1)", "2/8", "1N + Cult Admiral Navy (10%)", time="30–35 min"),
    "men-steel-blue": _g(9, "Denim steel blue — fashion statement.", "Chroma ID Blue + Clear (1:2)", "Colorful Hair Navy Blue + Clear (1:2)", "Color Fresh Create Nu-dist Blue", "SoColor Cult Admiral Navy + Clear (1:2)", dev="None (direct dye)", time="20–25 min", prep=_PRELIGHT_9 + " " + _DIRECT, grey="Not for grey coverage."),
}


def shade_guide(color_id: str) -> dict | None:
    g = GUIDE.get(color_id)
    if not g:
        return None
    return {**g, "brands": BRANDS,
            "disclaimer": "Reference formula only — strand test, and adjust for natural level, porosity and % grey."}
