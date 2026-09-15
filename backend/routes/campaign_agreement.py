"""Brand Model campaign documents & e-acceptance: tenant download/accept, HQ send pack / signed copies."""
import asyncio
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from database import _raw_db
from routes.rewards_campaign import _tenant_eligible, get_campaign, get_campaign_for
from security import current_tenant, require_super_admin, require_tenant_admin
from services.campaign_docs import (
    agreement_version, build_agreement_pdf, build_guide_pdf, email_doc_pack, get_acceptance,
)
from services.pdf_brand import platform_logo_bytes
from services.subscription_invoice import get_biller

router = APIRouter()


def _pdf(data: bytes, name: str) -> Response:
    return Response(content=data, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{name}"'})


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return (fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "")) or ""


async def agreement_ok(tenant_id: str, c: dict) -> bool:
    """True when the salon has accepted the CURRENT agreement version (gate for casting page, joins and QR poster)."""
    acc = await get_acceptance(tenant_id, c["id"])
    return bool(acc) and acc.get("version") == agreement_version(c)


async def agreement_state(tenant: dict, c: dict) -> dict:
    acc = await get_acceptance(tenant["id"], c["id"])
    ver = agreement_version(c)
    from routes.tenant_features import get_onboarding
    return {"version": ver, "share_pct": float(c.get("salon_share_pct") or 10), "campaign": c["name"],
            "onboarding": await get_onboarding(tenant["id"], c["id"]),
            "accepted": acc is not None and acc.get("version") == ver,
            "needs_reaccept": acc is not None and acc.get("version") != ver,
            "acceptance": {k: acc.get(k) for k in ("id", "full_name", "designation", "accepted_at", "user_email", "version")} if acc else None}


async def _find_tenant(tenant_id: str) -> dict:
    t = await _raw_db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tenant not found")
    return t


async def _real_to(t: dict) -> list[str]:
    from routes.rewards_settlements import _real_email
    em = await _real_email(t)
    if not em:
        raise HTTPException(400, "Salon has no real notification email on file — ask them to add one in Settings")
    return [em]


