"""Emergent Object Storage: image uploads (staff photos, service/product thumbnails)."""
import os
import requests
from typing import Optional
from fastapi import HTTPException

# ---------------- Emergent Object Storage ----------------
# Powers image uploads for staff photos, service thumbnails, product images.
# One shared session key across the API — Emergent's object store is a single
# bucket per app; multi-tenant isolation happens via the path prefix.
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "miracurl-salon"
_storage_key: Optional[str] = None
_MIME = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp",
}


def _init_storage() -> str:
    global _storage_key
    if _storage_key:
        return _storage_key
    emergent_key = os.environ.get("EMERGENT_LLM_KEY")
    if not emergent_key:
        raise HTTPException(500, "Object storage not configured (EMERGENT_LLM_KEY missing)")
    r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": emergent_key}, timeout=30)
    r.raise_for_status()
    _storage_key = r.json()["storage_key"]
    return _storage_key


def _put_object(path: str, data: bytes, content_type: str) -> dict:
    key = _init_storage()
    r = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    if r.status_code == 403:  # session expired — force a re-init
        global _storage_key
        _storage_key = None
        key = _init_storage()
        r = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=120,
        )
    r.raise_for_status()
    return r.json()


def _get_object(path: str) -> tuple[bytes, str]:
    key = _init_storage()
    r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if r.status_code == 403:
        global _storage_key
        _storage_key = None
        key = _init_storage()
        r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")




_IMG_SIGS = {
    "jpg": (b"\xff\xd8\xff",), "jpeg": (b"\xff\xd8\xff",),
    "png": (b"\x89PNG\r\n\x1a\n",), "gif": (b"GIF87a", b"GIF89a"),
    "webp": (b"RIFF",),
}


def validate_image_bytes(ext: str, data: bytes):
    """Magic-byte sniffing — extension alone is spoofable (security hardening)."""
    sigs = _IMG_SIGS.get(ext)
    if sigs and not any(data.startswith(s) for s in sigs):
        raise HTTPException(400, "File content doesn't match its image type")
