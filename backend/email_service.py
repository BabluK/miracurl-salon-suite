"""Email delivery (Resend) + HTML templates for Miracurl transactional mail."""
import asyncio
import html as html_lib
import logging
import os
from urllib.parse import quote

# Default banner art (AI-generated, hosted on Emergent CDN) — env vars override.
_IMG_BASE = "https://static.prod-images.emergentagent.com/jobs/8d58114b-7738-444d-a4a6-c58e9aa75e05/images"
DEFAULT_WELCOME_IMAGE = f"{_IMG_BASE}/d7946ff142f21cc316f0fe02df6fbae156c88cb6a8d04c2b4977b9aa72f665ab.png"
DEFAULT_MONTHLY_IMAGE = f"{_IMG_BASE}/9c02e11fae1a50a02cdaf0b705f3055c472d92ae26ef59182584566d0cf10f27.png"
DEFAULT_WEEKLY_IMAGE = f"{_IMG_BASE}/75b0ac704a7cf3e1d5dd8787d16566485a3bd3007f4e3f2128874e46dcd0bd1e.png"
DEFAULT_BIRTHDAY_IMAGE = f"{_IMG_BASE}/f565f36e70da377dab4e70c377842044c3474a2dbb0e85fa040ee4abb328157e.png"

import resend


def marketing_email_html(salon: str, body_text: str, cta_url: str, cta_label: str = "Book your visit ✦") -> str:
    """Branded luxe template for Mira marketing/campaign emails (matches onboarding style)."""
    paras = "".join(f'<p style="font-size:14px;color:#333;line-height:1.75;margin:0 0 14px">{html_lib.escape(p)}</p>'
                    for p in body_text.split("\n") if p.strip())
    return f"""
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#fdfbf7;border:1px solid #eee;border-radius:16px;overflow:hidden">
      <div style="background:#1c1c22;padding:26px 30px">
        <span style="color:#e8c37f;font-size:21px;letter-spacing:1.5px">{html_lib.escape(salon)}</span>
        <div style="color:#8a8a92;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin-top:4px">Beauty · Care · You</div>
      </div>
      <div style="padding:30px">{paras}
        <a href="{cta_url}" style="display:inline-block;margin-top:10px;background:#1c1c22;color:#e8c37f;text-decoration:none;padding:13px 28px;border-radius:10px;font-size:14px;letter-spacing:0.5px">{cta_label}</a>
        <p style="font-size:11px;color:#999;margin-top:26px;border-top:1px solid #eee;padding-top:14px">
          You're receiving this because you're a valued guest of {html_lib.escape(salon)}. Reply STOP to opt out.</p>
      </div>
    </div>"""


def _brand_footer(book_url: str | None = None, book_label: str = "Book Now ✦",
                  suite_label: str = "Salon & Restaurant Management Suite") -> str:
    """Branded footer appended to every outgoing email (Powered by Miracurl + CTA)."""
    url = book_url or "https://miracurl-suite.com"
    return f"""
    <div style="max-width:560px;margin:18px auto 0;text-align:center;font-family:Georgia,serif">
      <a href="{url}" style="display:inline-block;background:#1c1c22;color:#e8c37f;text-decoration:none;padding:11px 28px;border-radius:999px;font-size:13px;letter-spacing:0.6px">{book_label}</a>
      <p style="font-size:11px;color:#9a9aa2;margin:12px 0 0;letter-spacing:0.4px">
        Powered by <a href="https://miracurl-suite.com" style="color:#b08d3f;text-decoration:none;font-weight:bold">Miracurl</a> · {suite_label}</p>
    </div>"""


def _resend_config_error() -> dict | None:
    if not os.environ.get("RESEND_API_KEY"):
        return {"sent": False, "error": "Email not configured (RESEND_API_KEY missing)"}
    if not os.environ.get("SENDER_EMAIL"):
        return {"sent": False, "error": "Email not configured (SENDER_EMAIL missing — set it to an address on your verified Resend domain, e.g. noreply@miracurl-suite.com)"}
    return None


def _resend_params(to: list, subject: str, html: str, opts: dict) -> dict:
    params = {
        "from": f"{opts['from_name']} <{os.environ['SENDER_EMAIL']}>",
        "to": to, "subject": subject,
        "html": html + _brand_footer(opts["book_url"], opts["book_label"],
                                     opts.get("suite_label") or "Salon & Restaurant Management Suite"),
    }
    if opts["headers"]:
        params["headers"] = opts["headers"]
    reply_to = opts["reply_to"] or os.environ.get("SUPPORT_REPLY_TO")
    if reply_to:
        params["reply_to"] = [reply_to]
    if opts["attachments"]:
        params["attachments"] = opts["attachments"]
    return params


_EMAIL_OPTION_KEYS = frozenset(
    {"attachments", "reply_to", "book_url", "book_label", "headers", "from_name", "suite_label"})


async def _send_email(to: list, subject: str, html: str, **options) -> dict:
    """Send via Resend. Options: attachments, reply_to, book_url, book_label, headers, from_name."""
    unknown = set(options) - _EMAIL_OPTION_KEYS
    if unknown:
        raise TypeError(f"_send_email got unexpected options: {sorted(unknown)}")
    err = _resend_config_error()
    if err:
        return err
    resend.api_key = os.environ["RESEND_API_KEY"]
    params = _resend_params(to, subject, html, {
        "attachments": options.get("attachments"), "reply_to": options.get("reply_to"),
        "book_url": options.get("book_url"), "book_label": options.get("book_label", "Book Now ✦"),
        "headers": options.get("headers"), "from_name": options.get("from_name", "Miracurl"),
        "suite_label": options.get("suite_label")})
    try:
        r = await asyncio.to_thread(resend.Emails.send, params)
        return {"sent": True, "id": (r or {}).get("id")}
    except Exception as e:
        logging.getLogger("email").error(f"resend send failed: {e}")
        return {"sent": False, "error": str(e)[:300]}


def _welcome_poster_row(poster_url: str) -> str:
    if not poster_url:
        return ""
    return (f'<img src="{poster_url}" alt="Welcome to Miracurl" width="560" '
            f'style="display:block;width:100%;border-radius:0"/>')


