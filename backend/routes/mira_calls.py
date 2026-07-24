"""Mira AI outbound voice calls (Twilio) to hot leads + HQ voice assistant (briefing/ask/speak)."""
import asyncio
import html as html_lib
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from database import _raw_db
from security import require_super_admin

router = APIRouter()
log = logging.getLogger("mira_calls")

VOICE = 'voice="Polly.Aditi" language="en-IN"'
VOICE_HI = 'voice="Polly.Aditi" language="hi-IN"'


def _say(text: str, lang: str = "en") -> str:
    return f"<Say {VOICE_HI if lang == 'hi' else VOICE}>{_esc(text)}</Say>"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _norm_phone(p: str) -> str:
    d = re.sub(r"\D", "", p or "")
    if d.startswith("91") and len(d) == 12:
        return "+" + d
    if d.startswith("0") and len(d) == 11:
        d = d[1:]
    if len(d) == 10:
        return "+91" + d
    return ("+" + d) if d else ""


def _twilio():
    from twilio.rest import Client
    return Client(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])


def _xml(body: str) -> Response:
    return Response(media_type="application/xml",
                    content=f'<?xml version="1.0" encoding="UTF-8"?><Response>{body}</Response>')


def _esc(s: str) -> str:
    return (s or "").replace("&", "and").replace("<", "").replace(">", "")


HOT_QUERY = {"reviews": {"$gte": 500}, "$or": [{"website": ""}, {"website": None}, {"website": {"$exists": False}}]}


def _pitch_text(salon: str) -> str:
    return (f"Hello! This is Mira, your A I Business Consultant from Miracurl Suite. "
            f"Am I speaking with the owner of {salon}? Wonderful. "
            "I'm calling on behalf of the Miracurl team because we're helping salons automate their entire "
            "business using Artificial Intelligence. "
            "Running a salon today is much more than great beauty services — you juggle appointments, staff "
            "attendance, payroll, inventory, customer follow ups, marketing, reviews and billing, and most "
            "owners lose hours every day on operations instead of growing their business. "
            "That's exactly why Miracurl Suite was created. Your own A I assistant works 24 hours a day: it "
            "answers customer enquiries, books appointments, handles follow ups, manages P O S billing, tracks "
            "individual staff check in and check out, captures new leads, and even responds to Google and "
            "social media enquiries. "
            "Salon owners using Miracurl Suite save hours every day, increase customer retention, improve their "
            "online reputation, and manage multiple branches from one dashboard — from anywhere. "
            "We'd love to give you a free personalised demonstration, plus a 7 day free trial where our team "
            "sets everything up at no cost. There is absolutely no obligation.")


def _pitch_text_hi(salon: str) -> str:
    return (f"नमस्ते! मैं मीरा हूँ, मिराकर्ल सूट से आपकी ए आई बिज़नेस कंसल्टेंट। "
            f"क्या मेरी बात {salon} के मालिक से हो रही है? बहुत बढ़िया। "
            "हम सैलून का पूरा कामकाज आर्टिफिशियल इंटेलिजेंस से ऑटोमेट करने में मदद करते हैं। "
            "अपॉइंटमेंट, स्टाफ अटेंडेंस, पेरोल, इन्वेंटरी, कस्टमर फॉलो-अप, मार्केटिंग, रिव्यू और बिलिंग — "
            "आज सैलून चलाना सिर्फ अच्छी सर्विस देना नहीं है, और ज़्यादातर मालिक रोज़ घंटों ऑपरेशंस में गँवा देते हैं। "
            "इसीलिए मिराकर्ल सूट बनाया गया। आपका अपना ए आई असिस्टेंट चौबीस घंटे काम करता है: "
            "कस्टमर के सवालों के जवाब देता है, अपॉइंटमेंट बुक करता है, फॉलो-अप करता है, पी ओ एस बिलिंग संभालता है, "
            "हर स्टाफ की चेक-इन चेक-आउट अटेंडेंस रखता है, नए कस्टमर लाता है और गूगल तथा सोशल मीडिया के सवालों के जवाब भी देता है। "
            "हम आपको एक फ्री पर्सनल डेमो और सात दिन का फ्री ट्रायल देना चाहेंगे — हमारी टीम पूरा सेटअप मुफ्त में करेगी, "
            "कोई बाध्यता नहीं।")


def _gather_menu(base: str, call_id: str, lang: str = "en") -> str:
    if lang == "hi":
        menu = ("आप मुझसे कुछ भी पूछ सकते हैं — जैसे, इसकी कीमत क्या है। या, "
                "एक दबाइए और मैं डेमो इनविटेशन, फ्री ट्रायल एक्टिवेशन और प्राइसिंग की पूरी जानकारी आपको तुरंत ईमेल कर दूँगी। "
                "दो दबाइए अगर आप चाहते हैं कि मैं किसी और समय कॉल करूँ। "
                "नौ दबाइए अगर आप आगे कॉल नहीं चाहते।")
        return (f'<Gather input="dtmf speech" numDigits="1" timeout="7" speechTimeout="auto" language="hi-IN" '
                f'action="{base}/api/webhooks/twilio/voice/{call_id}/gather" method="POST">'
                f'{_say(menu, "hi")}</Gather>')
    return (f'<Gather input="dtmf speech" numDigits="1" timeout="7" speechTimeout="auto" language="en-IN" '
            f'action="{base}/api/webhooks/twilio/voice/{call_id}/gather" method="POST">'
            f'<Say {VOICE}>You can also just ask me anything — for example, how much does it cost. Or, '
            f'Press 1 and I will email you the demo invitation, free trial activation, '
            f'feature brochure and pricing details right away. '
            f'Press 2 if you would like me to call back another time. '
            f'Press 3 to continue in Hindi. '
            f'Press 9 to opt out of future calls.</Say></Gather>')


def _gather_listen(base: str, call_id: str, lang: str = "en") -> str:
    return (f'<Gather input="dtmf speech" numDigits="1" timeout="6" speechTimeout="auto" '
            f'language="{"hi-IN" if lang == "hi" else "en-IN"}" '
            f'action="{base}/api/webhooks/twilio/voice/{call_id}/gather" method="POST"/>')


# ---------------- Twilio webhooks (public; signature-verified, call_id is an unguessable UUID) ----------------

async def _twilio_form(request: Request, base: str) -> dict | None:
    """Validate X-Twilio-Signature; return form params if genuine, else None."""
    from twilio.request_validator import RequestValidator
    form = await request.form()
    params = {k: str(v) for k, v in form.items()}
    url = f"{base}{request.url.path}" + (f"?{request.url.query}" if request.url.query else "")
    sig = request.headers.get("X-Twilio-Signature", "")
    if RequestValidator(os.environ["TWILIO_AUTH_TOKEN"]).validate(url, params, sig):
        return params
    log.warning(f"rejected Twilio webhook with bad signature: {request.url.path}")
    return None


