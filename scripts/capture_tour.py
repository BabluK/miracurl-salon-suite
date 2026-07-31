import asyncio
from playwright.async_api import async_playwright

BASE = "https://hair-hub-system.preview.emergentagent.com"
OUT = "/app/scripts/tour_shots"

SHOTS = [
    ("book", f"{BASE}/book/miracurl-marathahalli", None, 6000),
    ("gift", f"{BASE}/gift/miracurl-marathahalli", None, 5000),
    ("registry", f"{BASE}/staff-registry", None, 4000),
    ("dashboard", f"{BASE}/dashboard", "auth", 7000),
    ("appointments", f"{BASE}/appointments", "auth", 5000),
    ("pos", f"{BASE}/pos", "auth", 5000),
    ("customers", f"{BASE}/customers", "auth", 5000),
    ("services", f"{BASE}/services", "auth", 5000),
    ("attendance", f"{BASE}/attendance", "auth", 5000),
    ("reviews", f"{BASE}/reviews", "auth", 5000),
    ("reports", f"{BASE}/reports", "auth", 6000),
]

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 1920, "height": 1080})
        page = await ctx.new_page()
        logged = False
        for name, url, auth, wait in SHOTS:
            if auth and not logged:
                await page.goto(f"{BASE}/login")
                await page.wait_for_timeout(2500)
                await page.fill('input[type="email"]', "admin@miracurl.com")
                await page.fill('input[type="password"]', "q6QY@tn3p#9DtL")
                await page.click('button[type="submit"]')
                await page.wait_for_timeout(5000)
                try:
                    await page.click('[data-testid="whats-new-got-it-btn"]', timeout=3000)
                except Exception:
                    pass
                logged = True
            await page.goto(url)
            await page.wait_for_timeout(wait)
            try:
                await page.click('[data-testid="whats-new-got-it-btn"]', timeout=1200)
            except Exception:
                pass
            await page.screenshot(path=f"{OUT}/{name}.png")
            print("captured", name)
        await browser.close()

asyncio.run(main())