def salon_welcome_email_html(salon_name: str, owner_name: str, owner_email: str,
                             password: str, trial_end: str, poster_url: str = "") -> str:
    """Warm onboarding email with login credentials — salon vertical."""
    salon_name, owner_name, owner_email, password = (
        html_lib.escape(salon_name or "your salon"), html_lib.escape(owner_name or "there"),
        html_lib.escape(owner_email or ""), html_lib.escape(password or ""))
    login_url = f"{os.environ.get('APP_PUBLIC_URL', 'https://miracurl-suite.com')}/login"
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    return f"""
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#fdfbf7;border:1px solid #eee;border-radius:16px;overflow:hidden">
      {_welcome_poster_row(poster_url)}
      <div style="background:#1c1c22;padding:26px 30px">
        <div style="color:#d4af37;font-size:22px;font-weight:bold">Miracurl ✦ Salon Suite</div>
        <div style="color:#999;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:4px">Welcome aboard — your salon is live</div>
      </div>
      <div style="padding:28px 30px;color:#333">
        <p>Namaste <b>{owner_name}</b> 🎉</p>
        <p style="line-height:1.7">A very warm welcome to the Miracurl family! <b>{salon_name}</b> is now set up with
          online bookings, POS billing, staff management and Mira AI — everything you need to run a beautiful, busy salon with ease.</p>
        <p style="line-height:1.7">Your <b>free trial</b> runs until <b>{html_lib.escape(trial_end or "")}</b>. Here are your login details:</p>
        <div style="background:#faf6ec;border:1px solid #eadfc0;border-radius:12px;padding:16px 20px;margin:18px 0;font-size:15px">
          👤 <b>Login email:</b> {owner_email}<br/><br/>
          🔑 <b>Password:</b> <span style="font-family:monospace;background:#fff;border:1px dashed #d4af37;padding:3px 12px;border-radius:8px;font-weight:bold;color:#8a6d1f">{password}</span>
        </div>
        <p style="text-align:center;margin:24px 0">
          <a href="{login_url}" style="background:linear-gradient(135deg,#d4af37,#e6c66e);color:#17171f;text-decoration:none;padding:13px 38px;border-radius:999px;font-weight:bold">💇 &nbsp;Open your dashboard&nbsp; →</a>
        </p>
        <div style="background:#f4f8f4;border:1px solid #d4e6d4;border-radius:12px;padding:16px 20px;font-size:13px;font-family:Arial,sans-serif;line-height:2">
          <b style="font-size:14px">🚀 Get glowing in 4 quick steps</b><br/>
          1️⃣ &nbsp;<b>Services</b> — add your service menu, or one-tap import our presets<br/>
          2️⃣ &nbsp;<b>Staff</b> — add your stylists so appointments &amp; commissions flow<br/>
          3️⃣ &nbsp;<b>Booking QR</b> — print your booking poster so clients book online 24×7<br/>
          4️⃣ &nbsp;<b>POS / Billing</b> — bill services, products &amp; memberships in seconds
        </div>
        <p style="font-size:12px;color:#888;margin-top:20px">Keep this email safe — it contains your login details. Need a hand getting set up? Just reply to this email or write to {hq_email}. We're thrilled to have you! ✨</p>
      </div>
    </div>"""


def restaurant_welcome_email_html(restaurant_name: str, owner_name: str, owner_email: str,
                                  password: str, trial_end: str, poster_url: str = "") -> str:
    """Warm onboarding email with login credentials — restaurant vertical only."""
    restaurant_name, owner_name, owner_email, password = (
        html_lib.escape(restaurant_name or "your restaurant"), html_lib.escape(owner_name or "there"),
        html_lib.escape(owner_email or ""), html_lib.escape(password or ""))
    login_url = f"{os.environ.get('APP_PUBLIC_URL', 'https://miracurl-suite.com')}/login"
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    return f"""
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#fdfbf7;border:1px solid #eee;border-radius:16px;overflow:hidden">
      {_welcome_poster_row(poster_url)}
      <div style="background:#1c1c22;padding:26px 30px">
        <div style="color:#d4af37;font-size:22px;font-weight:bold">Miracurl ✦ Restaurant Suite</div>
        <div style="color:#999;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:4px">Welcome aboard — your restaurant is live</div>
      </div>
      <div style="padding:28px 30px;color:#333">
        <p>Namaste <b>{owner_name}</b> 🎉</p>
        <p style="line-height:1.7">A very warm welcome to the Miracurl family! <b>{restaurant_name}</b> is now set up with
          QR table ordering, live kitchen tickets, POS billing and Mira AI — everything you need to run a busy floor with ease.</p>
        <p style="line-height:1.7">Your <b>first month is on us</b> — free trial until <b>{html_lib.escape(trial_end or "")}</b>. Here are your login details:</p>
        <div style="background:#faf6ec;border:1px solid #eadfc0;border-radius:12px;padding:16px 20px;margin:18px 0;font-size:15px">
          👤 <b>Login email:</b> {owner_email}<br/><br/>
          🔑 <b>Password:</b> <span style="font-family:monospace;background:#fff;border:1px dashed #d4af37;padding:3px 12px;border-radius:8px;font-weight:bold;color:#8a6d1f">{password}</span>
        </div>
        <p style="text-align:center;margin:24px 0">
          <a href="{login_url}" style="background:linear-gradient(135deg,#d4af37,#e6c66e);color:#17171f;text-decoration:none;padding:13px 38px;border-radius:999px;font-weight:bold">🍽️ &nbsp;Open your dashboard&nbsp; →</a>
        </p>
        <div style="background:#f4f8f4;border:1px solid #d4e6d4;border-radius:12px;padding:16px 20px;font-size:13px;font-family:Arial,sans-serif;line-height:2">
          <b style="font-size:14px">🚀 Get serving in 4 quick steps</b><br/>
          1️⃣ &nbsp;<b>Menu</b> — add your dishes, or one-tap import our Starters menu<br/>
          2️⃣ &nbsp;<b>Table QR codes</b> — print table tents from Kitchen → Table QR codes<br/>
          3️⃣ &nbsp;<b>Kitchen</b> — diners scan &amp; order, tickets appear live with a chime<br/>
          4️⃣ &nbsp;<b>POS / Orders</b> — merge table orders into one bill and collect payment
        </div>
        <p style="font-size:12px;color:#888;margin-top:20px">Keep this email safe — it contains your login details. Need a hand getting set up? Just reply to this email or write to {hq_email}. We're thrilled to have you! 🥂</p>
      </div>
    </div>"""


def _credentials_email_html(salon_name: str, owner_email: str, temp_pw: str) -> str:
    salon_name, owner_email, temp_pw = (html_lib.escape(salon_name or ""),
                                        html_lib.escape(owner_email or ""),
                                        html_lib.escape(temp_pw or ""))
    login_url = f"{os.environ.get('APP_PUBLIC_URL', 'https://miracurl-suite.com')}/login"
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    return f"""
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#fdfbf7;border:1px solid #eee;border-radius:16px;overflow:hidden">
      <div style="background:#1c1c22;padding:26px 30px">
        <div style="color:#d4af37;font-size:22px;font-weight:bold">Miracurl ✦ Salon Suite</div>
        <div style="color:#999;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:4px">Updated login credentials</div>
      </div>
      <div style="padding:28px 30px;color:#333">
        <p>Hello,</p>
        <p>Your login credentials for <b>{salon_name}</b> were reset by Miracurl HQ. Use these to sign in — you'll be asked to set a new password on first login.</p>
        <div style="background:#faf6ec;border:1px solid #eadfc0;border-radius:12px;padding:16px 20px;margin:18px 0;font-size:15px">
          👤 <b>Login email:</b> {owner_email}<br/><br/>
          🔑 <b>Temp password:</b> <span style="font-family:monospace;background:#fff;border:1px dashed #d4af37;padding:3px 12px;border-radius:8px;font-weight:bold;color:#8a6d1f">{temp_pw}</span>
        </div>
        <p style="text-align:center;margin:24px 0">
          <a href="{login_url}" style="background:#1c1c22;color:#d4af37;text-decoration:none;padding:12px 34px;border-radius:999px;font-weight:bold">Log in now →</a>
        </p>
        <p style="font-size:12px;color:#888">If you did not request this change, contact Miracurl HQ immediately at {hq_email}.</p>
      </div>
    </div>"""


