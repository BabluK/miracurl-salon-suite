"""SMS delivery — MSG91 (Flow API, DLT) only; gracefully skips when not configured. (Twilio retired 20 Sep 2026.)

Provider selection: SMS_PROVIDER=msg91 activates MSG91 once MSG91_AUTHKEY,
MSG91_SENDER_ID and MSG91_FLOW_ID are all set (Flow template must contain a
##message## variable approved on DLT).
"""
import logging
import os
import uuid
from datetime import datetime, timezone

log = logging.getLogger("sms")
MSG91_FLOW_URL = "https://control.msg91.com/api/v5/flow"


# DLT-approved MSG91 flows (sender MIRACU). Text is fixed on DLT; only ##varN## slots are filled.
# kind → (env override key, default MSG91 template id, variable names in order)
MSG91_TEMPLATES: dict[str, tuple[str, str, tuple[str, ...]]] = {
    "booking":      ("MSG91_TPL_BOOKING",      "6aad2c6df24ce78592014d12", ("name", "when", "service", "phone")),
    "reminder":     ("MSG91_TPL_REMINDER",     "6aad4b01b3d5bd0e3603bbb2", ("name", "when", "service", "phone")),
    "cancellation": ("MSG91_TPL_CANCELLED",    "6aad4823152316d3b30f5c27", ("name", "when", "phone")),
    "rescheduled":  ("MSG91_TPL_RESCHEDULED",  "6aad49b58393cbe7b10bfff2", ("name", "when", "service", "phone")),
    "review":       ("MSG91_TPL_REVIEW",       "6aad488c9d46d5d9310ea663", ("name", "url")),
    "birthday":     ("MSG91_TPL_BIRTHDAY",     "6aad49f494e67f01f40b14a2", ("name", "offer")),
    "festival":     ("MSG91_TPL_FESTIVAL",     "6aad491cd077278ca60eae23", ("name", "festival", "offer")),
    "special":      ("MSG91_TPL_SPECIAL",      "6aad4a4adf4726e0d1013f14", ("name", "offer", "valid_till")),
    "billing":      ("MSG91_TPL_BILLING",      "6aaed91266b259e2920c73d3", ("name", "invoice", "amount", "salon", "points")),  # legacy receipt (signs off "Miracurl AI Salon Suite")
    # v2 receipt (user's DLT template 1777178990962910600, salon-branded, no software name):
    # "Hi ##var1##, your payment of Rs. ##var2## has been received by ##var3##. Invoice No: ##var4##. Thank you."
    "billing_v2":   ("MSG91_TPL_BILLING_V2",   "", ("name", "amount", "salon", "invoice")),
    "otp":          ("MSG91_TPL_OTP",          "6aae14594f99d7fba7049633", ("var1",)),  # miracurl_otp (DLT verified): "…verification code is ##var1##…"
}


def msg91_template_id(kind: str) -> str:
    env_key, default, _ = MSG91_TEMPLATES.get(kind) or ("", "", ())
    return os.environ.get(env_key, default) if env_key else ""


_V2_READY = {"at": 0.0, "ok": False, "tpl": ""}


async def msg91_template_verified(tpl_id: str) -> bool:
    """True when MSG91 reports an ACTIVE, DLT-verified version for this template (getTemplateVersions)."""
    import httpx
    async with httpx.AsyncClient(timeout=12) as http:
        r = await http.get("https://control.msg91.com/api/v5/sms/getTemplateVersions",
                           params={"template_id": tpl_id}, headers={"authkey": os.environ.get("MSG91_AUTHKEY", "")})
    versions = (r.json().get("data") or []) if r.status_code == 200 else []
    return any(str(v.get("dlt_verified")) == "10" and str(v.get("active_status")) == "1" for v in versions)


