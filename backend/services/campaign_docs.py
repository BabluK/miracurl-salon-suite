"""Brand Model campaign documents: Salon Guide PDF, Participation Agreement PDF (with e-acceptance page), and the doc pack email."""
import base64
import hashlib
import html as html_lib
import os
import textwrap
from datetime import datetime, timedelta, timezone

from database import _raw_db
from email_service import _send_email, hq_notify_emails
from services.hq_docs import DOCS, _doc_pdf, _pdf_doc_header, _pdf_doc_sections
from services.pdf_brand import GOLD, GREY, INK, LIGHT, draw_powered_footer, draw_watermark, platform_logo_bytes

AGREEMENT_TEXT_VERSION = "2026-09-B"
IST = timezone(timedelta(hours=5, minutes=30))


def _app_url() -> str:
    return os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")


def _pct(c: dict) -> float:
    return float(c.get("salon_share_pct") or 10)


def _inr(v) -> str:
    return f"Rs. {float(v or 0):,.0f}"


def agreement_version(c: dict) -> str:
    """Changes whenever a material term changes → salons must re-accept."""
    key = f"{AGREEMENT_TEXT_VERSION}|{c['name']}|{c['start_date']}|{c['end_date']}|{_pct(c)}|{c.get('min_transaction')}"
    return hashlib.sha256(key.encode()).hexdigest()[:10].upper()


def guide_doc(c: dict) -> dict:
    tiers = " / ".join(f"{r.get('tier')} ({r.get('winners')})" for r in c.get("rewards") or [])
    return {
        "title": "Brand Model Campaign Guide",
        "subtitle": f"{c['name']}  ·  {c['start_date']} to {c['end_date']}",
        "description": "Everything a participating salon needs to do, step by step.",
        "sections": [
            ("How the campaign works", [
                f"Miracurl runs the '{c['name']}' customer rewards campaign across participating salons from {c['start_date']} to {c['end_date']}.",
                f"Customers who spend {_inr(c.get('min_transaction'))} or more on services at your salon earn entries; extra entries for referrals, reviews and public votes.",
                f"Miracurl selects {c.get('winner_count')} Brand Models across tiers {tiers} and funds their memberships. Winners redeem their memberships at YOUR salon.",
                "Every winner receives a shareable 'Brand Model' announcement card featuring your salon — free social-media reach for you.",
            ]),
            ("Step 1 — Accept the Participation Agreement", [
                "Open Settings → Brand Model Campaign in your Miracurl dashboard and read the agreement.",
                "Enter your full name and designation, tick 'I agree' and click Accept. A signed copy is emailed to you and stored in your account.",
                f"Key term: after the campaign closes, the salon pays Miracurl {_pct(c):g}% of its campaign-period earnings (see Agreement, Clause 4).",
            ]),
            ("Step 2 — Display the QR poster", [
                "Download the print-ready poster from Settings → Rewards → 'Download QR poster' and place it at the billing desk and mirror stations.",
                "Customers scan the QR to reach your salon's casting page (miracurl-suite.com/rewards/<your-salon>) and apply in under a minute.",
            ]),
            ("Step 3 — Bill every visit in Miracurl POS", [
                "Entries are counted ONLY from invoices recorded in Miracurl POS — bill every eligible service visit in the app.",
                "Add the customer's mobile number on every bill so their entries are credited automatically.",
                "Do not void, delete or split bills to reduce totals; the campaign is audited from POS data.",
            ]),
            ("Step 4 — Encourage applications & votes", [
                "Ask happy customers to apply with a photo of their look; share your casting page link on Instagram and WhatsApp status.",
                "Public voting boosts entries — Mira automatically nudges applicants at 10, 25 and 50 votes.",
            ]),
            ("Step 5 — Winners & Brand Model cards", [
                "After the closing date Miracurl HQ reviews entries and announces the Brand Models.",
                "You receive winner announcement cards (square + Instagram story) to post; honour the winners' memberships at your outlet as per the tier.",
            ]),
            ("Step 6 — Settlement & Trusted badge", [
                f"HQ shares your settlement: campaign-period POS earnings × {_pct(c):g}%, with a secure Razorpay payment link (UPI / cards / net-banking).",
                "Pay within 15 days of the settlement notice. A tax invoice and payment receipt are emailed automatically.",
                "Once settled, your salon earns the 'Trusted by Miracurl' badge — shown on the Miracurl home page and on your public booking page.",
            ]),
            ("Need help?", [
                f"Write to {os.environ.get('SUPPORT_REPLY_TO') or 'support@miracurl-suite.com'} or reply to any Miracurl email. Mira (in-app assistant) can answer campaign questions instantly.",
            ]),
        ],
    }