def staff_welcome_email_html(staff_name: str, salon_name: str, login_email: str, temp_pw: str,
                             role_label: str = "staff") -> str:
    staff_name, salon_name, login_email, temp_pw = (html_lib.escape(staff_name or "there"),
                                                    html_lib.escape(salon_name or "your salon"),
                                                    html_lib.escape(login_email or ""),
                                                    html_lib.escape(temp_pw or ""))
    login_url = f"{os.environ.get('APP_PUBLIC_URL', 'https://miracurl-suite.com')}/login"
    return f"""
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#fdfbf7;border:1px solid #eee;border-radius:16px;overflow:hidden">
      <div style="background:#1c1c22;padding:26px 30px">
        <div style="color:#d4af37;font-size:22px;font-weight:bold">Miracurl ✦ Salon Suite</div>
        <div style="color:#999;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:4px">Your {html_lib.escape(role_label)} login is ready</div>
      </div>
      <div style="padding:28px 30px;color:#333">
        <p>Hi <b>{staff_name}</b> 👋</p>
        <p><b>{salon_name}</b> has created your Miracurl {html_lib.escape(role_label)} account. Use the one-time password below to sign in — you'll set your own password on first login.</p>
        <div style="background:#faf6ec;border:1px solid #eadfc0;border-radius:12px;padding:16px 20px;margin:18px 0;font-size:15px">
          👤 <b>Login email:</b> {login_email}<br/><br/>
          🔑 <b>One-time password:</b> <span style="font-family:monospace;background:#fff;border:1px dashed #d4af37;padding:3px 12px;border-radius:8px;font-weight:bold;color:#8a6d1f">{temp_pw}</span>
        </div>
        <p style="text-align:center;margin:24px 0">
          <a href="{login_url}" style="background:#1c1c22;color:#d4af37;text-decoration:none;padding:12px 34px;border-radius:999px;font-weight:bold">Log in &amp; set your password →</a>
        </p>
        <p style="font-size:12px;color:#888">In the app you can mark attendance, see your appointments, salary slips and more. If you weren't expecting this email, please tell your salon owner.</p>
      </div>
    </div>"""


def renewal_reminder_email_html(salon_name: str, days_left: int, end_date: str,
                                plan_label: str, price: float, credits: float) -> str:
    """15/7/1-day subscription renewal reminder with in-app Razorpay pay CTA."""
    renew_url = f"{os.environ.get('APP_PUBLIC_URL', 'https://miracurl-suite.com')}/settings"
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    when = "ends <b>tomorrow</b>" if days_left == 1 else f"ends in <b>{days_left} days</b>"
    credit_row = (f'<p style="margin:12px 0 0;font-size:13px;color:#1f7a4d;font-family:Arial,sans-serif">'
                  f'🎁 You have <b>₹{credits:,.0f}</b> referral credits — they\'ll be auto-applied as a discount at checkout.</p>') if credits > 0 else ""
    price_row = f' · ₹{price:,.0f}' if price else ""
    return f"""
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#fdfbf7;border:1px solid #eee;border-radius:16px;overflow:hidden">
      <div style="background:#1c1c22;padding:26px 30px">
        <div style="color:#d4af37;font-size:22px;font-weight:bold">Miracurl ✦ Salon Suite</div>
        <div style="color:#999;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:4px">Subscription renewal reminder</div>
      </div>
      <div style="padding:28px 30px;color:#333">
        <p style="font-family:Arial,sans-serif;font-size:14px">Namaste <b>{html_lib.escape(salon_name)}</b>,</p>
        <p style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7">
          A friendly heads-up — your Miracurl subscription {when} (on <b>{end_date}</b>).
          Renew now so your bookings, billing and Mira AI keep running without a pause.</p>
        <div style="background:#faf6ec;border:1px solid #eadfc0;border-radius:12px;padding:16px 20px;margin:18px 0;font-size:14px;font-family:Arial,sans-serif">
          📋 <b>Current plan:</b> {html_lib.escape(plan_label)}{price_row}<br/><br/>
          📅 <b>Valid till:</b> {end_date}
        </div>
        {credit_row}
        <p style="text-align:center;margin:24px 0">
          <a href="{renew_url}" style="background:linear-gradient(135deg,#d4af37,#e6c66e);color:#17171f;text-decoration:none;padding:13px 38px;border-radius:999px;font-weight:bold;font-family:Arial,sans-serif;font-size:14px">✦ &nbsp;Renew now — pay via UPI / card&nbsp; ✦</a>
        </p>
        <p style="font-size:12px;color:#888;text-align:center;font-family:Arial,sans-serif">Log in → Settings → Subscription → Pay securely via Razorpay.</p>
        <p style="font-size:12px;color:#888;font-family:Arial,sans-serif;border-top:1px solid #eee;padding-top:14px;margin-top:22px">
          Facing an issue or need more time? Just reply to this email or write to {hq_email} — we're happy to help.</p>
      </div>
    </div>"""


