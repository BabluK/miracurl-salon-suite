"""Verified stock-image library for Mira Studio websites — every ID checked to return HTTP 200.
The LLM hallucinates Unsplash URLs, so generated HTML is restricted to this pool."""
import re

SITE_IMAGES = {
    "salon": ["photo-1560066984-138dadb4c035", "photo-1521590832167-7bcbfaa6381f", "photo-1562322140-8baeececf3df", "photo-1595476108010-b4d1f102b1b1", "photo-1600948836101-f9ffda59d250", "photo-1519415943484-9fa1873496d4"],
    "watches": ["photo-1523170335258-f5ed11844a49", "photo-1524592094714-0f0654e20314", "photo-1547996160-81dfa63595aa", "photo-1522312346375-d1a52e2b99b3", "photo-1508057198894-247b23fe5ade", "photo-1594534475808-b18fc33b045e"],
    "jewellery": ["photo-1515562141207-7a88fb7ce338", "photo-1599643478518-a784e5dc4c8f", "photo-1573408301185-9146fe634ad0", "photo-1605100804763-247f67b3557e", "photo-1611591437281-460bfbe1220a"],
    "clinic": ["photo-1519494026892-80bbd2d6fd0d", "photo-1629909613654-28e377c37b09", "photo-1588776814546-1ffcf47267a5", "photo-1576091160399-112ba8d25d1d", "photo-1551190822-a9333d879b1f", "photo-1666214280557-f1b5022eb634"],
    "gym": ["photo-1534438327276-14e5300c3a48", "photo-1571902943202-507ec2618e8f", "photo-1517836357463-d25dfeac3438", "photo-1583454110551-21f2fa2afe61", "photo-1540497077202-7c8a3999166f", "photo-1574680096145-d05b474e2155"],
    "restaurant": ["photo-1517248135467-4c7edcad34c4", "photo-1414235077428-338989a2e8c0", "photo-1555396273-367ea4eb4db5", "photo-1552566626-52f8b828add9", "photo-1504674900247-0877df9cc836", "photo-1466978913421-dad2ebd01d17"],
    "cafe": ["photo-1495474472287-4d71bcdd2085", "photo-1509042239860-f550ce710b93", "photo-1447933601403-0c6688de566e", "photo-1554118811-1e0d58224f24", "photo-1501339847302-ac426a4a7cbb"],
    "photography": ["photo-1519741497674-611481863552", "photo-1606216794074-735e91aa2c92", "photo-1537633552985-df8429e8048b", "photo-1583939003579-730e3918a45a", "photo-1520854221256-17451cc331bf", "photo-1465495976277-4387d4b0b4c6"],
    "fashion": ["photo-1441986300917-64674bd600d8", "photo-1490481651871-ab68de25d43d", "photo-1445205170230-053b83016050", "photo-1483985988355-763728e1935b", "photo-1524504388940-b1c1722653e1", "photo-1469334031218-e382a71b716b"],
    "tech": ["photo-1498050108023-c5249f4df085", "photo-1531297484001-80022131f5a1", "photo-1519389950473-47ba0277781c", "photo-1552664730-d307ca884978", "photo-1460925895917-afdab827c52f", "photo-1504384308090-c894fdcc538d"],
    "realestate": ["photo-1560518883-ce09059eeffa", "photo-1600585154340-be6161a56a0c", "photo-1600596542815-ffad4c1539a9", "photo-1600607687939-ce8a6c25118c", "photo-1586023492125-27b2c045efd7", "photo-1600210492486-724fe5c67fb0"],
    "education": ["photo-1509062522246-3755977927d7", "photo-1427504494785-3a9ca7044f45", "photo-1503676260728-1c00da094a0b", "photo-1524178232363-1fb2b075b655"],
    "travel": ["photo-1488646953014-85cb44e25828", "photo-1476514525535-07fb3b4ae5f1", "photo-1530521954074-e64f6810b32d", "photo-1507525428034-b723cf961d3e", "photo-1502920917128-1aa500764cbd"],
    "automobile": ["photo-1492144534655-ae79c964c9d7", "photo-1503376780353-7e6692767b70", "photo-1552519507-da3b142c6e3d", "photo-1568605117036-5fe5e7bab0b7", "photo-1511919884226-fd3cad34687c"],
    "petcare": ["photo-1548199973-03cce0bbc87b", "photo-1583337130417-3346a1be7dee", "photo-1587300003388-59208cc962cb", "photo-1450778869180-41d0601e046e"],
    "flowers": ["photo-1490750967868-88aa4486c946", "photo-1526047932273-341f2a7631f9", "photo-1487070183336-b863922373d4", "photo-1561181286-d3fee7d55364", "photo-1563241527-3004b7be0ffd"],
    "bakery": ["photo-1509440159596-0249088772ff", "photo-1517433670267-08bbd4be890f", "photo-1555507036-ab1f4038808a", "photo-1608198093002-ad4e005484ec", "photo-1486427944299-d1955d23e34d"],
    "store": ["photo-1441984904996-e0b6ba687e04", "photo-1534452203293-494d7ddbf7e0", "photo-1472851294608-062f824d29cc", "photo-1567401893414-76b7b1e5a7a5", "photo-1578916171728-46686eac8d58"],
    "wedding": ["photo-1519225421980-715cb0215aed", "photo-1465495976277-4387d4b0b4c6", "photo-1511795409834-ef04bbd61622", "photo-1523438885200-e635ba2c371e", "photo-1478146896981-b80fe463b330"],
    "music": ["photo-1511671782779-c97d3d27a1d4", "photo-1493225457124-a3eb161ffa5f", "photo-1470225620780-dba8ba36b745", "photo-1514320291840-2e0a9bf2a9ae"],
    "art": ["photo-1513364776144-60967b0f800f", "photo-1460661419201-fd4cecdf8a8b"],
    "sports": ["photo-1461896836934-ffe607ba8211", "photo-1517649763962-0c623066013b", "photo-1552674605-db6ffd4facb5"],
    "agriculture": ["photo-1500937386664-56d1dfef3854", "photo-1625246333195-78d9c38ad449", "photo-1560493676-04071c5f467b", "photo-1592982537447-7440770cbfc9"],
    "spa": ["photo-1544161515-4ab6ce6db874", "photo-1540555700478-4be289fbecef", "photo-1600334129128-685c5582fd35", "photo-1519823551278-64ac92734fb1"],
    "business": ["photo-1497366216548-37526070297c", "photo-1486406146926-c627a92ad1ab", "photo-1556761175-b413da4baf72", "photo-1521737604893-d14cc237f11d", "photo-1522071820081-009f0129c71c", "photo-1454165804606-c3d57bc86b40"],
}

