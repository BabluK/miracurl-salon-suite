"""SSRF-safe image fetch (public URLs only, peer-IP re-validated). Service layer — importable by routes and services."""
import ipaddress

import requests

import socket
from urllib.parse import urlparse


def is_safe_public_url(url: str) -> bool:
    """Allow only http(s) URLs that do not resolve to private/loopback/link-local hosts (SSRF guard)."""
    import ipaddress
    try:
        p = urlparse((url or "").strip())
    except Exception:
        return False
    if p.scheme not in ("http", "https") or not p.hostname:
        return False
    try:
        infos = socket.getaddrinfo(p.hostname, None)
    except Exception:
        return False
    for info in infos:
        addr = info[4][0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            return False
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            return False
    return True


def _safe_fetch_image_bytes(url: str, limit: int = 4 * 1024 * 1024) -> bytes:
    if not is_safe_public_url(url):
        raise ValueError("blocked url")
    resp = requests.get(url, timeout=6, stream=True, allow_redirects=False)
    try:
        # SEC: re-validate the ACTUAL connected peer IP (defeats DNS-rebinding TOCTOU).
        try:
            sock = resp.raw._connection.sock  # noqa: SLF001
            peer = ipaddress.ip_address(sock.getpeername()[0])
        except Exception:
            raise ValueError("blocked url")  # fail closed if peer can't be verified
        if (peer.is_private or peer.is_loopback or peer.is_link_local
                or peer.is_reserved or peer.is_multicast or peer.is_unspecified):
            raise ValueError("blocked url")
        resp.raise_for_status()
        return resp.raw.read(limit, decode_content=True)
    finally:
        resp.close()