def renewal_reminder_email_intl_html(salon_name: str, days_left: int, end_date: str,
                                     plan_label: str, price_usd: float, pay_url: str) -> str:
    """USD renewal reminder with a one-click Stripe pay link (international salons)."""
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    demo_url = f"{os.environ.get('APP_PUBLIC_URL', 'https://miracurl-suite.com')}/demo"
    when = "ends <b>tomorrow</b>" if days_left == 1 else f"ends in <b>{days_left} days</b>"
    price_row = f' · ${price_usd:,.0f}' if price_usd else ""
    btn_label = f"💳 &nbsp;Pay ${price_usd:,.0f} &amp; Activate — one click&nbsp; ✦" if price_usd else "💳 &nbsp;Renew now — one click&nbsp; ✦"
    return f"""
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#fdfbf7;border:1px solid #eee;border-radius:16px;overflow:hidden">
      <div style="background:#1c1c22;padding:26px 30px">
        <div style="color:#d4af37;font-size:22px;font-weight:bold">Miracurl ✦ Salon Suite</div>
        <div style="color:#999;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:4px">Subscription renewal reminder</div>
      </div>
      <div style="padding:28px 30px;color:#333">
        <p style="font-family:Arial,sans-serif;font-size:14px">Hello <b>{html_lib.escape(salon_name)}</b>,</p>
        <p style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7">
          A friendly heads-up — your Miracurl subscription {when} (on <b>{end_date}</b>).
          Renew now so your bookings, billing and Mira AI keep running without a pause.</p>
        <div style="background:#faf6ec;border:1px solid #eadfc0;border-radius:12px;padding:16px 20px;margin:18px 0;font-size:14px;font-family:Arial,sans-serif">
          📋 <b>Your plan:</b> {html_lib.escape(plan_label)}{price_row}<br/><br/>
          📅 <b>Valid till:</b> {end_date}
        </div>
        <p style="text-align:center;margin:24px 0">
          <a href="{pay_url}" style="background:linear-gradient(135deg,#d4af37,#e6c66e);color:#17171f;text-decoration:none;padding:13px 38px;border-radius:999px;font-weight:bold;font-family:Arial,sans-serif;font-size:14px">{btn_label}</a>
        </p>
        <p style="font-size:12px;color:#888;text-align:center;font-family:Arial,sans-serif">One secure Stripe checkout — billed in USD, any international card accepted. Your plan activates instantly.</p>
        <div style="margin:20px 0 4px;background:#f6f4fb;border:1px dashed #c8bde3;border-radius:12px;padding:16px 20px;text-align:center;font-family:Arial,sans-serif">
          <p style="margin:0;font-size:13px;color:#4a3f63;line-height:1.6">Not sure yet? Grab a free <b>live 1-on-1 demo</b> — we'll walk you through bookings, billing and Mira AI for your salon.</p>
          <a href="{demo_url}" style="display:inline-block;margin-top:10px;background:#1c1c22;color:#e8c37f;text-decoration:none;padding:10px 26px;border-radius:999px;font-size:13px;font-weight:bold">📅 &nbsp;Book a live demo&nbsp;</a>
        </div>
        <p style="font-size:12px;color:#888;font-family:Arial,sans-serif;border-top:1px solid #eee;padding-top:14px;margin-top:22px">
          Prefer a different plan or need help? Just reply to this email or write to {hq_email} — we're happy to assist.</p>
      </div>
    </div>"""


def restaurant_trial_reminder_email_html(restaurant_name: str, days_left: int, end_date: str,
                                         source: str, credits: float) -> str:
    """Friendly trial/renewal reminder — restaurant vertical only."""
    renew_url = f"{os.environ.get('APP_PUBLIC_URL', 'https://miracurl-suite.com')}/settings"
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    ending = "free month ends" if source == "trial" else "subscription ends"
    when = f"{ending} <b>tomorrow</b>" if days_left == 1 else f"{ending} in <b>{days_left} days</b>"
    credit_row = (f'<p style="margin:12px 0 0;font-size:13px;color:#1f7a4d;font-family:Arial,sans-serif">'
                  f'🎁 You have <b>₹{credits:,.0f}</b> referral credits — auto-applied as a discount at checkout.</p>') if credits > 0 else ""
    return f"""
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#fdfbf7;border:1px solid #eee;border-radius:16px;overflow:hidden">
      <div style="background:#1c1c22;padding:26px 30px">
        <div style="color:#d4af37;font-size:22px;font-weight:bold">Miracurl ✦ Restaurant Suite</div>
        <div style="color:#999;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:4px">{"Your free month is ending soon" if source == "trial" else "Subscription renewal reminder"}</div>
      </div>
      <div style="padding:28px 30px;color:#333">
        <p style="font-family:Arial,sans-serif;font-size:14px">Namaste <b>{html_lib.escape(restaurant_name)}</b> 👋</p>
        <p style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7">
          We hope your tables have been buzzing! A friendly heads-up — your {when} (on <b>{end_date}</b>).
          Renew now so QR ordering, kitchen tickets, POS billing and Mira AI keep serving without a pause.</p>
        <div style="background:#faf6ec;border:1px solid #eadfc0;border-radius:12px;padding:16px 20px;margin:18px 0;font-size:14px;font-family:Arial,sans-serif;line-height:2">
          🍽️ <b>Restaurant plans</b><br/>
          · 3-Month — <b>₹3,000</b><br/>
          · 6-Month — <b>₹6,000</b><br/>
          · Annual — <b>₹12,000</b> <span style="color:#1f7a4d;font-size:12px">(best value)</span>
        </div>
        {credit_row}
        <p style="text-align:center;margin:24px 0">
          <a href="{renew_url}" style="background:linear-gradient(135deg,#d4af37,#e6c66e);color:#17171f;text-decoration:none;padding:13px 38px;border-radius:999px;font-weight:bold;font-family:Arial,sans-serif;font-size:14px">✦ &nbsp;Renew now — pay via UPI / card&nbsp; ✦</a>
        </p>
        <p style="font-size:12px;color:#888;text-align:center;font-family:Arial,sans-serif">Log in → Settings → Subscription &amp; renewal → Pay securely via Razorpay.</p>
        <p style="font-size:12px;color:#888;font-family:Arial,sans-serif;border-top:1px solid #eee;padding-top:14px;margin-top:22px">
          Facing an issue or need more time? Just reply to this email or write to {hq_email} — we're happy to help. 🥂</p>
      </div>
    </div>"""


