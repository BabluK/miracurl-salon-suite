"""Brand Model campaign — per-salon settlement tracker (HQ) with Mira email / WhatsApp nudges."""
import asyncio
import html as html_lib
import logging
import os
import re
import uuid
from datetime import date, datetime, timezone
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import _raw_db
from email_service import _inboxes_for_login, _is_login_only, _send_email, hq_notify_emails
from routes.rewards_campaign import _tenant_eligible, get_campaign, get_campaign_for
from security import require_super_admin

router = APIRouter()
log = logging.getLogger("rewards_settlements")
_T_FIELDS = {"_id": 0, "id": 1, "name": 1, "slug": 1, "plan": 1, "status": 1, "location": 1, "logo_url": 1, "business_type": 1,
             "owner_email": 1, "notify_email": 1, "phone": 1, "owner_phone": 1, "trusted_badge": 1}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _app_url() -> str:
    return os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")


def _rzp_enabled() -> bool:
    return bool(os.environ.get("RAZORPAY_KEY_ID") and os.environ.get("RAZORPAY_KEY_SECRET"))


def _rzp_client():
    import razorpay
    return razorpay.Client(auth=(os.environ["RAZORPAY_KEY_ID"], os.environ["RAZORPAY_KEY_SECRET"]))


async def _real_email(t: dict) -> str:
    """Deliverable inbox for a salon: tenant notify_email → owner's users.notify_email → owner_email if real."""
    for cand in (t.get("notify_email"), t.get("salon_email"), t.get("owner_email")):
        cand = (cand or "").strip().lower()
        if not cand:
            continue
        if not _is_login_only(cand):
            return cand
        real = await _inboxes_for_login(cand)
        if real:
            return real[0]
    return ""


async def _campaign_revenue(c: dict) -> dict:
    """Per-tenant POS earnings during the campaign window (paid invoices; total + eligible-bill count)."""
    start, end = f"{c['start_date']}T00:00:00", f"{c['end_date']}T23:59:59.999999+00:00"
    agg = await _raw_db.invoices.aggregate([
        {"$match": {"created_at": {"$gte": start, "$lte": end}, "paid": {"$ne": False}, "status": {"$nin": ["open", "void", "cancelled"]}}},
        {"$group": {"_id": "$tenant_id", "revenue": {"$sum": "$total"}, "bills": {"$sum": 1},
                    "eligible": {"$sum": {"$cond": [{"$gte": ["$total", float(c.get("min_transaction") or 0)]}, 1, 0]}}}},
    ]).to_list(2000)
    return {r["_id"]: r for r in agg}


def _suggest(c: dict, rev: dict) -> dict:
    """Miracurl share = campaign-period salon earnings × salon_share_pct (default 10%)."""
    pct = float(c.get("salon_share_pct") or 0)
    revenue = float((rev or {}).get("revenue") or 0)
    return {"amount": round(revenue * pct / 100), "pct": pct, "revenue": round(revenue, 2),
            "bills": int((rev or {}).get("bills") or 0), "eligible_bills": int((rev or {}).get("eligible") or 0),
            "breakdown": f"₹{revenue:,.0f} earned {c['start_date']} → {c['end_date']} × {pct:g}%"}


def _create_pay_link(amount: float, tenant: dict, c: dict, email: str, due_date: str) -> dict:
    """Razorpay Payment Link for a salon's settlement — uses the platform keys already configured in HQ."""
    pl = _rzp_client().payment_link.create({
        "amount": int(round(amount * 100)), "currency": "INR",
        "reference_id": f"settle-{tenant['id'][:8]}-{uuid.uuid4().hex[:6]}",
        "description": f"{c['name']} — settlement share for {tenant.get('name') or tenant.get('slug')}"[:250],
        "customer": {"name": (tenant.get("name") or "")[:50], "email": email or "", "contact": re.sub(r"\D", "", tenant.get("owner_phone") or tenant.get("phone") or "")[-12:] or None},
        "notify": {"email": False, "sms": False}, "reminder_enable": False,
        "notes": {"type": "rewards_settlement", "tenant_id": tenant["id"], "campaign_id": c["id"], "due_date": due_date or ""},
        "callback_url": f"{_app_url()}/dashboard?settlement=paid", "callback_method": "get",
    })
    return {"id": pl.get("id"), "url": pl.get("short_url"), "amount": amount, "created_at": _now(), "status": pl.get("status", "created")}