@router.post("/webhooks/twilio/voice/{call_id}")
async def twilio_voice_twiml(call_id: str, request: Request, retry: int = 0):
    c = await _raw_db.mira_call_logs.find_one({"id": call_id}, {"_id": 0})
    if not c:
        return _xml(f'<Say {VOICE}>Sorry, this call is no longer valid. Goodbye.</Say><Hangup/>')
    if await _twilio_form(request, c["webhook_base"]) is None:
        raise HTTPException(403, "Invalid Twilio signature")
    base = c["webhook_base"]
    lang = c.get("lang") or "en"
    if retry:
        if lang == "hi":
            body = (_say("मैं विकल्प दोहरा देती हूँ।", "hi") + _gather_menu(base, call_id, "hi") +
                    _say("कोई बात नहीं — आप कभी भी miracurl suite dot com पर सब देख सकते हैं। "
                         "आपके समय के लिए धन्यवाद, आपका दिन शुभ हो!", "hi"))
        else:
            body = (f'<Say {VOICE}>Just to repeat the options.</Say>{_gather_menu(base, call_id)}'
                    f'<Say {VOICE}>No worries — you can explore us any time at miracurl suite dot com. '
                    f'Thank you for your time today. Have a fantastic day!</Say>')
    else:
        pitch = _pitch_text_hi(c.get("lead_name") or "आपके सैलून") if lang == "hi" else _pitch_text(c.get("lead_name") or "your salon")
        body = (_say(pitch, lang) + _gather_menu(base, call_id, lang) +
                f'<Redirect method="POST">{base}/api/webhooks/twilio/voice/{call_id}?retry=1</Redirect>')
    return _xml(body)


MAX_TURNS = 5

_SALES_CONTEXT = (
    "You are Mira, an AI Business Consultant from Miracurl Suite, LIVE ON A PHONE CALL with a salon owner in India. "
    "Miracurl Suite is an AI-powered salon management platform: AI answers customer enquiries, books appointments, "
    "does follow-ups, POS billing, individual staff check-in/check-out attendance, payroll, inventory, memberships, "
    "review funnels, marketing, lead capture, Google/social enquiry replies, multi-branch dashboard. "
    "Offer: FREE personalised demo + 7-day free trial with full setup help, no obligation. Website: miracurl-suite.com. "
    "Objection handling — Busy: 'takes 20 seconds, may I email you the details?'. Already using other software: "
    "'many customers switched; Miracurl adds a virtual AI salon manager, not just bookings — open to a 20-minute comparison?'. "
    "Cost: 'flexible plans by salon size; we recommend the right plan in the free demo, and the 7-day trial is free.' "
    "RULES: Speak naturally like a friendly phone agent, MAX 40 words per reply, no emojis, no lists. "
    "LANGUAGE: a 'Current language' line is provided. If it is 'hi', reply ONLY in Hindi (Devanagari script). "
    "If the owner speaks Hindi (or asks for Hindi) while current language is 'en', SWITCH — reply in Hindi. "
    "If they ask for English, switch back. Always set \"lang\" to the language of YOUR reply. "
    "CALLBACK TIME: if the owner asks to be called at a SPECIFIC time (e.g. 'call after 4 PM', 'tomorrow morning', "
    "'कल शाम को'), set action='callback' AND set \"callback_at\" to that moment in IST as \"YYYY-MM-DDTHH:MM\", "
    "computed from the 'Current time' line (morning=10:00, afternoon=14:00, evening=18:00 when vague). "
    "If no specific time was mentioned, leave callback_at empty. "
    "Decide an action: 'continue' (keep talking), 'send_pack' (they agreed to receive details/demo/trial by email), "
    "'callback' (busy, call later), 'optout' (do not call again), 'end' (goodbye). "
    'Respond ONLY JSON: {"say":"<spoken reply>","action":"continue|send_pack|callback|optout|end","lang":"en|hi","callback_at":""}')


_CLOSERS = {
    "send_pack": {"en": "I am sending everything over right now. Thank you for your time today — have a fantastic day!",
                  "hi": "मैं अभी सारी जानकारी भेज रही हूँ। आपके समय के लिए धन्यवाद — आपका दिन शानदार हो!"},
    "end": {"en": "You can explore everything at miracurl suite dot com. Have a wonderful day!",
            "hi": "आप miracurl suite dot com पर सब कुछ देख सकते हैं। आपका दिन शुभ हो!"},
}