def agreement_doc(c: dict, tenant: dict, biller: dict) -> dict:
    pct = _pct(c)
    m, s = biller.get("legal_name") or "Miracurl AI Salon Suite", tenant.get("name") or tenant.get("slug") or "the Salon"
    gst = f", GSTIN {tenant['gst_number'].upper()}" if tenant.get("gst_number") else ""
    return {
        "title": "Salon Participation Agreement",
        "subtitle": f"Brand Model Campaign · {c['name']}  ·  Version {agreement_version(c)}",
        "description": f"Between {m} and {s}",
        "sections": [
            ("Parties", [
                f"(1) {m}, {biller.get('address') or 'Bengaluru, Karnataka, India'}" + (f", GSTIN {biller['gstin']}" if biller.get("gstin") else "") + " ('Miracurl'); and",
                f"(2) {s}, {tenant.get('location') or ''}{gst}, represented by its owner/authorised signatory ('the Salon').",
                "Miracurl and the Salon are each a 'Party' and together the 'Parties'. This Agreement is entered into electronically on the Acceptance Date recorded on the final page.",
            ]),
            ("1. Definitions", [
                f"1.1 'Campaign' means the '{c['name']}' customer rewards / Brand Model casting programme operated by Miracurl.",
                f"1.2 'Campaign Period' means {c['start_date']} to {c['end_date']} (both inclusive), as may be extended by Miracurl with notice in the dashboard.",
                "1.3 'Campaign Earnings' means the gross value (inclusive of taxes and before discounts already applied on the bill) of all paid invoices recorded in the Miracurl POS for the Salon during the Campaign Period, excluding voided or refunded invoices.",
                f"1.4 'Settlement Share' means {pct:g}% ({pct:g} per cent) of Campaign Earnings.",
                "1.5 'Winners' means customers selected by Miracurl as Brand Models; 'Memberships' means the Diamond / Platinum / Gold membership benefits awarded to Winners and funded by Miracurl.",
                "1.6 'Platform' means the Miracurl Suite software and websites; 'Terms' means the Miracurl Terms & Conditions, Privacy Policy and Refund Policy published at miracurl-suite.com.",
            ]),
            ("2. Miracurl's obligations", [
                "2.1 Operate the Campaign, the public casting page for the Salon, public voting and winner selection in good faith and at its own cost.",
                "2.2 Fund the Memberships awarded to Winners and issue Brand Model announcement cards featuring the Salon.",
                "2.3 Provide the printable QR poster, in-app tracking of entries, and automated customer communications (Mira).",
                "2.4 Issue a tax invoice and payment receipt for the Settlement Share and grant the 'Trusted by Miracurl' badge upon full settlement.",
            ]),
            ("3. Salon's obligations", [
                "3.1 Display the Campaign QR poster prominently during the Campaign Period and record every eligible customer bill in the Miracurl POS with the customer's mobile number.",
                "3.2 Honour the Memberships of Winners at the Salon's outlet(s) as per the tier benefits communicated by Miracurl, without additional charge to the Winner.",
                "3.3 Not void, delete, split, back-date or otherwise manipulate invoices so as to reduce Campaign Earnings; not register fictitious customers or entries.",
                "3.4 Obtain each customer's consent before submitting photos or stories and comply with the Digital Personal Data Protection Act, 2023 in handling customer data.",
                "3.5 Use Campaign creatives and the Miracurl name only as provided and not make claims on Miracurl's behalf.",
            ]),
            ("4. Settlement Share and payment", [
                f"4.1 In consideration of the Campaign, the Salon shall pay Miracurl the Settlement Share, i.e. {pct:g}% of Campaign Earnings, computed from Miracurl POS records at the end of the Campaign Period.",
                "4.2 Miracurl will issue a settlement notice in the Salon's dashboard (Miracurl Updates) and by email/WhatsApp with the computed amount and a secure Razorpay payment link.",
                "4.3 Payment is due within fifteen (15) days of the settlement notice. Payments may be made via the payment link (UPI, cards, net-banking) or as otherwise agreed in writing.",
                "4.4 Amounts not paid when due carry simple interest at 1.5% per month (or the maximum permitted by law, if lower) from the due date until payment. After 30 days of non-payment Miracurl may suspend Brand Model features, withhold the Trusted badge and/or restrict Campaign-related services after 7 days' written notice.",
                "4.5 Applicable GST, if any, is charged in addition as shown on the tax invoice. The Salon is responsible for any taxes on its own Campaign Earnings.",
                "4.6 Disputes regarding the computed amount must be raised in writing within seven (7) days of the settlement notice, failing which the amount is deemed accepted. Miracurl will review POS records and respond within 7 working days.",
            ]),
            ("5. Records and audit", [
                "5.1 Campaign Earnings are determined solely from invoices recorded in the Miracurl POS. The Salon confirms that its Miracurl POS records are true and complete.",
                "5.2 Miracurl may review POS data, entries and votes for irregularities and may disqualify entries or the Salon for breach of Clause 3.",
                "5.3 The Salon expressly authorises Miracurl, as its software service provider, to access and use aggregated billing data from the Miracurl POS (invoice dates, numbers, amounts and counts) for the sole purpose of computing, verifying and invoicing the Settlement Share. Customer personal data (names, mobile numbers) is not disclosed to Miracurl HQ for this purpose and is processed only under the Privacy Policy.",
                "5.4 Bills recorded outside the Miracurl POS during the Campaign Period, if discovered, are included in Campaign Earnings; deliberate under-recording is a material breach.",
                "5.5 Business visibility consent: for the Campaign Period and until settlement, the Salon consents that Miracurl HQ may view the Salon's Miracurl workspace (bookings, billing totals, campaign entries and settings) to set up, support and verify the Campaign. HQ access is logged in the Salon's Audit Log and never includes deleting Salon data.",
            ]),
            ("6. Trusted badge and publicity", [
                "6.1 Upon full settlement Miracurl grants the Salon a non-exclusive, revocable licence to display the 'Trusted by Miracurl' badge on the Platform pages (Miracurl home page and the Salon's booking page).",
                "6.2 Each Party grants the other a non-exclusive licence to use its name and logo solely for Campaign publicity. Winner photos are used only with the Winner's consent.",
                "6.3 Miracurl may withdraw the badge on breach of this Agreement or the Terms.",
            ]),
            ("7. Term and termination", [
                "7.1 This Agreement commences on the Acceptance Date and continues until sixty (60) days after the end of the Campaign Period or until all Settlement Share dues are paid, whichever is later.",
                "7.2 Either Party may terminate for material breach not cured within seven (7) days of written notice. Clauses 3.3, 4, 5, 8 and 9 survive termination.",
                "7.3 If the Salon withdraws before the Campaign ends, the Settlement Share remains payable on Campaign Earnings accrued up to the withdrawal date.",
            ]),
            ("8. Liability", [
                "8.1 Neither Party is liable for indirect, incidental or consequential loss. Miracurl's aggregate liability under this Agreement is limited to the Settlement Share actually received from the Salon for the Campaign.",
                "8.2 Nothing limits liability for fraud, wilful misconduct or breach of Clause 3.4.",
            ]),
            ("9. Electronic acceptance, governing law and disputes", [
                "9.1 The Salon accepts this Agreement electronically by entering the signatory's name and designation and clicking 'Accept' in the Miracurl dashboard. Such acceptance constitutes a valid and binding electronic contract under Section 10A of the Information Technology Act, 2000 and the Indian Contract Act, 1872. Miracurl records the acceptance date-time, IP address and device as evidence.",
                "9.2 This Agreement is governed by the laws of India. Courts at Bengaluru, Karnataka have exclusive jurisdiction, subject to Clause 9.3.",
                "9.3 Any dispute not resolved amicably within 30 days shall be referred to arbitration by a sole arbitrator appointed by mutual consent under the Arbitration and Conciliation Act, 1996; seat Bengaluru; language English.",
                "9.4 This Agreement, together with the Terms, is the entire agreement for the Campaign. If Miracurl changes a material term (including the Settlement Share percentage) a new version is issued and requires fresh acceptance; the version accepted by the Salon governs its Campaign.",
            ]),
        ],
    }