async def _ensure_pay_link(d: dict, tenant: dict, c: dict) -> Optional[dict]:
    """Create (or refresh after an amount change) the Razorpay link for a pending settlement. Never raises."""
    if not _rzp_enabled() or not d.get("amount") or d.get("status") in ("paid", "waived"):
        return d.get("pay_link")
    link = d.get("pay_link") or {}
    if link.get("url") and float(link.get("amount") or 0) == float(d["amount"]):
        return link
    try:
        if link.get("id"):
            await asyncio.to_thread(lambda: _rzp_client().payment_link.cancel(link["id"]))
    except Exception as e:  # noqa: BLE001
        log.info("old settlement link cancel skipped: %s", str(e)[:80])
    try:
        email = await _real_email(tenant)
        new = await asyncio.to_thread(_create_pay_link, float(d["amount"]), tenant, c, email, d.get("due_date") or "")
        await _raw_db.rewards_settlements.update_one({"campaign_id": c["id"], "tenant_id": tenant["id"]}, {"$set": {"pay_link": new}})
        return new
    except Exception as e:  # noqa: BLE001
        log.error("settlement pay link failed for %s: %s", tenant.get("slug"), str(e)[:160])
        return link or None


async def _set_trusted(tenant_id: str, campaign_id: str, on: bool) -> None:
    """'Trusted by Miracurl' badge — shown on the Miracurl home page and the salon's booking page once settled."""
    if on:
        await _raw_db.tenants.update_one({"id": tenant_id}, {"$set": {"trusted_badge": {
            "campaign_id": campaign_id, "since": date.today().isoformat(), "label": "Trusted by Miracurl"}}})
    else:
        await _raw_db.tenants.update_one({"id": tenant_id}, {"$unset": {"trusted_badge": ""}})


async def mark_settlement_paid(campaign_id: str, tenant_id: str, method: str, ref: str, by: str = "razorpay") -> bool:
    r = await _raw_db.rewards_settlements.update_one(
        {"campaign_id": campaign_id, "tenant_id": tenant_id, "amount": {"$gt": 0}, "status": {"$nin": ["paid"]}},
        {"$set": {"status": "paid", "paid_at": _now(), "paid_method": method, "paid_ref": ref, "updated_at": _now(), "updated_by": by}})
    if r.modified_count:
        await _set_trusted(tenant_id, campaign_id, True)
    return bool(r.modified_count)


async def _sync_pending_links(c: dict, docs: dict) -> None:
    """Poll Razorpay for pending links (cap 10) so a paid link flips to PAID even if the webhook was missed."""
    if not _rzp_enabled():
        return
    pend = [d for d in docs.values() if d.get("status") == "pending" and (d.get("pay_link") or {}).get("id")][:10]
    for d in pend:
        try:
            pl = await asyncio.to_thread(_rzp_client().payment_link.fetch, d["pay_link"]["id"])
            if pl.get("status") == "paid":
                pays = pl.get("payments") or []
                ref = pays[0].get("payment_id") if pays else pl.get("id")
                if await mark_settlement_paid(c["id"], d["tenant_id"], "razorpay", ref or ""):
                    d.update({"status": "paid", "paid_method": "razorpay", "paid_ref": ref, "paid_at": _now()})
        except Exception as e:  # noqa: BLE001
            log.info("settlement link sync skipped: %s", str(e)[:100])


