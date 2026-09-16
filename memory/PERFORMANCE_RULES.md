# ⚡ PERFORMANCE RULES — user-mandated (16–17 Sep 2026): "no slowness on mobile, tablet or laptop"

Root causes found & removed (build .269):
1. `.app-canvas` / `.mesh-dark` animated 3–4 full-page radial gradients (`mesh-drift` infinite) → whole-page repaint every frame. NOW STATIC. Never re-add.
2. `DashboardAurora`: three 60vw circles with `filter: blur(70px)` animated (translate+scale+rotate) → GPU re-rasterises blurred layers each frame. NOW static blur(56px) + translateZ(0); hidden ≤1024px. Sparkles limited to 11 on desktop, hidden ≤1024px.
3. Infinite glow loops (`gold-shine-text`, `gold-shine-img` drop-shadow keyframes, `mira-*` rings/orbit/sparks, `brand-*`) → off ≤1024px.
4. `backdrop-blur*` → off ≤1024px; decorative `.blur-3xl/.blur-2xl.pointer-events-none` blobs → display:none ≤1024px.

Rules for any new UI:
- No `animation: … infinite` on elements larger than a button/avatar. Entrance animations only (`both`, finite).
- Never animate `filter`, `backdrop-filter`, `box-shadow`, `background-position/size` on large surfaces. Animate `transform`/`opacity` only.
- Decorative blur blobs: max 2 per page, `pointer-events-none`, ≤ 20rem, never animated.
- `backdrop-blur` only on small overlays (headers, modals), never on card grids.
- Images: `loading="lazy"` except above-the-fold hero; keep dashboard assets < 400 KB.
- Check: scroll a page 1s in Playwright with `requestAnimationFrame` counter — expect ≥ 45 fps on desktop.