async def receipt_sms_kind() -> str:
    """Salon-branded v2 receipt once its MSG91 template is DLT-verified (auto-switch, checked every 10 min); legacy until then."""
    import time
    tpl = msg91_template_id("billing_v2")
    if not tpl:
        return "billing"
    now = time.time()
    if _V2_READY["tpl"] != tpl or now - _V2_READY["at"] > 600:
        try:
            ok = await msg91_template_verified(tpl)
        except Exception as e:  # noqa: BLE001 — keep last known state on network hiccups
            log.warning("msg91 v2 template check failed: %s", e)
            ok = _V2_READY["ok"] if _V2_READY["tpl"] == tpl else False
        _V2_READY.update({"at": now, "ok": ok, "tpl": tpl})
    return "billing_v2" if _V2_READY["ok"] else "billing"


async def apply_hq_sms_template_ids() -> int:
    """HQ-entered MSG91 template IDs (hq_settings.sms_templates) beat .env — no redeploy needed. Boot + on save."""
    from database import _raw_db
    doc = await _raw_db.hq_settings.find_one({"id": "sms_templates"}, {"_id": 0, "ids": 1})
    ids = (doc or {}).get("ids") or {}
    for kind, tpl in ids.items():
        env_key = (MSG91_TEMPLATES.get(kind) or ("",))[0]
        if env_key and tpl:
            os.environ[env_key] = tpl
    return len(ids)


def _msg91_ready() -> bool:
    # Either the generic ##message## flow or the per-kind DLT templates make MSG91 usable.
    return all(os.environ.get(k) for k in ("MSG91_AUTHKEY", "MSG91_SENDER_ID")) and bool(
        os.environ.get("MSG91_FLOW_ID") or MSG91_TEMPLATES)


def _provider() -> str:
    # MSG91 (DLT, sender MIRACU) is the only SMS route. Twilio was retired on 20 Sep 2026 (account suspended) — never used.
    return "msg91" if _msg91_ready() else ""


def sms_configured() -> bool:
    return bool(_provider())


def _normalize_in(phone: str) -> str:
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    if len(digits) == 10:
        return f"+91{digits}"
    if digits.startswith("91") and len(digits) == 12:
        return f"+{digits}"
    if (phone or "").startswith("+"):
        return phone
    return f"+{digits}" if digits else ""


async def _msg91_post(payload: dict) -> dict:
    import httpx
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            resp = await http.post(MSG91_FLOW_URL, json=payload,
                                   headers={"authkey": os.environ["MSG91_AUTHKEY"], "accept": "application/json"})
        data = resp.json()
        if resp.status_code == 200 and data.get("type") == "success":
            return {"sent": True, "sid": data.get("message", "")}
        log.error("msg91 send failed: %s %s", resp.status_code, str(data)[:300])
        return {"sent": False, "error": str(data.get("message") or data)[:200]}
    except Exception as e:
        log.error("msg91 send failed: %s", e)
        return {"sent": False, "error": str(e)[:200]}


def _fit_var(v: str, limit: int = 30) -> str:
    """DLT allows ≤30 chars per variable: keep the first item of a comma list and say how many more."""
    if len(v) <= limit:
        return v
    parts = [x.strip() for x in v.split(",") if x.strip()]
    if len(parts) > 1:
        cand = f"{parts[0][:limit - 4]} +{len(parts) - 1}"
        if len(cand) <= limit:
            return cand
    return v[:limit - 1] + "…"


async def send_sms_template(to: str, kind: str, values: list[str]) -> dict:
    """DLT-template SMS via MSG91 Flow API: fills ##var1##..##varN## in order. Values are trimmed to DLT's 30-char slot limit."""
    tpl = msg91_template_id(kind)
    if not tpl:
        return {"sent": False, "error": f"no_dlt_template:{kind}"}
    to = _normalize_in(to)
    if not to:
        return {"sent": False, "error": "invalid_phone"}
    names = MSG91_TEMPLATES[kind][2]
    recipient = {"mobiles": to.lstrip("+")}
    has_url = False
    for i, name in enumerate(names):
        v = str(values[i] if i < len(values) else "-").strip()
        if name == "url":
            has_url = True  # MSG91 shortens links (DLT caps other variables at 30 chars)
        else:
            v = _fit_var(v)
        recipient[f"var{i + 1}"] = v or "-"
    res = await _msg91_post({"template_id": tpl, "short_url": "1" if has_url else "0",
                             "sender": os.environ["MSG91_SENDER_ID"], "recipients": [recipient]})
    res["provider"] = "msg91"
    res["template"] = kind
    return res