def _welcome_email_html(salon_name: str, owner_email: str, temp_pw: str, poster_url: str = "") -> str:
    login_url = f"{os.environ.get('APP_PUBLIC_URL', 'https://miracurl-suite.com')}/login"
    img = poster_url or os.environ.get("WELCOME_IMAGE_URL", "")
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    img_row = (f'<tr><td style="padding:0"><img src="{img}" alt="Welcome to Miracurl" width="600" '
               f'style="display:block;width:100%;border-radius:16px 16px 0 0"/></td></tr>') if img else ""
    return f"""
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f14;padding:28px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;font-family:Georgia,'Times New Roman',serif;box-shadow:0 8px 40px rgba(212,175,55,.25)">
{img_row}
<tr><td style="background:linear-gradient(135deg,#17171f,#26202b);padding:26px 36px;text-align:center">
  <div style="color:#e6c66e;font-size:12px;letter-spacing:4px;text-transform:uppercase">✦ &nbsp;Welcome Onboard&nbsp; ✦</div>
  <div style="color:#ffffff;font-size:26px;margin-top:8px">{html_lib.escape(salon_name)}</div>
  <div style="color:#b9b0c4;font-size:13px;margin-top:6px;font-family:Arial,sans-serif">Your salon's digital journey begins today 🎉</div>
</td></tr>
<tr><td style="padding:30px 36px 10px">
  <p style="margin:0;color:#2b2b33;font-size:15px;font-family:Arial,sans-serif">Namaste! We're delighted to have <b>{html_lib.escape(salon_name)}</b> on Miracurl.</p>
  <p style="margin:12px 0 0;color:#55555f;font-size:14px;line-height:1.6;font-family:Arial,sans-serif">
    Your complete salon management suite is ready — billing, appointments, staff, inventory,
    AI marketing and your own online booking page. Here are your one-time login details:</p>
</td></tr>
<tr><td style="padding:18px 36px">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf6ec;border:1px solid #ecdfc0;border-radius:12px">
    <tr><td style="padding:18px 22px;font-size:14px;color:#2b2b33;line-height:2.1;font-family:Arial,sans-serif">
      🔗 <b>Login:</b> <a href="{login_url}" style="color:#a08a4b;font-weight:bold">{login_url}</a><br/>
      📧 <b>Email:</b> {owner_email}<br/>
      🔑 <b>Temp password:</b> <span style="font-family:monospace;background:#fff;border:1px dashed #d4af37;padding:3px 12px;border-radius:8px;font-weight:bold;color:#8a6d1f">{temp_pw}</span>
    </td></tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:22px 0 4px">
    <a href="{login_url}" style="background:linear-gradient(135deg,#d4af37,#e6c66e);color:#17171f;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:14px;padding:13px 42px;border-radius:999px;display:inline-block">✦ &nbsp;Login &amp; Set Your Password&nbsp; ✦</a>
  </td></tr></table>
  <p style="margin:14px 0 0;font-size:12px;color:#8a8a94;text-align:center;font-family:Arial,sans-serif">You'll be asked to set your own password right after your first login.</p>
</td></tr>
<tr><td style="background:#17171f;padding:22px 36px;text-align:center">
  <div style="color:#e6c66e;font-size:16px">✦ Miracurl ✦</div>
  <div style="color:#8f8798;font-size:12px;margin-top:6px;font-family:Arial,sans-serif">Questions? Just reply to this email · +91-7206869271 · {hq_email}</div>
  <div style="color:#5d5766;font-size:11px;margin-top:10px;font-family:Arial,sans-serif">Sent with ♥ by Mira — your salon's AI assistant</div>
</td></tr>
</table>
</td></tr></table>"""


def _img_header_row(url: str, alt: str) -> str:
    if not url:
        return ""
    return (f'<tr><td style="padding:0"><img src="{url}" alt="{alt}" width="600" '
            f'style="display:block;width:100%;border-radius:16px 16px 0 0"/></td></tr>')


def _growth_chip(current: float, prev: float, compare_label: str) -> str:
    if prev <= 0:
        return ""
    pct = (current - prev) / prev * 100
    up = pct >= 0
    return (f'<span style="display:inline-block;margin-top:10px;background:{"#0d3321" if up else "#3a1520"};'
            f'color:{"#4ade80" if up else "#fb7185"};font-family:Arial,sans-serif;font-size:12px;font-weight:bold;'
            f'padding:5px 16px;border-radius:999px">{"▲" if up else "▼"} {abs(pct):.0f}% vs {compare_label}</span>')


def _bar_chart_block(values: list, labels: list, title: str, *, label_w: int, bar_h: int, row_pad: int,
                     skip_last_if_zero: bool = False) -> str:
    max_v = max(values) if values and max(values) > 0 else 0
    if not max_v:
        return ""
    bars = ""
    for idx, val in enumerate(values[:len(labels)]):
        if skip_last_if_zero and idx == len(labels) - 1 and val == 0:
            continue
        pct_w = int(val / max_v * 100)
        bars += (
            f'<tr><td style="padding:{row_pad}px 0;width:{label_w}px;font-size:11px;color:#8a8a94;font-family:Arial,sans-serif">{labels[idx]}</td>'
            f'<td style="padding:{row_pad}px 0"><table cellpadding="0" cellspacing="0" width="100%"><tr>'
            f'<td style="width:{max(pct_w, 2)}%;background:linear-gradient(90deg,#d4af37,#e6c66e);border-radius:4px;height:{bar_h}px;font-size:1px">&nbsp;</td>'
            f'<td style="padding-left:8px;font-size:12px;color:#2b2b33;font-family:Arial,sans-serif;white-space:nowrap"><b>&#8377;{val:,.0f}</b></td>'
            f'<td width="100%"></td></tr></table></td></tr>')
    return (f'<tr><td style="padding:6px 36px 4px">'
            f'<h3 style="font-size:13px;color:#a08a4b;margin:14px 0 10px;font-family:Arial,sans-serif;letter-spacing:2px;text-transform:uppercase">{title}</h3>'
            f'<table width="100%" cellpadding="0" cellspacing="0">{bars}</table></td></tr>')


def _stat_card(label: str, value, *, pad: str = "16px 10px", size: int = 21) -> str:
    return (f'<td style="background:#faf6ec;border:1px solid #ecdfc0;border-radius:12px;padding:{pad};text-align:center">'
            f'<div style="font-size:10px;color:#a08a4b;text-transform:uppercase;letter-spacing:2px;font-family:Arial,sans-serif">{label}</div>'
            f'<div style="font-size:{size}px;color:#2b2b33;font-weight:bold;margin-top:5px;font-family:Georgia,serif">{value}</div></td>')


def _rank_rows(pairs: list) -> str:
    medals = ["🥇", "🥈", "🥉"]
    return "".join(
        f'<tr><td style="padding:9px 16px;border-bottom:1px solid #f1e8d8;color:#2b2b33;font-size:13px;font-family:Arial,sans-serif">{medals[i] if i < 3 else ""} {html_lib.escape(str(name))}</td>'
        f'<td style="padding:9px 16px;border-bottom:1px solid #f1e8d8;color:#2b2b33;font-size:13px;text-align:right;font-family:Arial,sans-serif"><b>&#8377;{rev:,.0f}</b></td></tr>'
        for i, (name, rev) in enumerate(pairs))


def _ranked_section(title: str, rows: str) -> str:
    if not rows:
        return ""
    return (f'<h3 style="font-size:13px;color:#a08a4b;margin:18px 0 8px;font-family:Arial,sans-serif;letter-spacing:2px;text-transform:uppercase">{title}</h3>'
            f'<table width="100%" cellpadding="0" cellspacing="0" style="background:#fdfbf5;border:1px solid #f1e8d8;border-radius:12px">{rows}</table>')


def _report_header(title: str, salon_name: str, sub_label: str, *, pad: str, name_size: int) -> str:
    return (f'<tr><td style="background:linear-gradient(135deg,#17171f,#26202b);padding:{pad};text-align:center">'
            f'<div style="color:#e6c66e;font-size:12px;letter-spacing:4px;text-transform:uppercase">✦ &nbsp;{title}&nbsp; ✦</div>'
            f'<div style="color:#ffffff;font-size:{name_size}px;margin-top:8px">{html_lib.escape(salon_name)}</div>'
            f'<div style="color:#b9b0c4;font-size:13px;margin-top:6px;font-family:Arial,sans-serif">{sub_label}</div></td></tr>')


