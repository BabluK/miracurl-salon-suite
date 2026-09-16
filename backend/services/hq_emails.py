"""Branded HQ → salon-owner notice emails (campaign live / setup call / credits) — luxe dark-gold template."""
import html as html_lib
import os
from datetime import datetime

IST_LABEL = "IST"


def app_url() -> str:
    return os.environ.get("APP_PUBLIC_URL", "").rstrip("/")


def fmt_when(iso: str) -> str:
    """'2026-10-15T19:11' → 'Thursday, 15 Oct 2026 · 7:11 PM IST'."""
    try:
        d = datetime.fromisoformat(iso.replace("Z", ""))
        return d.strftime("%A, %d %b %Y · %I:%M %p").replace(" 0", " ").replace("·  ", "· ") + f" {IST_LABEL}"
    except Exception:  # noqa: BLE001
        return iso


def owner_notice_html(*, salon: str, eyebrow: str, title: str, intro: str, bullets: list[str] | None = None,
                      cta_label: str, cta_path: str, hero: str | None = None, closing: str = "— Team Miracurl",
                      tone: str = "gold") -> str:
    e = html_lib.escape
    hero_html = (f'<img src="{app_url()}/assets/email/{hero}" alt="" width="560" style="display:block;width:100%;height:auto;border:0">'
                 if hero else "")
    accent = {"gold": "#e8c37f", "amber": "#f5b544", "red": "#ff8a80"}.get(tone, "#e8c37f")
    steps = "".join(
        f'<tr><td style="width:30px;vertical-align:top;padding:7px 0;color:{accent};font-weight:bold;font-size:15px">{i + 1}</td>'
        f'<td style="padding:7px 0;color:#3a3a42;font-size:14px;line-height:1.6">{b}</td></tr>' for i, b in enumerate(bullets or []))
    return f"""
<div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;background:#fffdf9;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(20,18,12,.12)">
  <div style="background:#0f0f14;position:relative">
    {hero_html}
    <div style="padding:{'18px' if hero else '30px'} 32px 28px;text-align:center">
      <div style="color:{accent};font-size:11px;letter-spacing:4px;text-transform:uppercase">{e(eyebrow)}</div>
      <div style="color:#f4f1e8;font-size:26px;line-height:1.25;margin-top:10px">{title}</div>
      <div style="color:#b9b2a3;font-size:13px;margin-top:8px">{e(salon)}</div>
    </div>
  </div>
  <div style="padding:28px 34px 30px;color:#3a3a42;font-size:15px;line-height:1.75">
    <p style="margin:0 0 14px">{intro}</p>
    {f'<table cellpadding="0" cellspacing="0" style="width:100%;margin:6px 0 14px">{steps}</table>' if steps else ''}
    <p style="text-align:center;margin:22px 0 6px">
      <a href="{app_url()}{cta_path}" style="display:inline-block;background:linear-gradient(90deg,#e8c56a,#c99a2e);color:#1a1408;font-weight:bold;text-decoration:none;padding:14px 34px;border-radius:999px;font-size:14px;letter-spacing:.4px">{e(cta_label)}</a>
    </p>
    <p style="font-size:13px;color:#7d7668;margin:18px 0 0">{e(closing)}</p>
  </div>
</div>"""


def campaign_live_email(t: dict, c: dict) -> tuple[str, str]:
    name = t.get("name") or "your salon"
    subject = f"🎉 Congratulations {name} — {c['name']} is LIVE!"
    html = owner_notice_html(
        salon=name, eyebrow="Congratulations", hero="campaign-live.jpg",
        title=f"Your <span style='color:#e8c37f'>{html_lib.escape(c['name'])}</span> campaign is live",
        intro=(f"Namaste {html_lib.escape(name)} 👋 Miracurl HQ has completed your setup and switched the campaign on. "
               f"From today, every guest who spends ₹{int(c.get('min_transaction') or 0):,}+ in one bill can apply to become your Brand Model."),
        bullets=["Download your <b>QR poster</b> from Settings → Brand Model Campaign and place it at the billing counter",
                 "Brief your team: <b>scan after billing</b>, remind guests to refer friends and share their look",
                 "Watch entries grow live on your Dashboard — Top-10 winners are showcased on Miracurl",
                 f"Campaign period: <b>{c.get('start_date')}</b> → <b>{c.get('end_date')}</b>"],
        cta_label="Open my campaign ✦", cta_path="/settings#campaign-agreement",
        closing="We can't wait to see your Brand Models shine. — Team Miracurl HQ")
    return subject, html


def setup_call_email(t: dict, c: dict, call_at: str) -> tuple[str, str]:
    name = t.get("name") or "your salon"
    when = fmt_when(call_at)
    subject = f"📞 {c['name']}: your setup call — {when}"
    html = owner_notice_html(
        salon=name, eyebrow="Setup call scheduled",
        title=f"We'll call you on<br><span style='color:#e8c37f'>{html_lib.escape(when)}</span>",
        intro=f"Namaste {html_lib.escape(name)} 👋 Your Brand Model campaign setup call with Miracurl HQ is booked. In about 15 minutes we'll get you fully ready to launch:",
        bullets=["Where to place the <b>QR poster</b> and how guests apply", "How <b>entries</b> are counted from your POS bills, referrals & reviews",
                 "Briefing your stylists in two minutes", "Answering any question on the agreement or settlement"],
        cta_label="View campaign status ✦", cta_path="/settings#campaign-agreement",
        closing="Need a different time? Reply to this email. — Team Miracurl HQ")
    return subject, html


def wa_credits_exhausted_email(t: dict) -> tuple[str, str]:
    name = t.get("name") or "your salon"
    subject = f"⚠️ {name}: WhatsApp credits are over — Mira has paused replies"
    html = owner_notice_html(
        salon=name, eyebrow="Action needed", tone="amber",
        title="Mira has paused <span style='color:#f5b544'>WhatsApp</span> auto-replies",
        intro=f"Namaste {html_lib.escape(name)} 👋 A customer just messaged you on WhatsApp, but Mira couldn't reply because your WhatsApp credit balance is <b>0</b>. Until you top up, WhatsApp enquiries and bookings will wait for a human.",
        bullets=["Open <b>Settings → Message credits → WhatsApp</b>", "Pick a pack (from ₹299 for 250 replies) and pay via Razorpay",
                 "Mira resumes answering and booking automatically within seconds"],
        cta_label="Top up WhatsApp credits ✦", cta_path="/settings",
        closing="Tip: the Dashboard warns you when credits drop under 20. — Team Miracurl")
    return subject, html
