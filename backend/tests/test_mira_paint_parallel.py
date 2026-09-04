"""Backend tests for Mira paint parallelism fix (paint_offloop helper).

Covers:
1. Batch generate-missing-images with 2 temp services runs in parallel + poll latency < 3s.
2. Single-service paint job (generate-image) completes and returns image_url.
3. generate-all-banners on an existing category returns 200 with a batch_id.
4. Unrelated endpoints stay responsive while a paint batch runs.
5. Regression smoke: /services, /service-categories, /services/image-weight all 200.
6. Concurrency guard: POST generate-missing-images while another batch running -> 409.
"""
import os
import time
import uuid
import threading
import requests
import pytest

BASE_URL = [l.split("=", 1)[1].strip() for l in open("/app/frontend/.env") if l.startswith("REACT_APP_BACKEND_URL")][0].rstrip("/")
TENANT = "miracurl-marathahalli"
EMAIL = "admin@miracurl.com"
PASSWORD = "q6QY@tn3p#9DtL"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    csrf = s.cookies.get("csrf_token")
    if csrf:
        s.headers["X-CSRF-Token"] = csrf
    s.headers["X-Owner-Pin"] = "4321"
    return s


def _wait_batch(client, timeout=180):
    lat = []
    last = None
    t0 = time.time()
    while time.time() - t0 < timeout:
        a = time.time()
        r = client.get(f"{BASE_URL}/api/services/image-batch-status", timeout=30)
        lat.append(time.time() - a)
        assert r.status_code == 200
        last = r.json()
        if last.get("status") != "running":
            break
        time.sleep(2)
    return last, lat, time.time() - t0


# ---------- Feature 1: batch parallel paint ----------
def test_batch_generate_missing_images_parallel(client):
    cat = f"ZZ QA Paint {uuid.uuid4().hex[:6]}"
    ids = []
    try:
        for i in range(2):
            r = client.post(f"{BASE_URL}/api/services", json={
                "name": f"QA Paint Svc {i}", "category": cat, "price": 100, "duration_min": 30
            }, timeout=30)
            assert r.status_code in (200, 201), r.text[:200]
            ids.append(r.json()["id"])

        r = client.post(f"{BASE_URL}/api/services/generate-missing-images?category={cat}", timeout=30)
        assert r.status_code == 200, r.text[:200]
        qbody = r.json()
        assert qbody.get("queued", 0) >= 2, qbody

        last, lat, total = _wait_batch(client, timeout=180)
        assert last is not None
        assert last.get("status") == "done", last
        assert last.get("done") == 2, last
        assert last.get("failed", 0) == 0, last
        assert total < 90, f"batch too slow: {total:.1f}s"
        assert max(lat) < 3.0, f"poll latency spike {max(lat):.2f}s -> event loop blocked!"

        # verify image_url populated (no GET /services/{id}; fetch list and filter)
        r = client.get(f"{BASE_URL}/api/services", timeout=15)
        assert r.status_code == 200
        all_svcs = r.json()
        if isinstance(all_svcs, dict):
            all_svcs = all_svcs.get("items") or all_svcs.get("services") or []
        by_id = {s.get("id"): s for s in all_svcs}
        for sid in ids:
            svc = by_id.get(sid)
            assert svc, f"service {sid} not found in list"
            url = svc.get("image_url", "") or ""
            assert url and url.startswith("/api/files/"), f"bad url {url}"
    finally:
        for sid in ids:
            client.delete(f"{BASE_URL}/api/services/{sid}", timeout=15)


# ---------- Feature 3: single-service paint job ----------
def test_single_service_paint_job(client):
    cat = f"ZZ QA Single {uuid.uuid4().hex[:6]}"
    r = client.post(f"{BASE_URL}/api/services", json={
        "name": "QA Single Paint", "category": cat, "price": 200, "duration_min": 45
    }, timeout=30)
    assert r.status_code in (200, 201), r.text[:200]
    sid = r.json()["id"]
    try:
        r = client.post(f"{BASE_URL}/api/services/{sid}/generate-image", timeout=30)
        assert r.status_code == 200, r.text[:200]
        job_id = r.json().get("job_id")
        assert job_id, r.json()

        t0 = time.time()
        last = None
        while time.time() - t0 < 90:
            r = client.get(f"{BASE_URL}/api/services/image-jobs/{job_id}", timeout=15)
            assert r.status_code == 200
            last = r.json()
            if last.get("status") in ("done", "failed", "error"):
                break
            time.sleep(2)
        assert last and last.get("status") == "done", last
        assert last.get("image_url"), last
    finally:
        client.delete(f"{BASE_URL}/api/services/{sid}", timeout=15)


