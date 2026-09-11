"""Iter149 — POST /api/public/color/{slug}/face-check tests."""
import base64
import io
import os

import pytest
import requests
from PIL import Image

def _load_backend_url():
    p = "/app/frontend/.env"
    if os.path.exists(p):
        for line in open(p):
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    return os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


BASE_URL = _load_backend_url()
SLUG = "miracurl-marathahalli"


def _b64_from_path(path: str, max_side: int = 900, quality: int = 82) -> str:
    im = Image.open(path).convert("RGB")
    w, h = im.size
    scale = min(1.0, max_side / max(w, h))
    if scale < 1.0:
        im = im.resize((int(w * scale), int(h * scale)))
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=quality)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


class TestFaceCheck:
    def test_face_true_with_portrait(self):
        b64 = _b64_from_path("/app/backend/assets/founder_backdrop.png")
        r = requests.post(f"{BASE_URL}/api/public/color/{SLUG}/face-check",
                          json={"selfie_b64": b64}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "face" in d and "presentation" in d and "hair_length" in d
        # Portrait must be detected as a face
        assert d["face"] is True, f"expected face=true, got {d}"
        assert d["presentation"] in ("man", "woman", "unclear")
        assert d["hair_length"] in ("short", "medium", "long", "unclear")

    def test_face_false_back_of_head(self):
        b64 = _b64_from_path("/app/backend/tests/fixtures_hair_back.jpg")
        r = requests.post(f"{BASE_URL}/api/public/color/{SLUG}/face-check",
                          json={"selfie_b64": b64}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        # Back-of-head → should not detect a face
        assert d["face"] is False, f"expected face=false, got {d}"

    def test_selfie_too_small_400(self):
        r = requests.post(f"{BASE_URL}/api/public/color/{SLUG}/face-check",
                          json={"selfie_b64": "abc"}, timeout=15)
        assert r.status_code == 400

    def test_unknown_slug_404(self):
        r = requests.post(f"{BASE_URL}/api/public/color/no-such-salon-xyz/face-check",
                          json={"selfie_b64": "x" * 3000}, timeout=15)
        assert r.status_code == 404