async def _converse(c: dict, lead: dict, speech: str) -> Response:
    """Full conversation mode: lead spoke → LLM answers in Mira's voice, loops up to MAX_TURNS."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    base = c["webhook_base"]
    call_id = c["id"]
    convo = c.get("convo") or []
    convo.append({"role": "lead", "text": speech[:300]})
    turns = len([m for m in convo if m["role"] == "lead"])
    lang = c.get("lang") or "en"
    say, action, cb_at = "", "continue", ""
    try:
        chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"mira-call-{call_id}",
                       system_message=_SALES_CONTEXT).with_model("openai", "gpt-4o-mini")
        history = "\n".join(f"{'Owner' if m['role'] == 'lead' else 'Mira'}: {m['text']}" for m in convo[-8:])
        raw = await chat.send_message(UserMessage(
            text=f"Salon: {lead.get('name') if lead else 'a salon'} ({(lead or {}).get('city') or 'India'}). "
                 f"Lead has email on file: {bool((lead or {}).get('email'))}.\n"
                 f"Current time: {datetime.now(_IST).strftime('%A %d %B %Y, %I:%M %p')} IST.\n"
                 f"Current language: {lang}.\n"
                 f"Conversation so far:\n{history}\n\nOwner just said: \"{speech}\". Reply as Mira."))
        m = re.search(r"\{.*\}", str(raw), re.S)
        d = json.loads(m.group(0)) if m else {}
        say = str(d.get("say") or "")[:400]
        action = d.get("action") if d.get("action") in ("continue", "send_pack", "callback", "optout", "end") else "continue"
        lang = d.get("lang") if d.get("lang") in ("en", "hi") else lang
        cb_raw = str(d.get("callback_at") or "").strip()
        if action == "callback" and cb_raw:
            try:
                dt = datetime.strptime(cb_raw[:16], "%Y-%m-%dT%H:%M")
                cb_at = (dt.replace(tzinfo=timezone.utc) - timedelta(hours=5, minutes=30)).isoformat()
            except ValueError:
                cb_at = ""
    except Exception as e:
        log.error(f"converse LLM failed: {e}")
        say, action = ("यह अच्छा सवाल है — सबसे आसान तरीका है हमारा फ्री डेमो और सात दिन का ट्रायल।"
                       if lang == "hi" else
                       "That's a great question — the easiest way is our free demo and 7 day trial."), "continue"
    convo.append({"role": "mira", "text": say})
    await _raw_db.mira_call_logs.update_one({"id": call_id}, {"$set": {"convo": convo, "conversed": True, "lang": lang}})
    if lang == "hi" and c.get("lead_id"):
        await _raw_db.mira_leads.update_one({"id": c["lead_id"]}, {"$set": {"preferred_lang": "hi"}})
    said = _say(say, lang)
    if action == "send_pack":
        await _raw_db.mira_call_logs.update_one({"id": call_id}, {"$set": {"digits": "speech", "result": "interested"}})
        await _raw_db.mira_leads.update_one(
            {"id": c["lead_id"]}, {"$set": {"call_result": "interested", "last_call_at": _now(), "seen_by_hq": False}})
        asyncio.get_event_loop().create_task(_fulfil_interest(c["lead_id"]))
        return _xml(said + _say(_CLOSERS["send_pack"][lang], lang) + "<Hangup/>")
    if action == "callback":
        await _raw_db.mira_call_logs.update_one(
            {"id": call_id}, {"$set": {"result": "callback", **({"callback_at": cb_at} if cb_at else {})}})
        upd = {"call_result": "callback", "last_call_at": _now()}
        if cb_at:
            upd["callback_at"] = cb_at
            upd["callback_redialed"] = False
        await _raw_db.mira_leads.update_one({"id": c["lead_id"]}, {"$set": upd})
        return _xml(said + "<Hangup/>")
    if action == "optout":
        await _raw_db.mira_call_logs.update_one({"id": call_id}, {"$set": {"result": "opt_out"}})
        await _raw_db.mira_leads.update_one(
            {"id": c["lead_id"]}, {"$set": {"call_result": "opt_out", "do_not_call": True, "last_call_at": _now()}})
        return _xml(said + "<Hangup/>")
    if action == "end" or turns >= MAX_TURNS:
        return _xml(said + _say(_CLOSERS["end"][lang], lang) + "<Hangup/>")
    return _xml(said + _gather_listen(base, c["id"], lang) +
                f'<Redirect method="POST">{base}/api/webhooks/twilio/voice/{call_id}?retry=1</Redirect>')


@router.post("/webhooks/twilio/voice/{call_id}/gather")
async def twilio_voice_gather(call_id: str, request: Request):
    c = await _raw_db.mira_call_logs.find_one({"id": call_id}, {"_id": 0})
    if not c:
        return _xml("<Hangup/>")
    form = await _twilio_form(request, c["webhook_base"])
    if form is None:
        raise HTTPException(403, "Invalid Twilio signature")
    digit = str(form.get("Digits") or "")
    speech = str(form.get("SpeechResult") or "").strip()
    base = c["webhook_base"]
    lang = c.get("lang") or "en"
    lead = await _raw_db.mira_leads.find_one({"id": c["lead_id"]}, {"_id": 0})
    if not digit and speech:
        return await _converse(c, lead, speech)
    if digit == "3" and lang != "hi":
        await _raw_db.mira_call_logs.update_one({"id": call_id}, {"$set": {"lang": "hi"}})
        if c.get("lead_id"):
            await _raw_db.mira_leads.update_one({"id": c["lead_id"]}, {"$set": {"preferred_lang": "hi"}})
        return _xml(_say("बहुत बढ़िया! अब मैं हिंदी में बात करूँगी। " +
                         _pitch_text_hi(c.get("lead_name") or "आपके सैलून"), "hi") +
                    _gather_menu(base, call_id, "hi") +
                    f'<Redirect method="POST">{base}/api/webhooks/twilio/voice/{call_id}?retry=1</Redirect>')
    if digit == "1":
        await _raw_db.mira_call_logs.update_one({"id": call_id}, {"$set": {"digits": "1", "result": "interested"}})
        await _raw_db.mira_leads.update_one(
            {"id": c["lead_id"]}, {"$set": {"call_result": "interested", "last_call_at": _now(), "seen_by_hq": False}})
        asyncio.get_event_loop().create_task(_fulfil_interest(c["lead_id"]))
        if lang == "hi":
            line = ("मैं अभी आपके ईमेल पर डेमो इनविटेशन, फ्री ट्रायल एक्टिवेशन और प्राइसिंग की पूरी जानकारी भेज रही हूँ।"
                    if lead and lead.get("email") else
                    "मैं अभी आपको मैसेज में डेमो, फ्री ट्रायल और प्राइसिंग का लिंक भेज रही हूँ।")
            return _xml(_say(f"बहुत बढ़िया! {line} आपके सैलून को ए आई से बदलने में मदद करने के लिए उत्सुक हूँ। "
                             f"आपका दिन शानदार हो!", "hi") + "<Hangup/>")
        if lead and lead.get("email"):
            line = "I'm sending your demo invitation, free trial activation, feature brochure and pricing details to your email right now."
        else:
            line = "I'm texting you the link with the demo invitation, free trial and pricing details right now."
        return _xml(f"<Say {VOICE}>Wonderful! {line} I am looking forward to helping you transform your salon "
                    f"with A I. Have a fantastic day!</Say><Hangup/>")
    if digit == "2":
        await _raw_db.mira_call_logs.update_one({"id": call_id}, {"$set": {"digits": "2", "result": "callback"}})
        await _raw_db.mira_leads.update_one(
            {"id": c["lead_id"]}, {"$set": {"call_result": "callback", "last_call_at": _now()}})
        if lang == "hi":
            return _xml(_say("बिल्कुल समझती हूँ। मैं किसी और समय संपर्क करूँगी। तब तक आप miracurl suite dot com "
                             "पर सब कुछ देख सकते हैं। आपका दिन शुभ हो!", "hi") + "<Hangup/>")
        return _xml(f'<Say {VOICE}>I completely understand. I will reach out another time. Meanwhile you can '
                    f'explore everything at miracurl suite dot com. Have a great day!</Say><Hangup/>')
    if digit == "9":
        await _raw_db.mira_call_logs.update_one({"id": call_id}, {"$set": {"digits": "9", "result": "opt_out"}})
        await _raw_db.mira_leads.update_one(
            {"id": c["lead_id"]}, {"$set": {"call_result": "opt_out", "do_not_call": True, "last_call_at": _now()}})
        if lang == "hi":
            return _xml(_say("ठीक है, आपको आगे से हमारी कोई कॉल नहीं आएगी। धन्यवाद, आपका दिन शुभ हो।", "hi") + "<Hangup/>")
        return _xml(f'<Say {VOICE}>You have been opted out and will not receive calls from us again. '
                    f'Thank you, have a good day.</Say><Hangup/>')
    return _xml(f'<Redirect method="POST">{base}/api/webhooks/twilio/voice/{call_id}?retry=1</Redirect>')


@router.post("/webhooks/twilio/voice/{call_id}/status")
async def twilio_voice_status(call_id: str, request: Request):
    c0 = await _raw_db.mira_call_logs.find_one({"id": call_id}, {"_id": 0, "webhook_base": 1, "lead_id": 1})
    if not c0:
        return {"ok": True}
    form = await _twilio_form(request, c0["webhook_base"])
    if form is None:
        raise HTTPException(403, "Invalid Twilio signature")
    status = str(form.get("CallStatus") or "")
    dur = int(form.get("CallDuration") or 0)
    upd = {"status": status, "duration": dur, "updated_at": _now()}
    await _raw_db.mira_call_logs.update_one({"id": call_id}, {"$set": upd})
    await _raw_db.mira_leads.update_one(
        {"id": c0["lead_id"]}, {"$set": {"last_call_status": status, "last_call_at": _now()}})
    return {"ok": True}


def _is_twilio_url(url: str) -> bool:
    from urllib.parse import urlparse
    p = urlparse(url or "")
    host = (p.hostname or "").lower()
    return p.scheme == "https" and (host == "twilio.com" or host.endswith(".twilio.com"))


@router.post("/webhooks/twilio/voice/{call_id}/recording")
async def twilio_voice_recording(call_id: str, request: Request):
    c0 = await _raw_db.mira_call_logs.find_one({"id": call_id}, {"_id": 0, "webhook_base": 1})
    if not c0:
        return {"ok": True}
    form = await _twilio_form(request, c0["webhook_base"])
    if form is None:
        raise HTTPException(403, "Invalid Twilio signature")
    url = str(form.get("RecordingUrl") or "")
    if url and _is_twilio_url(url):
        await _raw_db.mira_call_logs.update_one({"id": call_id}, {"$set": {
            "recording_url": url, "recording_sid": str(form.get("RecordingSid") or ""),
            "recording_duration": int(form.get("RecordingDuration") or 0)}})
    return {"ok": True}


@router.get("/super-admin/mira-calls/{call_id}/recording")
async def get_call_recording(call_id: str, user=Depends(require_super_admin)):
    """Proxy the Twilio recording audio (Twilio URLs need account credentials)."""
    import httpx
    c = await _raw_db.mira_call_logs.find_one({"id": call_id}, {"_id": 0, "recording_url": 1})
    if not c or not c.get("recording_url"):
        raise HTTPException(404, "No recording for this call")
    if not _is_twilio_url(c["recording_url"]):
        raise HTTPException(400, "Recording URL is not a Twilio host")
    auth = (os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])
    async with httpx.AsyncClient(auth=auth, timeout=30, follow_redirects=False) as cl:
        r = await cl.get(c["recording_url"] + ".mp3")
        if r.status_code in (301, 302, 303, 307, 308):
            loc = r.headers.get("location", "")
            if not _is_twilio_url(loc):
                raise HTTPException(502, "Recording redirect left Twilio")
            r = await cl.get(loc)
    if r.status_code != 200:
        raise HTTPException(502, "Couldn't fetch the recording from Twilio")
    return Response(content=r.content, media_type="audio/mpeg")


async def _fulfil_interest(lead_id: str) -> None:
    """Press 1 → email the full demo pack (or SMS the link if no email on the lead)."""
    try:
        lead = await _raw_db.mira_leads.find_one({"id": lead_id}, {"_id": 0})
        if not lead:
            return
        if lead.get("email") and lead.get("status") != "sent":
            from email_service import _send_email
            from routes.lead_gen import _outreach_email_html, _live_plans, _lead_reply_to
            from services.pdf import screens_tour_attachment
            from routes.hq_documents import suite_overview_attachment
            html = _outreach_email_html(lead, await _live_plans())
            attachments = [await asyncio.to_thread(suite_overview_attachment)]
            tour = screens_tour_attachment()
            if tour:
                attachments.append(tour)
            res = await _send_email([lead["email"]],
                                    lead.get("email_subject") or "Miracurl Suite — your free demo & 7-day trial",
                                    html, attachments=attachments,
                                    book_url="https://miracurl-suite.com/demo", reply_to=_lead_reply_to())
            if res.get("sent"):
                await _raw_db.mira_leads.update_one(
                    {"id": lead_id}, {"$set": {"status": "sent", "sent_at": _now(), "approved_by": "mira-call"}})
        elif lead.get("phone"):
            from twilio.rest import Client
            _twilio().messages.create(
                to=_norm_phone(lead["phone"]), from_=os.environ["TWILIO_PHONE_NUMBER"],
                body=("Hi! Mira from Miracurl Suite here \U0001F44B As promised: free demo + 7-day trial of the "
                      "AI salon platform \u2192 https://miracurl-suite.com/demo"))
    except Exception as e:
        log.error(f"fulfil interest failed for {lead_id}: {e}")


# ---------------- super admin: start calls + log ----------------

def _webhook_base(request: Request) -> str:
    host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    return f"https://{host}" if host else os.environ.get("APP_PUBLIC_URL", "").rstrip("/")


async def _start_call(lead: dict, base: str) -> dict:
    phone = _norm_phone(lead.get("phone") or "")
    if not phone:
        return {"ok": False, "error": "No valid phone number"}
    call_id = str(uuid.uuid4())
    await _raw_db.mira_call_logs.insert_one({
        "id": call_id, "lead_id": lead["id"], "lead_name": lead.get("name") or "",
        "phone": phone, "status": "queued", "digits": "", "result": "",
        "lang": lead.get("preferred_lang") or "en",
        "duration": 0, "webhook_base": base, "created_at": _now()})
    try:
        tw = await asyncio.to_thread(
            lambda: _twilio().calls.create(
                to=phone, from_=os.environ["TWILIO_PHONE_NUMBER"],
                url=f"{base}/api/webhooks/twilio/voice/{call_id}",
                status_callback=f"{base}/api/webhooks/twilio/voice/{call_id}/status",
                status_callback_event=["completed"], timeout=25, machine_detection="Enable",
                record=True,
                recording_status_callback=f"{base}/api/webhooks/twilio/voice/{call_id}/recording",
                recording_status_callback_event=["completed"]))
        await _raw_db.mira_call_logs.update_one({"id": call_id}, {"$set": {"twilio_sid": tw.sid, "status": "initiated"}})
        return {"ok": True, "call_id": call_id}
    except Exception as e:
        await _raw_db.mira_call_logs.update_one({"id": call_id}, {"$set": {"status": "failed", "error": str(e)[:300]}})
        return {"ok": False, "error": str(e)[:200]}


async def run_timed_callbacks() -> int:
    """Dial leads whose owner asked for a specific callback time, once that time arrives."""
    now = datetime.now(timezone.utc).isoformat()
    leads = await _raw_db.mira_leads.find(
        {"call_result": "callback", "callback_at": {"$nin": ["", None], "$lte": now},
         "do_not_call": {"$ne": True}, "phone": {"$nin": ["", None]},
         "callback_redialed": {"$ne": True}}, {"_id": 0}).to_list(10)
    if not leads:
        return 0
    last = await _raw_db.mira_call_logs.find_one(
        {"webhook_base": {"$nin": ["", None]}}, {"_id": 0, "webhook_base": 1}, sort=[("created_at", -1)])
    base = (last or {}).get("webhook_base") or os.environ.get("APP_PUBLIC_URL", "").rstrip("/")
    if not base:
        return 0
    n = 0
    for lead in leads:
        await _raw_db.mira_leads.update_one({"id": lead["id"]}, {"$set": {"callback_redialed": True}})
        res = await _start_call(lead, base)
        if res.get("ok"):
            n += 1
        await asyncio.sleep(2)
    return n


async def run_callback_redials() -> int:
    """Next-morning auto re-dial for 'call back later' leads WITHOUT a specific time (once per lead)."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=14)).isoformat()
    leads = await _raw_db.mira_leads.find(
        {"call_result": "callback", "do_not_call": {"$ne": True}, "phone": {"$nin": ["", None]},
         "callback_at": {"$in": ["", None]},
         "callback_redialed": {"$ne": True}, "last_call_at": {"$lt": cutoff}}, {"_id": 0}).to_list(15)
    if not leads:
        return 0
    last = await _raw_db.mira_call_logs.find_one(
        {"webhook_base": {"$nin": ["", None]}}, {"_id": 0, "webhook_base": 1}, sort=[("created_at", -1)])
    base = (last or {}).get("webhook_base") or os.environ.get("APP_PUBLIC_URL", "").rstrip("/")
    if not base:
        return 0
    n = 0
    for lead in leads:
        await _raw_db.mira_leads.update_one({"id": lead["id"]}, {"$set": {"callback_redialed": True}})
        res = await _start_call(lead, base)
        if res.get("ok"):
            n += 1
        await asyncio.sleep(2)
    return n