# ---------- Feature 2: generate-all-banners on existing category ----------
def test_generate_all_banners_existing_category(client):
    r = client.get(f"{BASE_URL}/api/services", timeout=15)
    assert r.status_code == 200
    services = r.json()
    if isinstance(services, dict):
        services = services.get("items") or services.get("services") or []
    cats = [s.get("category") for s in services if s.get("category")]
    assert cats, "no categories to test banner regen"
    cat = cats[0]

    r = client.post(f"{BASE_URL}/api/services/generate-all-banners?category={cat}", timeout=30)
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    assert "batch_id" in body or "queued" in body, body

    last, lat, total = _wait_batch(client, timeout=120)
    assert last is not None
    assert last.get("status") in ("done", "idle"), last
    if last.get("status") == "done":
        assert last.get("failed", 0) == 0, last
        assert max(lat) < 3.0, f"poll latency {max(lat):.2f}s"


# ---------- Feature 4: event loop responsiveness while batch runs ----------
def test_event_loop_not_blocked_during_batch(client):
    cat = f"ZZ QA Loop {uuid.uuid4().hex[:6]}"
    ids = []
    try:
        for i in range(2):
            r = client.post(f"{BASE_URL}/api/services", json={
                "name": f"QA Loop Svc {i}", "category": cat, "price": 100, "duration_min": 30
            }, timeout=30)
            assert r.status_code in (200, 201)
            ids.append(r.json()["id"])
        r = client.post(f"{BASE_URL}/api/services/generate-missing-images?category={cat}", timeout=30)
        assert r.status_code == 200

        # hit unrelated endpoints while running
        unrelated_lat = []
        t0 = time.time()
        while time.time() - t0 < 60:
            r_status = client.get(f"{BASE_URL}/api/services/image-batch-status", timeout=15)
            if r_status.status_code == 200 and r_status.json().get("status") != "running":
                break
            for path in ["/api/services", "/api/dashboard/stats", "/api/customers?limit=5"]:
                a = time.time()
                rr = client.get(f"{BASE_URL}{path}", timeout=15)
                unrelated_lat.append((path, time.time() - a, rr.status_code))
            time.sleep(1)

        # allow one endpoint (e.g. /customers) to be missing (404) but latency must be sane
        max_lat = max((l for _, l, _ in unrelated_lat), default=0)
        assert max_lat < 3.0, f"unrelated endpoint blocked: {max_lat:.2f}s, samples={unrelated_lat[:5]}"

        # let batch finish so next test's 409-check has clean state
        _wait_batch(client, timeout=120)
    finally:
        for sid in ids:
            client.delete(f"{BASE_URL}/api/services/{sid}", timeout=15)


# ---------- Feature 5: regression smoke ----------
def test_regression_smoke(client):
    for path in ["/api/services", "/api/service-categories", "/api/services/image-weight"]:
        r = client.get(f"{BASE_URL}{path}", timeout=15)
        assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:150]}"


# ---------- Feature 5b: concurrency 409 ----------
def test_concurrent_batch_returns_409(client):
    cat = f"ZZ QA 409 {uuid.uuid4().hex[:6]}"
    ids = []
    try:
        for i in range(2):
            r = client.post(f"{BASE_URL}/api/services", json={
                "name": f"QA 409 Svc {i}", "category": cat, "price": 100, "duration_min": 30
            }, timeout=30)
            assert r.status_code in (200, 201)
            ids.append(r.json()["id"])
        r1 = client.post(f"{BASE_URL}/api/services/generate-missing-images?category={cat}", timeout=30)
        assert r1.status_code == 200
        # immediately fire another before it finishes
        r2 = client.post(f"{BASE_URL}/api/services/generate-missing-images?category={cat}", timeout=30)
        assert r2.status_code == 409, f"expected 409, got {r2.status_code} {r2.text[:150]}"
        _wait_batch(client, timeout=120)
    finally:
        for sid in ids:
            client.delete(f"{BASE_URL}/api/services/{sid}", timeout=15)
