"""Release notes shipped with every deployment — shown in Super Admin → Deployments.
Append a new entry (or extend the latest date) whenever a deploy-worthy change lands.
Bump BUILD on every deploy-worthy change so preview vs production builds are comparable."""

BUILD = "2026-07-10.9"

RELEASES = [
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
