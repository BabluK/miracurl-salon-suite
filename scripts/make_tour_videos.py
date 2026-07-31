"""Builds the Miracurl tour videos with Mira TTS voiceover.
- /app/frontend/public/miracurl-full-tour.mp4  (~2 min, ALL features, YouTube-ready)
- /app/frontend/public/miracurl-demo-60s.mp4   (60s WhatsApp version, voiced)
Regenerate: cd /app/backend && python3 /app/scripts/make_tour_videos.py
Set YT_CHANNEL below when the user provides their YouTube channel URL."""
import asyncio, base64, os, re, subprocess, sys
sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

D = "/app/scripts/tour_shots"
W, H = 1920, 1080
FF = imageio_ffmpeg.get_ffmpeg_exe()
FONT_B = "/root/.venv/lib/python3.11/site-packages/reportlab/fonts/VeraBd.ttf"
FONT_R = "/root/.venv/lib/python3.11/site-packages/reportlab/fonts/Vera.ttf"
GOLD, DARK = (212, 175, 55), (14, 14, 16)
YT_CHANNEL = os.environ.get("YT_CHANNEL", "youtube.com/@miracurl_unisex_saloon7423")

def font(sz, bold=True):
    return ImageFont.truetype(FONT_B if bold else FONT_R, sz)