async def _send_msg91(to: str, body: str) -> dict:
    if not os.environ.get("MSG91_FLOW_ID"):
        return {"sent": False, "error": "msg91_generic_flow_missing"}
    mobile = to.lstrip("+")
    payload = {
        "flow_id": os.environ["MSG91_FLOW_ID"],
        "sender": os.environ["MSG91_SENDER_ID"],
        "mobiles": mobile,
        "message": body,
    }
    return await _msg91_post(payload)


async def send_sms(to_phone: str, body: str) -> dict:
    provider = _provider()
    if not provider:
        return {"sent": False, "error": "not_configured"}
    to = _normalize_in(to_phone)
    if not to:
        return {"sent": False, "error": "invalid_phone"}
    return await _send_msg91(to, body)


async def send_tenant_sms(tenant_id: str, to_phone: str, body: str, kind: str = "general", wa: dict | None = None,
                          sms_vars: list[str] | None = None) -> dict:
    """Point-metered customer SMS: burns 1 sms_point from the tenant, refunds on failure.
    Every attempt is recorded in sms_log for the HQ delivery log."""
    from database import _raw_db

    async def _log(res: dict) -> None:
        try:
            await _raw_db.sms_log.insert_one({
                "id": str(uuid.uuid4()), "tenant_id": tenant_id, "phone": to_phone,
                "kind": kind, "preview": body[:90], "sent": bool(res.get("sent")), "channel": res.get("channel", "sms"),
                "error": res.get("error"), "sid": res.get("sid"),
                "created_at": datetime.now(timezone.utc).isoformat()})
        except Exception as e:  # noqa: BLE001 — logging must never break sending
            log.warning("sms_log write failed: %s", e)

    # Official Miracurl WhatsApp (Meta template) first when the caller supplied template params; SMS is the fallback.
    if wa and kind != "staff_transfer":
        try:
            from services import whatsapp_official as official
            from services.tenant_features import feature_on
            t_doc = await _raw_db.tenants.find_one({"id": tenant_id}, {"_id": 0})
            if t_doc and await feature_on(tenant_id, "whatsapp") and int(t_doc.get("wa_points") or 0) >= 1:
                r = await official.send(wa["kind"], t_doc, to_phone, wa["params"], image_url=wa.get("image_url"))
                res = {"sent": True, "channel": "whatsapp", "sid": r.get("message_id")}
                await _log(res)
                return res
        except Exception as e:  # noqa: BLE001 — fall back to SMS
            log.warning("official whatsapp send failed, falling back to SMS: %s", e)

    if not sms_configured():
        res = {"sent": False, "error": "not_configured"}
        await _log(res)
        return res
    from services.tenant_features import feature_on
    if not await feature_on(tenant_id, "sms"):
        res = {"sent": False, "error": "sms_disabled"}
        await _log(res)
        return res
    r = await _raw_db.tenants.update_one(
        {"id": tenant_id, "sms_points": {"$gte": 1}}, {"$inc": {"sms_points": -1}})
    if r.modified_count == 0:
        log.info("sms skipped (no sms_points) tenant=%s", tenant_id)
        res = {"sent": False, "error": "no_sms_points"}
        await _log(res)
        return res
    # MSG91 (DLT): use the approved template for this kind when the caller supplied its variables.
    if _provider() == "msg91" and sms_vars is not None and msg91_template_id(kind):
        res = await send_sms_template(to_phone, kind, sms_vars)
    elif _provider() == "msg91" and not os.environ.get("MSG91_FLOW_ID"):
        res = {"sent": False, "error": f"no DLT template for '{kind}' SMS — add an approved MSG91 template for this kind"}
    else:
        res = await send_sms(to_phone, body)
    if not res.get("sent"):
        await _raw_db.tenants.update_one({"id": tenant_id}, {"$inc": {"sms_points": 1}})
    fresh = await _raw_db.tenants.find_one({"id": tenant_id}, {"_id": 0, "sms_points": 1})
    res["points_left"] = int((fresh or {}).get("sms_points") or 0)
    await _log(res)
    return res