async def _settlement_rows(c: dict) -> list:
    ts = await _raw_db.tenants.find({"status": {"$ne": "deleted"}}, _T_FIELDS).to_list(1000)
    docs = {d["tenant_id"]: d for d in await _raw_db.rewards_settlements.find({"campaign_id": c["id"]}, {"_id": 0}).to_list(1000)}
    await _sync_pending_links(c, docs)
    revenue = await _campaign_revenue(c)
    from services.campaign_docs import agreement_version
    ver = agreement_version(c)
    accs: dict = {}
    for a in await _raw_db.rewards_agreements.find({"campaign_id": c["id"]}, {"_id": 0, "tenant_id": 1, "version": 1, "full_name": 1, "accepted_at": 1}).sort("accepted_at", 1).to_list(2000):
        accs[a["tenant_id"]] = a
    agg = await _raw_db.rewards_participants.aggregate([{"$group": {
        "_id": {"t": "$tenant_id", "w": "$winner_tier"}, "n": {"$sum": 1}}}]).to_list(2000)
    counts: dict = {}
    for r in agg:
        tid, tier = r["_id"].get("t"), r["_id"].get("w")
        row = counts.setdefault(tid, {"n": 0, "winners": 0, "by_tier": {}})
        row["n"] += r["n"]
        if tier:
            row["winners"] += r["n"]
            row["by_tier"][tier] = row["by_tier"].get(tier, 0) + r["n"]
    today = date.today().isoformat()
    out = []
    for t in ts:
        d = docs.get(t["id"])
        if not (_tenant_eligible(c, t) or d):
            continue
        d = d or {}
        status = d.get("status") or "not_set"
        overdue = status == "pending" and bool(d.get("due_date")) and d["due_date"] < today
        cnt = counts.get(t["id"], {"n": 0, "winners": 0, "by_tier": {}})
        out.append({
            "tenant_id": t["id"], "name": t.get("name"), "slug": t.get("slug"), "location": t.get("location"),
            "plan": t.get("plan"), "logo_url": t.get("logo_url"), "public_url": f"{_app_url()}/rewards/{t.get('slug')}",
            "email": await _real_email(t), "phone": t.get("owner_phone") or t.get("phone") or "",
            "participants": cnt["n"], "winners": cnt["winners"], "winners_by_tier": cnt["by_tier"], "suggested": _suggest(c, revenue.get(t["id"])),
            "trusted": bool(t.get("trusted_badge")),
            "amount": float(d.get("amount") or 0), "due_date": d.get("due_date") or "", "note": d.get("note") or "",
            "status": "overdue" if overdue else status, "paid_at": d.get("paid_at"), "paid_method": d.get("paid_method"),
            "paid_ref": d.get("paid_ref"), "reminders": d.get("reminders") or [], "updated_at": d.get("updated_at"),
            "pay_url": (d.get("pay_link") or {}).get("url") or "",
            "docs_sent_at": d.get("docs_sent_at"),
            "agreement": ({"status": "accepted" if accs[t["id"]].get("version") == ver else "outdated",
                           "by": accs[t["id"]].get("full_name"), "at": accs[t["id"]].get("accepted_at")} if t["id"] in accs else {"status": "pending"}),
        })
    order = {"overdue": 0, "pending": 1, "not_set": 2, "paid": 3, "waived": 4}
    out.sort(key=lambda r: (order.get(r["status"], 9), -r["amount"], (r["name"] or "").lower()))
    return out


def _summary(rows: list) -> dict:
    return {
        "salons": len(rows),
        "total_billed": round(sum(r["amount"] for r in rows if r["status"] != "waived"), 2),
        "collected": round(sum(r["amount"] for r in rows if r["status"] == "paid"), 2),
        "outstanding": round(sum(r["amount"] for r in rows if r["status"] in ("pending", "overdue")), 2),
        "pending_count": sum(1 for r in rows if r["status"] in ("pending", "overdue")),
        "overdue_count": sum(1 for r in rows if r["status"] == "overdue"),
        "not_set_count": sum(1 for r in rows if r["status"] == "not_set"),
        "campaign_revenue": round(sum(float((r.get("suggested") or {}).get("revenue") or 0) for r in rows), 2),
        "suggested_total": round(sum(float((r.get("suggested") or {}).get("amount") or 0) for r in rows), 2),
    }


@router.get("/super-admin/rewards-campaign/settlements")
async def sa_settlements(campaign: str = "main", user=Depends(require_super_admin)):
    c = await get_campaign(campaign)
    rows = await _settlement_rows(c)
    from services.campaign_docs import agreement_version
    ver = agreement_version(c)
    return {"rows": rows, "summary": _summary(rows), "payment_link": c.get("payment_link") or "",
            "rzp_enabled": _rzp_enabled(), "rzp_key": (os.environ.get("RAZORPAY_KEY_ID") or "")[:12],
            "salon_share_pct": c.get("salon_share_pct"), "agreement_version": ver,
            "campaign": {"name": c["name"], "end_date": c["end_date"]}}