@router.post("/super-admin/mira-calls/{lid}/call")
async def call_one_lead(lid: str, request: Request, user=Depends(require_super_admin)):
    lead = await _raw_db.mira_leads.find_one({"id": lid}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")
    if lead.get("do_not_call"):
        raise HTTPException(400, "This lead opted out of calls")
    if not lead.get("phone"):
        raise HTTPException(400, "No phone number on this lead")
    res = await _start_call(lead, _webhook_base(request))
    if not res["ok"]:
        raise HTTPException(502, f"Call failed: {res['error']}")
    return res


class BatchCallIn(BaseModel):
    limit: int = 20


async def _callable_hot_query() -> dict:
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    return {**HOT_QUERY, "phone": {"$nin": ["", None]}, "do_not_call": {"$ne": True},
            "call_result": {"$nin": ["interested", "opt_out"]},
            "status": {"$nin": ["customer", "rejected"]},
            "$or": [{"last_call_at": {"$exists": False}}, {"last_call_at": {"$lt": since}}]}


async def _call_hot_batch(limit: int, base: str) -> int:
    """Fetch callable hot leads and dial them one by one (staggered, background)."""
    leads = await _raw_db.mira_leads.find(
        await _callable_hot_query(), {"_id": 0}).sort("reviews", -1).to_list(max(1, min(limit, 50)))

    async def _runner():
        for ld in leads:
            await _start_call(ld, base)
            await asyncio.sleep(2)

    if leads:
        asyncio.get_event_loop().create_task(_runner())
    return len(leads)


@router.post("/super-admin/mira-calls/call-hot")
async def call_hot_leads(body: BatchCallIn, request: Request, user=Depends(require_super_admin)):
    """Mira calls all HOT leads (500+ reviews, no website) with a phone number, staggered."""
    queued = await _call_hot_batch(body.limit, _webhook_base(request))
    if not queued:
        return {"ok": True, "queued": 0, "note": "No callable hot leads (all called in the last 7 days, opted out, or missing phones)"}
    return {"ok": True, "queued": queued}


@router.post("/super-admin/mira-calls/retry-failed")
async def retry_failed_calls(request: Request, user=Depends(require_super_admin)):
    """Re-dial everyone whose LATEST call failed (skips leads that later succeeded or opted out)."""
    queued = await _retry_failed_batch(_webhook_base(request))
    return {"ok": True, "queued": queued}


async def _retry_failed_batch(base: str) -> int:
    logs = await _raw_db.mira_call_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    latest = {}
    for c in logs:
        key = c.get("phone") or c.get("lead_id")
        if key and key not in latest:
            latest[key] = c
    failed = [c for c in latest.values() if c.get("status") == "failed"]
    targets = []
    for c in failed:
        if c.get("lead_id"):
            lead = await _raw_db.mira_leads.find_one({"id": c["lead_id"]}, {"_id": 0})
            if not lead or lead.get("do_not_call") or lead.get("call_result") in ("interested", "opt_out"):
                continue
            targets.append(lead)
        else:
            targets.append({"id": "", "name": c.get("lead_name") or "", "phone": c.get("phone")})
    targets = targets[:50]

    async def _runner():
        for ld in targets:
            await _start_call(ld, base)
            await asyncio.sleep(2)

    if targets:
        asyncio.get_event_loop().create_task(_runner())
    return len(targets)


def _friendly_error(err: str) -> str:
    e = (err or "").lower()
    if "unverified" in e or "is not a verified" in e or "trial account" in e:
        return "Twilio trial: this number isn't verified — upgrade Twilio to call anyone"
    if "geo" in e or "permission" in e or "not authorized" in e:
        return "Destination blocked — enable this country in Twilio Geo Permissions"
    if "invalid" in e and "number" in e:
        return "Invalid phone number format"
    return (err or "")[:90]


@router.get("/super-admin/mira-calls")
async def list_calls(user=Depends(require_super_admin)):
    rows = await _raw_db.mira_call_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for r in rows:
        if r.get("error"):
            r["error_friendly"] = _friendly_error(r["error"])
    stats = {"total": len(rows),
             "interested": len([r for r in rows if r.get("result") == "interested"]),
             "callback": len([r for r in rows if r.get("result") == "callback"]),
             "opt_out": len([r for r in rows if r.get("result") == "opt_out"]),
             "failed": len([r for r in rows if r.get("status") == "failed"]),
             "completed": len([r for r in rows if r.get("status") == "completed"])}
    return {"items": rows, "stats": stats}


@router.get("/super-admin/platform-map/live")
async def platform_map_live(user=Depends(require_super_admin)):
    """Real-time feed powering the Platform Map: Mira call stats, live activity, AI insight."""
    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    week_ago = (now - timedelta(days=7)).isoformat()
    two_weeks = (now - timedelta(days=14)).isoformat()
    calls = await _raw_db.mira_call_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
    call_stats = {"total": len(calls),
                  "today": len([c for c in calls if c.get("created_at", "") >= today]),
                  "interested": len([c for c in calls if c.get("result") == "interested"]),
                  "callback": len([c for c in calls if c.get("result") == "callback"]),
                  "conversations": len([c for c in calls if c.get("conversed")])}
    events = []
    for c in calls[:8]:
        if c.get("status") == "failed":
            label = f"failed — {_friendly_error(c.get('error'))}"
        else:
            label = {"interested": "pressed 1 — demo pack sent 🎉", "callback": "asked to call back",
                     "opt_out": "opted out"}.get(c.get("result"), c.get("status") or "dialing")
        events.append({"icon": "📞", "title": f"Mira called {c.get('lead_name') or 'a lead'}",
                       "sub": label, "at": c.get("created_at", "")})
    for l in await _raw_db.mira_leads.find({}, {"_id": 0, "name": 1, "city": 1, "created_at": 1}).sort("created_at", -1).to_list(5):
        events.append({"icon": "🧲", "title": f"New lead — {l.get('name')}", "sub": l.get("city") or "", "at": l.get("created_at", "")})
    for a in await _raw_db.appointments.find({}, {"_id": 0, "customer_name": 1, "created_at": 1}).sort("created_at", -1).to_list(4):
        events.append({"icon": "📅", "title": "Booking confirmed", "sub": a.get("customer_name") or "", "at": a.get("created_at", "")})
    for i in await _raw_db.invoices.find({}, {"_id": 0, "total": 1, "created_at": 1}).sort("created_at", -1).to_list(4):
        events.append({"icon": "💰", "title": f"Payment received ₹{round(i.get('total') or 0)}", "sub": "", "at": i.get("created_at", "")})
    for t in await _raw_db.tenants.find({}, {"_id": 0, "name": 1, "created_at": 1}).sort("created_at", -1).to_list(3):
        events.append({"icon": "🏢", "title": f"New salon — {t.get('name')}", "sub": "", "at": t.get("created_at", "")})
    for e in await _raw_db.registry_employees.find({}, {"_id": 0, "name": 1, "created_at": 1}).sort("created_at", -1).to_list(3):
        events.append({"icon": "🪪", "title": f"Staff registered — {e.get('name')}", "sub": "", "at": e.get("created_at", "")})
    events = sorted([e for e in events if e["at"]], key=lambda x: x["at"], reverse=True)[:12]
    this_week = await _raw_db.mira_leads.count_documents({"created_at": {"$gte": week_ago}})
    prev_week = await _raw_db.mira_leads.count_documents({"created_at": {"$gte": two_weeks, "$lt": week_ago}})
    change = round((this_week - prev_week) / prev_week * 100) if prev_week else (100 if this_week else 0)
    return {"call_stats": call_stats, "events": events,
            "insight": {"leads_this_week": this_week, "leads_prev_week": prev_week, "change_pct": change}}


# ---------------- HQ Mira voice assistant ----------------

_IST = timezone(timedelta(hours=5, minutes=30))

MIRA_TABS = ["tenants", "notifications", "platform-map", "billing", "partners", "leaderboard", "revenue",
             "docs", "lead-email", "mira-leads", "demo-calendar", "ai", "inquiries", "mira-studio",
             "hiring", "inbox", "verify-staff", "team", "deployments", "load", "database", "security"]


async def _hq_snapshot() -> dict:
    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    yesterday = (now.date() - timedelta(days=1)).isoformat()
    soon = (now.date() + timedelta(days=5)).isoformat()
    hot = await _raw_db.mira_leads.count_documents({**HOT_QUERY})
    call_interested = await _raw_db.mira_leads.count_documents({"call_result": "interested"})
    calls_total = await _raw_db.mira_call_logs.count_documents({})
    calls_today = await _raw_db.mira_call_logs.count_documents({"created_at": {"$gte": today}})
    callable_hot = await _raw_db.mira_leads.count_documents(await _callable_hot_query())
    new_verify = await _raw_db.staff_verification_requests.count_documents({"status": "new"})
    unread_inbox = await _raw_db.hq_messages.count_documents({"read": {"$ne": True}})
    tenants_total = await _raw_db.tenants.count_documents({"status": {"$in": ["active", "trial"]}})
    trials_expiring = await _raw_db.tenants.count_documents(
        {"status": "trial", "trial_ends_at": {"$lte": soon, "$gte": today}})
    bookings_today = await _raw_db.appointments.count_documents({"date": today})
    rev = await _raw_db.invoices.aggregate([
        {"$match": {"created_at": {"$gte": yesterday, "$lt": today}}},
        {"$group": {"_id": None, "s": {"$sum": "$total"}}}]).to_list(1)
    failed_today = await _raw_db.mira_call_logs.find(
        {"created_at": {"$gte": today}, "status": "failed"}, {"_id": 0, "error": 1}).to_list(300)
    drafted_ready = await _raw_db.mira_leads.count_documents(
        {"status": {"$in": ["drafted", "researched"]}, "email": {"$nin": ["", None]}})
    rd = await _raw_db.platform_settings.find_one({"key": "lead_heat_risers"}, {"_id": 0}) or {}
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    heated = (rd.get("risers") or [])[:3] if (rd.get("ran_at") or "") >= week_ago else []
    return {"hot_leads": hot, "call_interested": call_interested,
            "callable_hot_leads_with_phone": callable_hot,
            "leads_heated_up_this_week": heated,
            "mira_calls_made_total": calls_total, "mira_calls_made_today": calls_today,
            "calls_failed_today": len(failed_today),
            "top_call_failure_reason": _friendly_error(next((c.get("error") for c in failed_today if c.get("error")), "")) if failed_today else "",
            "emails_drafted_awaiting_your_approval": drafted_ready,
            "new_verification_requests": new_verify,
            "unread_hq_inbox": unread_inbox,
            "active_and_trial_salons": tenants_total, "trials_expiring_in_5_days": trials_expiring,
            "bookings_today_all_salons": bookings_today,
            "revenue_yesterday_all_salons": round((rev[0]["s"] if rev else 0) or 0, 2)}


def _tod_greeting() -> str:
    h = datetime.now(_IST).hour
    return "Good morning" if h < 12 else ("Good afternoon" if h < 17 else "Good evening")


@router.get("/super-admin/mira/briefing")
async def mira_briefing(user=Depends(require_super_admin)):
    snap = await _hq_snapshot()
    today = datetime.now(timezone.utc).date().isoformat()
    calls_today = await _raw_db.mira_call_logs.find(
        {"created_at": {"$gte": today}}, {"_id": 0, "status": 1, "result": 1, "error": 1}).to_list(300)
    bits = []
    def _n(c, s, p):
        return f"{c} {s if c == 1 else p}"
    if snap["hot_leads"]:
        bits.append(f"{_n(snap['hot_leads'], 'hot lead is', 'hot leads are')} waiting")
    if snap["bookings_today_all_salons"]:
        bits.append(f"{_n(snap['bookings_today_all_salons'], 'booking', 'bookings')} across your salons today")
    if snap["revenue_yesterday_all_salons"]:
        bits.append(f"₹{snap['revenue_yesterday_all_salons']:g} collected yesterday")
    if snap["new_verification_requests"]:
        bits.append(f"{_n(snap['new_verification_requests'], 'new staff verification request', 'new staff verification requests')}")
    if snap["trials_expiring_in_5_days"]:
        bits.append(f"{_n(snap['trials_expiring_in_5_days'], 'trial', 'trials')} expiring within 5 days")
    summary = "; ".join(bits[:4]) if bits else "everything is calm right now"
    call_report = ""
    if calls_today:
        interested_n = len([c for c in calls_today if c.get("result") == "interested"])
        failed_n = len([c for c in calls_today if c.get("status") == "failed"])
        if failed_n >= 3 and failed_n == len(calls_today):
            reason = _friendly_error(next((c.get('error') for c in calls_today if c.get('error')), ''))
            call_report = (f" ⚠ Heads up: I tried calling {_n(len(calls_today), 'lead', 'leads')} today and NONE connected"
                           f" — {reason}. Once that's fixed, just say 'retry failed calls' and I'll redial everyone.")
        else:
            call_report = f" Call report: I made {_n(len(calls_today), 'call', 'calls')} today — {interested_n} interested, {failed_n} failed"
            if failed_n:
                call_report += f". Most failures: {_friendly_error(next((c.get('error') for c in calls_today if c.get('error')), ''))} — say 'retry failed calls' when ready"
            call_report += f". {snap['callable_hot_leads_with_phone']} hot leads are still callable — just say 'call the hot leads'."
    suggestion = ""
    if snap["emails_drafted_awaiting_your_approval"]:
        suggestion = f" Tip: {_n(snap['emails_drafted_awaiting_your_approval'], 'personalized email is', 'personalized emails are')} drafted and waiting for your approval."
    elif not calls_today and snap["callable_hot_leads_with_phone"]:
        suggestion = f" Tip: {snap['callable_hot_leads_with_phone']} hot leads are ready to call — just say 'call the hot leads'."
    heat_note = ""
    rd = await _raw_db.platform_settings.find_one({"key": "lead_heat_risers"}, {"_id": 0}) or {}
    if rd.get("risers") and not rd.get("announced"):
        top = rd["risers"][0]
        heat_note = (f" 🔥 Heat alert: {_n(len(rd['risers']), 'lead', 'leads')} got hotter after my weekly refresh — "
                     f"top mover: {top['name']} jumped from {top['from']} to {top['to']}. Worth a call!")
        await _raw_db.platform_settings.update_one({"key": "lead_heat_risers"}, {"$set": {"announced": True}})
    text = (f"Hey Miracurl! {_tod_greeting()}! {summary}.{call_report}{heat_note}{suggestion} "
            f"How may I help you today — what details do you want me to show?")
    return {"text": text, "data": snap}


@router.get("/super-admin/mira/map-briefing")
async def mira_map_briefing(user=Depends(require_super_admin)):
    """Spoken real-time update when the Platform Map opens."""
    today = datetime.now(timezone.utc).date().isoformat()
    leads_today = await _raw_db.mira_leads.count_documents({"created_at": {"$gte": today}})
    calls_today = await _raw_db.mira_call_logs.find(
        {"created_at": {"$gte": today}}, {"_id": 0, "status": 1, "result": 1}).to_list(300)
    interested = len([c for c in calls_today if c.get("result") == "interested"])
    failed = len([c for c in calls_today if c.get("status") == "failed"])
    bookings_today = await _raw_db.appointments.count_documents({"date": today})
    pay = await _raw_db.invoices.aggregate([
        {"$match": {"created_at": {"$gte": today}}},
        {"$group": {"_id": None, "n": {"$sum": 1}, "s": {"$sum": "$total"}}}]).to_list(1)
    pay_n = (pay[0]["n"] if pay else 0) or 0
    pay_amt = round((pay[0]["s"] if pay else 0) or 0)
    tenants_today = await _raw_db.tenants.count_documents({"created_at": {"$gte": today}})
    staff_today = await _raw_db.registry_employees.count_documents({"created_at": {"$gte": today}})
    callable_hot = await _raw_db.mira_leads.count_documents(await _callable_hot_query())

    def _n(c, s, p):
        return f"{c} {s if c == 1 else p}"
    bits = []
    if leads_today:
        bits.append(f"{_n(leads_today, 'new lead', 'new leads')} received")
    else:
        bits.append("no new leads received so far today")
    if pay_n:
        bits.append(f"{_n(pay_n, 'payment', 'payments')} received worth ₹{pay_amt:,}")
    if tenants_today:
        bits.append(f"{_n(tenants_today, 'new tenant', 'new tenants')} added")
    if staff_today:
        bits.append(f"{_n(staff_today, 'staff member', 'staff members')} registered")
    if bookings_today:
        bits.append(f"{_n(bookings_today, 'booking', 'bookings')} across your salons")
    if calls_today:
        rep = f"On your behalf I called {_n(len(calls_today), 'lead', 'leads')} today — "
        if interested:
            rep += f"{interested} said yes to the demo!"
        else:
            rep += "no positive response received yet"
            if failed:
                rep += f", {failed} failed"
            rep += "."
    elif callable_hot:
        rep = f"{_n(callable_hot, 'hot lead is', 'hot leads are')} ready — just say the word and I'll start calling."
    else:
        rep = ""
    text = (f"Hey Miracurl! Live update — {'; '.join(bits)}. {rep} "
            "Please give me a command — what do you want to know?").replace("  ", " ")
    return {"text": text,
            "data": {"leads_today": leads_today, "calls_today": len(calls_today),
                     "interested_today": interested, "failed_today": failed,
                     "payments_today": pay_n, "payments_amount_today": pay_amt,
                     "tenants_today": tenants_today, "staff_today": staff_today,
                     "bookings_today": bookings_today, "callable_hot": callable_hot}}


class MiraAskIn(BaseModel):
    question: str
    last_mira: str = ""


@router.post("/super-admin/mira/ask")
async def mira_ask(body: MiraAskIn, request: Request, user=Depends(require_super_admin)):
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    snap = await _hq_snapshot()
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"mira-hq-{user['id']}-{uuid.uuid4().hex[:6]}",
                   system_message=(
                       "You are Mira, the voice assistant of the Miracurl Suite super-admin console, and an EXPERT "
                       "lead-generation consultant. Answer the admin's question in ONE or TWO short spoken-style "
                       "sentences using the live platform snapshot provided. If a dashboard tab is clearly relevant, include it. "
                       f"Valid tabs: {', '.join(MIRA_TABS)}. "
                       "The 'Current time' line in the message tells you the exact local time — ALWAYS use the matching "
                       "greeting (Good morning before 12 PM, Good afternoon 12–5 PM, Good evening after 5 PM); NEVER guess. "
                       "LANGUAGE: reply in the SAME language the admin used — English or Hindi (Devanagari script). "
                       "Hinglish (Hindi words in Latin script) counts as Hindi: reply in Devanagari Hindi. "
                       "BE PROACTIVE: if calls_failed_today is high (especially if ALL calls failed), warn the admin, state "
                       "top_call_failure_reason plainly, and suggest fixing it then saying 'retry failed calls'. If "
                       "emails_drafted_awaiting_your_approval > 0, suggest approving them. If callable_hot_leads_with_phone "
                       "is large and no calls were made today, suggest a calling session. You may also suggest hunting leads "
                       "in a new city when the pipeline looks thin. "
                       "CALLING HOT LEADS: you can phone hot leads yourself. If the admin asks you to call hot "
                       "leads WITHOUT saying how many, set action='ask_call_count' and ask exactly like: "
                       "'You have N hot leads with phone numbers ready — how many should I call now?' using "
                       "callable_hot_leads_with_phone from the snapshot. If the admin gives a number of leads to "
                       "call (either in the request itself, like 'call 5 hot leads', or as a reply after you asked "
                       "— check the previous Mira message), set action='start_calls' and count to that number "
                       "(cap 50; 'all' means every callable one). "
                       "If the admin asks you to call a SPECIFIC phone number or a SPECIFIC salon/lead by name "
                       "(e.g. 'call 9876543210', 'call Empire Hair Lounge'), set action='call_specific' and put "
                       "the phone number or the salon name in 'target'. "
                       "If the admin asks to RETRY the failed calls (e.g. 'retry failed calls', 'redial the failed ones'), "
                       "ALWAYS set action='retry_failed' — the system itself checks the full call history (not just today), "
                       "so never refuse based on the snapshot. "
                       'Respond ONLY with JSON: {"answer": "<spoken answer>", "tab": "<tab id or empty>", '
                       '"action": "" | "ask_call_count" | "start_calls" | "call_specific" | "retry_failed", '
                       '"count": <int, 0 if not applicable>, "target": "<phone or salon name or empty>"}'
                   )).with_model("openai", "gpt-4o-mini")
    prev = f'Previous Mira message: "{body.last_mira.strip()[:200]}"\n' if body.last_mira.strip() else ""
    ist_now = datetime.now(_IST)
    msg = (f"Current time: {ist_now.strftime('%A %d %B, %I:%M %p')} IST ({_tod_greeting()}).\n"
           f"Live snapshot: {json.dumps(snap)}\n{prev}\nAdmin says: {body.question.strip()[:300]}")
    try:
        raw = await chat.send_message(UserMessage(text=msg))
        m = re.search(r"\{.*\}", str(raw), re.S)
        d = json.loads(m.group(0)) if m else {"answer": str(raw)[:300], "tab": ""}
    except Exception as e:
        log.error(f"mira ask failed: {e}")
        d = {"answer": "Sorry, I couldn't process that just now — please try again.", "tab": ""}
    answer = str(d.get("answer") or "")[:500]
    tab = d.get("tab") if d.get("tab") in MIRA_TABS else ""
    action = d.get("action") if d.get("action") in ("ask_call_count", "start_calls", "call_specific", "retry_failed") else ""
    if action == "retry_failed":
        queued = await _retry_failed_batch(_webhook_base(request))
        answer = (f"On it! I'm re-dialing {queued} failed call{'s' if queued != 1 else ''} right now — "
                  f"watch the call history for results." if queued
                  else "Good news — there are no failed calls that need retrying right now.")
        tab = "mira-leads"
    if action == "call_specific":
        target = str(d.get("target") or "").strip()
        digits = re.sub(r"\D", "", target)
        base = _webhook_base(request)
        if len(digits) >= 8:
            res = await _start_call({"id": "", "name": "the salon", "phone": target}, base)
            answer = (f"Calling {target} now — I'll pitch Miracurl Suite and log the result in call history."
                      if res.get("ok") else f"I couldn't place that call: {_friendly_error(res.get('error'))}")
        elif target:
            lead = await _raw_db.mira_leads.find_one(
                {"name": {"$regex": re.escape(target), "$options": "i"}, "phone": {"$nin": ["", None]}}, {"_id": 0})
            if not lead:
                answer = f"I couldn't find a lead named '{target}' with a phone number."
            elif lead.get("do_not_call"):
                answer = f"{lead['name']} has opted out of calls, so I won't dial them."
            else:
                res = await _start_call(lead, base)
                answer = (f"Calling {lead['name']} at {lead['phone']} now — watch their lead card for the result."
                          if res.get("ok") else f"Couldn't reach {lead['name']}: {_friendly_error(res.get('error'))}")
            tab = "mira-leads"
        else:
            answer = "Tell me the phone number or the salon name you want me to call."
    if action == "start_calls":
        try:
            count = max(1, min(int(d.get("count") or 0), 50))
        except (TypeError, ValueError):
            count = 0
        if count:
            queued = await _call_hot_batch(count, _webhook_base(request))
            answer = (f"On it! I'm calling {queued} hot lead{'s' if queued != 1 else ''} one by one right now — "
                      f"watch the results appear on the lead cards." if queued
                      else "There are no callable hot leads right now — everyone was called in the last 7 days, opted out, or has no phone number.")
            tab = "mira-leads"
        else:
            action = "ask_call_count"
            answer = f"How many of the {snap['callable_hot_leads_with_phone']} callable hot leads should I call now?"
    return {"answer": answer, "tab": tab, "action": action}


