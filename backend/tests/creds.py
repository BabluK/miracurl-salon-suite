"""Test credentials loader — keeps secrets out of test files.
Priority: TEST_PASSWORD_<USER> env var, then /app/memory/test_credentials.md."""
import os
import re
from pathlib import Path

_MD = Path("/app/memory/test_credentials.md")


def password_for(email: str) -> str:
    env_key = "TEST_PASSWORD_" + re.sub(r"\W", "_", email.split("@")[0]).upper()
    if os.environ.get(env_key):
        return os.environ[env_key]
    try:
        lines = _MD.read_text().splitlines()
    except OSError as e:
        raise RuntimeError(f"Set {env_key} or provide {_MD}") from e
    for i, line in enumerate(lines):
        if email in line:
            for nxt in lines[i + 1:i + 4]:
                m = re.search(r"[Pp]assword\D*`([^`]+)`", nxt)
                if m:
                    return m.group(1)
    raise RuntimeError(f"No password found for {email} — set {env_key}")