@router.get("/super-admin/rewards-campaign/settlements/{tenant_id}/earnings")
async def sa_settlement_earnings(tenant_id: str, user=Depends(require_super_admin)):
    """Campaign-period earnings proof for HQ: totals, monthly split and bill list (no customer personal data)."""
    t = await _tenant_or_404(tenant_id)
    c = await get_campaign_for(t)
    start, end = f"{c['start_date']}T00:00:00", f"{c['end_date']}T23:59:59.999999+00:00"
    flt = {"tenant_id": tenant_id, "created_at": {"$gte": start, "$lte": end}, "paid": {"$ne": False}, "status": {"$nin": ["open", "void", "cancelled"]}}
    bills = await _raw_db.invoices.find(flt, {"_id": 0, "id": 1, "invoice_no": 1, "created_at": 1, "total": 1, "payment_mode": 1, "items": 1, "branch_name": 1}).sort("created_at", -1).to_list(5000)
    monthly: dict = {}
    for b in bills:
        m = monthly.setdefault(b["created_at"][:7], {"month": b["created_at"][:7], "revenue": 0.0, "bills": 0})
        m["revenue"] += float(b.get("total") or 0)
        m["bills"] += 1
    pct = float(c.get("salon_share_pct") or 0)
    revenue = round(sum(float(b.get("total") or 0) for b in bills), 2)
    return {"tenant": {"id": t["id"], "name": t.get("name"), "slug": t.get("slug")}, "period": {"start": c["start_date"], "end": c["end_date"]},
            "revenue": revenue, "bills": len(bills), "eligible_bills": sum(1 for b in bills if float(b.get("total") or 0) >= float(c.get("min_transaction") or 0)),
            "share_pct": pct, "share_amount": round(revenue * pct / 100),
            "monthly": sorted(monthly.values(), key=lambda m: m["month"]),
            "recent": [{"date": b["created_at"][:10], "invoice_no": b.get("invoice_no"), "total": float(b.get("total") or 0),
                        "payment_mode": b.get("payment_mode"), "items": len(b.get("items") or []), "branch": b.get("branch_name") or ""} for b in bills[:200]]}


@router.get("/super-admin/rewards-campaign/settlements/{tenant_id}/earnings.csv")
async def sa_settlement_earnings_csv(tenant_id: str, user=Depends(require_super_admin)):
    import csv
    import io

    from fastapi import Response
    data = await sa_settlement_earnings(tenant_id, user)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["date", "invoice_no", "total", "payment_mode", "items", "branch"])
    for r in data["recent"]:
        w.writerow([r["date"], r["invoice_no"], f"{r['total']:.2f}", r["payment_mode"], r["items"], r["branch"]])
    w.writerow([])
    w.writerow(["campaign_revenue", data["revenue"], "share_pct", data["share_pct"], "share_amount", data["share_amount"]])
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="campaign-earnings-{data["tenant"]["slug"]}.csv"'})


# ── Earnings anomaly detection (off-app billing check) ──
ANOMALY_DROP_PCT = 30.0
ANOMALY_MIN_BASELINE = 5000.0


async def _monthly_revenue_map(tenant_ids: list, start_iso: str, end_iso: str) -> dict:
    agg = await _raw_db.invoices.aggregate([
        {"$match": {"tenant_id": {"$in": tenant_ids}, "created_at": {"$gte": start_iso, "$lte": end_iso},
                    "paid": {"$ne": False}, "status": {"$nin": ["open", "void", "cancelled"]}}},
        {"$group": {"_id": {"t": "$tenant_id", "m": {"$substr": ["$created_at", 0, 7]}}, "revenue": {"$sum": "$total"}, "bills": {"$sum": 1}}},
    ]).to_list(10000)
    out: dict = {}
    for r in agg:
        out.setdefault(r["_id"]["t"], {})[r["_id"]["m"]] = {"revenue": float(r["revenue"]), "bills": int(r["bills"])}
    return out


def _mira_anomaly_note(name: str, a: dict) -> str:
    if a["flag"] == "drop":
        return (f"{name} billed ₹{a['current_monthly']:,.0f}/month during the campaign vs ₹{a['baseline_monthly']:,.0f}/month before it "
                f"({a['drop_pct']:.0f}% lower, {a['current_bills']} bills). Worth a friendly check-in: are all visits going through Miracurl POS? "
                f"Remind them entries only count from POS bills — and that the agreement covers off-app billing (Clause 5.4).")
    if a["flag"] == "silent":
        return f"{name} has recorded no POS bills since the campaign started, though it billed ₹{a['baseline_monthly']:,.0f}/month before. Possible off-app billing or a closed outlet — check in."
    if a["flag"] == "early":
        return f"{name}: campaign is only {a['days_in_campaign']} day(s) old — Mira starts comparing against the ₹{a['baseline_monthly']:,.0f}/month baseline after 7 days."
    if a["flag"] == "no_baseline":
        return f"{name} has little or no POS history before the campaign (₹{a['baseline_monthly']:,.0f}/month), so there is nothing to compare yet."
    return f"{name} looks healthy: ₹{a['current_monthly']:,.0f}/month during the campaign vs ₹{a['baseline_monthly']:,.0f}/month before."