CATEGORIES = list(SITE_IMAGES.keys())
_VERIFIED_IDS = {pid for pids in SITE_IMAGES.values() for pid in pids}
_IMG_URL_RE = re.compile(r"https://(?:images|source)\.unsplash\.com/[^\s\"'()<>]+")


def image_urls(category: str) -> list[str]:
    pool = SITE_IMAGES.get(category) or SITE_IMAGES["business"]
    return [f"https://images.unsplash.com/{pid}?w=1200&q=80" for pid in pool]


def sanitize_html_images(html: str, category: str) -> str:
    """Replace any hallucinated/broken Unsplash URL with a verified one from the category pool."""
    pool = image_urls(category)
    state = {"i": 0}

    def repl(m):
        url = m.group(0)
        pid = re.search(r"(photo-[0-9a-fA-F-]+)", url)
        if pid and pid.group(1) in _VERIFIED_IDS:
            return url
        out = pool[state["i"] % len(pool)]
        state["i"] += 1
        return out

    return _IMG_URL_RE.sub(repl, html)


_TAILWIND_SCRIPT = '<script src="https://cdn.tailwindcss.com"></script>'


def ensure_tailwind(html: str) -> str:
    """The Play CDN is a JS script — LLMs sometimes emit it as a stylesheet <link>, leaving the page unstyled."""
    html = re.sub(r'<link[^>]*cdn\.tailwindcss\.com[^>]*/?>', _TAILWIND_SCRIPT, html)
    if "cdn.tailwindcss.com" not in html:
        html = html.replace("</head>", f"{_TAILWIND_SCRIPT}\n</head>", 1)
    return html


_CATEGORY_KEYWORDS = [
    ("watches", ["watch", "timepiece"]),
    ("jewellery", ["jewel", "gold shop", "diamond"]),
    ("spa", ["spa", "massage", "wellness"]),
    ("salon", ["salon", "beauty", "hair", "makeup"]),
    ("clinic", ["clinic", "dental", "doctor", "hospital", "pharma", "medical"]),
    ("gym", ["gym", "fitness", "yoga"]),
    ("bakery", ["bakery", "cake", "pastry"]),
    ("cafe", ["cafe", "coffee"]),
    ("restaurant", ["restaurant", "food", "dhaba", "biryani", "kitchen"]),
    ("flowers", ["flower", "florist", "bouquet", "nursery", "plant"]),
    ("wedding", ["wedding", "event", "banquet", "matrimon"]),
    ("photography", ["photograph", "studio photo"]),
    ("fashion", ["fashion", "boutique", "clothing", "apparel", "garment", "tailor"]),
    ("music", ["music", "dj", "band", "dance"]),
    ("art", ["art ", "craft", "gallery", "painting"]),
    ("sports", ["sport", "cricket", "football", "academy sport"]),
    ("agriculture", ["farm", "agricult", "organic", "dairy"]),
    ("tech", ["tech", "software", "startup", "it services", "app "]),
    ("realestate", ["real estate", "property", "interior", "architect", "construction"]),
    ("education", ["school", "education", "academy", "tuition", "coaching", "college"]),
    ("travel", ["travel", "tour", "resort", "hotel"]),
    ("automobile", ["car ", "auto", "bike", "garage", "vehicle"]),
    ("petcare", ["pet", "veterin", "dog", "cat "]),
    ("store", ["store", "shop", "mart", "grocery", "kirana", "retail"]),
]


def guess_category(text: str) -> str:
    t = (text or "").lower()
    for cat, kws in _CATEGORY_KEYWORDS:
        if any(k in t for k in kws):
            return cat
    return "business"
