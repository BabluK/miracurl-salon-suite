"""Release notes shipped with every deployment — shown in Super Admin → Deployments.
Append a new entry (or extend the latest date) whenever a deploy-worthy change lands.
Bump BUILD on every deploy-worthy change so preview vs production builds are comparable."""

BUILD = "2026-07-11.3"

RELEASES = [
    {
        "date": "2026-07-11",
        "changes": [
            "Your salon now has its own public web page ✨ — share miracurl-suite.com/salon/your-salon-name with clients: your services & prices, star rating and best reviews, plus a Book Now button. Google can find and rank it too",
            "Super Admin: Notifications center — every hiring update, owner message, software lead, renewal alert and new signup in one filterable feed, with a jump-to-section on click",
            "Super Admin: the HQ console got a subtle 3D animated backdrop — floating orbs, rings and sparkles",
            "Platform: SEO pass — robots.txt, sitemap.xml (now including every salon's public page) and structured data for Google",
            "Hire Staff 🧑‍💼 — post a hiring request from your dashboard and Miracurl HQ finds you verified candidates, schedules trials and updates you at every step",
            "Public Jobs board (/jobs) — HQ-verified professionals apply for open positions with their registered number; salon identity stays private until shortlisting",
            "Flash offers ⚡ — when AI CCTV spots chairs sitting empty, Mira alerts you on the Dashboard and designs a 2-hour flash offer with poster + WhatsApp caption in one tap",
            "What's New ✨ popup — after every update, salon owners see the latest features once, with a WhatsApp share button",
            "Renewal reminders on auto-pilot — owners get a branded email 15, 7 and 1 day(s) before their subscription/trial ends, with a direct Razorpay renew link",
            "Refer & Earn: referral list now shows reward status — pending until the referred salon makes its first payment, then ₹1,000 credited",
            "Mira Day-Smart Offers — ask Mira for today's offer: weekday-aware (fills chairs Mon-Thu, upsells Fri-Sun), built from your real service catalog, downloadable poster",
            "AI CCTV Analytics — waiting customers, empty chairs, queue length & idle staff read from camera frames every few minutes, with hourly trends",
            "Super Admin: Hiring tab (middleman pipeline: applied → shortlisted → trial → hired), renewals auto-email log with WhatsApp follow-ups, full Referral Tracking table",
        ],
    },
    {
        "date": "2026-07-10",
        "changes": [
            "Promo Video: Express mode now renders in seconds (was minutes / timing out on the live server)",
            "Promo Video: live timer — see exactly when generation started, how long it's running, and how long it took",
            "Promo Video: download history panel is now always visible on the right, with per-video Download & Delete",
            "Miracurl Team: new section for your own HQ staff & CEO — rose-gold company ID cards (MC-0001 style)",
            "Staff Verification: record staff of salons not using the software — public ✦ HQ Verified gold badge",
            "Staff Registry: salon owners can mark staff as 'Left salon' — moves to Past Staff, stays publicly verifiable",
            "Employee ID Cards: print-ready PDF cards for salon staff & verified staff, with blood group, barcode and a SCAN-TO-VERIFY QR code",
            "Billing: subscription plan catalog is now editable — change plan names & prices any time",
            "Deployments: this deployment history section, with server build status (compare live vs preview)",
            "Promo Video: Express now renders all scenes in a single ultra-light ffmpeg pass at social-friendly resolution — built for slow production CPUs",
            "Promo Video: AI Scenes mode fixed on the live server — renders at social resolution with low CPU priority so the server stays healthy mid-render",
            "Pricing: the public website pricing section now shows live prices from the plan catalog — edit a price in Billing and the website updates instantly",
            "Promo Video: new 'AI Booking demo' video — live walkthrough of Mira booking a Botox appointment (service, time, name) on the real app",
            "AI Posters: delete button next to download; website demo carousel refreshed with current app screens incl. Mira booking",
            "Website: partner testimonials are now real & editable from Super Admin → Partners",
            "Super Admin: new Diagnose tool per salon — see DB health, heavy data & stuck jobs, then 'Clear cache & auto-fix' remotely wipes the salon's device cache on next open",
        ],
    },
    {
        "date": "2026-07-09",
        "changes": [
            "Promo videos: removed email flow — direct download & delete from the studio",
            "AI Posters: contact details & website printed on generated posters; new AI Flyer studio for salons",
            "Platform: global API speed-up with GZIP compression",
            "Super Admin: Platform Load monitor and Database cleanup panels",
            "Mira Auto-Pilot: Monday marketing fully autonomous — weekly promo reel + AI poster auto-published to Meta",
        ],
    },
    {
        "date": "2026-07-08",
        "changes": [
            "Rose-gold rebranding across the app — new logo, favicon and downloadable Brand Kit PDF",
            "Dashboard aurora background animations",
            "Fixed promo video 'stuck forever' bug with automatic stale-job recovery",
            "Passed 2 security audits — security trust badges added to the /partner landing page",
        ],
    },
]