async def detect_earnings_anomalies(c: dict) -> list:
    """Compare campaign-period monthly run-rate vs the 3 months before the campaign; flag sharp drops."""
    from datetime import timedelta as _td
    start = date.fromisoformat(c["start_date"])
    end = min(date.fromisoformat(c["end_date"]), date.today())
    if end < start:
        return []
    base_start = (start.replace(day=1) - _td(days=1)).replace(day=1)
    base_start = (base_start.replace(day=1) - _td(days=1)).replace(day=1)  # 3 full months back
    ts = await _raw_db.tenants.find({"status": {"$ne": "deleted"}}, _T_FIELDS).to_list(1000)
    ts = [t for t in ts if _tenant_eligible(c, t)]
    if not ts:
        return []
    ids = [t["id"] for t in ts]
    base = await _monthly_revenue_map(ids, f"{base_start.isoformat()}T00:00:00", f"{(start - _td(days=1)).isoformat()}T23:59:59.999999+00:00")
    cur = await _monthly_revenue_map(ids, f"{start.isoformat()}T00:00:00", f"{end.isoformat()}T23:59:59.999999+00:00")
    days = max(1, (end - start).days + 1)
    out = []
    for t in ts:
        b_months = base.get(t["id"], {})
        baseline_total = sum(m["revenue"] for m in b_months.values())
        baseline_monthly = baseline_total / 3
        c_months = cur.get(t["id"], {})
        cur_total = sum(m["revenue"] for m in c_months.values())
        cur_bills = sum(m["bills"] for m in c_months.values())
        current_monthly = cur_total / days * 30
        drop = (1 - current_monthly / baseline_monthly) * 100 if baseline_monthly > 0 else 0.0
        if baseline_monthly < ANOMALY_MIN_BASELINE:
            flag = "no_baseline"
        elif days < 7:
            flag = "early"
        elif cur_bills == 0:
            flag = "silent"
        elif drop >= ANOMALY_DROP_PCT:
            flag = "drop"
        else:
            flag = "ok"
        a = {"tenant_id": t["id"], "name": t.get("name"), "slug": t.get("slug"), "flag": flag,
             "baseline_monthly": round(baseline_monthly), "baseline_months": sorted(b_months.keys()),
             "current_total": round(cur_total), "current_monthly": round(current_monthly), "current_bills": cur_bills,
             "days_in_campaign": days, "drop_pct": round(max(drop, 0), 1)}
        a["mira_note"] = _mira_anomaly_note(t.get("name") or t.get("slug"), a)
        out.append(a)
    order = {"silent": 0, "drop": 1, "ok": 2, "early": 3, "no_baseline": 4}
    out.sort(key=lambda a: (order[a["flag"]], -a["drop_pct"]))
    return out


@router.get("/super-admin/rewards-campaign/anomalies")
async def sa_anomalies(campaign: str = "main", user=Depends(require_super_admin)):
    c = await get_campaign(campaign)
    rows = await detect_earnings_anomalies(c)
    last = await _raw_db.system_flags.find_one({"key": "rewards_anomaly_alert" if c["id"] == "main" else f"rewards_anomaly_alert_{c['id']}"}, {"_id": 0})
    return {"rows": rows, "flagged": sum(1 for r in rows if r["flag"] in ("drop", "silent")),
            "threshold_pct": ANOMALY_DROP_PCT, "min_baseline": ANOMALY_MIN_BASELINE, "last_alert": (last or {}).get("value")}


