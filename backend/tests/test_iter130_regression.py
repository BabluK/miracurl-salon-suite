"""
Iteration 130 regression tests:
- Rewards entries batch, vote toggle atomic, public rewards status
- HQ growth-advisory ledger progress for scheduled bookings
- Auth profile: notify_email, instagram, login-email change with wrong password
"""
import os
import time
import requests
import pytest

def _read_env():
    try:
        with open('/app/frontend/.env') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    return line.split('=', 1)[1].strip()
    except Exception:
        pass
    return None

BASE_URL = (os.environ.get('REACT_APP_BACKEND_URL') or _read_env()).rstrip('/')
TENANT = 'miracurl-marathahalli'
SUPER_EMAIL = 'super@miracurl.com'
SUPER_PASS = 'og9T@41Es#OQb6'
ADMIN_EMAIL = 'admin@miracurl.com'
ADMIN_PASS = 'q6QY@tn3p#9DtL'
OWNER_PIN = '4321'


@pytest.fixture(scope='module')
def super_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": SUPER_EMAIL, "password": SUPER_PASS})
    assert r.status_code == 200, r.text
    csrf = s.cookies.get("csrf_token")
    if csrf:
        s.headers.update({"X-CSRF-Token": csrf})
    return s


@pytest.fixture(scope='module')
def admin_session():
    s = requests.Session()
    s.headers.update({"X-Tenant-Slug": TENANT, "X-Owner-Pin": OWNER_PIN})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
               headers={"X-Tenant-Slug": TENANT})
    assert r.status_code == 200, r.text
    csrf = s.cookies.get("csrf_token")
    if csrf:
        s.headers.update({"X-CSRF-Token": csrf})
    return s


# ============== Rewards: /me entries ==============
class TestRewardsPublicMe:
    def test_public_me_entries_shape(self):
        r = requests.get(f"{BASE_URL}/api/public/rewards/{TENANT}/me",
                         params={"phone": "9700011299"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert 'entries' in data, data
        entries = data['entries']
        assert 'total' in entries and 'vote_count' in entries
        assert isinstance(entries['total'], int)
        assert isinstance(entries['vote_count'], int)
        # cross-check with applicants list
        ap = requests.get(f"{BASE_URL}/api/public/rewards/{TENANT}/applicants")
        assert ap.status_code == 200
        arr = ap.json().get('applicants') or ap.json().get('items') or []
        me = next((a for a in arr if a.get('phone') == '9700011299' or a.get('phone', '').endswith('9700011299')), None)
        if me is not None:
            # vote_count consistency
            vc = me.get('vote_count') or me.get('votes')
            if vc is not None:
                assert entries['vote_count'] == vc, f"{entries['vote_count']} != {vc}"

    def test_public_rewards_has_status_and_salon_on(self):
        r = requests.get(f"{BASE_URL}/api/public/rewards/{TENANT}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert 'status' in d, d
        assert 'salon_on' in d, d
        assert d['status'] == 'live', f"expected live, got {d.get('status')}"


# ============== Vote toggle ==============
class TestVoteToggle:
    def test_vote_toggle_atomic(self):
        # Get an applicant to vote for
        ap = requests.get(f"{BASE_URL}/api/public/rewards/{TENANT}/applicants")
        assert ap.status_code == 200
        arr = ap.json().get('applicants') or ap.json().get('items') or []
        assert len(arr) > 0
        target = arr[0]
        target_id = target.get('id') or target.get('_id') or target.get('participant_id')
        prev_count = target.get('vote_count') or target.get('votes') or 0
        # Use a fresh phone
        fresh_phone = f"98{int(time.time()) % 100000000:08d}"

        r1 = requests.post(f"{BASE_URL}/api/public/rewards/{TENANT}/vote",
                           json={"participant_id": target_id, "phone": fresh_phone})
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1.get('voted') is True, d1

        r2 = requests.post(f"{BASE_URL}/api/public/rewards/{TENANT}/vote",
                           json={"participant_id": target_id, "phone": fresh_phone})
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        assert d2.get('voted') is False, d2

        # count is back to prev
        ap2 = requests.get(f"{BASE_URL}/api/public/rewards/{TENANT}/applicants")
        arr2 = ap2.json().get('applicants') or ap2.json().get('items') or []
        tgt2 = next((a for a in arr2 if (a.get('id') or a.get('_id')) == target_id), None)
        if tgt2 is not None:
            now_count = tgt2.get('vote_count') or tgt2.get('votes') or 0
            assert now_count == prev_count, f"vote count drifted: {prev_count} -> {now_count}"


# ============== Super Admin & Tenant participants entries ==============
class TestParticipantsEntries:
    def test_super_participants_have_entries(self, super_session):
        r = super_session.get(f"{BASE_URL}/api/super-admin/rewards-campaign/participants")
        assert r.status_code == 200, r.text
        data = r.json()
        rows = data.get('participants') or []
        if not rows and isinstance(data, list):
            rows = data
        assert len(rows) > 0, data
        row = rows[0]
        assert 'entries' in row, row
        e = row['entries']
        for k in ('purchases', 'referred', 'vote_count', 'total'):
            assert k in e, f"missing {k} in {e}"

    def test_tenant_settings_participants_have_entries(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/settings/rewards-campaign")
        assert r.status_code == 200, r.text
        data = r.json()
        parts = data.get('participants') or []
        if parts:
            assert 'entries' in parts[0], parts[0]


# ============== Auth profile updates ==============
class TestAuthProfile:
    def test_login_super(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": SUPER_EMAIL, "password": SUPER_PASS})
        assert r.status_code == 200

    def test_login_tenant_admin(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
                          headers={"X-Tenant-Slug": TENANT})
        assert r.status_code == 200

    def test_update_profile_notify_instagram(self, super_session):
        payload = {"name": "Super Admin", "notify_email": "delivered@resend.dev",
                   "instagram": "@miracurl.suite", "phone": "7406869271"}
        r = super_session.put(f"{BASE_URL}/api/auth/me/profile", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        # instagram stripped '@'
        insta = d.get('instagram') or (d.get('user') or {}).get('instagram')
        assert insta == 'miracurl.suite', d

        me = super_session.get(f"{BASE_URL}/api/auth/me")
        assert me.status_code == 200
        mej = me.json()
        u = mej.get('user') or mej
        assert u.get('notify_email') == 'delivered@resend.dev'
        assert u.get('instagram') == 'miracurl.suite'

    def test_login_email_wrong_password_400(self, super_session):
        r = super_session.put(f"{BASE_URL}/api/auth/me/login-email",
                              json={"new_email": "some-other@miracurl.com",
                                    "current_password": "WRONG_PASSWORD_XYZ"})
        assert r.status_code == 400, r.text


# ============== Growth advisory ledger ==============
class TestGrowthAdvisory:
    def test_ledger_has_progress(self, super_session):
        r = super_session.get(f"{BASE_URL}/api/super-admin/growth-advisory")
        assert r.status_code == 200, r.text
        d = r.json()
        bookings = d.get('bookings') or []
        scheduled = [b for b in bookings if b.get('status') in ('scheduled', 'completed')]
        if scheduled:
            b = scheduled[0]
            assert 'progress' in b, b