def card(path, lines, subs):
    img = Image.new("RGB", (W, H), DARK)
    d = ImageDraw.Draw(img)
    d.text((W//2, 300), "MIRACURL", font=font(110), fill=GOLD, anchor="mm")
    d.text((W//2, 400), "AI  SALON  SUITE", font=font(36, False), fill=(200, 200, 205), anchor="mm")
    y = 560
    for ln in lines:
        d.text((W//2, y), ln, font=font(56), fill=(245, 245, 245), anchor="mm"); y += 90
    y += 30
    for s in subs:
        d.text((W//2, y), s, font=font(34, False), fill=GOLD, anchor="mm"); y += 60
    img.save(path)

def caption(src, dst, title, sub):
    img = Image.open(src).convert("RGB").resize((W, H))
    d = ImageDraw.Draw(img, "RGBA")
    d.rectangle([0, H-170, W, H], fill=(10, 10, 12, 235))
    d.rectangle([0, H-170, W, H-166], fill=GOLD + (255,))
    d.text((80, H-125), title, font=font(52), fill=GOLD)
    d.text((80, H-58), sub, font=font(32, False), fill=(235, 235, 235))
    img.save(dst)

# slide -> (image, caption title, caption sub, full narration, short narration or None)
FULL = [
    ("_title", None, None,
     "Welcome to Miracurl Suite — the A.I. powered platform that runs your entire salon from one screen. Here's everything it can do, in two minutes.", 
     "Meet Miracurl Suite — run your entire salon from one screen. Here's a sixty second tour."),
    ("book", "Online Booking", "Your own booking page — services, stylist & time in seconds",
     "Every salon gets its own beautiful booking page. Customers pick services, choose their favourite stylist and lock a time slot in seconds — and Mira can even book for them with A.I.",
     "Customers book online — services, stylist and time slot, all in seconds."),
    ("dashboard", "Mira AI Dashboard", "Revenue, bookings & a daily AI briefing",
     "Your dashboard shows today's revenue, bookings and customers at a glance — and every morning, Mira greets you with a spoken briefing of how your salon is doing.",
     "Your dashboard shows revenue and bookings, with Mira's spoken briefing every morning."),
    ("appointments", "Appointments Calendar", "Walk-ins, scheduling & instant confirmations",
     "Manage the full appointment calendar — walk-ins, reschedules and cancellations, with automatic SMS and WhatsApp confirmations to every customer.",
     "Manage every appointment, with automatic SMS and WhatsApp confirmations."),
    ("pos", "Point of Sale & Billing", "GST invoices, receipts & loyalty points",
     "Bill customers in seconds at the point of sale. GST invoices, digital receipts by SMS, email and WhatsApp — and loyalty points added automatically on every visit.",
     None),
    ("customers", "Customer CRM & Wallet", "Profiles, visit history, wallets & win-back",
     "Every customer gets a rich profile — visit history, preferences, wallet balance and memberships. Mira even spots customers who haven't visited lately and wins them back.",
     None),
    ("services", "Service Menu & Packages", "Prices, combos, memberships & offers",
     "Your full service menu with prices, combos, packages and memberships — plus an offers studio that designs promotions for you.",
     None),
    ("attendance", "Staff Attendance & Payroll", "GPS + desk-QR check-in, half-day rules, payroll",
     "Staff check in by GPS or the salon desk QR code. Late fines and half-day rules apply automatically, and payroll calculates itself at month end.",
     "Staff check in by GPS or desk QR — payroll and half-day rules run automatically."),
    ("gift", "Gift Cards & Marketing", "Occasion e-cards, campaigns & referrals",
     "Sell beautiful occasion gift cards for birthdays, anniversaries and festivals — delivered by email or WhatsApp, paid by UPI or card. Plus campaigns, reviews and a referral engine.",
     "Sell occasion gift cards and run WhatsApp campaigns, reviews and referrals."),
    ("reviews", "Reviews & Reputation", "Auto review requests after every visit",
     "After every visit, Mira requests a review automatically — building your Google reputation while you work.",
     None),
    ("registry", "Verified Staff Registry", "Hire with verified work history",
     "Hire with confidence using the verified staff registry — real employment history, service years and reputation badges for every professional.",
     "Verify any staff member's real work history before you hire."),
    ("reports", "Reports & Insights", "Revenue trends, staff performance & digests",
     "Deep reports show revenue trends, top services and staff performance — with a daily digest emailed to you every morning.",
     None),
    ("_end", None, None,
     f"Start your free trial today at miracurl suite dot com — and subscribe to our YouTube channel for more. The Miracurl team is really happy to onboard you!",
     "Start free at miracurl suite dot com. The Miracurl team is happy to onboard you!"),
]

def dur_of(path):
    r = subprocess.run([FF, "-i", path], capture_output=True, text=True)
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr)
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))

async def tts_all(lines, prefix):
    from emergentintegrations.llm.openai import OpenAITextToSpeech
    tts = OpenAITextToSpeech(api_key=os.environ["EMERGENT_LLM_KEY"])
    outs = []
    for i, text in enumerate(lines):
        p = f"{D}/{prefix}{i}.mp3"
        if not os.path.exists(p):
            b64 = await tts.generate_speech_base64(text=text, model="tts-1", voice="shimmer", speed=1.04)
            open(p, "wb").write(base64.b64decode(b64))
        outs.append(p)
        print("tts", prefix, i, round(dur_of(p), 1), "s")
    return outs

def build(slides, narrations, out_path, prefix):
    clips = []
    for i, ((name, title, sub, _f, _s), audio) in enumerate(zip(slides, narrations)):
        img = f"{D}/r_{name}.png"
        dur = dur_of(audio) + 1.0
        clip = f"{D}/{prefix}c{i}.mp4"
        subprocess.run([FF, "-y", "-loop", "1", "-t", f"{dur:.2f}", "-i", img, "-i", audio,
                        "-vf", f"scale=1280:720,fade=t=in:st=0:d=0.4,fade=t=out:st={dur-0.4:.2f}:d=0.4",
                        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "26", "-pix_fmt", "yuv420p",
                        "-c:a", "aac", "-b:a", "96k", "-shortest",
                        "-af", "apad=pad_dur=1", "-t", f"{dur:.2f}", clip], check=True, capture_output=True)
        clips.append(clip)
        print("clip", prefix, i, f"{dur:.1f}s")
    lst = f"{D}/{prefix}list.txt"
    with open(lst, "w") as f:
        for c in clips:
            f.write(f"file '{c}'\n")
    subprocess.run([FF, "-y", "-f", "concat", "-safe", "0", "-i", lst,
                    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "26", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "96k", out_path], check=True, capture_output=True)
    print(out_path, round(os.path.getsize(out_path)/1048576, 2), "MB, duration", round(dur_of(out_path), 1), "s")

def main():
    card(f"{D}/r__title.png", ["Run your entire salon", "from one screen"], ["The complete feature tour  \u2022  miracurl-suite.com"])
    card(f"{D}/r__end.png", ["Start your free trial today"],
         ["Register:  miracurl-suite.com/signup-salon", "Live demo:  miracurl-suite.com/demo",
          f"YouTube:  {YT_CHANNEL}", "The Miracurl team is happy to onboard you"])
    for name, title, sub, _f, _s in FULL:
        if name.startswith("_"):
            continue
        caption(f"{D}/{name}.png", f"{D}/r_{name}.png", title, sub)
    full_audio = asyncio.run(tts_all([s[3] for s in FULL], "fa"))
    build(FULL, full_audio, "/app/frontend/public/miracurl-full-tour.mp4", "f")
    short_slides = [s for s in FULL if s[4]]
    short_audio = asyncio.run(tts_all([s[4] for s in short_slides], "sa"))
    build(short_slides, short_audio, "/app/frontend/public/miracurl-demo-60s.mp4", "s")

if __name__ == "__main__":
    main()