class MiraSpeakIn(BaseModel):
    text: str


@router.post("/super-admin/mira/speak")
async def mira_speak(body: MiraSpeakIn, user=Depends(require_super_admin)):
    from routes.briefings import _tts_cached_speech
    audio_b64 = await _tts_cached_speech(body.text.strip()[:900], voice="shimmer", speed=1.03)
    return {"audio_b64": audio_b64}


# ---------------- auto campaign: call new hot leads within the hour ----------------

AUTO_CALL_KEY = "mira_auto_call"


async def _auto_settings() -> dict:
    doc = await _raw_db.platform_settings.find_one({"key": AUTO_CALL_KEY}, {"_id": 0}) or {}
    return {"enabled": bool(doc.get("enabled", False)),
            "daily_limit": int(doc.get("daily_limit", 25)),
            "start_hour": int(doc.get("start_hour", 10)), "end_hour": int(doc.get("end_hour", 19))}


class AutoCallSettingsIn(BaseModel):
    enabled: bool
    daily_limit: int = 25


@router.get("/super-admin/mira-calls/auto-settings")
async def get_auto_call_settings(user=Depends(require_super_admin)):
    return await _auto_settings()


@router.put("/super-admin/mira-calls/auto-settings")
async def set_auto_call_settings(body: AutoCallSettingsIn, user=Depends(require_super_admin)):
    await _raw_db.platform_settings.update_one(
        {"key": AUTO_CALL_KEY},
        {"$set": {"enabled": body.enabled, "daily_limit": max(1, min(body.daily_limit, 100)),
                  "updated_at": _now()}}, upsert=True)
    return {"ok": True}


