"""Test credentials come from the environment (TEST_PW_<KEY>) or /app/memory/test_credentials.md — never from source."""
import os
import re
from functools import lru_cache

# key -> (env var, email whose password we look up in test_credentials.md)
_KEYS = {
    "SUPER_ADMIN": ("TEST_PW_SUPER_ADMIN", "admin@miracurl-suite.com"),
    "SALON_ADMIN": ("TEST_PW_SALON_ADMIN", "admin@miracurl.com"),
    "RESTAURANT_ADMIN": ("TEST_PW_RESTAURANT_ADMIN", "infinity.admin@miracurl.com"),
    "USD_OWNER": ("TEST_PW_USD_OWNER", "emma.glowaustin@test.com"),
    "MANAGER": ("TEST_PW_MANAGER", "manager@miracurl.com"),
    "STAFF": ("TEST_PW_STAFF", "priya.staff@miracurl.com"),
    "LEGACY_SUPER": ("TEST_PW_LEGACY_SUPER", "super@miracurl.com"),
    "ELEGANCE_OWNER": ("TEST_PW_ELEGANCE_OWNER", "owner@elegance.com"),
}
_CREDS_MD = os.environ.get("TEST_CREDENTIALS_FILE", "/app/memory/test_credentials.md")


@lru_cache(maxsize=None)
def _md_passwords() -> dict:
    """email -> password, parsed from the markdown credential tables (`**Email** | \\`x\\` ... **Password** | \\`y\\``)."""
    out = {}
    try:
        text = open(_CREDS_MD, encoding="utf-8").read()
    except OSError:
        return out
    for block in re.split(r"\n(?=#)", text):
        emails = re.findall(r"\*\*Email\*\*\s*\|\s*`([^`]+)`", block)
        pws = re.findall(r"\*\*Password\*\*\s*\|\s*`([^`]+)`", block)
        for e, p in zip(emails, pws):
            out.setdefault(e.strip().lower(), p.strip())
    for e, p in re.findall(r"`([^`\s]+@[^`\s]+)`\s*/\s*`([^`]+)`", text):
        out.setdefault(e.strip().lower(), p.strip())
    return out


def pw(key: str) -> str:
    env, email = _KEYS[key]
    v = os.environ.get(env) or _md_passwords().get(email.lower())
    if not v:
        raise RuntimeError(f"Missing test credential {key}: set {env} or add {email} to {_CREDS_MD}")
    return v


def password_for(email: str, env_key: str = "") -> str:
    """Password for any email listed in test_credentials.md (env override: TEST_PASSWORD_<EMAIL>)."""
    return ((os.environ.get(env_key) if env_key else "")
            or os.environ.get("TEST_PASSWORD_" + re.sub(r"\W", "_", email).upper())
            or _md_passwords().get(email.lower(), ""))


def __getattr__(name: str):
    # Lazy legacy aliases used by older tests: _PW_ADMIN, _PW_SUPER, _PW_MANAGER, _PW_ELEGANCE
    alias = {"_PW_ADMIN": "SALON_ADMIN", "_PW_SUPER": "SUPER_ADMIN", "_PW_MANAGER": "MANAGER", "_PW_ELEGANCE": "ELEGANCE_OWNER"}
    if name in alias:
        return pw(alias[name])
    raise AttributeError(name)
