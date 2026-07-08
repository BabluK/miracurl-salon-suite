"""Iter 55 — Custom playlists + Trusted Partners backend tests."""
import os
import pytest
import requests

def _read_env(k):
    if os.environ.get(k):
        return os.environ[k]
    for p in ("/app/frontend/.env",):
        try:
            for line in open(p):
                if line.startswith(k + "="):
                    return line.split("=", 1)[1].strip()
        except Exception:
            pass
    raise KeyError(k)

BASE = _read_env("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE}/api"

ADMIN = {"email": "admin@miracurl.com", "password": "q6QY@tn3p#9DtL"}
SUPER = {"email": "super@miracurl.com", "password": "og9T@41Es#OQb6"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin_sess():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def super_sess():
    return _login(SUPER)


# ----------------- PLAYLISTS -----------------
class TestPlaylists:
    _created_ids = []

    def test_list_baseline(self, admin_sess):
        r = admin_sess.get(f"{API}/entertainment/playlists")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        labels = [p["label"] for p in data]
        # Preexisting seed
        for name in ("Owner Favs", "Spa Vibes"):
            assert name in labels, f"missing preexisting playlist {name}"

    def test_add_youtube_video(self, admin_sess):
        r = admin_sess.post(f"{API}/entertainment/playlists", json={
            "label": "TEST_yt_video",
            "url": "https://www.youtube.com/watch?v=ZD72mEhB6TE",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["kind"] == "youtube"
        assert d["media_type"] == "video"
        assert d["media_id"] == "ZD72mEhB6TE"
        TestPlaylists._created_ids.append(d["id"])

    def test_add_youtube_playlist(self, admin_sess):
        r = admin_sess.post(f"{API}/entertainment/playlists", json={
            "label": "TEST_yt_playlist",
            "url": "https://www.youtube.com/watch?v=IYuhfdw8_yc&list=PLxxxABC123",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["kind"] == "youtube"
        assert d["media_type"] == "playlist"
        TestPlaylists._created_ids.append(d["id"])

    def test_add_spotify(self, admin_sess):
        r = admin_sess.post(f"{API}/entertainment/playlists", json={
            "label": "TEST_spotify",
            "url": "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["kind"] == "spotify"
        assert d["media_type"] == "playlist"
        TestPlaylists._created_ids.append(d["id"])

    def test_add_bad_url(self, admin_sess):
        r = admin_sess.post(f"{API}/entertainment/playlists", json={
            "label": "TEST_bad", "url": "https://example.com/x",
        })
        assert r.status_code == 400

    def test_delete_created(self, admin_sess):
        assert TestPlaylists._created_ids, "nothing created to delete"
        for pid in TestPlaylists._created_ids:
            r = admin_sess.delete(f"{API}/entertainment/playlists/{pid}")
            assert r.status_code == 200
        # Ensure preexisting remain
        r = admin_sess.get(f"{API}/entertainment/playlists")
        labels = [p["label"] for p in r.json()]
        for pid in TestPlaylists._created_ids:
            assert pid not in [p["id"] for p in r.json()]
        assert "Owner Favs" in labels and "Spa Vibes" in labels


# ----------------- PARTNERS -----------------
class TestPartners:
    _manual_id = None
    _tenant_id = None

    def test_public_partners(self):
        r = requests.get(f"{API}/public/partners", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        card = data[0]
        for k in ("name", "rating", "reviews_count"):
            assert k in card

    def test_super_admin_partners(self, super_sess):
        r = super_sess.get(f"{API}/super-admin/partners")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "tenants" in d and "manual" in d
        assert isinstance(d["tenants"], list)
        assert len(d["tenants"]) >= 1
        TestPartners._tenant_id = d["tenants"][0]["id"]

    def test_hide_and_restore_tenant(self, super_sess):
        tid = TestPartners._tenant_id
        assert tid
        # Hide
        r = super_sess.put(f"{API}/super-admin/partners/tenant/{tid}",
                           json={"visible": False})
        assert r.status_code == 200
        pub = requests.get(f"{API}/public/partners").json()
        assert tid not in [p.get("id") for p in pub], "tenant still visible after hide"
        # Restore
        r = super_sess.put(f"{API}/super-admin/partners/tenant/{tid}",
                           json={"visible": True})
        assert r.status_code == 200
        pub = requests.get(f"{API}/public/partners").json()
        assert tid in [p.get("id") for p in pub], "tenant not restored"

    def test_feature_and_blurb(self, super_sess):
        tid = TestPartners._tenant_id
        r = super_sess.put(f"{API}/super-admin/partners/tenant/{tid}",
                           json={"featured": True, "blurb": "Great partner"})
        assert r.status_code == 200
        pub = requests.get(f"{API}/public/partners").json()
        match = next((p for p in pub if p.get("id") == tid), None)
        assert match, "tenant missing"
        assert match.get("featured")
        assert match.get("blurb") == "Great partner"
        # Sort: featured first
        first_featured_idx = next((i for i, p in enumerate(pub) if p.get("featured")), None)
        first_nonfeat_idx = next((i for i, p in enumerate(pub) if not p.get("featured")), None)
        if first_featured_idx is not None and first_nonfeat_idx is not None:
            assert first_featured_idx < first_nonfeat_idx
        # Cleanup: unfeature, clear blurb
        super_sess.put(f"{API}/super-admin/partners/tenant/{tid}",
                       json={"featured": False, "blurb": ""})

    def test_manual_partner_crud(self, super_sess):
        r = super_sess.post(f"{API}/super-admin/partners/manual", json={
            "name": "TEST_Brand", "city": "Mumbai", "rating": 4.5, "blurb": "Supplier",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        TestPartners._manual_id = d["id"]
        # Public should list with source=manual
        pub = requests.get(f"{API}/public/partners").json()
        m = next((p for p in pub if p.get("id") == d["id"]), None)
        assert m, "manual partner not in public list"
        assert m.get("source") == "manual"
        # Delete
        r = super_sess.delete(f"{API}/super-admin/partners/manual/{d['id']}")
        assert r.status_code == 200
        pub2 = requests.get(f"{API}/public/partners").json()
        assert d["id"] not in [p.get("id") for p in pub2]