def _report_footer(hq_email: str, *, pad: str = "22px 36px") -> str:
    return (f'<tr><td style="background:#17171f;padding:{pad};text-align:center">'
            f'<div style="color:#e6c66e;font-size:16px">✦ Miracurl ✦</div>'
            f'<div style="color:#8f8798;font-size:12px;margin-top:6px;font-family:Arial,sans-serif">Questions? Just reply to this email · {hq_email}</div>'
            f'<div style="color:#5d5766;font-size:11px;margin-top:10px;font-family:Arial,sans-serif">Sent with ♥ by Mira — your salon\'s AI assistant</div></td></tr>')


def _report_hero(caption: str, amount: float, chip: str, *, pad: str, size: int) -> str:
    return (f'<tr><td style="padding:{pad};text-align:center">'
            f'<div style="font-size:11px;color:#a08a4b;text-transform:uppercase;letter-spacing:3px;font-family:Arial,sans-serif">{caption}</div>'
            f'<div style="font-size:{size}px;color:#1c1c24;font-weight:bold;margin-top:6px">&#8377;{amount:,.0f}</div>'
            f'{chip}</td></tr>')


_REPORT_SHELL = ('<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f14;padding:28px 0">'
                 '<tr><td align="center">'
                 '<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;'
                 "font-family:Georgia,'Times New Roman',serif;box-shadow:0 8px 40px rgba(212,175,55,.25)\">"
                 '{body}</table></td></tr></table>')


def _attendance_month_html(t: dict, month_label: str, rows: list) -> str:
    def td(v, align="left", extra=""):
        return f'<td style="padding:7px 10px;border-bottom:1px solid #f0e6ee;font-size:13px;text-align:{align};{extra}">{v}</td>'
    body_rows = ""
    for r in rows:
        fines = f"₹{r['total_fines']:.0f}" if r["total_fines"] else "—"
        body_rows += ("<tr>"
                      + td(f"<b>{r['name']}</b><br><span style='color:#999;font-size:11px'>{r['role']}{(' · ' + r['branch']) if r['branch'] else ''}</span>")
                      + td(r["days_present"], "center")
                      + td(r["half_days"] or "—", "center", "color:#b45309;" if r["half_days"] else "")
                      + td(f"{r['late_count']}× ({r['late_minutes']} min)" if r["late_count"] else "—", "center")
                      + td(fines, "right", "color:#dc2626;font-weight:600;" if r["total_fines"] else "")
                      + "</tr>")
    th = 'style="padding:8px 10px;background:#1a1a2e;color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:.06em;"'
    return f"""<div style="font-family:Georgia,serif;max-width:640px;margin:0 auto;color:#333">
      <h2 style="color:#1a1a2e;margin-bottom:2px">🗓️ Staff attendance summary — {month_label}</h2>
      <p style="color:#777;font-size:13px;margin-top:2px">{t.get('name', '')} · per-staff half-days, lates and fines in one sheet.</p>
      <table style="border-collapse:collapse;width:100%;margin-top:12px">
        <tr><th {th} align="left">Staff</th><th {th}>Days present</th><th {th}>Half-days</th><th {th}>Lates</th><th {th} align="right">Fines</th></tr>
        {body_rows or '<tr><td colspan="5" style="padding:14px;text-align:center;color:#999">No attendance records this month.</td></tr>'}
      </table>
      <p style="font-size:12px;color:#999;margin-top:14px">Fines = late fines + half-day deductions. Full details per staff are on your Attendance page. ✦ Miracurl</p>
    </div>"""


def _monthly_report_html(t: dict, month_label: str, stats: dict) -> str:
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    chip = _growth_chip(stats["revenue"], float(stats.get("prev_revenue") or 0), "previous month")
    chart = _bar_chart_block(stats.get("weekly") or [], ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5"],
                             "📊 Weekly collection", label_w=64, bar_h=16, row_pad=4, skip_last_if_zero=True)
    cards = ('<td style="width:10px"></td>'.join([
        _stat_card("Bills", stats["invoices"]),
        _stat_card("Avg Bill", f"&#8377;{stats['avg_bill']:,.0f}"),
        _stat_card("New Guests", stats["new_customers"]),
        _stat_card("Appointments", stats["appointments"]),
    ]))
    body = (
        _img_header_row(os.environ.get("MONTHLY_REPORT_IMAGE_URL") or DEFAULT_MONTHLY_IMAGE, "Monthly Business Report")
        + _report_header("Monthly Business Report", t["name"], month_label, pad="26px 36px", name_size=26)
        + _report_hero("Total Collection", stats["revenue"], chip, pad="28px 36px 4px", size=40)
        + f'<tr><td style="padding:20px 36px 4px"><table width="100%" cellpadding="0" cellspacing="0"><tr>{cards}</tr></table></td></tr>'
        + chart
        + ('<tr><td style="padding:4px 36px 8px">'
           + _ranked_section("🏆 Top services", _rank_rows(stats["top_services"]))
           + _ranked_section("⭐ Star team members", _rank_rows(stats["top_staff"]))
           + "</td></tr>")
        + ('<tr><td style="padding:18px 36px 26px;text-align:center">'
           '<p style="margin:0;font-size:13px;color:#55555f;font-family:Arial,sans-serif;line-height:1.6">'
           "Keep shining! Mira crunched these numbers so you can plan next month with confidence ✦</p></td></tr>")
        + _report_footer(hq_email)
    )
    return _REPORT_SHELL.format(body=body)


def _weekly_highlights_block(stats: dict) -> str:
    top_svc = stats["top_services"][0] if stats.get("top_services") else None
    top_stf = stats["top_staff"][0] if stats.get("top_staff") else None
    if not (top_svc or top_stf):
        return ""
    rows = ""
    if top_svc:
        rows += (f'<tr><td style="padding:9px 16px;border-bottom:1px solid #f1e8d8;color:#2b2b33;font-size:13px;font-family:Arial,sans-serif">🏆 Top service: <b>{html_lib.escape(str(top_svc[0]))}</b></td>'
                 f'<td style="padding:9px 16px;border-bottom:1px solid #f1e8d8;color:#2b2b33;font-size:13px;text-align:right;font-family:Arial,sans-serif"><b>&#8377;{top_svc[1]:,.0f}</b></td></tr>')
    if top_stf:
        rows += (f'<tr><td style="padding:9px 16px;color:#2b2b33;font-size:13px;font-family:Arial,sans-serif">⭐ Star of the week: <b>{html_lib.escape(str(top_stf[0]))}</b></td>'
                 f'<td style="padding:9px 16px;color:#2b2b33;font-size:13px;text-align:right;font-family:Arial,sans-serif"><b>&#8377;{top_stf[1]:,.0f}</b></td></tr>')
    return (f'<tr><td style="padding:4px 36px 8px">'
            f'<h3 style="font-size:13px;color:#a08a4b;margin:14px 0 8px;font-family:Arial,sans-serif;letter-spacing:2px;text-transform:uppercase">✨ Highlights</h3>'
            f'<table width="100%" cellpadding="0" cellspacing="0" style="background:#fdfbf5;border:1px solid #f1e8d8;border-radius:12px">{rows}</table></td></tr>')


