"""Manual check: bearded man -> front/back try-on. Run: cd /app/backend && python tests/test_hair_beard_manual.py"""
import asyncio, base64, sys, uuid, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")


async def main():
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    from routes.mira_common import _key
    from routes.hair_colors import _recolor, _subject_note, _NO_FACIAL_HAIR
    if os.path.exists("/tmp/beard_in.jpg"):
        b64 = base64.b64encode(open("/tmp/beard_in.jpg", "rb").read()).decode()
    else:
        chat = LlmChat(api_key=_key(), session_id="t" + uuid.uuid4().hex[:6], system_message="image gen").with_model(
            "gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
        _, imgs = await chat.send_message_multimodal_response(UserMessage(
            text="Photorealistic front-facing selfie portrait of a 30-year-old Indian man with a full dark brown beard and short dark brown hair, plain background, natural light."))
        b64 = imgs[0]["data"]
        open("/tmp/beard_in.jpg", "wb").write(base64.b64decode(b64))
    print("input ready", len(b64))
    swatch = "#B7410E, #D2691E, #8B2500"
    shade = f"'Copper Blaze' (warm copper) — exact hex tones {swatch}"
    subject = _subject_note("man", "short", "beard")
    front = (f"Edit this photo: keep the SAME person, same face, same skin, same expression, same background and framing. "
             f"Change ONLY the scalp hair colour to the professional salon shade {shade}. Realistic glossy salon finish with "
             f"natural dimension, the overall hair colour must read clearly as {swatch}. {subject} {_NO_FACIAL_HAIR} "
             f"Photorealistic, no text, no watermark.")
    back = (f"This photo shows a person whose scalp hair has just been coloured in the salon shade {shade}. "
            f"Create a photorealistic salon photo of the SAME person seen from BEHIND (back of the head and shoulders, "
            f"same hair length, cut and texture, same clothing). The hair colour from behind must be IDENTICAL to the hair colour "
            f"visible in this photo — same hue, same depth, exact tones {swatch}; do not shift it warmer, cooler, lighter or darker. "
            f"{subject} Soft salon lighting, plain neutral background. No text, no watermark.")
    f = await _recolor(b64, front)
    open("/tmp/beard_front.png", "wb").write(base64.b64decode(f))
    print("front done")
    b = await _recolor(f, back)
    open("/tmp/beard_back.png", "wb").write(base64.b64decode(b))
    print("back done")

asyncio.run(main())