async def auto_call_hot_leads() -> int:
    """Scheduler: Mira automatically calls hot leads discovered in the last 24h, within IST business hours."""
    s = await _auto_settings()
    if not s["enabled"]:
        return 0
    ist_hour = datetime.now(_IST).hour
    if not (s["start_hour"] <= ist_hour < s["end_hour"]):
        return 0
    today = datetime.now(timezone.utc).date().isoformat()
    made_today = await _raw_db.mira_call_logs.count_documents(
        {"created_at": {"$gte": today}, "auto": True})
    budget = s["daily_limit"] - made_today
    if budget <= 0:
        return 0
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    leads = await _raw_db.mira_leads.find(
        {**HOT_QUERY, "phone": {"$nin": ["", None]}, "do_not_call": {"$ne": True},
         "last_call_at": {"$exists": False}, "auto_called_at": {"$exists": False},
         "status": {"$nin": ["customer", "rejected", "sent"]},
         "created_at": {"$gte": since}},
        {"_id": 0}).sort("reviews", -1).to_list(min(budget, 10))
    base = os.environ.get("APP_PUBLIC_URL", "").rstrip("/")
    n = 0
    for ld in leads:
        await _raw_db.mira_leads.update_one({"id": ld["id"]}, {"$set": {"auto_called_at": _now()}})
        res = await _start_call(ld, base)
        if res.get("ok"):
            await _raw_db.mira_call_logs.update_one({"id": res["call_id"]}, {"$set": {"auto": True}})
            n += 1
        await asyncio.sleep(2)
    if n:
        log.info(f"auto campaign: Mira dialed {n} fresh hot leads")
    return n