def _weekly_tip_block(tip: str) -> str:
    if not tip:
        return ""
    return (f'<tr><td style="padding:4px 36px 8px">'
            f'<table width="100%" cellpadding="0" cellspacing="0" style="background:#17171f;border-radius:12px">'
            f'<tr><td style="padding:16px 22px">'
            f'<div style="font-size:11px;color:#e6c66e;text-transform:uppercase;letter-spacing:3px;font-family:Arial,sans-serif">💡 Mira\'s tip for this week</div>'
            f'<div style="font-size:14px;color:#f0ead6;margin-top:8px;line-height:1.6;font-family:Georgia,serif">{html_lib.escape(tip)}</div>'
            f'</td></tr></table></td></tr>')


def _weekly_report_html(t: dict, week_label: str, stats: dict, tip: str = "") -> str:
    hq_email = os.environ.get("HQ_EMAIL", "admin@miracurl.com")
    chip = _growth_chip(stats["revenue"], float(stats.get("prev_revenue") or 0), "last week")
    chart = _bar_chart_block(stats.get("daily") or [], ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
                             "📊 Day by day", label_w=44, bar_h=14, row_pad=3)
    cards = ('<td style="width:10px"></td>'.join([
        _stat_card("Bills", stats["invoices"], pad="14px 8px", size=19),
        _stat_card("Avg Bill", f"&#8377;{stats['avg_bill']:,.0f}", pad="14px 8px", size=19),
        _stat_card("New Guests", stats["new_customers"], pad="14px 8px", size=19),
    ]))
    body = (
        _img_header_row(os.environ.get("WEEKLY_REPORT_IMAGE_URL") or DEFAULT_WEEKLY_IMAGE, "Weekly Business Snapshot")
        + _report_header("Weekly Business Snapshot", t["name"], week_label, pad="24px 36px", name_size=24)
        + _report_hero("Week's Collection", stats["revenue"], chip, pad="26px 36px 4px", size=36)
        + f'<tr><td style="padding:18px 36px 4px"><table width="100%" cellpadding="0" cellspacing="0"><tr>{cards}</tr></table></td></tr>'
        + chart
        + _weekly_highlights_block(stats)
        + _weekly_tip_block(tip)
        + ('<tr><td style="padding:14px 36px 24px;text-align:center">'
           '<p style="margin:0;font-size:13px;color:#55555f;font-family:Arial,sans-serif;line-height:1.6">'
           "A fresh week begins today — Mira wishes you a full appointment book ✦</p></td></tr>")
        + _report_footer(hq_email, pad="20px 36px")
    )
    return _REPORT_SHELL.format(body=body)


def _birthday_email_html(t: dict, cust_name: str, offer_text: str, booking_url: str) -> str:
    img = os.environ.get("BIRTHDAY_IMAGE_URL") or DEFAULT_BIRTHDAY_IMAGE
    img_row = (f'<tr><td style="padding:0"><img src="{img}" alt="Happy Birthday" width="600" '
               f'style="display:block;width:100%;border-radius:16px 16px 0 0"/></td></tr>') if img else ""
    offer_block = (
        f'<tr><td style="padding:6px 36px">'
        f'<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf6ec;border:1px dashed #d4af37;border-radius:12px">'
        f'<tr><td style="padding:16px 22px;text-align:center">'
        f'<div style="font-size:11px;color:#a08a4b;text-transform:uppercase;letter-spacing:3px;font-family:Arial,sans-serif">🎁 Your birthday treat</div>'
        f'<div style="font-size:16px;color:#2b2b33;margin-top:6px;font-family:Georgia,serif"><b>{html_lib.escape(offer_text)}</b></div>'
        f'</td></tr></table></td></tr>') if offer_text else ""
    return f"""
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f14;padding:28px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;font-family:Georgia,'Times New Roman',serif;box-shadow:0 8px 40px rgba(212,175,55,.25)">
{img_row}
<tr><td style="background:linear-gradient(135deg,#17171f,#26202b);padding:24px 36px;text-align:center">
  <div style="color:#e6c66e;font-size:12px;letter-spacing:4px;text-transform:uppercase">✦ &nbsp;Happy Birthday&nbsp; ✦</div>
  <div style="color:#ffffff;font-size:26px;margin-top:8px">{html_lib.escape(cust_name)}</div>
  <div style="color:#b9b0c4;font-size:13px;margin-top:6px;font-family:Arial,sans-serif">With love from {html_lib.escape(t.get('name') or 'your salon')} 🎂</div>
</td></tr>
<tr><td style="padding:26px 36px 8px;text-align:center">
  <p style="margin:0;color:#2b2b33;font-size:15px;line-height:1.7;font-family:Arial,sans-serif">
    Wishing you a day as beautiful as you are! May this year bring you endless joy,
    great hair days and moments worth celebrating ✨</p>
</td></tr>
{offer_block}
<tr><td style="padding:18px 36px 26px;text-align:center">
  <a href="{booking_url}" style="background:linear-gradient(135deg,#d4af37,#e6c66e);color:#17171f;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:14px;padding:13px 42px;border-radius:999px;display:inline-block">✦ &nbsp;Book Your Birthday Pamper&nbsp; ✦</a>
</td></tr>
<tr><td style="background:#17171f;padding:20px 36px;text-align:center">
  <div style="color:#e6c66e;font-size:16px">✦ {html_lib.escape(t.get('name') or 'Miracurl')} ✦</div>
  <div style="color:#5d5766;font-size:11px;margin-top:8px;font-family:Arial,sans-serif">Sent with ♥ by Mira — your salon's AI assistant</div>
</td></tr>
</table>
</td></tr></table>"""


