"""Social account connections (Meta Instagram/Facebook + Google Business Profile).

OAuth flows are backend-driven: /start returns an auth URL, provider redirects to
the public /callback which exchanges the code, stores long-lived tokens per tenant
in `social_connections`, then bounces back to /settings. Publishing endpoints use
the stored tokens so Mira Studio can auto-post once an account is connected.
"""
import os
import uuid
import asyncio
import logging
from urllib.parse import urlencode
from datetime import datetime, timezone, timedelta

import httpx
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from database import _raw_db
from security import require_tenant_admin, current_tenant

router = APIRouter()
log = logging.getLogger("social_connect")

GRAPH = "https://graph.facebook.com/v21.0"
FB_DIALOG = "https://www.facebook.com/v21.0/dialog/oauth"
META_SCOPES = "pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish,business_management"
GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_SCOPE = "https://www.googleapis.com/auth/business.manage"
GBP_V4 = "https://mybusiness.googleapis.com/v4"
GBP_ACCOUNTS = "https://mybusinessaccountmanagement.googleapis.com/v1"
GBP_INFO = "https://mybusinessbusinessinformation.googleapis.com/v1"
STAR_MAP = {"ONE": 1, "TWO": 2, "THREE": 3, "FOUR": 4, "FIVE": 5}


def _meta_creds():
    return os.environ.get("META_APP_ID", ""), os.environ.get("META_APP_SECRET", "")


def _google_creds():
    return os.environ.get("GOOGLE_OAUTH_CLIENT_ID", ""), os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", "")


# ── Token encryption at rest (Fernet, legacy plaintext passthrough) ─────────
_fernet = None

def _f():
    global _fernet
    if _fernet is None:
        from cryptography.fernet import Fernet
        _fernet = Fernet(os.environ["TOKEN_ENC_KEY"].encode())
    return _fernet

def _enc(v):
    return f"enc:{_f().encrypt(v.encode()).decode()}" if v else v

def _dec(v):
    if isinstance(v, str) and v.startswith("enc:"):
        try:
            return _f().decrypt(v[4:].encode()).decode()
        except Exception:
            return v
    return v

def _enc_gb(gb: dict) -> dict:
    return {**gb, "access_token": _enc(gb.get("access_token")), "refresh_token": _enc(gb.get("refresh_token"))}


_ALLOWED_HOSTS = [h.strip().lower() for h in os.environ.get("ALLOWED_PUBLIC_HOSTS", "").split(",") if h.strip()]

def _base(request: Request) -> str:
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host", "")).split(":")[0].lower()
    if _ALLOWED_HOSTS and host not in _ALLOWED_HOSTS:
        host = _ALLOWED_HOSTS[0]
    return f"https://{host}"


async def _conn(tid: str) -> dict:
    doc = await _raw_db.social_connections.find_one({"tenant_id": tid}, {"_id": 0}) or {}
    for k in ("facebook", "instagram"):
        if doc.get(k) and doc[k].get("page_token"):
            doc[k]["page_token"] = _dec(doc[k]["page_token"])
    if doc.get("meta_user_token"):
        doc["meta_user_token"] = _dec(doc["meta_user_token"])
    for p in doc.get("meta_pages") or []:
        if p.get("page_token"):
            p["page_token"] = _dec(p["page_token"])
    gb = doc.get("google_business")
    if gb:
        for k in ("access_token", "refresh_token"):
            if gb.get(k):
                gb[k] = _dec(gb[k])
    return doc


async def _new_state(tid: str, provider: str) -> str:
    state = uuid.uuid4().hex
    now = datetime.now(timezone.utc)
    await _raw_db.oauth_states.insert_one({
        "state": state, "tenant_id": tid, "provider": provider,
        "created_at": now.isoformat(), "expires_at": (now + timedelta(minutes=15)).isoformat(),
    })
    return state


async def _pop_state(state: str, provider: str) -> dict | None:
    doc = await _raw_db.oauth_states.find_one_and_delete({"state": state, "provider": provider})
    if doc and doc.get("expires_at") and doc["expires_at"] < datetime.now(timezone.utc).isoformat():
        return None
    return doc


