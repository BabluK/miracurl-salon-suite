"""Test credentials come from env or /app/memory/test_credentials.md — never literals in test files."""
import os
import re

_DOC = "/app/memory/test_credentials.md"


def _from_doc(email: str) -> str:
    try:
        text = open(_DOC, encoding="utf-8").read()
    except OSError:
        return ""
    m = re.search(re.escape(email) + r"`?\s*\|\s*\n\|\s*\*\*Password\*\*\s*\|\s*`([^`]+)`", text)
    return m.group(1) if m else ""


def password_for(email: str, env_key: str = "") -> str:
    return (os.environ.get(env_key) if env_key else "") or os.environ.get("TEST_PASSWORD_" + re.sub(r"\W", "_", email).upper()) or _from_doc(email)