async def send_anomaly_alert(force: bool = False, campaign: str = "main") -> dict:
    """Weekly Mira email to HQ listing salons whose campaign billing dropped sharply. Dedupes per ISO week (per campaign)."""
    c = await get_campaign(campaign)
    if not c.get("enabled"):
        return {"skipped": "campaign off"}
    week = datetime.now(timezone.utc).strftime("%G-W%V")
    flag_key = "rewards_anomaly_alert" if c["id"] == "main" else f"rewards_anomaly_alert_{c['id']}"
    flag = await _raw_db.system_flags.find_one({"key": flag_key})
    if not force and flag and flag.get("value") == week:
        return {"skipped": "already sent this week"}
    rows = [r for r in await detect_earnings_anomalies(c) if r["flag"] in ("drop", "silent")]
    if not rows:
        await _raw_db.system_flags.update_one({"key": flag_key}, {"$set": {"value": week, "flagged": 0, "ran_at": _now()}}, upsert=True)
        return {"sent": False, "flagged": 0}
    items = ""
    for r in rows:
        pct_txt = "no bills" if r["flag"] == "silent" else f"-{r['drop_pct']:.0f}%"
        items += (f"<tr><td style='padding:8px 12px;border-top:1px solid #eee'><b>{html_lib.escape(r['name'] or '')}</b><br/>"
                  f"<span style='font-size:12px;color:#777'>{html_lib.escape(r['mira_note'])}</span></td>"
                  f"<td style='padding:8px 12px;border-top:1px solid #eee;text-align:right;white-space:nowrap;color:#c0392b;font-weight:bold'>{pct_txt}</td></tr>")
    html = f"""
    <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#fdfbf7;border:1px solid #eee;border-radius:16px;overflow:hidden">
      <div style="background:#1c1c22;padding:22px 28px"><div style="color:#d4af37;font-size:20px;font-weight:bold">Mira ✦ Earnings watch</div>
      <div style="color:#999;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:4px">{html_lib.escape(c['name'])} · week {week}</div></div>
      <div style="padding:22px 28px;color:#333;font-size:14px;line-height:1.7">
        <p>Hi HQ 👋 {len(rows)} participating salon{'s' if len(rows) != 1 else ''} {'are' if len(rows) != 1 else 'is'} billing well below their pre-campaign run-rate. Since the settlement is {float(c.get('salon_share_pct') or 10):g}% of POS earnings, this is worth a quick check for off-app billing.</p>
        <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #eadfc0;border-radius:12px;font-size:13px">{items}</table>
        <p style="font-size:12px;color:#888;margin-top:14px">Open HQ → Tenants → Settlement tracker → Earnings watch to see bills and nudge the salon. Threshold: {ANOMALY_DROP_PCT:g}% drop vs the 3-month pre-campaign average.</p>
      </div></div>"""
    res = await _send_email(list(dict.fromkeys(hq_notify_emails("billing") + hq_notify_emails("admin"))),
                            f"⚠️ Mira earnings watch — {len(rows)} salon{'s' if len(rows) != 1 else ''} billing far below pre-campaign levels",
                            html, book_url=f"{_app_url()}/super-admin?tab=tenants", book_label="Open Settlement tracker ✦")
    await _raw_db.system_flags.update_one({"key": flag_key},
                                         {"$set": {"value": week, "flagged": len(rows), "ran_at": _now(), "sent": bool(res.get("sent"))}}, upsert=True)
    return {"sent": bool(res.get("sent")), "flagged": len(rows), "error": res.get("error")}


@router.post("/super-admin/rewards-campaign/anomalies/alert")
async def sa_anomaly_alert_now(campaign: str = "main", user=Depends(require_super_admin)):
    out = await send_anomaly_alert(force=True, campaign=campaign)
    if out.get("skipped"):
        raise HTTPException(400, out["skipped"])
    return {"ok": True, **out}


class SettlementIn(BaseModel):
    amount: float = Field(..., ge=0, le=10_000_000)
    due_date: str = Field("", pattern=r"^(\d{4}-\d{2}-\d{2})?$")
    note: str = Field("", max_length=400)


async def _tenant_or_404(tenant_id: str) -> dict:
    t = await _raw_db.tenants.find_one({"id": tenant_id}, _T_FIELDS)
    if not t:
        raise HTTPException(404, "Tenant not found")
    return t


@router.put("/super-admin/rewards-campaign/settlements/{tenant_id}")
async def sa_settlement_put(tenant_id: str, body: SettlementIn, user=Depends(require_super_admin)):
    t = await _tenant_or_404(tenant_id)
    c = await get_campaign_for(t)
    cur = await _raw_db.rewards_settlements.find_one({"campaign_id": c["id"], "tenant_id": tenant_id}, {"_id": 0, "status": 1})
    status = cur["status"] if cur and cur.get("status") in ("paid", "waived") else ("pending" if body.amount > 0 else "not_set")
    await _raw_db.rewards_settlements.update_one(
        {"campaign_id": c["id"], "tenant_id": tenant_id},
        {"$set": {"amount": body.amount, "due_date": body.due_date, "note": body.note.strip(), "status": status,
                  "updated_at": _now(), "updated_by": user.get("email")},
         "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": _now(), "reminders": []}}, upsert=True)
    d = await _raw_db.rewards_settlements.find_one({"campaign_id": c["id"], "tenant_id": tenant_id}, {"_id": 0})
    link = await _ensure_pay_link(d, t, c)
    return {"ok": True, "status": status, "pay_url": (link or {}).get("url") or ""}


class MarkPaidIn(BaseModel):
    method: str = Field("upi", max_length=30)
    ref: str = Field("", max_length=120)