def _lead_alert_email_html(inq: dict, question: str) -> str:
    app_url = os.environ.get("APP_PUBLIC_URL", "https://miracurl-suite.com")
    phone = inq.get("phone", "")
    wa_msg = f"Hi {inq.get('name', '').split(' ')[0]}! This is the Miracurl team — saw you exploring our salon suite. Happy to answer anything or set up a quick demo!"
    q_block = (f'<tr><td style="padding:6px 36px 4px">'
               f'<div style="font-size:11px;color:#a08a4b;text-transform:uppercase;letter-spacing:3px;font-family:Arial,sans-serif">They just asked</div>'
               f'<div style="background:#faf6ec;border:1px solid #ecdfc0;border-radius:12px;padding:14px 18px;margin-top:8px;font-size:15px;color:#2b2b33;font-family:Georgia,serif">"{html_lib.escape(question[:300])}"</div>'
               f'</td></tr>') if question else ""
    return f"""
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f14;padding:28px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;font-family:Georgia,'Times New Roman',serif;box-shadow:0 8px 40px rgba(212,175,55,.25)">
<tr><td style="background:linear-gradient(135deg,#3a1520,#26202b);padding:24px 36px;text-align:center">
  <div style="color:#fb7185;font-size:12px;letter-spacing:4px;text-transform:uppercase">🔥 &nbsp;Hot Lead — Live Right Now&nbsp; 🔥</div>
  <div style="color:#ffffff;font-size:26px;margin-top:8px">{html_lib.escape(inq.get('name', ''))}</div>
  <div style="color:#b9b0c4;font-size:13px;margin-top:6px;font-family:Arial,sans-serif">is chatting with Sales Mira on your website</div>
</td></tr>
<tr><td style="padding:24px 36px 8px">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdfbf5;border:1px solid #f1e8d8;border-radius:12px">
    <tr><td style="padding:16px 22px;font-size:14px;color:#2b2b33;line-height:2;font-family:Arial,sans-serif">
      📧 <b>Email:</b> {html_lib.escape(inq.get('email', ''))}<br/>
      📞 <b>Phone:</b> +91 {html_lib.escape(phone)}
    </td></tr>
  </table>
</td></tr>
{q_block}
<tr><td style="padding:20px 36px 8px;text-align:center">
  <a href="tel:+91{phone}" style="background:linear-gradient(135deg,#d4af37,#e6c66e);color:#17171f;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:13px;padding:12px 28px;border-radius:999px;display:inline-block;margin:4px">📞 Call Now</a>
  <a href="https://wa.me/91{phone}?text={quote(wa_msg)}" style="background:#0d3321;color:#4ade80;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:13px;padding:12px 28px;border-radius:999px;display:inline-block;margin:4px">💬 WhatsApp</a>
  <a href="{app_url}/super-admin" style="background:#17171f;color:#e6c66e;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:13px;padding:12px 28px;border-radius:999px;display:inline-block;margin:4px">✦ Open HQ Inquiries</a>
</td></tr>
<tr><td style="padding:8px 36px 22px;text-align:center">
  <p style="margin:0;font-size:12px;color:#8a8a94;font-family:Arial,sans-serif">Strike while they're on the site — leads answered within 5 minutes convert best ✦</p>
</td></tr>
<tr><td style="background:#17171f;padding:18px 36px;text-align:center">
  <div style="color:#e6c66e;font-size:15px">✦ Miracurl HQ ✦</div>
  <div style="color:#5d5766;font-size:11px;margin-top:6px;font-family:Arial,sans-serif">Sent instantly by Mira — your AI sales assistant</div>
</td></tr>
</table>
</td></tr></table>"""


def _digest_section(title: str, rows: str) -> str:
    if not rows:
        return ""
    return (f'<tr><td style="padding:6px 36px 4px"><h3 style="font-size:13px;color:#a08a4b;margin:14px 0 8px;font-family:Arial,sans-serif;letter-spacing:2px;text-transform:uppercase">{title}</h3>'
            f'<table width="100%" cellpadding="0" cellspacing="0" style="background:#fdfbf5;border:1px solid #f1e8d8;border-radius:12px">{rows}</table></td></tr>')


def _digest_row(left: str, right: str, right_color: str = "#55555f") -> str:
    return (f'<tr><td style="padding:8px 16px;border-bottom:1px solid #f1e8d8;color:#2b2b33;font-size:13px;font-family:Arial,sans-serif">{left}</td>'
            f'<td style="padding:8px 16px;border-bottom:1px solid #f1e8d8;color:{right_color};font-size:12px;text-align:right;font-family:Arial,sans-serif">{right}</td></tr>')


def _platform_digest_html(stats: dict) -> str:
    def _stat(label, value, color="#2b2b33"):
        return (f'<td style="background:#faf6ec;border:1px solid #ecdfc0;border-radius:12px;padding:14px 8px;text-align:center">'
                f'<div style="font-size:10px;color:#a08a4b;text-transform:uppercase;letter-spacing:2px;font-family:Arial,sans-serif">{label}</div>'
                f'<div style="font-size:20px;color:{color};font-weight:bold;margin-top:5px;font-family:Georgia,serif">{value}</div></td>')

    trials = "".join(_digest_row(f'⏳ {html_lib.escape(t["name"])}', f'expires {t["ends"]}', "#b45309")
                     for t in stats.get("expiring_trials", []))
    leads = "".join(_digest_row(f'🔥 {html_lib.escape(ld["name"])}', html_lib.escape(ld["phone"]))
                    for ld in stats.get("recent_leads", [])[:5])
    trials_block = _digest_section("⏳ Trials expiring this week", trials)
    leads_block = _digest_section("🔥 New leads (last 7 days)", leads)

    return f"""
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f14;padding:28px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;font-family:Georgia,'Times New Roman',serif;box-shadow:0 8px 40px rgba(212,175,55,.25)">
<tr><td style="background:linear-gradient(135deg,#17171f,#26202b);padding:24px 36px;text-align:center">
  <div style="color:#e6c66e;font-size:12px;letter-spacing:4px;text-transform:uppercase">✦ &nbsp;Platform Health Digest&nbsp; ✦</div>
  <div style="color:#ffffff;font-size:24px;margin-top:8px">Miracurl HQ</div>
  <div style="color:#b9b0c4;font-size:13px;margin-top:6px;font-family:Arial,sans-serif">{stats['week_label']}</div>
</td></tr>
<tr><td style="padding:24px 36px 4px">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    {_stat("Active Salons", stats['active_tenants'], "#15803d")}
    <td style="width:8px"></td>
    {_stat("On Trial", stats['trial_tenants'], "#b45309")}
    <td style="width:8px"></td>
    {_stat("New Leads", stats['new_leads'], "#be185d")}
    <td style="width:8px"></td>
    {_stat("Open Tickets", stats['open_tickets'], "#1d4ed8")}
  </tr></table>
</td></tr>
<tr><td style="padding:16px 36px 4px;text-align:center">
  <div style="font-size:11px;color:#a08a4b;text-transform:uppercase;letter-spacing:3px;font-family:Arial,sans-serif">Platform collection last week (all salons)</div>
  <div style="font-size:32px;color:#1c1c24;font-weight:bold;margin-top:6px">&#8377;{stats['platform_revenue']:,.0f}</div>
</td></tr>
{trials_block}
{leads_block}
<tr><td style="padding:16px 36px 24px;text-align:center">
  <p style="margin:0;font-size:13px;color:#55555f;font-family:Arial,sans-serif;line-height:1.6">Your platform pulse, every Monday — from Mira with ♥</p>
</td></tr>
<tr><td style="background:#17171f;padding:18px 36px;text-align:center">
  <div style="color:#e6c66e;font-size:15px">✦ Miracurl HQ ✦</div>
</td></tr>
</table>
</td></tr></table>"""
