"""HQ per-tenant feature switches (SMS / WhatsApp / Campaign), owner support-access consent,
and Brand Model campaign onboarding (invite → agreement → setup call → HQ go-live)."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import _raw_db, db
from security import current_tenant, log_audit, require_super_admin, require_tenant_admin
from services.rewards_core import _tenant_eligible, _plan_matches, campaign_id_for, get_campaign, get_campaign_for
from services.tenant_features import FEATURE_KEYS, features_of, support_access_on
from services.tenant_notices import notify_tenant

router = APIRouter()
_now = lambda: datetime.now(timezone.utc).isoformat()  # noqa: E731
ONBOARDING_STEPS = ("invited", "agreed", "call_scheduled", "call_done", "live")


async def _tenant(tid: str) -> dict:
    t = await _raw_db.tenants.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tenant not found")
    return t


async def get_onboarding(tenant_id: str, campaign_id: str) -> dict:
    doc = await _raw_db.rewards_onboarding.find_one({"tenant_id": tenant_id, "campaign_id": campaign_id}, {"_id": 0})
    return doc or {"tenant_id": tenant_id, "campaign_id": campaign_id, "status": "none", "call_at": None, "notes": "", "live": False}


async def set_onboarding(tenant_id: str, campaign_id: str, patch: dict) -> dict:
    await _raw_db.rewards_onboarding.update_one(
        {"tenant_id": tenant_id, "campaign_id": campaign_id},
        {"$set": {**patch, "updated_at": _now()}, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": _now()}}, upsert=True)
    return await get_onboarding(tenant_id, campaign_id)


async def backfill_onboarding() -> None:
    """One-time: salons that signed before the go-live gate existed stay live (no disruption)."""
    # Stale "🎨 A guest picked …" bell notices (feature removed 12 Sep — they opened an empty POS): purge everywhere.
    await _raw_db.tenant_notices.delete_many({"kind": "color_pick"})
    async for a in _raw_db.rewards_agreements.find({}, {"_id": 0, "tenant_id": 1, "campaign_id": 1}):
        if not await _raw_db.rewards_onboarding.find_one({"tenant_id": a["tenant_id"], "campaign_id": a["campaign_id"]}, {"_id": 1}):
            await set_onboarding(a["tenant_id"], a["campaign_id"], {"status": "live", "live": True, "live_at": _now(), "live_by": "backfill"})


async def campaign_live_ok(tenant_id: str, c: dict) -> bool:
    """Casting page / joins / QR poster open only after the signed agreement AND HQ go-live."""
    from routes.campaign_agreement import agreement_ok
    if not await agreement_ok(tenant_id, c):
        return False
    return bool((await get_onboarding(tenant_id, c["id"])).get("live"))


async def _owner_email(t: dict) -> Optional[str]:
    from routes.rewards_settlements import _real_email
    return await _real_email(t)


async def invite_tenant_to_campaign(t: dict, by: str) -> dict:
    """Campaign switched ON for this tenant → doc pack email + bell + dashboard popup reset."""
    from services.campaign_docs import email_doc_pack
    c = await get_campaign_for(t)
    emailed = False
    em = await _owner_email(t)
    if em:
        try:
            emailed = bool((await email_doc_pack(c, t, None, [em], hq_copy=False)).get("sent"))
        except Exception:  # noqa: BLE001 — invite is recorded even if email fails
            emailed = False
    await _raw_db.rewards_tenant_acks.delete_many({"tenant_id": t["id"]})
    await notify_tenant(t["id"], "campaign_invite", f"You're invited to {c['name']}",
                        "Read the guide, terms & agreement, then approve to start.", "/settings#campaign-agreement", f"campaign_invite:{c['id']}")
    ob = await set_onboarding(t["id"], c["id"], {"status": "invited", "invited_at": _now(), "invited_by": by, "invite_emailed": emailed, "live": False})
    return {"emailed": emailed, "to": em, "onboarding": ob}


async def _features_payload(t: dict) -> dict:
    c = await get_campaign_for(t)
    flags = c.get("tenant_flags") or {}
    from routes.campaign_agreement import agreement_state
    return {"tenant_id": t["id"], "name": t.get("name"), "slug": t.get("slug"), **features_of(t),
            "support_access": support_access_on(t),
            "campaign": {"on": _tenant_eligible(c, t), "manual": flags.get(t["id"]), "plan_ok": _plan_matches(t.get("plan") or "", c.get("eligible_plans") or []),
                         "enabled": bool(c.get("enabled")), "name": c["name"], "id": c["id"]},
            "agreement": await agreement_state(t, c), "onboarding": await get_onboarding(t["id"], c["id"])}


# ---------------- Super Admin ----------------
class FeaturesIn(BaseModel):
    sms: Optional[bool] = None
    whatsapp: Optional[bool] = None
    campaign: Optional[str] = Field(None, pattern=r"^(on|off|auto)$")


@router.get("/super-admin/tenants/{tid}/features")
async def sa_get_features(tid: str, user=Depends(require_super_admin)):
    return await _features_payload(await _tenant(tid))


@router.put("/super-admin/tenants/{tid}/features")
async def sa_put_features(tid: str, body: FeaturesIn, user=Depends(require_super_admin)):
    t = await _tenant(tid)
    sets = {f"features.{k}": bool(getattr(body, k)) for k in FEATURE_KEYS if getattr(body, k) is not None}
    if sets:
        await _raw_db.tenants.update_one({"id": tid}, {"$set": sets})
        await log_audit(tid, {**user, "name": "Miracurl HQ"}, "hq_features",
                        "Features updated by HQ: " + ", ".join(f"{k.split('.')[1]} {'ON' if v else 'OFF'}" for k, v in sets.items()))
    invite = None
    if body.campaign is not None:
        c_before = await get_campaign_for(t)
        was_on = _tenant_eligible(c_before, t)
        cid = campaign_id_for(t)
        op = {"$unset": {f"tenant_flags.{tid}": ""}} if body.campaign == "auto" else {"$set": {f"tenant_flags.{tid}": body.campaign == "on"}}
        await _raw_db.rewards_campaign.update_one({"id": cid}, {**op, "$setOnInsert": {"id": cid}}, upsert=True)
        now_on = _tenant_eligible(await get_campaign(cid), t)
        if now_on and not was_on:
            invite = await invite_tenant_to_campaign(t, user.get("email", "hq"))
        elif not now_on and was_on:
            await set_onboarding(tid, cid, {"status": "off", "live": False})
    return {**(await _features_payload(await _tenant(tid))), "invite": invite}


class OnboardingIn(BaseModel):
    action: str = Field(..., pattern=r"^(schedule|call_done|go_live|pause|resend_invite)$")
    call_at: Optional[str] = Field(None, max_length=40)
    notes: Optional[str] = Field(None, max_length=600)


@router.put("/super-admin/rewards-campaign/onboarding/{tid}")
async def sa_onboarding(tid: str, body: OnboardingIn, user=Depends(require_super_admin)):
    t = await _tenant(tid)
    c = await get_campaign_for(t)
    from routes.campaign_agreement import agreement_ok
    agreed = await agreement_ok(t["id"], c)
    patch: dict = {"notes": body.notes} if body.notes is not None else {}
    em = await _owner_email(t)
    from email_service import _send_email
    if body.action == "resend_invite":
        return {"ok": True, **(await invite_tenant_to_campaign(t, user.get("email", "hq")))}
    if body.action == "schedule":
        if not body.call_at:
            raise HTTPException(400, "Pick the call date & time")
        patch.update({"status": "call_scheduled", "call_at": body.call_at, "scheduled_by": user.get("email")})
        await notify_tenant(t["id"], "campaign_call", "Campaign setup call scheduled",
                            f"Miracurl will call you on {body.call_at}. Keep your poster spot & staff briefing ready.", "/settings#campaign-agreement", f"campaign_call:{body.call_at}")
        if em:
            await _send_email([em], f"{c['name']}: your setup call is on {body.call_at}",
                              f"<p>Namaste {t.get('name')},</p><p>Your Brand Model campaign setup call with Miracurl is scheduled for <b>{body.call_at}</b>.</p>"
                              f"<p>We'll walk you through the QR poster, staff briefing and how entries are counted. — Miracurl HQ</p>")
    elif body.action == "call_done":
        patch.update({"status": "call_done", "call_done_at": _now()})
    elif body.action == "go_live":
        if not agreed:
            raise HTTPException(400, "The salon must accept the Participation Agreement before going live")
        patch.update({"status": "live", "live": True, "live_at": _now(), "live_by": user.get("email")})
        await notify_tenant(t["id"], "campaign_live", f"{c['name']} is LIVE for your salon 🎉",
                            "Print your QR poster from Settings and start enrolling customers.", "/settings#campaign-agreement", f"campaign_live:{c['id']}")
        if em:
            await _send_email([em], f"🎉 {c['name']} is live for {t.get('name')}",
                              f"<p>Namaste {t.get('name')},</p><p>Your campaign is now <b>live</b>. Download the QR poster from <b>Settings → Brand Model Campaign</b>, "
                              f"place it at the billing counter and let customers apply.</p><p>— Miracurl HQ</p>")
    elif body.action == "pause":
        patch.update({"status": "paused", "live": False, "paused_at": _now()})
    ob = await set_onboarding(t["id"], c["id"], patch)
    await log_audit(t["id"], {**user, "name": "Miracurl HQ"}, "campaign_onboarding", f"HQ: {body.action}" + (f" ({body.call_at})" if body.call_at else ""))
    return {"ok": True, "onboarding": ob, "agreed": agreed}


@router.get("/super-admin/rewards-campaign/onboarding")
async def sa_onboarding_list(campaign: str = "main", user=Depends(require_super_admin)):
    c = await get_campaign(campaign)
    rows = await _raw_db.rewards_onboarding.find({"campaign_id": c["id"]}, {"_id": 0}).sort("updated_at", -1).to_list(500)
    tids = [r["tenant_id"] for r in rows]
    ts = {t["id"]: t for t in await _raw_db.tenants.find({"id": {"$in": tids}}, {"_id": 0, "id": 1, "name": 1, "slug": 1, "logo_url": 1, "location": 1}).to_list(500)}
    accs = {a["tenant_id"]: a for a in await _raw_db.rewards_agreements.find({"campaign_id": c["id"]}, {"_id": 0, "tenant_id": 1, "full_name": 1, "accepted_at": 1, "version": 1, "consents": 1}).sort("accepted_at", -1).to_list(1000)}
    for r in rows:
        r["tenant"] = ts.get(r["tenant_id"], {})
        r["acceptance"] = accs.get(r["tenant_id"])
    return {"items": rows}


# ---------------- Tenant ----------------
class SupportAccessIn(BaseModel):
    enabled: bool


@router.put("/settings/support-access")
async def set_support_access(body: SupportAccessIn, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    await db.tenants.update_one({"id": t["id"]}, {"$set": {"support_access": bool(body.enabled)}})
    await log_audit(t["id"], user, "support_access", f"Miracurl support access turned {'ON' if body.enabled else 'OFF'}")
    return {"ok": True, "support_access": bool(body.enabled)}
