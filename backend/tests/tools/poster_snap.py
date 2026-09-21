"""Before/after pixel-identity check for the loyalty poster renderer.
Usage: python3 tests/tools/poster_snap.py before|after
"""
import asyncio
import hashlib
import json
import sys

from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")

SNAP = "/app/backend/tests/tools/poster_before.json"
LOGO_PNG = "/app/frontend/public/icon-admin-192.png"


async def _hashes() -> dict:
    from routes import loyalty_stamps as ls
    from routes import services_catalog as sc

    logo = open(LOGO_PNG, "rb").read()
    cases = {}
    for with_logo in (False, True):
        async def _logo(t, base, _b=logo if with_logo else None):
            return _b
        sc._tenant_logo_bytes = _logo
        for resto in (False, True):
            for design in ["", *ls.LOYALTY_BGS]:
                for shape in ("circle", "square"):
                    t = {"id": "x", "slug": "snap-salon", "name": "Snapshot Unisex Family Salon", "location": "Marathahalli, Bengaluru",
                         "business_type": "restaurant" if resto else "salon",
                         "loyalty_stamps": {"stamps_needed": 8 if resto else 12, "logo_shape": "circle"}}
                    img = await ls._loyalty_poster_jpeg(t, "https://miracurl-suite.com", design, shape)
                    cases[f"logo={int(with_logo)}|resto={int(resto)}|design={design or 'auto'}|shape={shape}"] = hashlib.sha256(img).hexdigest()
    return cases


async def main(mode: str) -> None:
    hashes = await _hashes()
    if mode == "before":
        json.dump(hashes, open(SNAP, "w"), indent=1)
        print(f"saved {len(hashes)} snapshots")
        return
    before = json.load(open(SNAP))
    bad = [k for k, v in hashes.items() if before.get(k) != v]
    for k in bad:
        print("DIFF", k)
    print(f"{len(hashes) - len(bad)}/{len(hashes)} identical — " + ("ALL PIXEL-IDENTICAL" if not bad else "MISMATCH"))
    sys.exit(1 if bad else 0)


asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "after"))
