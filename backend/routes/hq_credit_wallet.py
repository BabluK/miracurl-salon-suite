"""HQ credit wallet: Miracurl's stock of SMS/WhatsApp credits handed to tenants on purchase or by manual grant."""
import os
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import _raw_db
from services.pack_pricing import pack_pricing
from security import require_super_admin

router = APIRouter()
WALLET_ID = "hq_credit_wallet"
FIELD = {"sms": "sms_points", "whatsapp": "wa_points"}
LOW_STOCK = 200  # Mira nags the Boss below this many unassigned credits
LABEL = {"sms": "SMS", "whatsapp": "WhatsApp"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _wallet() -> dict:
    w = await _raw_db.hq_wallet.find_one({"id": WALLET_ID}, {"_id": 0})
    if not w:
        w = {"id": WALLET_ID, "sms_stock": 0, "whatsapp_stock": 0, "sms_revenue_paise": 0, "whatsapp_revenue_paise": 0,
             "sms_cost_paise": 0, "whatsapp_cost_paise": 0, "updated_at": _now()}
        await _raw_db.hq_wallet.insert_one({**w})
    return w


async def _ledger(channel: str, delta: int, kind: str, tenant_id: str | None, amount_paise: int, by: str, note: str = "") -> None:
    await _raw_db.hq_wallet_ledger.insert_one({
        "id": str(uuid.uuid4()), "channel": channel, "delta": delta, "kind": kind, "tenant_id": tenant_id,
        "amount_paise": amount_paise, "by": by, "note": note, "at": _now()})


async def record_tenant_purchase(channel: str, points: int, tenant_id: str, amount_paise: int, payment_ref: str) -> None:
    """Tenant paid Razorpay → credits already added to tenant; take them out of HQ stock and book the revenue."""
    await _wallet()
    await _raw_db.hq_wallet.update_one({"id": WALLET_ID}, {"$inc": {f"{channel}_stock": -points, f"{channel}_revenue_paise": amount_paise},
                                                          "$set": {"updated_at": _now()}})
    await _ledger(channel, -points, "tenant_purchase", tenant_id, amount_paise, "razorpay", payment_ref)
    await check_low_stock()


def low_stock_line(w: dict) -> str:
    """Mira's one-liner for the Boss when HQ stock is thin (empty string when all good)."""
    low = [(ch, int(w.get(f"{ch}_stock") or 0)) for ch in FIELD if int(w.get(f"{ch}_stock") or 0) < LOW_STOCK]
    if not low:
        return ""
    parts = " and ".join(f"{n:,} {LABEL[ch]}" for ch, n in low)
    where = " / ".join("MSG91" if ch == "sms" else "Meta" for ch, _ in low)
    return (f"Hey Boss 👋 HQ has only {parts} credits left to assign. Please top up {where} so every tenant "
            f"who purchases a pack gets their credits instantly.")


async def check_low_stock() -> list[str]:
    """Below LOW_STOCK on any channel → one Mira alert per channel per day (HQ feed + email to admin@)."""
    w = await _wallet()
    today = datetime.now(timezone.utc).date().isoformat()
    fired = []
    for ch in FIELD:
        stock = int(w.get(f"{ch}_stock") or 0)
        if stock >= LOW_STOCK or w.get(f"{ch}_low_alert_date") == today:
            continue
        await _raw_db.hq_wallet.update_one({"id": WALLET_ID}, {"$set": {f"{ch}_low_alert_date": today}})
        await _raw_db.hq_wallet_alerts.insert_one({"id": f"wallet-low-{ch}-{today}", "channel": ch, "stock": stock, "at": _now()})
        fired.append(ch)
    if fired:
        from email_service import _send_email, hq_inbox
        line = low_stock_line(w)
        rows = "".join(f"<li><b>{LABEL[ch]}</b>: {int(w.get(f'{ch}_stock') or 0):,} credits left (alert below {LOW_STOCK})</li>" for ch in fired)
        try:
            await _send_email([hq_inbox("admin")], "🔔 Mira: HQ credit stock is running low",
                              f"<div style='font-family:Arial,sans-serif;font-size:14px;color:#33333b;line-height:1.7'><p>{line}</p><ul>{rows}</ul>"
                              f"<p>Top up MSG91 (SMS) or set the Meta budget (WhatsApp), then record it in Super Admin → HQ Credit Wallet.</p></div>")
        except Exception:  # noqa: BLE001 — email is best-effort
            pass
    return fired


async def _msg91_balance() -> int | None:
    """Live prepaid SMS balance from MSG91 (route type 4 = transactional). None when not configured/unreachable."""
    import os
    import httpx
    key = os.environ.get("MSG91_AUTHKEY", "")
    if not key:
        return None
    try:
        async with httpx.AsyncClient(timeout=8.0) as c:
            r = await c.get("https://control.msg91.com/api/balance.php", params={"authkey": key, "type": 4})
        return int(r.text.strip())
    except Exception:  # noqa: BLE001
        return None


@router.post("/super-admin/credit-wallet/sync")
async def hq_wallet_sync(admin=Depends(require_super_admin)):
    """Pull HQ's real SMS stock from MSG91 (what you paid MSG91 for). WhatsApp is postpaid — Meta bills per message,
    so its stock is treated as unlimited and tracked as revenue vs. Meta cost."""
    bal = await _msg91_balance()
    if bal is None:
        raise HTTPException(502, "MSG91 not reachable — check MSG91_AUTHKEY")
    if bal == 0:
        raise HTTPException(409, "MSG91 reports 0 on the SMS route — your account uses the ₹ wallet, which MSG91 doesn't expose via API. "
                                 "Use 'Record MSG91 wallet' and enter the ₹ balance + price per SMS.")
    w = await _wallet()
    delta = bal - int(w.get("sms_stock") or 0)
    await _raw_db.hq_wallet.update_one({"id": WALLET_ID}, {"$set": {"sms_stock": bal, "sms_synced_at": _now(), "updated_at": _now()}})
    if delta:
        await _ledger("sms", delta, "msg91_sync", None, 0, admin.get("email"), f"MSG91 balance {bal}")
    return {"ok": True, "sms_stock": bal, "delta": delta}


async def _channel_margin(ch: str, w: dict, pr: dict) -> dict:
    """Margin so far = what tenants paid − (messages sold × HQ unit cost)."""
    sold = 0
    async for r in _raw_db.hq_wallet_ledger.find({"channel": ch, "kind": "tenant_purchase"}, {"_id": 0, "delta": 1}):
        sold += abs(int(r.get("delta") or 0))
    revenue, unit_cost = int(w.get(f"{ch}_revenue_paise") or 0), pr[f"{ch}_cost_paise"]
    return {"sold": sold, "revenue_paise": revenue, "cost_paise": sold * unit_cost, "margin_paise": revenue - sold * unit_cost, "unit_cost_paise": unit_cost}


async def _ledger_with_names(limit: int = 40) -> list[dict]:
    ledger = await _raw_db.hq_wallet_ledger.find({}, {"_id": 0}).sort("at", -1).to_list(limit)
    tids = list({r["tenant_id"] for r in ledger if r.get("tenant_id")})
    names = {t["id"]: t["name"] async for t in _raw_db.tenants.find({"id": {"$in": tids}}, {"_id": 0, "id": 1, "name": 1})} if tids else {}
    for r in ledger:
        r["tenant_name"] = names.get(r.get("tenant_id"), "")
    return ledger


class HqChannelIn(BaseModel):
    phone_number_id: str = Field(..., min_length=6, max_length=40)
    waba_id: str = Field(..., min_length=6, max_length=40)
    access_token: str = Field(..., min_length=20, max_length=600)


async def apply_hq_channel_override() -> bool:
    """DB-stored live HQ channel beats deployment Secrets (prod once shipped with Meta's test number). Called at boot + on save."""
    from services.wa_coexist import decrypt_token
    doc = await _raw_db.hq_settings.find_one({"id": "whatsapp_channel"}, {"_id": 0})
    if not doc:
        return False
    os.environ["WHATSAPP_PHONE_NUMBER_ID"] = doc["phone_number_id"]
    os.environ["WHATSAPP_BUSINESS_ACCOUNT_ID"] = doc["waba_id"]
    os.environ["WHATSAPP_ACCESS_TOKEN"] = decrypt_token(doc["token_enc"])
    return True


@router.put("/super-admin/whatsapp-channel")
async def hq_whatsapp_channel_set(body: HqChannelIn, admin=Depends(require_super_admin)):
    """Point HQ sending at the live Meta number without touching deployment Secrets; verified against Meta before saving."""
    import httpx
    from services.wa_coexist import encrypt_token
    from services.whatsapp_cloud import GRAPH_API_VERSION
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(f"https://graph.facebook.com/{GRAPH_API_VERSION}/{body.phone_number_id}",
                             params={"fields": "display_phone_number,verified_name,code_verification_status"}, headers={"Authorization": f"Bearer {body.access_token}"})
    if r.is_error:
        raise HTTPException(400, f"Meta rejected these credentials: {(r.json().get('error') or {}).get('message', r.text[:120])}")
    info = r.json()
    await _raw_db.hq_settings.update_one({"id": "whatsapp_channel"}, {"$set": {"id": "whatsapp_channel", "phone_number_id": body.phone_number_id, "waba_id": body.waba_id,
                                                                            "token_enc": encrypt_token(body.access_token), "display": info.get("display_phone_number"),
                                                                            "verified_name": info.get("verified_name"), "updated_at": datetime.now(timezone.utc).isoformat(),
                                                                            "updated_by": admin.get("email")}}, upsert=True)
    await apply_hq_channel_override()
    from services import whatsapp_official as official
    official._tpl_status_cache.clear()
    return {"ok": True, "display_phone_number": info.get("display_phone_number"), "verified_name": info.get("verified_name")}


@router.delete("/super-admin/whatsapp-channel")
async def hq_whatsapp_channel_clear(admin=Depends(require_super_admin)):
    await _raw_db.hq_settings.delete_one({"id": "whatsapp_channel"})
    return {"ok": True, "note": "Override removed — restart/redeploy to fall back to deployment Secrets"}


@router.get("/super-admin/whatsapp-health")
async def hq_whatsapp_health(admin=Depends(require_super_admin)):
    """One-tap check of the HQ Meta channel: token validity, phone-number status/quality, WABA reach, template count."""
    import httpx
    from services.whatsapp_cloud import GRAPH_API_VERSION, channel_for
    ch = await channel_for(None)
    ovr = await _raw_db.hq_settings.find_one({"id": "whatsapp_channel"}, {"_id": 0, "display": 1, "updated_at": 1})
    out = {"phone_number_id": ch.get("phone_number_id"), "graph_version": GRAPH_API_VERSION, "checks": [], "ok": False,
           "source": f"HQ override ({ovr.get('display')}, set {ovr.get('updated_at', '')[:10]})" if ovr else "deployment Secrets / .env"}
    if not ch.get("token") or not ch.get("phone_number_id"):
        out["checks"].append({"name": "Config", "ok": False, "detail": "WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID missing in this environment"})
        return out
    hdr = {"Authorization": f"Bearer {ch['token']}"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        for name, path, fields in (
            ("Access token", "/debug_token", None),
            ("Phone number", f"/{ch['phone_number_id']}", "display_phone_number,verified_name,quality_rating,code_verification_status,messaging_limit_tier,platform_type"),
            ("Business account", f"/{os.environ.get('WHATSAPP_BUSINESS_ACCOUNT_ID', '')}", "name,account_review_status,message_template_namespace"),
            ("Templates", f"/{os.environ.get('WHATSAPP_BUSINESS_ACCOUNT_ID', '')}/message_templates", "name,status"),
        ):
            params = {"fields": fields} if fields else {"input_token": ch["token"]}
            if name == "Templates":
                params["limit"] = 100
            try:
                r = await client.get(f"https://graph.facebook.com/{GRAPH_API_VERSION}{path}", headers=hdr, params=params)
                body = r.json()
            except Exception as e:  # noqa: BLE001
                out["checks"].append({"name": name, "ok": False, "detail": f"network: {e}"[:200]})
                continue
            if r.is_error:
                err = body.get("error") or {}
                out["checks"].append({"name": name, "ok": False, "detail": f"#{err.get('code')} {err.get('message', '')}"[:220]})
                continue
            out["checks"].append({"name": name, "ok": not (name == "Phone number" and "TEST NUMBER" in _health_detail(name, body)), "detail": _health_detail(name, body)})
    out["ok"] = all(c["ok"] for c in out["checks"])
    out["checked_at"] = datetime.now(timezone.utc).isoformat()
    return out


def _health_detail(name: str, body: dict) -> str:
    if name == "Access token":
        d = body.get("data") or {}
        exp = d.get("expires_at")
        when = "never expires (system user)" if not exp else datetime.fromtimestamp(exp, tz=timezone.utc).strftime("expires %d %b %Y")
        return f"valid · {when} · scopes: {', '.join(d.get('scopes') or [])[:120]}"
    if name == "Phone number":
        test_no = (body.get("verified_name") or "").lower() == "test number" or str(body.get("display_phone_number", "")).startswith("+1 555")
        warn = " ⚠️ META TEST NUMBER — only 5 pre-approved recipients can receive messages (#131030). Set the live WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_BUSINESS_ACCOUNT_ID / WHATSAPP_ACCESS_TOKEN in Publish → Secrets and redeploy." if test_no else ""
        return f"{body.get('display_phone_number')} · {body.get('verified_name')} · quality {body.get('quality_rating')} · tier {body.get('messaging_limit_tier')} · {body.get('code_verification_status')}{warn}"
    if name == "Business account":
        return f"{body.get('name')} · review {body.get('account_review_status')}"
    rows = body.get("data") or []
    approved = sum(1 for t in rows if t.get("status") == "APPROVED")
    return f"{approved} approved / {len(rows)} total" + (f" · pending: {', '.join(t['name'] for t in rows if t.get('status') == 'PENDING')[:120]}" if any(t.get('status') == 'PENDING' for t in rows) else "")


@router.get("/super-admin/credit-wallet")
async def hq_wallet_view(admin=Depends(require_super_admin)):
    w = await _wallet()
    w["whatsapp_postpaid"] = True  # Meta bills per message to the card on WABA 1627056435755219
    w["msg91_balance"] = await _msg91_balance()
    low = {ch: int(w.get(f"{ch}_stock") or 0) < LOW_STOCK for ch in FIELD}
    pr = await pack_pricing()
    margin = {ch: await _channel_margin(ch, w, pr) for ch in FIELD}
    return {**w, "ledger": await _ledger_with_names(), "low_stock": low, "low_threshold": LOW_STOCK, "mira_note": low_stock_line(w), "margin": margin}


class TopupIn(BaseModel):
    channel: str = Field(..., pattern="^(sms|whatsapp)$")
    points: int = Field(..., ge=0, le=1_000_000)
    cost_paise: int = Field(0, ge=0)
    note: str = Field("", max_length=200)
    mode: str = Field("add", pattern="^(add|set)$")  # set = "this is my current MSG91/Meta stock"


@router.post("/super-admin/credit-wallet/topup")
async def hq_wallet_topup(body: TopupIn, admin=Depends(require_super_admin)):
    """HQ bought stock from Meta / MSG91 (add), or records the current balance (set) — e.g. MSG91 ₹ wallet ÷ price per SMS."""
    w = await _wallet()
    cur = int(w.get(f"{body.channel}_stock") or 0)
    delta = body.points if body.mode == "add" else body.points - cur
    await _raw_db.hq_wallet.update_one({"id": WALLET_ID}, {"$inc": {f"{body.channel}_stock": delta, f"{body.channel}_cost_paise": body.cost_paise},
                                                          "$set": {"updated_at": _now()}})
    if delta:
        await _ledger(body.channel, delta, "hq_topup" if body.mode == "add" else "hq_set_balance", None, body.cost_paise, admin.get("email"), body.note)
    await check_low_stock()
    return {"ok": True, **(await _wallet())}


class GrantIn(BaseModel):
    channel: str = Field(..., pattern="^(sms|whatsapp)$")
    points: int = Field(..., ge=1, le=100_000)
    note: str = Field("", max_length=200)


@router.post("/super-admin/tenants/{tid}/grant-credits")
async def hq_grant_credits(tid: str, body: GrantIn, admin=Depends(require_super_admin)):
    """Manually hand credits from HQ stock to a tenant (free grant / offline payment)."""
    t = await _raw_db.tenants.find_one({"id": tid}, {"_id": 0, "id": 1, "name": 1})
    if not t:
        raise HTTPException(404, "Tenant not found")
    w = await _wallet()
    if w.get(f"{body.channel}_stock", 0) < body.points:
        raise HTTPException(409, f"HQ has only {w.get(f'{body.channel}_stock', 0)} {body.channel} credits in stock — top up first")
    await _raw_db.tenants.update_one({"id": tid}, {"$inc": {FIELD[body.channel]: body.points}})  # feature stays as Super Admin set it
    await _raw_db.hq_wallet.update_one({"id": WALLET_ID}, {"$inc": {f"{body.channel}_stock": -body.points}, "$set": {"updated_at": _now()}})
    await _raw_db.sms_credit_log.insert_one({"id": str(uuid.uuid4()), "tenant_id": tid, "points": body.points, "source": "hq_grant",
                                             "channel": body.channel, "credited_by": admin.get("email"), "at": _now(), "note": body.note})
    await _ledger(body.channel, -body.points, "hq_grant", tid, 0, admin.get("email"), body.note)
    await check_low_stock()
    return {"ok": True, **(await _wallet())}


LEGIT_SOURCES = ("razorpay", "hq_grant", "purchase", "pack_purchase")


async def _legit_credits(tenant_id: str) -> dict:
    """Credits HQ actually sold/granted, per channel. Ledger and credit-log describe the same grants → max, never sum."""
    from_ledger, from_log = {"sms": 0, "whatsapp": 0}, {"sms": 0, "whatsapp": 0}
    async for l in _raw_db.hq_wallet_ledger.find({"tenant_id": tenant_id, "kind": {"$in": ["tenant_purchase", "hq_grant"]}}, {"_id": 0, "channel": 1, "delta": 1}):
        from_ledger[l["channel"]] = from_ledger.get(l["channel"], 0) + abs(int(l.get("delta") or 0))
    async for l in _raw_db.sms_credit_log.find({"tenant_id": tenant_id, "source": {"$in": list(LEGIT_SOURCES)}, "points": {"$gt": 0}}, {"_id": 0, "channel": 1, "points": 1}):
        ch = l.get("channel") or "sms"
        from_log[ch] = from_log.get(ch, 0) + int(l.get("points") or 0)
    return {ch: max(from_ledger.get(ch, 0), from_log.get(ch, 0)) for ch in FIELD}


def _audit_row(t: dict, legit: dict) -> dict:
    sms, wa = int(t.get("sms_points") or 0), int(t.get("wa_points") or 0)
    dummy = {"sms": sms > 0 and legit["sms"] == 0, "whatsapp": wa > 0 and legit["whatsapp"] == 0}
    return {"tenant_id": t["id"], "name": t.get("name"), "slug": t.get("slug"), "sms_points": sms, "wa_points": wa,
            "legit_sms": legit["sms"], "legit_whatsapp": legit["whatsapp"], "dummy": dummy, "has_dummy": dummy["sms"] or dummy["whatsapp"]}


async def _audit_rows() -> list[dict]:
    """Per tenant with any credits: current balance vs. what HQ sold/granted. No legit source + points > 0 ⇒ dummy (dev/test) credits."""
    rows = []
    async for t in _raw_db.tenants.find({"$or": [{"sms_points": {"$gt": 0}}, {"wa_points": {"$gt": 0}}]},
                                        {"_id": 0, "id": 1, "name": 1, "slug": 1, "sms_points": 1, "wa_points": 1}).sort("created_at", 1):
        rows.append(_audit_row(t, await _legit_credits(t["id"])))
    return rows


@router.get("/super-admin/credit-wallet/audit")
async def hq_credit_audit(admin=Depends(require_super_admin)):
    rows = await _audit_rows()
    return {"tenants": rows, "dummy_count": sum(1 for r in rows if r["has_dummy"])}


@router.post("/super-admin/credit-wallet/audit/remove-dummy")
async def hq_credit_remove_dummy(admin=Depends(require_super_admin)):
    """Zero out credits that were never sold or granted from HQ stock (old dev/test seeds). Legit balances are untouched."""
    removed = []
    for r in await _audit_rows():
        unset = {}
        if r["dummy"]["sms"]:
            unset["sms_points"] = 0
        if r["dummy"]["whatsapp"]:
            unset["wa_points"] = 0
        if not unset:
            continue
        await _raw_db.tenants.update_one({"id": r["tenant_id"]}, {"$set": unset})
        for ch, field in FIELD.items():
            if field in unset:
                await _raw_db.sms_credit_log.insert_one({"id": str(uuid.uuid4()), "tenant_id": r["tenant_id"], "channel": ch,
                                                         "points": -(r["sms_points"] if ch == "sms" else r["wa_points"]), "source": "dummy_reset",
                                                         "credited_by": admin.get("email"), "at": _now(), "note": "never sold/granted from HQ stock"})
        removed.append({"name": r["name"], "sms_removed": r["sms_points"] if "sms_points" in unset else 0,
                        "wa_removed": r["wa_points"] if "wa_points" in unset else 0})
    return {"ok": True, "removed": removed}


# ---------------- Meta WhatsApp month-to-date usage & spend ----------------
_meta_cache: dict = {"at": 0.0, "data": None}


def _sum_points(payload: dict, key: str, cat_key: str, count_keys: tuple) -> tuple[dict, float]:
    by_cat, cost = {}, 0.0
    for block in (payload.get(key) or {}).get("data", []):
        for p in block.get("data_points", []):
            cat = (p.get(cat_key) or "OTHER").upper()
            by_cat[cat] = by_cat.get(cat, 0) + sum(int(p.get(k) or 0) for k in count_keys)
            cost += float(p.get("cost") or 0)
    return by_cat, round(cost, 2)


async def _meta_fetch(tok: str, waba: str, pid: str | None, start: int, end: int) -> tuple[dict, dict, dict]:
    import httpx
    G, H = "https://graph.facebook.com/v22.0", {"Authorization": f"Bearer {tok}"}
    async with httpx.AsyncClient(timeout=20) as http:
        pr = (await http.get(f"{G}/{waba}", headers=H, params={"fields": f"pricing_analytics.start({start}).end({end}).granularity(DAILY).dimensions(PRICING_CATEGORY)"})).json()
        cv = (await http.get(f"{G}/{waba}", headers=H, params={"fields": f"conversation_analytics.start({start}).end({end}).granularity(DAILY).dimensions(CONVERSATION_CATEGORY)"})).json()
        ph = (await http.get(f"{G}/{pid}", headers=H, params={"fields": "display_phone_number,quality_rating,messaging_limit_tier,status"})).json() if pid else {}
    return pr, cv, ph


def _meta_summary(pr: dict, cv: dict, ph: dict) -> dict:
    msgs, cost = _sum_points(pr, "pricing_analytics", "pricing_category", ("volume",))
    convs, cost2 = _sum_points(cv, "conversation_analytics", "conversation_category", ("conversation",))
    return {"messages_by_category": msgs, "messages_total": sum(msgs.values()), "conversations_by_category": convs,
            "conversations_total": sum(convs.values()), "cost_inr": cost or cost2,
            "free_service": convs.get("SERVICE", 0), "phone": {k: ph.get(k) for k in ("display_phone_number", "quality_rating", "messaging_limit_tier", "status")},
            "note": "Service (guest-initiated) conversations are free; Meta bills marketing ₹0.78 / utility ₹0.115 per message to the card on file."}


@router.get("/super-admin/meta-usage")
async def hq_meta_usage(refresh: bool = False, admin=Depends(require_super_admin)):
    """Month-to-date WhatsApp messages + Meta's own ₹ cost (pricing_analytics) for the HQ number. Cached 10 min."""
    import time
    if _meta_cache["data"] and not refresh and time.time() - _meta_cache["at"] < 600:
        return _meta_cache["data"]
    tok, waba, pid = os.environ.get("WHATSAPP_ACCESS_TOKEN"), os.environ.get("WHATSAPP_BUSINESS_ACCOUNT_ID"), os.environ.get("WHATSAPP_PHONE_NUMBER_ID")
    if not (tok and waba):
        return {"available": False, "reason": "WhatsApp Cloud API not configured"}
    now = datetime.now(timezone.utc)
    start = int(now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).timestamp())
    try:
        pr, cv, ph = await _meta_fetch(tok, waba, pid, start, int(now.timestamp()))
    except Exception as e:  # noqa: BLE001
        return {"available": False, "reason": f"Meta unreachable: {str(e)[:120]}"}
    if "error" in pr and "error" in cv:
        return {"available": False, "reason": pr["error"].get("message", "Meta analytics denied")[:160]}
    out = {"available": True, "month": now.strftime("%B %Y"), "fetched_at": now.isoformat(), "currency": "INR", **_meta_summary(pr, cv, ph)}
    _meta_cache.update(at=time.time(), data=out)
    return out


_DLT_STATE = {"10": "DLT verified", "0": "not sent to DLT", "5": "DLT rejected", "1": "pending at DLT"}


def _sms_template_row(kind: str, tpl_id: str, versions: list) -> dict:
    """Pick the best version: a DLT-verified active one wins; else surface the newest and why it fails."""
    verified = [v for v in versions if str(v.get("dlt_verified")) == "10" and str(v.get("active_status")) == "1"]
    v = verified[0] if verified else (versions[-1] if versions else {})
    ok = bool(verified)
    reason = (v.get("dlt_reason") or v.get("reject_reason") or "").strip()
    fix = ""
    if not ok and versions:
        if reason.lower().startswith("template id not found"):
            fix = (f"DLT ID {v.get('DLT_ID') or '—'} is not registered/approved on your operator DLT portal (Jio TrueConnect / Vi / Airtel). "
                   "Open the DLT portal → Templates → check 'miracurl_billing_receipt' is APPROVED and copy its exact Template ID, then on MSG91 → "
                   "SMS → Templates → this template → 'Add version' with that DLT ID and the identical text.")
        elif str(v.get("dlt_verified")) == "0":
            fix = "No DLT ID attached on MSG91 — add a version with the approved DLT Template ID."
        else:
            fix = f"MSG91 says: {reason or 'pending DLT verification'} — wait for approval or re-submit."
    return {"kind": kind, "template_id": tpl_id, "name": v.get("template_name") or kind, "ok": ok,
            "version": v.get("version"), "dlt_id": v.get("DLT_ID") or "", "dlt_state": _DLT_STATE.get(str(v.get("dlt_verified")), str(v.get("dlt_verified"))),
            "active": str(v.get("active_status")) == "1", "reason": reason, "fix": fix, "text": v.get("template_data", "")}


@router.get("/super-admin/sms-templates-health")
async def hq_sms_templates_health(admin=Depends(require_super_admin)):
    """Every MSG91 DLT template used by the platform: verified & active, or the exact reason it won't deliver."""
    import httpx
    from sms_service import MSG91_TEMPLATES, msg91_template_id, receipt_sms_kind
    key = os.environ.get("MSG91_AUTHKEY", "")
    if not key:
        raise HTTPException(400, "MSG91_AUTHKEY missing in this environment")
    rows = []
    async with httpx.AsyncClient(timeout=20.0) as client:
        for kind in MSG91_TEMPLATES:
            tpl_id = msg91_template_id(kind)
            if not tpl_id:
                rows.append({"kind": kind, "template_id": "", "name": kind, "ok": False, "missing": True, "dlt_state": "not registered yet",
                             "reason": "", "fix": "Create this template on DLT + MSG91, then paste the MSG91 Template ID here.",
                             "text": _TEMPLATE_HINTS.get(kind, "")})
                continue
            try:
                r = await client.get("https://control.msg91.com/api/v5/sms/getTemplateVersions",
                                     params={"template_id": tpl_id}, headers={"authkey": key})
                data = r.json().get("data") or []
                rows.append(_sms_template_row(kind, tpl_id, data if isinstance(data, list) else []))
            except Exception as e:  # noqa: BLE001 — one bad template must not hide the others
                rows.append({"kind": kind, "template_id": tpl_id, "name": kind, "ok": False, "reason": str(e), "fix": "MSG91 API unreachable — retry", "dlt_state": "?"})
    receipt_kind = receipt_sms_kind()
    for r in rows:
        if r["kind"] in ("billing", "billing_v2"):
            r["in_use"] = r["kind"] == receipt_kind
    return {"ok": all(r["ok"] for r in rows if not (r.get("missing") and r["kind"] == "billing_v2")),
            "sender": os.environ.get("MSG91_SENDER_ID", ""), "templates": rows, "checked_at": datetime.now(timezone.utc).isoformat()}


_TEMPLATE_HINTS = {
    "billing_v2": "Thank you ##var1##! Your receipt ##var2## for Rs ##var3## is ready. You earned ##var4## loyalty points. - ##var5##",
}


class SmsTemplateIdIn(BaseModel):
    kind: str = Field(..., max_length=40)
    template_id: str = Field("", max_length=40)  # blank = clear the HQ override


@router.put("/super-admin/sms-template-id")
async def hq_set_sms_template_id(body: SmsTemplateIdIn, admin=Depends(require_super_admin)):
    """Register/replace the MSG91 template ID for a kind without touching deployment Secrets."""
    from sms_service import MSG91_TEMPLATES, apply_hq_sms_template_ids, receipt_sms_kind
    if body.kind not in MSG91_TEMPLATES:
        raise HTTPException(400, f"Unknown SMS kind '{body.kind}'")
    tpl = body.template_id.strip()
    if tpl and not re.fullmatch(r"[a-f0-9]{24}", tpl):
        raise HTTPException(400, "MSG91 Template IDs are 24 hex characters (copy it from MSG91 → SMS → Templates)")
    op = {"$set": {f"ids.{body.kind}": tpl}} if tpl else {"$unset": {f"ids.{body.kind}": ""}}
    await _raw_db.hq_settings.update_one({"id": "sms_templates"}, {**op, "$set": {**op.get("$set", {}), "updated_at": datetime.now(timezone.utc).isoformat(), "updated_by": admin.get("email")}}, upsert=True)
    if not tpl:
        os.environ.pop(MSG91_TEMPLATES[body.kind][0], None)
    await apply_hq_sms_template_ids()
    return {"ok": True, "kind": body.kind, "template_id": tpl, "receipt_kind_in_use": receipt_sms_kind()}