@router.post("/super-admin/rewards-campaign/settlements/{tenant_id}/mark-paid")
async def sa_settlement_paid(tenant_id: str, body: MarkPaidIn, user=Depends(require_super_admin)):
    c = await get_campaign_for(await _tenant_or_404(tenant_id))
    r = await _raw_db.rewards_settlements.update_one(
        {"campaign_id": c["id"], "tenant_id": tenant_id, "amount": {"$gt": 0}},
        {"$set": {"status": "paid", "paid_at": _now(), "paid_method": body.method, "paid_ref": body.ref.strip(),
                  "updated_at": _now(), "updated_by": user.get("email")}})
    if not r.matched_count:
        raise HTTPException(400, "Set the settlement amount first")
    await _set_trusted(tenant_id, c["id"], True)
    return {"ok": True, "trusted": True}


@router.post("/super-admin/rewards-campaign/settlements/{tenant_id}/reopen")
async def sa_settlement_reopen(tenant_id: str, user=Depends(require_super_admin)):
    c = await get_campaign_for(await _tenant_or_404(tenant_id))
    r = await _raw_db.rewards_settlements.update_one(
        {"campaign_id": c["id"], "tenant_id": tenant_id},
        {"$set": {"status": "pending", "updated_at": _now()}, "$unset": {"paid_at": "", "paid_method": "", "paid_ref": ""}})
    if not r.matched_count:
        raise HTTPException(404, "No settlement yet")
    await _set_trusted(tenant_id, c["id"], False)
    return {"ok": True}


@router.post("/super-admin/rewards-campaign/settlements/{tenant_id}/waive")
async def sa_settlement_waive(tenant_id: str, user=Depends(require_super_admin)):
    c = await get_campaign_for(await _tenant_or_404(tenant_id))
    r = await _raw_db.rewards_settlements.update_one(
        {"campaign_id": c["id"], "tenant_id": tenant_id},
        {"$set": {"status": "waived", "updated_at": _now(), "updated_by": user.get("email")}})
    if not r.matched_count:
        raise HTTPException(404, "No settlement yet")
    return {"ok": True}


def _fmt_inr(v: float) -> str:
    return f"₹{v:,.0f}"


def _fallback_nudge(name: str, c: dict, d: dict, link: str, overdue: bool) -> str:
    due = f" by {d['due_date']}" if d.get("due_date") else ""
    lead = (f"a gentle reminder that the {_fmt_inr(d['amount'])} settlement for {c['name']} was due on {d['due_date']}"
            if overdue else f"the {c['name']} has wrapped up — your settlement share of {_fmt_inr(d['amount'])} is ready to pay{due}")
    note = f" {d['note'].rstrip('.')}." if d.get("note") else ""
    return (f"Hi {name} team 👋 This is Mira from Miracurl. Just {lead}.{note} "
            f"It covers the Brand Model memberships your winners are enjoying at your salon. "
            + (f"Pay securely here: {link} " if link else "")
            + "Reply to this message if you'd like a breakdown or a different date — happy to help! ✨")


async def _mira_nudge(name: str, c: dict, d: dict, link: str, overdue: bool) -> str:
    try:
        from routes.mira_common import _ask
        txt = await _ask(
            "You are Mira, the warm and professional AI assistant of Miracurl Suite (a salon SaaS). Write a short, friendly "
            "payment reminder message (max 90 words, WhatsApp style, 1-2 emojis, no subject line, no placeholders, no markdown).",
            f"Salon: {name}. Campaign: {c['name']} (ended {c['end_date']}). Settlement amount: {_fmt_inr(d['amount'])}. "
            f"Due date: {d.get('due_date') or 'not specified'}. {'OVERDUE — be gentle but clear.' if overdue else 'First reminder.'} "
            f"Context: the amount is the salon's share of the Brand Model winner memberships redeemed at their outlet. "
            f"Note from HQ: {d.get('note') or 'none'}. Payment link to include verbatim: {link or 'none'}. Sign off as Mira from Miracurl.")
        txt = re.sub(r"\*\*|__", "", txt).strip()
        if 40 < len(txt) < 900:
            return txt
    except Exception as e:  # noqa: BLE001 — never block a nudge on the LLM
        log.warning("mira nudge fallback: %s", str(e)[:120])
    return _fallback_nudge(name, c, d, link, overdue)


class RemindIn(BaseModel):
    channel: str = Field("email", pattern=r"^(email|whatsapp)$")