# ── Status ──────────────────────────────────────────────────────────────────
@router.get("/social/connections")
async def connections_status(request: Request, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    meta_id, meta_secret = _meta_creds()
    g_id, g_secret = _google_creds()
    doc = await _conn(t["id"])
    fb = doc.get("facebook") or None
    ig = doc.get("instagram") or None
    gb = doc.get("google_business") or None
    return {
        "meta_configured": bool(meta_id and meta_secret),
        "google_configured": bool(g_id and g_secret),
        "google_redirect_uri": f"{_base(request)}/api/social/google/oauth/callback",
        "meta_redirect_uri": f"{_base(request)}/api/social/meta/oauth/callback",
        "facebook": {"page_id": fb["page_id"], "page_name": fb.get("page_name")} if fb else None,
        "instagram": {"ig_user_id": ig["ig_user_id"], "username": ig.get("username")} if ig else None,
        "google_business": {
            "location_title": gb.get("location_title"), "location_name": gb.get("location_name"),
            "api_ready": gb.get("api_ready", False),
        } if gb else None,
        "meta_pages": [
            {"id": p["id"], "name": p["name"], "ig_username": p.get("ig_username")}
            for p in (doc.get("meta_pages") or [])
        ] if not fb else [],
    }


# ── Meta OAuth ──────────────────────────────────────────────────────────────
@router.get("/social/meta/oauth/start")
async def meta_oauth_start(request: Request, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    app_id, app_secret = _meta_creds()
    if not (app_id and app_secret):
        raise HTTPException(400, "Meta app credentials not configured yet. Add META_APP_ID and META_APP_SECRET.")
    state = await _new_state(t["id"], "meta")
    params = {
        "client_id": app_id,
        "redirect_uri": f"{_base(request)}/api/social/meta/oauth/callback",
        "response_type": "code",
        "scope": META_SCOPES,
        "state": state,
    }
    return {"auth_url": f"{FB_DIALOG}?{urlencode(params)}"}


@router.get("/social/meta/oauth/callback")
async def meta_oauth_callback(request: Request, code: str = "", state: str = "", error: str = ""):
    if error or not code or not state:
        return RedirectResponse("/settings?social=meta_error")
    doc = await _pop_state(state, "meta")
    if not doc:
        return RedirectResponse("/settings?social=meta_error")
    tid = doc["tenant_id"]
    app_id, app_secret = _meta_creds()
    redirect_uri = f"{_base(request)}/api/social/meta/oauth/callback"
    try:
        async with httpx.AsyncClient(timeout=30) as http:
            tok = await http.get(f"{GRAPH}/oauth/access_token", params={
                "client_id": app_id, "client_secret": app_secret,
                "redirect_uri": redirect_uri, "code": code,
            })
            tok.raise_for_status()
            short_token = tok.json()["access_token"]
            ll = await http.get(f"{GRAPH}/oauth/access_token", params={
                "grant_type": "fb_exchange_token", "client_id": app_id,
                "client_secret": app_secret, "fb_exchange_token": short_token,
            })
            ll.raise_for_status()
            user_token = ll.json()["access_token"]
            pages_resp = await http.get(f"{GRAPH}/me/accounts", params={
                "fields": "id,name,access_token,instagram_business_account{id,username}",
                "access_token": user_token,
            })
            pages_resp.raise_for_status()
            pages_raw = pages_resp.json().get("data", [])
    except Exception as e:
        # scrub: httpx errors embed the full request URL, which can carry an access token
        log.error("meta oauth failed: %s", type(e).__name__ + ": " + str(e).split("?")[0][:200])
        return RedirectResponse("/settings?social=meta_error")

    pages = [{
        "id": p["id"], "name": p.get("name"), "page_token": p.get("access_token"),
        "ig_id": (p.get("instagram_business_account") or {}).get("id"),
        "ig_username": (p.get("instagram_business_account") or {}).get("username"),
    } for p in pages_raw]

    update = {"meta_user_token": user_token, "meta_pages": pages,
              "meta_connected_at": datetime.now(timezone.utc).isoformat()}
    if len(pages) == 1:
        update.update(_page_selection(pages[0]))
    await _raw_db.social_connections.update_one({"tenant_id": tid}, {"$set": update}, upsert=True)
    if not pages:
        return RedirectResponse("/settings?social=meta_no_pages")
    return RedirectResponse("/settings?social=meta_ok" if len(pages) == 1 else "/settings?social=meta_pick_page")


def _page_selection(page: dict) -> dict:
    sel = {"facebook": {"page_id": page["id"], "page_name": page.get("name"), "page_token": _enc(page.get("page_token"))}}
    if page.get("ig_id"):
        sel["instagram"] = {"ig_user_id": page["ig_id"], "username": page.get("ig_username"),
                            "page_token": _enc(page.get("page_token"))}
    return sel


class SelectPageIn(BaseModel):
    page_id: str


@router.post("/social/meta/select-page")
async def meta_select_page(body: SelectPageIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    doc = await _conn(t["id"])
    page = next((p for p in doc.get("meta_pages", []) if p["id"] == body.page_id), None)
    if not page:
        raise HTTPException(404, "Page not found — reconnect your Meta account")
    await _raw_db.social_connections.update_one({"tenant_id": t["id"]}, {"$set": _page_selection(page)})
    return {"ok": True, "page_name": page.get("name"), "ig_username": page.get("ig_username")}


@router.delete("/social/meta")
async def meta_disconnect(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    await _raw_db.social_connections.update_one(
        {"tenant_id": t["id"]},
        {"$unset": {"facebook": "", "instagram": "", "meta_user_token": "", "meta_pages": ""}})
    return {"ok": True}


# ── Google Business OAuth ───────────────────────────────────────────────────
@router.get("/social/google/oauth/start")
async def google_oauth_start(request: Request, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    g_id, g_secret = _google_creds()
    if not (g_id and g_secret):
        raise HTTPException(400, "Google OAuth credentials not configured yet. Add GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.")
    state = await _new_state(t["id"], "google")
    params = {
        "client_id": g_id,
        "redirect_uri": f"{_base(request)}/api/social/google/oauth/callback",
        "response_type": "code",
        "scope": GOOGLE_SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return {"auth_url": f"{GOOGLE_AUTH}?{urlencode(params)}"}


@router.get("/social/google/oauth/callback")
async def google_oauth_callback(request: Request, code: str = "", state: str = "", error: str = ""):
    if error or not code or not state:
        return RedirectResponse("/settings?social=google_error")
    doc = await _pop_state(state, "google")
    if not doc:
        return RedirectResponse("/settings?social=google_error")
    tid = doc["tenant_id"]
    g_id, g_secret = _google_creds()
    try:
        async with httpx.AsyncClient(timeout=30) as http:
            tok = await http.post(GOOGLE_TOKEN_URL, data={
                "code": code, "client_id": g_id, "client_secret": g_secret,
                "redirect_uri": f"{_base(request)}/api/social/google/oauth/callback",
                "grant_type": "authorization_code",
            })
            tok.raise_for_status()
            td = tok.json()
    except Exception as e:
        log.error("google oauth failed: %s", e)
        return RedirectResponse("/settings?social=google_error")

    gb = {
        "refresh_token": td.get("refresh_token"),
        "access_token": td["access_token"],
        "expires_at": datetime.now(timezone.utc).timestamp() + td.get("expires_in", 3600),
        "api_ready": False,
    }
    # Best-effort: discover account + location (fails if GBP API quota not yet approved)
    try:
        async with httpx.AsyncClient(timeout=30) as http:
            hdr = {"Authorization": f"Bearer {gb['access_token']}"}
            acc = await http.get(f"{GBP_ACCOUNTS}/accounts", headers=hdr)
            acc.raise_for_status()
            accounts = acc.json().get("accounts", [])
            if accounts:
                account_name = accounts[0]["name"]
                loc = await http.get(f"{GBP_INFO}/{account_name}/locations",
                                     params={"readMask": "name,title", "pageSize": 10}, headers=hdr)
                loc.raise_for_status()
                locations = loc.json().get("locations", [])
                if locations:
                    gb["location_name"] = f"{account_name}/{locations[0]['name']}"
                    gb["location_title"] = locations[0].get("title")
                    gb["api_ready"] = True
    except Exception as e:
        log.warning("google business discovery failed (API access may be pending approval): %s", e)

    await _raw_db.social_connections.update_one(
        {"tenant_id": tid},
        {"$set": {"google_business": gb, "google_connected_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True)
    return RedirectResponse("/settings?social=google_ok" if gb["api_ready"] else "/settings?social=google_pending")


@router.delete("/social/google")
async def google_disconnect(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    await _raw_db.social_connections.update_one(
        {"tenant_id": t["id"]}, {"$unset": {"google_business": ""}})
    return {"ok": True}


async def _google_token(tid: str) -> tuple[str, dict]:
    doc = await _conn(tid)
    gb = doc.get("google_business")
    if not gb:
        raise HTTPException(400, "Google Business account not connected")
    now = datetime.now(timezone.utc).timestamp()
    if now < gb.get("expires_at", 0) - 300:
        return gb["access_token"], gb
    g_id, g_secret = _google_creds()
    async with httpx.AsyncClient(timeout=30) as http:
        resp = await http.post(GOOGLE_TOKEN_URL, data={
            "client_id": g_id, "client_secret": g_secret,
            "refresh_token": gb.get("refresh_token"), "grant_type": "refresh_token",
        })
    if resp.status_code != 200:
        raise HTTPException(400, "Google session expired — please reconnect your Google Business account")
    td = resp.json()
    gb["access_token"] = td["access_token"]
    gb["expires_at"] = now + td.get("expires_in", 3600)
    await _raw_db.social_connections.update_one({"tenant_id": tid}, {"$set": {"google_business": _enc_gb(gb)}})
    return gb["access_token"], gb


# ── Google reviews ──────────────────────────────────────────────────────────
@router.get("/social/google/reviews")
async def google_reviews(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    token, gb = await _google_token(t["id"])
    if not gb.get("location_name"):
        raise HTTPException(400, "Google Business location not found yet — API access may still be pending Google approval")
    async with httpx.AsyncClient(timeout=30) as http:
        resp = await http.get(f"{GBP_V4}/{gb['location_name']}/reviews",
                              params={"pageSize": 20},
                              headers={"Authorization": f"Bearer {token}"})
    if resp.status_code != 200:
        log.error("google reviews failed: %s", resp.text[:500])
        raise HTTPException(400, "Couldn't fetch Google reviews — check your Business Profile API access")
    data = resp.json()
    reviews = [{
        "review_id": r.get("reviewId"),
        "reviewer": (r.get("reviewer") or {}).get("displayName", "Anonymous"),
        "rating": STAR_MAP.get(r.get("starRating"), 0),
        "comment": r.get("comment", ""),
        "created": r.get("createTime"),
        "reply": (r.get("reviewReply") or {}).get("comment"),
    } for r in data.get("reviews", [])]
    return {"reviews": reviews, "average_rating": data.get("averageRating"), "total": data.get("totalReviewCount")}


class ReviewReplyIn(BaseModel):
    review_id: str
    comment: str


@router.post("/social/google/reviews/reply")
async def google_review_reply(body: ReviewReplyIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    token, gb = await _google_token(t["id"])
    if not gb.get("location_name"):
        raise HTTPException(400, "Google Business location not configured")
    async with httpx.AsyncClient(timeout=30) as http:
        resp = await http.put(f"{GBP_V4}/{gb['location_name']}/reviews/{body.review_id}/reply",
                              json={"comment": body.comment.strip()},
                              headers={"Authorization": f"Bearer {token}"})
    if resp.status_code != 200:
        log.error("review reply failed: %s", resp.text[:500])
        raise HTTPException(400, "Couldn't post the reply to Google")
    return {"ok": True}


class DraftReplyIn(BaseModel):
    reviewer: str
    rating: int
    comment: str


@router.post("/social/google/draft-reply")
async def google_draft_reply(body: DraftReplyIn, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    from routes.mira_common import _ask
    reply = await _ask(
        f"You reply to Google reviews for '{t.get('name')}', a premium Indian salon. Write ONE warm, personal, "
        "professional reply (2-3 sentences). Thank by name, address specifics, invite them back. "
        "For negative reviews: apologise sincerely and offer to make it right. No hashtags, no markdown.",
        f"Reviewer: {body.reviewer}. Rating: {body.rating}/5. Review: {body.comment or '(no text)'}")
    return {"draft": reply}


# ── Post history + engagement ───────────────────────────────────────────────
@router.get("/social/history")
async def social_history(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    posts = await _raw_db.social_posts.find(
        {"tenant_id": t["id"]}, {"_id": 0}).sort("created_at", -1).to_list(30)
    doc = await _conn(t["id"])
    fb, ig = doc.get("facebook"), doc.get("instagram")
    now = datetime.now(timezone.utc).timestamp()
    async with httpx.AsyncClient(timeout=20) as http:
        for p in posts:
            if (p.get("engagement") or {}).get("fetched_at", 0) > now - 3600:
                continue
            r = p.get("results") or {}
            fb_id = (r.get("facebook") or {}).get("post_id")
            ig_id = (r.get("instagram") or {}).get("media_id")
            new_eng = {}
            try:
                if fb_id and fb:
                    resp = await http.get(f"{GRAPH}/{fb_id}", params={
                        "fields": "likes.summary(true),comments.summary(true),shares",
                        "access_token": fb["page_token"]})
                    if resp.status_code == 200:
                        d = resp.json()
                        new_eng["facebook"] = {
                            "likes": ((d.get("likes") or {}).get("summary") or {}).get("total_count", 0),
                            "comments": ((d.get("comments") or {}).get("summary") or {}).get("total_count", 0),
                            "shares": (d.get("shares") or {}).get("count", 0)}
                if ig_id and ig:
                    resp = await http.get(f"{GRAPH}/{ig_id}", params={
                        "fields": "like_count,comments_count", "access_token": ig["page_token"]})
                    if resp.status_code == 200:
                        d = resp.json()
                        new_eng["instagram"] = {"likes": d.get("like_count", 0), "comments": d.get("comments_count", 0)}
            except Exception as e:
                log.warning("engagement fetch failed for post %s: %s", p.get("id"), e)
            if new_eng:
                new_eng["fetched_at"] = now
                p["engagement"] = new_eng
                await _raw_db.social_posts.update_one({"id": p["id"]}, {"$set": {"engagement": new_eng}})
    return {"posts": posts}


@router.delete("/social/history")
async def clear_social_history(admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    res = await _raw_db.social_posts.delete_many({"tenant_id": t["id"]})
    return {"ok": True, "deleted": res.deleted_count}


@router.delete("/social/history/{post_id}")
async def delete_social_history_item(post_id: str, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    res = await _raw_db.social_posts.delete_one({"tenant_id": t["id"], "id": post_id})
    if not res.deleted_count:
        raise HTTPException(404, "Post log not found")
    return {"ok": True}


# ── Google Business local posts ─────────────────────────────────────────────
async def publish_google_post(tid: str, summary: str, image_abs_url: str | None = None,
                              offer_title: str | None = None) -> dict:
    """Best-effort: publish an OFFER post on the tenant's Google Business Profile."""
    try:
        token, gb = await _google_token(tid)
    except HTTPException as e:
        return {"ok": False, "error": str(e.detail)}
    if not gb.get("location_name"):
        return {"ok": False, "error": "Google Business location not ready — API approval pending"}
    today = datetime.now(timezone.utc).date()
    d = {"year": today.year, "month": today.month, "day": today.day}
    post = {
        "languageCode": "en", "summary": summary[:1500], "topicType": "OFFER",
        "event": {"title": (offer_title or "Today's Offer")[:58],
                  "schedule": {"startDate": d, "endDate": d}},
    }
    if image_abs_url:
        post["media"] = [{"mediaFormat": "PHOTO", "sourceUrl": image_abs_url}]
    async with httpx.AsyncClient(timeout=60) as http:
        resp = await http.post(f"{GBP_V4}/{gb['location_name']}/localPosts",
                               json=post, headers={"Authorization": f"Bearer {token}"})
    if resp.status_code != 200:
        log.error("google local post failed: %s", resp.text[:500])
        result = {"ok": False, "error": resp.text[:200]}
    else:
        result = {"ok": True, "post_name": resp.json().get("name")}
    await _raw_db.social_posts.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": tid, "caption": summary, "image_url": image_abs_url,
        "platforms": ["google"], "results": {"google": result}, "kind": "google_offer",
        "created_at": datetime.now(timezone.utc).isoformat()})
    return result


# ── Publishing (Instagram + Facebook) ───────────────────────────────────────
async def publish_content(tid: str, caption: str, image_abs_url: str, platforms: list[str]) -> dict:
    doc = await _conn(tid)
    fb, ig = doc.get("facebook"), doc.get("instagram")
    results = {}
    async with httpx.AsyncClient(timeout=60) as http:
        if "facebook" in platforms:
            if not fb:
                results["facebook"] = {"ok": False, "error": "Facebook Page not connected"}
            else:
                resp = await http.post(f"{GRAPH}/{fb['page_id']}/photos", data={
                    "url": image_abs_url, "caption": caption, "published": "true",
                    "access_token": fb["page_token"],
                })
                results["facebook"] = ({"ok": True, "post_id": resp.json().get("id")} if resp.status_code == 200
                                       else {"ok": False, "error": resp.text[:300]})
        if "instagram" in platforms:
            if not ig:
                results["instagram"] = {"ok": False, "error": "Instagram account not connected"}
            else:
                results["instagram"] = await _publish_instagram(http, ig, caption, image_abs_url)
    await _raw_db.social_posts.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": tid, "caption": caption, "image_url": image_abs_url,
        "platforms": platforms, "results": results, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return results


async def _publish_instagram(http: httpx.AsyncClient, ig: dict, caption: str, image_url: str) -> dict:
    token = ig["page_token"]
    create = await http.post(f"{GRAPH}/{ig['ig_user_id']}/media", data={
        "image_url": image_url, "caption": caption, "access_token": token,
    })
    if create.status_code != 200:
        return {"ok": False, "error": create.text[:300]}
    creation_id = create.json().get("id")
    for _ in range(10):
        status = await http.get(f"{GRAPH}/{creation_id}", params={"fields": "status_code", "access_token": token})
        if status.status_code == 200 and status.json().get("status_code") == "FINISHED":
            break
        await asyncio.sleep(3)
    pub = await http.post(f"{GRAPH}/{ig['ig_user_id']}/media_publish", data={
        "creation_id": creation_id, "access_token": token,
    })
    if pub.status_code != 200:
        return {"ok": False, "error": pub.text[:300]}
    return {"ok": True, "media_id": pub.json().get("id")}


async def publish_video(tid: str, caption: str, video_abs_url: str, platforms: list[str]) -> dict:
    """Publish a video as an Instagram Reel and/or Facebook Page video."""
    doc = await _conn(tid)
    fb, ig = doc.get("facebook"), doc.get("instagram")
    results = {}
    async with httpx.AsyncClient(timeout=120) as http:
        if "instagram" in platforms:
            if not ig:
                results["instagram"] = {"ok": False, "error": "Instagram account not connected"}
            else:
                token = ig["page_token"]
                create = await http.post(f"{GRAPH}/{ig['ig_user_id']}/media", data={
                    "media_type": "REELS", "video_url": video_abs_url, "caption": caption,
                    "share_to_feed": "true", "access_token": token})
                if create.status_code != 200:
                    results["instagram"] = {"ok": False, "error": create.text[:300]}
                else:
                    cid = create.json().get("id")
                    state = ""
                    for _ in range(60):  # reels can take a few minutes to process
                        st = await http.get(f"{GRAPH}/{cid}", params={"fields": "status_code", "access_token": token})
                        state = st.json().get("status_code", "") if st.status_code == 200 else ""
                        if state in ("FINISHED", "ERROR"):
                            break
                        await asyncio.sleep(5)
                    if state != "FINISHED":
                        results["instagram"] = {"ok": False, "error": f"Reel processing did not finish (status: {state or 'unknown'})"}
                    else:
                        pub = await http.post(f"{GRAPH}/{ig['ig_user_id']}/media_publish", data={
                            "creation_id": cid, "access_token": token})
                        results["instagram"] = ({"ok": True, "media_id": pub.json().get("id")} if pub.status_code == 200
                                                else {"ok": False, "error": pub.text[:300]})
        if "facebook" in platforms:
            if not fb:
                results["facebook"] = {"ok": False, "error": "Facebook Page not connected"}
            else:
                resp = await http.post(f"{GRAPH}/{fb['page_id']}/videos", data={
                    "file_url": video_abs_url, "description": caption, "access_token": fb["page_token"]})
                results["facebook"] = ({"ok": True, "post_id": resp.json().get("id")} if resp.status_code == 200
                                       else {"ok": False, "error": resp.text[:300]})
    await _raw_db.social_posts.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": tid, "caption": caption, "video_url": video_abs_url,
        "platforms": platforms, "results": results, "kind": "video",
        "created_at": datetime.now(timezone.utc).isoformat()})
    return results


class PublishIn(BaseModel):
    caption: str
    image_url: str
    platforms: list[str] = ["instagram", "facebook"]


@router.post("/social/publish")
async def publish_post(body: PublishIn, request: Request, admin=Depends(require_tenant_admin), t=Depends(current_tenant)):
    if not body.caption.strip() or not body.image_url:
        raise HTTPException(400, "Caption and image are required")
    image_abs = body.image_url if body.image_url.startswith("http") else f"{_base(request)}{body.image_url}"
    results = await publish_content(t["id"], body.caption.strip(), image_abs, body.platforms)
    return {"results": results}

