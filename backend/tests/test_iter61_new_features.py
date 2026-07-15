"""Iter 61 — ID card PDFs, Miracurl Team CRUD, Releases, Plan catalog, blood_group."""
import os
import time
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://hair-hub-system.preview.emergentagent.com").rstrip("/")
SUPER_EMAIL = "super@miracurl.com"
SUPER_PW = "og9T@41Es#OQb6"
SALON_EMAIL = "admin@miracurl.com"
SALON_PW = "q6QY@tn3p#9DtL"
TENANT = "miracurl-marathahalli"
STAFF_ID = "3cdf66d1-ea58-4605-a4d7-333330a96e8a"
EXISTING_TEAM_MEMBER = "77f3b6b3-0a23-4b53-b7aa-ed3890b48370"


@pytest.fixture(scope="module")
def super_sess():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PW})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def salon_sess():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT})
    r = s.post(f"{BASE}/api/auth/login", json={"email": SALON_EMAIL, "password": SALON_PW}, headers={"X-Tenant-Slug": TENANT})
    assert r.status_code == 200, r.text
    return s


# -------- Staff ID Card PDF --------
def test_staff_id_card_pdf(salon_sess):
    r = salon_sess.get(f"{BASE}/api/id-cards/staff/{STAFF_ID}/pdf")
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert r.content[:4] == b"%PDF"
    assert len(r.content) > 1000


def test_staff_id_card_inactive_400(salon_sess):
    # find any inactive staff
    lst = salon_sess.get(f"{BASE}/api/staff").json()
    staff = lst.get("staff") if isinstance(lst, dict) else lst
    inactive = [s for s in staff if not s.get("active")]
    if not inactive:
        pytest.skip("No inactive staff available")
    r = salon_sess.get(f"{BASE}/api/id-cards/staff/{inactive[0]['id']}/pdf")
    assert r.status_code == 400


# -------- Blood group persistence --------
def test_blood_group_persist(salon_sess):
    r = salon_sess.get(f"{BASE}/api/staff")
    lst = r.json()
    staff = lst.get("staff") if isinstance(lst, dict) else lst
    target = next((s for s in staff if s["id"] == STAFF_ID), None)
    assert target, "target staff not found"
    orig_bg = target.get("blood_group")

    body = {
        "name": target["name"],
        "role": target.get("role") or "Staff",
        "phone": target.get("phone") or "",
        "blood_group": "B+",
    }
    for optk in ("email", "image_url", "commission_pct", "salary", "active"):
        if optk in target and target[optk] is not None:
            body[optk] = target[optk]
    put = salon_sess.put(
        f"{BASE}/api/staff/{STAFF_ID}",
        headers={"X-Owner-Pin": "4321"},
        json=body,
    )
    assert put.status_code in (200, 204), put.text

    lst2 = salon_sess.get(f"{BASE}/api/staff").json()
    staff2 = lst2.get("staff") if isinstance(lst2, dict) else lst2
    target2 = next(s for s in staff2 if s["id"] == STAFF_ID)
    assert target2.get("blood_group") == "B+"
    # restore
    if orig_bg and orig_bg != "B+":
        body["blood_group"] = orig_bg
        salon_sess.put(f"{BASE}/api/staff/{STAFF_ID}", headers={"X-Owner-Pin": "4321"}, json=body)


# -------- Miracurl Team CRUD --------
def test_team_list_has_mc0001(super_sess):
    r = super_sess.get(f"{BASE}/api/super/team")
    assert r.status_code == 200
    data = r.json()["members"]
    codes = [m["member_code"] for m in data]
    assert "MC-0001" in codes


def test_team_forbidden_for_salon(salon_sess):
    r = salon_sess.get(f"{BASE}/api/super/team")
    assert r.status_code in (401, 403)


def test_team_crud_lifecycle(super_sess):
    ts = int(time.time())
    payload = {
        "name": f"TEST_iter61_{ts}",
        "designation": "QA Tester",
        "phone": f"9{ts % 1000000000:09d}",
        "email": f"test{ts}@miracurl.com",
        "blood_group": "O+",
    }
    r = super_sess.post(f"{BASE}/api/super/team", json=payload)
    assert r.status_code in (200, 201), r.text
    created = r.json()
    tid = created.get("id") or created.get("member", {}).get("id")
    code = created.get("member_code") or created.get("member", {}).get("member_code")
    assert tid, created
    assert code and code.startswith("MC-"), code

    # PDF
    pdf = super_sess.get(f"{BASE}/api/super/team/{tid}/id-card.pdf")
    assert pdf.status_code == 200
    assert pdf.content[:4] == b"%PDF"

    # PUT
    payload2 = {**payload, "designation": "Senior QA"}
    up = super_sess.put(f"{BASE}/api/super/team/{tid}", json=payload2)
    assert up.status_code == 200, up.text

    lst = super_sess.get(f"{BASE}/api/super/team").json()["members"]
    match = next(m for m in lst if m["id"] == tid)
    assert match["designation"] == "Senior QA"

    # DELETE
    dl = super_sess.delete(f"{BASE}/api/super/team/{tid}")
    assert dl.status_code == 200

    lst2 = super_sess.get(f"{BASE}/api/super/team").json()["members"]
    assert not any(m["id"] == tid for m in lst2)


# -------- Releases --------
def test_releases_seeded_and_soft_delete_persist(super_sess):
    r = super_sess.get(f"{BASE}/api/super/releases")
    assert r.status_code == 200
    releases = r.json()["releases"]
    tags = [x["tag"] for x in releases]
    for expected in ["MIRA-DEPLOYED-2026-07-10", "MIRA-DEPLOYED-2026-07-09", "MIRA-DEPLOYED-2026-07-08"]:
        assert expected in tags, f"missing {expected}"
    # verify structure
    for rel in releases:
        assert isinstance(rel.get("changes"), list)

    # Verify listing is stable across two calls (no deletion done per instructions)
    r2 = super_sess.get(f"{BASE}/api/super/releases")
    tags2 = [x["tag"] for x in r2.json()["releases"]]
    assert tags == tags2


def test_releases_forbidden_for_salon(salon_sess):
    r = salon_sess.get(f"{BASE}/api/super/releases")
    assert r.status_code in (401, 403)


# -------- Plans --------
def test_plan_catalog_update_and_restore(super_sess):
    r = super_sess.get(f"{BASE}/api/super-admin/plans")
    assert r.status_code == 200
    plans = r.json()
    plans_list = plans.get("plans") if isinstance(plans, dict) else plans
    if isinstance(plans_list, list):
        half = next((p for p in plans_list if p.get("key") == "half_year"), None)
        orig_price = half["price"] if half else 12000
        orig_label = half.get("label") if half else "6 months"
    else:
        half = plans_list.get("half_year", {})
        orig_price = half.get("price", 12000)
        orig_label = half.get("label", "6 months")

    up = super_sess.put(f"{BASE}/api/super-admin/plans/half_year", json={"price": 12500, "label": orig_label})
    assert up.status_code == 200, up.text

    r2 = super_sess.get(f"{BASE}/api/super-admin/plans").json()
    pl2 = r2.get("plans") if isinstance(r2, dict) else r2
    if isinstance(pl2, list):
        half2 = next(p for p in pl2 if p.get("key") == "half_year")
    else:
        half2 = pl2["half_year"]
    assert half2["price"] == 12500

    # restore
    rest = super_sess.put(f"{BASE}/api/super-admin/plans/half_year", json={"price": orig_price, "label": orig_label})
    assert rest.status_code == 200