def _acceptance_page(c, W, H, mm, acc: dict | None, tenant: dict, biller: dict, camp: dict, logo):
    c.showPage()
    draw_watermark(c, logo, W, H, 110 * mm)
    c.setFillColorRGB(*GOLD)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(20 * mm, H - 30 * mm, "ACCEPTANCE & SIGNATURE RECORD")
    c.setStrokeColorRGB(*GOLD)
    c.line(20 * mm, H - 32 * mm, W - 20 * mm, H - 32 * mm)
    y = H - 44 * mm
    c.setFillColorRGB(*INK)
    c.setFont("Helvetica", 10)
    noun = "Restaurant" if camp.get("vertical") == "restaurant" else "Salon"
    intro = (f"The {noun} named below has read and accepted the {camp['name']} — {noun} Participation Agreement (version "
             f"{agreement_version(camp)}) electronically via the Miracurl dashboard." if acc else
             f"This copy is UNSIGNED. The {noun} accepts the Agreement in Miracurl → Settings → Campaign; the signed copy "
             "records the signatory, date-time, IP address and device.")
    for ln in textwrap.wrap(intro, 100):
        c.drawString(20 * mm, y, ln)
        y -= 5.2 * mm
    y -= 6 * mm
    when = ""
    if acc:
        try:
            when = datetime.fromisoformat(acc["accepted_at"]).astimezone(IST).strftime("%d %b %Y, %I:%M %p IST")
        except Exception:
            when = acc.get("accepted_at", "")
    rows = [
        (noun, tenant.get("name") or tenant.get("slug") or ""),
        ("Location", tenant.get("location") or "—"),
        ("GSTIN", (tenant.get("gst_number") or "—").upper()),
        ("Accepted by", f"{acc['full_name']} — {acc.get('designation') or 'Owner'}" if acc else "________________________________"),
        ("Login email", acc.get("user_email", "") if acc else "________________________________"),
        ("Date & time", when if acc else "________________________________"),
        ("IP address / device", f"{acc.get('ip') or '—'}  ·  {(acc.get('user_agent') or '')[:60]}" if acc else "________________________________"),
        ("Agreement version", agreement_version(camp)),
        ("Settlement Share", f"{_pct(camp):g}% of Campaign Earnings"),
        ("Consents", (f"Settlement Share {_pct(camp):g}% — {'AGREED' if (acc.get('consents') or {}).get('share', True) else '—'}  ·  "
                      f"HQ business visibility (Cl. 5.5) — {'AGREED' if (acc.get('consents') or {}).get('visibility') else '—'}") if acc else "☐ Settlement Share   ☐ HQ business visibility (Cl. 5.5)"),
        ("Acceptance ID", acc.get("id", "")[:8].upper() if acc else "—"),
    ]
    c.setFillColorRGB(*LIGHT)
    c.roundRect(20 * mm, y - len(rows) * 8 * mm - 4 * mm, W - 40 * mm, len(rows) * 8 * mm + 8 * mm, 3 * mm, stroke=0, fill=1)
    yy = y
    for k, v in rows:
        c.setFillColorRGB(*GREY)
        c.setFont("Helvetica", 8.5)
        c.drawString(25 * mm, yy, k.upper())
        c.setFillColorRGB(*INK)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(72 * mm, yy, str(v))
        yy -= 8 * mm
    y = yy - 20 * mm
    c.setFillColorRGB(*INK)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(20 * mm, y, f"For {biller.get('legal_name') or 'Miracurl AI Salon Suite'}")
    c.drawString(W / 2 + 10 * mm, y, f"For {tenant.get('name') or 'the ' + noun}")
    c.setFont("Helvetica", 8.5)
    c.setFillColorRGB(*GREY)
    c.drawString(20 * mm, y - 5 * mm, biller.get("signatory") or "Authorised Signatory")
    c.drawString(W / 2 + 10 * mm, y - 5 * mm, (f"{acc['full_name']} (e-signed)" if acc else "Owner / Authorised Signatory"))
    if acc:
        c.setFillColorRGB(0.13, 0.6, 0.35)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(W / 2 + 10 * mm, y - 10.5 * mm, "ELECTRONICALLY ACCEPTED — IT Act 2000, s.10A")
    draw_powered_footer(c, W, mm, logo, [
        "Electronic record maintained by Miracurl Suite. Tampering with this record is an offence under the Information Technology Act, 2000.",
        f"Verify: {_app_url()}/terms  ·  Support: {os.environ.get('SUPPORT_REPLY_TO') or 'support@miracurl-suite.com'}"])