@router.post("/super-admin/rewards-campaign/settlements/{tenant_id}/remind")
async def sa_settlement_remind(tenant_id: str, body: RemindIn, user=Depends(require_super_admin)):
    t = await _tenant_or_404(tenant_id)
    c = await get_campaign_for(t)
    d = await _raw_db.rewards_settlements.find_one({"campaign_id": c["id"], "tenant_id": tenant_id}, {"_id": 0})
    if not d or not d.get("amount"):
        raise HTTPException(400, "Set the settlement amount first")
    if d.get("status") in ("paid", "waived"):
        raise HTTPException(400, f"Settlement already {d['status']}")
    pl = await _ensure_pay_link(d, t, c)
    link = (pl or {}).get("url") or c.get("payment_link") or ""
    overdue = bool(d.get("due_date")) and d["due_date"] < date.today().isoformat()
    name = t.get("name") or t.get("slug")
    text = await _mira_nudge(name, c, d, link, overdue)
    out: dict = {"ok": True, "channel": body.channel, "text": text}
    if body.channel == "email":
        to = t.get("notify_email") or t.get("owner_email")
        if not to:
            raise HTTPException(400, "Salon has no notification email")
        paras = "".join(f"<p style='line-height:1.7'>{html_lib.escape(p)}</p>" for p in text.split("\n") if p.strip())
        html = f"""
        <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#fdfbf7;border:1px solid #eee;border-radius:16px;overflow:hidden">
          <div style="background:#1c1c22;padding:22px 28px"><div style="color:#d4af37;font-size:20px;font-weight:bold">Miracurl ✦ Brand Model</div>
          <div style="color:#999;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:4px">Campaign settlement · {html_lib.escape(name)}</div></div>
          <div style="padding:24px 28px;color:#333;font-size:14px">{paras}
          <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #eadfc0;border-radius:12px;margin:16px 0;font-size:13px">
            <tr><td style="padding:8px 14px;color:#777">Amount due</td><td style="padding:8px 14px;text-align:right;font-weight:bold">{_fmt_inr(d['amount'])}</td></tr>
            <tr><td style="padding:8px 14px;color:#777">Due date</td><td style="padding:8px 14px;text-align:right;font-weight:bold">{html_lib.escape(d.get('due_date') or '—')}</td></tr>
            <tr><td style="padding:8px 14px;color:#777">Status</td><td style="padding:8px 14px;text-align:right;font-weight:bold;color:{'#c0392b' if overdue else '#b08d3f'}">{'Overdue' if overdue else 'Pending'}</td></tr>
          </table>
          <p style="font-size:12px;color:#888">You can also see this under Settings → Miracurl Updates in your dashboard.</p></div></div>"""
        subject = f"{'⏰ Overdue: ' if overdue else ''}Brand Model settlement — {_fmt_inr(d['amount'])} for {name}"
        res = await _send_email([to], subject, html, book_url=link or f"{_app_url()}/settings", book_label="Pay settlement ✦" if link else "Open dashboard ✦")
        if not res.get("sent"):
            err = res.get("error") or "Email failed"
            raise HTTPException(400, "Salon has no real notification email on file — ask them to add one in Settings" if err == "no_real_recipient" else err)
        out["to"] = to
    else:
        digits = re.sub(r"\D", "", t.get("owner_phone") or t.get("phone") or "")
        if not digits:
            raise HTTPException(400, "Salon has no phone number")
        if len(digits) == 10:
            digits = "91" + digits
        out["whatsapp_url"] = f"https://wa.me/{digits}?text={quote(text)}"
        out["to"] = f"+{digits}"
    await _raw_db.rewards_settlements.update_one(
        {"campaign_id": c["id"], "tenant_id": tenant_id},
        {"$push": {"reminders": {"at": _now(), "channel": body.channel, "to": out["to"], "by": user.get("email"), "overdue": overdue}}})
    return out


async def tenant_settlement(tenant_id: str, campaign_id: str) -> Optional[dict]:
    d = await _raw_db.rewards_settlements.find_one({"campaign_id": campaign_id, "tenant_id": tenant_id}, {"_id": 0})
    if not d or not d.get("amount"):
        return None
    out = {k: d.get(k) for k in ("amount", "due_date", "note", "status", "paid_at")}
    out["pay_url"] = (d.get("pay_link") or {}).get("url") or ""
    t = await _raw_db.tenants.find_one({"id": tenant_id}, {"_id": 0, "trusted_badge": 1}) or {}
    out["trusted"] = bool(t.get("trusted_badge"))
    return out
