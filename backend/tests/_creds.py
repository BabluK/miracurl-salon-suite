"""Shared test credentials — keeps secrets OUT of test files.

Resolution order: env var first, then the preview credentials file
/app/memory/test_credentials.md (never committed hardcoded in tests).
"""
import os
import re
from pathlib import Path

_CRED_FILE = Path("/app/memory/test_credentials.md")


def _from_cred_file(email: str) -> str:
    text = _CRED_FILE.read_text()
    m = re.search(re.escape(email) + r"`\s*\|\s*\n\|\s*\*\*Password\*\*\s*\|\s*`([^`]+)`", text)
    if not m:
        raise RuntimeError(f"Password for {email} not found in {_CRED_FILE}")
    return m.group(1)


def _resolve(env_key: str, email: str) -> str:
    return os.environ.get(env_key) or _from_cred_file(email)


_PW_ADMIN = _resolve("TEST_ADMIN_PASSWORD", "admin@miracurl.com")
_PW_SUPER = _resolve("TEST_SUPER_PASSWORD", "super@miracurl.com")
_PW_MANAGER = _resolve("TEST_MANAGER_PASSWORD", "manager@miracurl.com")
_PW_ELEGANCE = _resolve("TEST_ELEGANCE_PASSWORD", "owner@elegance.com")