# ---------------- tenant ----------------
@router.get("/settings/rewards-campaign/agreement")
async def my_agreement(user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    c = await get_campaign_for(t)
    return {**(await agreement_state(t, c)), "eligible": _tenant_eligible(c, t), "enabled": bool(c.get("enabled"))}


@router.get("/settings/rewards-campaign/docs/{kind}.pdf")
async def my_doc(kind: str, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    c = await get_campaign_for(t)
    logo = await platform_logo_bytes()
    if kind == "guide":
        return _pdf(await asyncio.to_thread(build_guide_pdf, c, logo), "Miracurl-Brand-Model-Campaign-Guide.pdf")
    if kind == "agreement":
        acc = await get_acceptance(t["id"], c["id"])
        pdf = await asyncio.to_thread(build_agreement_pdf, c, t, await get_biller(), acc, logo)
        return _pdf(pdf, f"Miracurl-Participation-Agreement{'-SIGNED' if acc else ''}.pdf")
    if kind == "terms":
        from routes.hq_documents import DOCS, _doc_pdf
        return _pdf(await asyncio.to_thread(_doc_pdf, DOCS["terms_conditions"], logo), "Miracurl-Terms-and-Conditions.pdf")
    raise HTTPException(404, "Unknown document")


class AcceptIn(BaseModel):
    full_name: str = Field(..., min_length=3, max_length=80)
    designation: str = Field("Owner", min_length=2, max_length=60)
    agree: bool
    agree_share: bool = False        # 10% of all campaign earnings
    agree_visibility: bool = False   # HQ may view the business during the campaign (Cl. 5.5)


async def _open_campaign_or_400(t: dict) -> tuple[dict, str]:
    c = await get_campaign_for(t)
    if not c.get("enabled"):
        raise HTTPException(400, "The campaign is not open for participation yet")
    ver = agreement_version(c)
    if (await get_acceptance(t["id"], c["id"]) or {}).get("version") == ver:
        raise HTTPException(400, "Agreement already accepted")
    return c, ver


def _acceptance_doc(body: AcceptIn, request: Request, user: dict, t: dict, c: dict, ver: str) -> dict:
    return {
        "id": str(uuid.uuid4()), "tenant_id": t["id"], "tenant_name": t.get("name"), "campaign_id": c["id"], "version": ver,
        "share_pct": float(c.get("salon_share_pct") or 10), "campaign_snapshot": {k: c.get(k) for k in ("name", "start_date", "end_date", "min_transaction")},
        "full_name": body.full_name.strip(), "designation": body.designation.strip(),
        "consents": {"share": True, "visibility": True},
        "user_id": user.get("id"), "user_email": user.get("email"), "ip": _client_ip(request),
        "user_agent": request.headers.get("user-agent", "")[:200], "accepted_at": datetime.now(timezone.utc).isoformat(),
    }


async def _email_acceptance_pack(c: dict, t: dict, acc: dict) -> bool:
    """Acceptance is recorded even if the email fails."""
    try:
        from routes.rewards_settlements import _real_email
        em = await _real_email(t)
        res = await email_doc_pack(c, t, acc, [em]) if em else None
        return bool((res or {}).get("sent"))
    except Exception:  # noqa: BLE001
        return False


@router.post("/settings/rewards-campaign/agreement/accept")
async def accept_agreement(body: AcceptIn, request: Request, user=Depends(require_tenant_admin), t=Depends(current_tenant)):
    if not body.agree:
        raise HTTPException(400, "Tick 'I agree' to accept the agreement")
    if not (body.agree_share and body.agree_visibility):
        raise HTTPException(400, "Please tick both consents: the settlement share and HQ business visibility during the campaign")
    c, ver = await _open_campaign_or_400(t)
    acc = _acceptance_doc(body, request, user, t, c, ver)
    await _raw_db.rewards_agreements.insert_one(dict(acc))
    from routes.tenant_features import set_onboarding
    await set_onboarding(t["id"], c["id"], {"status": "agreed", "agreed_at": acc["accepted_at"], "live": False})
    await _notify_hq_agreed(t, c, acc)
    return {"ok": True, "acceptance": {k: acc[k] for k in ("id", "full_name", "designation", "accepted_at", "version")},
            "emailed": await _email_acceptance_pack(c, t, acc)}


async def _notify_hq_agreed(t: dict, c: dict, acc: dict) -> None:
    """HQ: salon approved → set up (via Open workspace) or schedule the call, then Go live."""
    try:
        import os
        from email_service import _send_email
        hq = os.environ.get("HQ_NOTIFY_EMAIL") or os.environ.get("SUPPORT_REPLY_TO") or ""
        if hq:
            await _send_email([hq], f"✅ {t.get('name')} approved {c['name']} — set up & go live",
                              f"<p><b>{t.get('name')}</b> ({t.get('slug')}) accepted the Participation Agreement v{acc['version']} — signed by {acc['full_name']} ({acc.get('designation')}).</p>"
                              f"<p>Consents: {acc['share_pct']:g}% settlement share ✔ · HQ business visibility ✔</p>"
                              f"<p>Next: open their workspace to set up the poster/QR, or schedule the setup call, then mark <b>Go live</b> in Super Admin → Tenant features.</p>")
    except Exception:  # noqa: BLE001
        pass


# ---------------- HQ ----------------
@router.get("/super-admin/rewards-campaign/docs/{kind}.pdf")
async def hq_doc(kind: str, campaign: str = "main", user=Depends(require_super_admin)):
    c = await get_campaign(campaign)
    logo = await platform_logo_bytes()
    if kind == "guide":
        return _pdf(await asyncio.to_thread(build_guide_pdf, c, logo), "Miracurl-Brand-Model-Campaign-Guide.pdf")
    if kind == "agreement":
        noun = "Restaurant" if c.get("vertical") == "restaurant" else "Salon"
        blank = {"name": f"[{noun} name]", "slug": noun.lower(), "location": f"[{noun} address]", "business_type": c.get("vertical", "salon")}
        return _pdf(await asyncio.to_thread(build_agreement_pdf, c, blank, await get_biller(), None, logo), "Miracurl-Participation-Agreement-Template.pdf")
    raise HTTPException(404, "Unknown document")


@router.get("/super-admin/rewards-campaign/docs/agreement/{tenant_id}.pdf")
async def hq_tenant_agreement(tenant_id: str, user=Depends(require_super_admin)):
    t = await _find_tenant(tenant_id)
    c = await get_campaign_for(t)
    acc = await get_acceptance(t["id"], c["id"])
    pdf = await asyncio.to_thread(build_agreement_pdf, c, t, await get_biller(), acc, await platform_logo_bytes())
    return _pdf(pdf, f"Miracurl-Participation-Agreement-{t.get('slug')}{'-SIGNED' if acc else ''}.pdf")


@router.get("/super-admin/rewards-campaign/agreements")
async def hq_agreements(campaign: str = "main", user=Depends(require_super_admin)):
    c = await get_campaign(campaign)
    rows = await _raw_db.rewards_agreements.find({"campaign_id": c["id"]}, {"_id": 0, "user_agent": 0}).sort("accepted_at", -1).to_list(1000)
    return {"version": agreement_version(c), "agreements": rows}


@router.post("/super-admin/rewards-campaign/docs/send/{tenant_id}")
async def hq_send_pack(tenant_id: str, user=Depends(require_super_admin)):
    t = await _find_tenant(tenant_id)
    c = await get_campaign_for(t)
    to = await _real_to(t)
    acc = await get_acceptance(t["id"], c["id"])
    res = await email_doc_pack(c, t, acc if acc and acc.get("version") == agreement_version(c) else None, to)
    if not res.get("sent"):
        raise HTTPException(400, res.get("error") or "Email failed")
    await _raw_db.rewards_settlements.update_one(
        {"campaign_id": c["id"], "tenant_id": t["id"]},
        {"$set": {"docs_sent_at": datetime.now(timezone.utc).isoformat(), "docs_sent_to": to[0]},
         "$setOnInsert": {"id": str(uuid.uuid4()), "amount": 0, "status": "not_set", "reminders": [], "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True)
    return {"ok": True, "to": to[0]}


@router.post("/super-admin/rewards-campaign/docs/send-all")
async def hq_send_pack_all(campaign: str = "main", user=Depends(require_super_admin)):
    """Email the pack to every participating salon that has not accepted the current version."""
    c = await get_campaign(campaign)
    ver = agreement_version(c)
    ts = await _raw_db.tenants.find({"status": {"$ne": "deleted"}}, {"_id": 0}).to_list(1000)
    sent, skipped = [], []
    for t in ts:
        if not _tenant_eligible(c, t):
            continue
        acc = await get_acceptance(t["id"], c["id"])
        if acc and acc.get("version") == ver:
            continue
        try:
            to = await _real_to(t)
            res = await email_doc_pack(c, t, None, to, hq_copy=False)
            (sent if res.get("sent") else skipped).append(t.get("slug"))
        except HTTPException:
            skipped.append(t.get("slug"))
    return {"ok": True, "sent": sent, "skipped": skipped}