# ---------------- Mira daily digest email (7 PM IST) ----------------

DIGEST_HOUR_IST = 19


async def send_daily_digest(force: bool = False) -> bool:
    """Evening email to super admins: leads found, calls made, who pressed 1."""
    from email_service import _send_email
    ist_now = datetime.now(_IST)
    today_ist = ist_now.date().isoformat()
    if not force:
        if ist_now.hour < DIGEST_HOUR_IST:
            return False
        sent = await _raw_db.platform_settings.find_one(
            {"key": "mira_digest", "last_sent": today_ist}, {"_id": 1})
        if sent:
            return False
    day_start_utc = (ist_now.replace(hour=0, minute=0, second=0, microsecond=0)).astimezone(timezone.utc).isoformat()
    leads_today = await _raw_db.mira_leads.find(
        {"created_at": {"$gte": day_start_utc}}, {"_id": 0, "name": 1, "city": 1}).to_list(200)
    calls = await _raw_db.mira_call_logs.find(
        {"created_at": {"$gte": day_start_utc}}, {"_id": 0}).to_list(300)
    interested = await _raw_db.mira_leads.find(
        {"call_result": "interested", "last_call_at": {"$gte": day_start_utc}},
        {"_id": 0, "name": 1, "city": 1, "phone": 1, "email": 1}).to_list(100)
    callbacks = len([c for c in calls if c.get("result") == "callback"])
    completed = len([c for c in calls if c.get("status") == "completed"])
    hot_now = await _raw_db.mira_leads.count_documents(await _callable_hot_query())

    def _stat(v, label, color="#1c1c22"):
        return (f'<td style="padding:14px 10px;text-align:center;background:#faf7f2;border-radius:12px">'
                f'<div style="font-size:26px;font-weight:bold;color:{color}">{v}</div>'
                f'<div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px">{label}</div></td>')

    rows = "".join(
        f'<tr><td style="padding:7px 10px;border-bottom:1px solid #f0ece4">🎉 <b>{html_lib.escape(l.get("name") or "")}</b>'
        f'<span style="color:#888"> · {html_lib.escape(l.get("city") or "")}</span></td>'
        f'<td style="padding:7px 10px;border-bottom:1px solid #f0ece4;color:#555;font-size:12px">'
        f'{html_lib.escape(l.get("phone") or "")}{(" · " + html_lib.escape(l["email"])) if l.get("email") else ""}</td></tr>'
        for l in interested) or ('<tr><td style="padding:10px;color:#999;font-size:12px" colspan="2">'
                                 'No one pressed 1 today — try a batch call tomorrow morning.</td></tr>')
    html = f"""
    <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto">
      <div style="background:#1c1c22;border-radius:18px 18px 0 0;padding:24px 28px">
        <div style="color:#d4af37;font-size:20px;font-weight:bold">🌙 Mira's Evening Digest</div>
        <div style="color:#999;font-size:12px;margin-top:4px">{ist_now.strftime('%A, %d %B %Y')} · Miracurl HQ</div>
      </div>
      <div style="background:#fff;border:1px solid #eee;border-top:0;border-radius:0 0 18px 18px;padding:24px 28px">
        <table style="width:100%;border-spacing:6px 0"><tr>
          {_stat(len(leads_today), "Leads found")}
          {_stat(len(calls), "Calls made", "#7c3aed")}
          {_stat(len(interested), "Pressed 1 🎉", "#0a7d43")}
          {_stat(callbacks, "Call back", "#0284c7")}
        </tr></table>
        <h3 style="color:#1c1c22;font-size:14px;margin:22px 0 6px">Who pressed 1 (demo pack sent)</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#333">{rows}</table>
        <p style="font-size:12px;color:#777;margin-top:18px">
          📞 {completed} calls fully completed · 🔥 {hot_now} hot leads still callable —
          just tell me <i>"call the hot leads"</i> tomorrow and I'll get dialing.</p>
      </div>
    </div>"""
    admins = await _raw_db.users.find({"role": "super_admin"}, {"_id": 0, "email": 1}).to_list(10)
    to = ([os.environ["HQ_DIGEST_EMAIL"]] if os.environ.get("HQ_DIGEST_EMAIL")
          else [a["email"] for a in admins if a.get("email")])
    if not to:
        return False
    res = await _send_email(
        to, f"🌙 Mira's digest — {len(leads_today)} leads found, {len(calls)} calls, {len(interested)} interested",
        html, book_url="https://miracurl-suite.com/super-admin", book_label="Open HQ Console ✦")
    await _raw_db.platform_settings.update_one(
        {"key": "mira_digest"}, {"$set": {"last_sent": today_ist, "at": _now(),
                                          "email_sent": bool(res.get("sent"))}}, upsert=True)
    return bool(res.get("sent"))