def _verticalise(doc: dict, camp: dict) -> dict:
    """Restaurant campaign: same legal skeleton, restaurant wording (Salon→Restaurant, Brand Model→Taste Ambassador)."""
    if camp.get("vertical") != "restaurant":
        return doc
    rep = [("Brand Model", "Taste Ambassador"), ("Salon", "Restaurant"), ("salon", "restaurant"), ("service visit", "dining visit"),
           ("services at your", "dining at your"), ("Beauty & physical well-being services", "Restaurant services"), ("mirror stations", "tables")]

    def fix(v):
        if isinstance(v, str):
            for a, b in rep:
                v = v.replace(a, b)
            return v
        if isinstance(v, list):
            return [fix(x) for x in v]
        if isinstance(v, tuple):
            return tuple(fix(x) for x in v)
        return v
    return {k: fix(v) for k, v in doc.items()}


def build_agreement_pdf(camp: dict, tenant: dict, biller: dict, acc: dict | None, logo: bytes | None) -> bytes:
    import io
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as rl_canvas

    doc = _verticalise(agreement_doc(camp, tenant, biller), camp)
    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    _pdf_doc_header(c, doc, W, H, mm, logo)
    _pdf_doc_sections(c, doc, W, H, mm)
    _acceptance_page(c, W, H, mm, acc, tenant, biller, camp, logo)
    c.save()
    return buf.getvalue()


def build_guide_pdf(camp: dict, logo: bytes | None) -> bytes:
    return _doc_pdf(_verticalise(guide_doc(camp), camp), logo=logo)


async def doc_pack_attachments(camp: dict, tenant: dict, acc: dict | None) -> list:
    from services.subscription_invoice import get_biller
    logo = await platform_logo_bytes()
    biller = await get_biller()
    b64 = lambda b: base64.b64encode(b).decode()
    return [
        {"filename": "Miracurl-Brand-Model-Campaign-Guide.pdf", "content": b64(build_guide_pdf(camp, logo))},
        {"filename": f"Miracurl-Participation-Agreement{'-SIGNED' if acc else ''}.pdf", "content": b64(build_agreement_pdf(camp, tenant, biller, acc, logo))},
        {"filename": "Miracurl-Terms-and-Conditions.pdf", "content": b64(_doc_pdf(DOCS["terms_conditions"], logo=logo))},
    ]


def _pack_html(camp: dict, tenant: dict, acc: dict | None) -> str:
    e = html_lib.escape
    pct = _pct(camp)
    status = (f"<div style='background:#eefaf1;border:1px solid #bfe3c8;border-radius:12px;padding:12px 16px;font-size:13px;color:#1f5c33'>"
              f"✅ <b>Agreement accepted</b> by {e(acc['full_name'])} on {e(acc['accepted_at'][:10])}. Your signed copy is attached.</div>"
              if acc else
              "<div style='background:#fff7e6;border:1px solid #f1d59b;border-radius:12px;padding:12px 16px;font-size:13px;color:#7a5410'>"
              "✍️ <b>Action needed:</b> please review and accept the Participation Agreement in your dashboard → <b>Settings → Brand Model Campaign</b>. "
              "It takes one minute — enter your name, tick 'I agree' and click Accept.</div>")
    return f"""
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#fdfbf7;border:1px solid #eee;border-radius:16px;overflow:hidden">
      <div style="background:#1c1c22;padding:24px 28px"><div style="color:#d4af37;font-size:21px;font-weight:bold">Miracurl ✦ Brand Model</div>
      <div style="color:#999;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:4px">Campaign documents · {e(tenant.get('name') or '')}</div></div>
      <div style="padding:24px 28px;color:#333;font-size:14px;line-height:1.7">
        <p>Namaste <b>{e(tenant.get('name') or 'Partner')}</b> 👋</p>
        <p>Here is everything you need for <b>{e(camp['name'])}</b> ({e(camp['start_date'])} → {e(camp['end_date'])}):</p>
        <ol style="padding-left:18px;font-size:13px">
          <li><b>Campaign Guide</b> — the 6 steps, from poster to payout</li>
          <li><b>Participation Agreement</b> — the legal terms, including the <b>{pct:g}% settlement share</b> of campaign-period earnings after the campaign</li>
          <li><b>Terms &amp; Conditions</b> — Miracurl platform terms</li>
        </ol>
        {status}
        <p style="font-size:12px;color:#888;margin-top:16px">Questions? Reply to this email — Mira and the Miracurl team are happy to help.</p>
      </div></div>"""


async def email_doc_pack(camp: dict, tenant: dict, acc: dict | None, to: list[str], *, subject: str | None = None, hq_copy: bool = True) -> dict:
    atts = await doc_pack_attachments(camp, tenant, acc)
    subj = subject or (f"✅ Signed: Brand Model Participation Agreement — {tenant.get('name')}" if acc
                       else f"📄 Your Brand Model campaign pack — please accept the agreement ({tenant.get('name')})")
    res = await _send_email(to, subj, _pack_html(camp, tenant, acc), attachments=atts,
                            book_url=f"{_app_url()}/settings#campaign-agreement", book_label="Open Settings ✦")
    if hq_copy:
        await _send_email(list(dict.fromkeys(hq_notify_emails("billing") + hq_notify_emails("admin"))),
                          f"[HQ copy] {subj}", _pack_html(camp, tenant, acc), attachments=atts)
    return res


async def get_acceptance(tenant_id: str, campaign_id: str) -> dict | None:
    return await _raw_db.rewards_agreements.find_one({"tenant_id": tenant_id, "campaign_id": campaign_id}, {"_id": 0}, sort=[("accepted_at", -1)])
