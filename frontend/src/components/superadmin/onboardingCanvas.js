// Canvas painter for the Onboarding "Congratulations" poster (HQ → Onboarding Image).
export const FORMATS = [
  { id: "story", label: "Story / Status 9:16", w: 1080, h: 1920 },
  { id: "portrait", label: "Insta Feed 4:5", w: 1080, h: 1350 },
  { id: "square", label: "Square 1:1", w: 1080, h: 1080 },
];
export const BACKGROUNDS = [
  { id: "luxury-gold", label: "Luxury gold", accent: "#e8c37f" },
  { id: "festive-confetti", label: "Festive confetti", accent: "#ffd166" },
  { id: "royal-burgundy", label: "Royal burgundy", accent: "#f2cf7a" },
  { id: "emerald-marble", label: "Emerald marble", accent: "#f0d9a5" },
  { id: "floral-blush", label: "Soft floral", accent: "#f7e0b5" },
  { id: "midnight-aurora", label: "Midnight aurora", accent: "#ffe08a" },
  { id: "salon-interior", label: "Salon interior", accent: "#f0c975" },
  { id: "restaurant-candle", label: "Restaurant candlelight", accent: "#f5d38a" },
];
export const TEMPLATES = [
  { id: "classic", label: "Classic Centre" },
  { id: "royal", label: "Royal Frame" },
  { id: "modern", label: "Modern Bold" },
  { id: "badge", label: "Golden Badge" },
];

export function loadImg(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function igHandle(url) {
  const m = String(url || "").match(/instagram\.com\/([A-Za-z0-9._]+)/i) || String(url || "").match(/^@?([A-Za-z0-9._]{2,})$/);
  return m ? `@${m[1].replace(/^@/, "")}` : "";
}

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Arial, Helvetica, sans-serif";

function fitFont(ctx, text, maxW, startPx, minPx, styleFn) {
  let px = startPx;
  ctx.font = styleFn(px);
  const longest = String(text).split(" ").reduce((a, b) => (ctx.measureText(b).width > ctx.measureText(a).width ? b : a), "");
  while (px > minPx && ctx.measureText(longest).width > maxW) { px -= 4; ctx.font = styleFn(px); }
  return px;
}

function wrap(ctx, text, x, y, maxW, lineH) {
  let line = "", yy = y;
  for (const wd of String(text).split(" ")) {
    const t = line ? `${line} ${wd}` : wd;
    if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, yy); line = wd; yy += lineH; } else line = t;
  }
  ctx.fillText(line, x, yy);
  return yy;
}

function goldFill(ctx, x, y, w, accent) {
  const g = ctx.createLinearGradient(x - w / 2, y - 40, x + w / 2, y + 20);
  g.addColorStop(0, "#b8862b"); g.addColorStop(0.45, "#fff2c2"); g.addColorStop(0.55, accent); g.addColorStop(1, "#b8862b");
  return g;
}

function glowText(ctx, text, x, y, color, blur = 28) {
  ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.fillText(text, x, y); ctx.restore();
}

export function drawBackground(ctx, w, h, bgImg, accent) {
  if (bgImg) {
    const s = Math.max(w / bgImg.width, h / bgImg.height);
    ctx.drawImage(bgImg, (w - bgImg.width * s) / 2, (h - bgImg.height * s) / 2, bgImg.width * s, bgImg.height * s);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#1a1230"); g.addColorStop(1, "#0b0812");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  const v = ctx.createRadialGradient(w / 2, h * 0.45, w * 0.15, w / 2, h * 0.5, h * 0.75);
  v.addColorStop(0, "rgba(6,4,10,0.28)"); v.addColorStop(1, "rgba(6,4,10,0.72)");
  ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
  const top = ctx.createLinearGradient(0, 0, 0, h * 0.3); top.addColorStop(0, "rgba(0,0,0,0.45)"); top.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = top; ctx.fillRect(0, 0, w, h * 0.3);
  ctx.strokeStyle = accent; ctx.globalAlpha = 0.55; ctx.lineWidth = 2;
  ctx.strokeRect(34, 34, w - 68, h - 68); ctx.globalAlpha = 1;
}

export function drawSparkles(ctx, w, h, accent, seed = 7) {
  let s = seed;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < 70; i++) {
    const x = rnd() * w, y = rnd() * h, r = 1 + rnd() * 3.2, a = 0.25 + rnd() * 0.6;
    ctx.fillStyle = accent; ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    if (i % 6 === 0) {
      ctx.strokeStyle = accent; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x - r * 4, y); ctx.lineTo(x + r * 4, y); ctx.moveTo(x, y - r * 4); ctx.lineTo(x, y + r * 4); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawLogo(ctx, logoImg, cx, ly, lr, accent, initial) {
  ctx.save(); ctx.shadowColor = accent; ctx.shadowBlur = 42;
  ctx.beginPath(); ctx.arc(cx, ly, lr + 12, 0, Math.PI * 2); ctx.fillStyle = "rgba(8,6,14,0.85)"; ctx.fill(); ctx.restore();
  if (logoImg) {
    ctx.save(); ctx.beginPath(); ctx.arc(cx, ly, lr, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(logoImg, cx - lr, ly - lr, lr * 2, lr * 2); ctx.restore();
  } else {
    ctx.fillStyle = accent; ctx.font = `bold ${Math.round(lr * 0.95)}px ${SERIF}`; ctx.textAlign = "center";
    ctx.fillText(initial, cx, ly + lr * 0.34);
  }
  ctx.beginPath(); ctx.arc(cx, ly, lr + 12, 0, Math.PI * 2); ctx.lineWidth = 5; ctx.strokeStyle = accent; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, ly, lr + 24, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6; ctx.stroke(); ctx.globalAlpha = 1;
}

function drawHeadline(ctx, o, y, sizePx, align = "center", x = o.cx) {
  ctx.textAlign = align;
  ctx.font = `italic ${Math.round(sizePx * 0.42)}px ${SERIF}`; ctx.fillStyle = "rgba(255,255,255,0.9)";
  glowText(ctx, "✦  Congratulations  ✦", x, y - sizePx * 1.0, "rgba(0,0,0,0.6)", 14);
  ctx.font = `bold ${sizePx}px ${SERIF}`;
  ctx.fillStyle = goldFill(ctx, x, y, o.w * 0.8, o.accent);
  glowText(ctx, "Welcome", x, y, o.accent, 34);
  ctx.font = `${Math.round(sizePx * 0.36)}px ${SANS}`; ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillText("to the Miracurl family", x, y + sizePx * 0.5);
}

function drawName(ctx, o, y, maxW, startPx, align = "center", x = o.cx) {
  ctx.textAlign = align; ctx.fillStyle = "#ffffff";
  const px = fitFont(ctx, o.name, maxW, startPx, 36, p => `bold ${p}px ${SERIF}`);
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 18;
  const endY = wrap(ctx, o.name, x, y, maxW, px * 1.1); ctx.restore();
  let yy = endY;
  if (o.location) {
    ctx.fillStyle = "rgba(255,255,255,0.78)"; ctx.font = `${Math.round(px * 0.42)}px ${SANS}`;
    yy += px * 0.9; ctx.fillText(`📍 ${o.location}`, x, yy);
  }
  if (o.handle) {
    ctx.fillStyle = o.accent; ctx.font = `bold ${Math.round(px * 0.42)}px ${SANS}`;
    yy += px * 0.7; ctx.fillText(o.handle, x, yy);
  }
  return yy;
}

function drawTagline(ctx, o, y, align = "center", x = o.cx, maxW = o.w * 0.8) {
  ctx.textAlign = align;
  ctx.strokeStyle = o.accent; ctx.lineWidth = 2; ctx.globalAlpha = 0.8;
  ctx.beginPath(); ctx.moveTo(x - (align === "left" ? 0 : 150), y - 44); ctx.lineTo(x + (align === "left" ? 300 : 150), y - 44); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = o.accent; ctx.font = `bold 34px ${SANS}`;
  ctx.fillText(o.kicker, x, y);
  ctx.fillStyle = "rgba(255,255,255,0.82)"; ctx.font = `30px ${SANS}`;
  wrap(ctx, o.features, x, y + 50, maxW, 40);
}

export function drawFooter(ctx, o, emblem) {
  const { w, h } = o, fh = 150;
  const g = ctx.createLinearGradient(0, h - fh - 60, 0, h); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.35, "rgba(0,0,0,0.75)"); g.addColorStop(1, "rgba(0,0,0,0.92)");
  ctx.fillStyle = g; ctx.fillRect(0, h - fh - 60, w, fh + 60);
  const y = h - 78;
  if (emblem) ctx.drawImage(emblem, w / 2 - 250, y - 46, 92, 92);
  ctx.textAlign = "left";
  ctx.fillStyle = goldFill(ctx, w / 2, y, 500, o.accent); ctx.font = `bold 40px ${SERIF}`;
  ctx.fillText("MIRACURL SUITE", w / 2 - 140, y - 4);
  ctx.fillStyle = "rgba(255,255,255,0.72)"; ctx.font = `26px ${SANS}`;
  ctx.fillText(`${o.site}  ·  ${o.brandHandle}`, w / 2 - 140, y + 36);
}

function tplClassic(ctx, o) {
  drawLogo(ctx, o.logoImg, o.cx, o.h * 0.2, o.h * 0.07, o.accent, o.initial);
  drawHeadline(ctx, o, o.h * 0.385, o.h * 0.052);
  const end = drawName(ctx, o, o.h * 0.48, o.w * 0.84, 84);
  drawTagline(ctx, o, Math.max(end + 120, o.h * 0.68));
}

function tplRoyal(ctx, o) {
  const { w, h, accent } = o, pad = 62;
  ctx.strokeStyle = accent; ctx.lineWidth = 4; ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2 - 150);
  ctx.lineWidth = 1.5; ctx.strokeRect(pad + 18, pad + 18, w - (pad + 18) * 2, h - (pad + 18) * 2 - 150);
  ctx.fillStyle = accent; ctx.font = `54px ${SERIF}`; ctx.textAlign = "center";
  [[pad + 18, pad + 38], [w - pad - 18, pad + 38], [pad + 18, h - 150 - pad + 2], [w - pad - 18, h - 150 - pad + 2]].forEach(([x, y]) => ctx.fillText("❖", x, y));
  drawLogo(ctx, o.logoImg, o.cx, h * 0.2, h * 0.062, accent, o.initial);
  drawHeadline(ctx, o, h * 0.375, h * 0.048);
  const end = drawName(ctx, o, h * 0.465, w * 0.72, 78);
  drawTagline(ctx, o, Math.max(end + 120, h * 0.68), "center", o.cx, w * 0.7);
}

function tplModern(ctx, o) {
  const { w, h, accent } = o, x = 120;
  ctx.fillStyle = accent; ctx.fillRect(66, h * 0.11, 10, h * 0.6);
  drawLogo(ctx, o.logoImg, x + 90, h * 0.17, h * 0.05, accent, o.initial);
  drawHeadline(ctx, o, h * 0.33, h * 0.05, "left", x);
  const end = drawName(ctx, o, h * 0.47, w - 240, 90, "left", x);
  drawTagline(ctx, o, Math.max(end + 120, h * 0.66), "left", x, w - 240);
}

function tplBadge(ctx, o) {
  const { w, h, accent, cx } = o, cy = h * 0.4, R = Math.min(w * 0.4, h * 0.24);
  ctx.save(); ctx.shadowColor = accent; ctx.shadowBlur = 60;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = "rgba(6,4,10,0.55)"; ctx.fill(); ctx.restore();
  ctx.lineWidth = 8; ctx.strokeStyle = accent; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R - 22, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.stroke();
  drawLogo(ctx, o.logoImg, cx, cy - R * 0.5, R * 0.24, accent, o.initial);
  ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.font = `italic ${Math.round(R * 0.12)}px ${SERIF}`;
  ctx.fillText("✦ Congratulations ✦", cx, cy - R * 0.16);
  ctx.font = `bold ${Math.round(R * 0.2)}px ${SERIF}`; ctx.fillStyle = goldFill(ctx, cx, cy, R * 1.4, accent);
  glowText(ctx, "Welcome", cx, cy + R * 0.12, accent, 26);
  ctx.fillStyle = "#fff"; const px = fitFont(ctx, o.name, R * 1.5, R * 0.16, 30, p => `bold ${p}px ${SERIF}`);
  const end = wrap(ctx, o.name, cx, cy + R * 0.34, R * 1.5, px * 1.1);
  if (o.handle) { ctx.fillStyle = accent; ctx.font = `bold ${Math.round(px * 0.5)}px ${SANS}`; ctx.fillText(o.handle, cx, end + px * 0.8); }
  const ry = cy + R + 110;
  ctx.fillStyle = accent; ctx.fillRect(cx - 390, ry - 44, 780, 88);
  ctx.beginPath(); ctx.moveTo(cx - 390, ry - 44); ctx.lineTo(cx - 450, ry); ctx.lineTo(cx - 390, ry + 44); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx + 390, ry - 44); ctx.lineTo(cx + 450, ry); ctx.lineTo(cx + 390, ry + 44); ctx.fill();
  ctx.fillStyle = "#1a1423"; ctx.font = `bold 36px ${SERIF}`; ctx.fillText(o.kicker, cx, ry + 13);
  ctx.fillStyle = "rgba(255,255,255,0.82)"; ctx.font = `30px ${SANS}`;
  wrap(ctx, o.features, cx, ry + 105, w * 0.8, 40);
}

const TPL_FNS = { classic: tplClassic, royal: tplRoyal, modern: tplModern, badge: tplBadge };

export function paintPoster(canvas, { format, template, bgImg, logoImg, emblem, accent, sparkles, tenant, brandHandle, site }) {
  const { w, h } = format;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  const resto = tenant?.business_type === "restaurant";
  const o = {
    w, h, cx: w / 2, accent, logoImg,
    name: tenant?.name || "Your Business Name", initial: (tenant?.name || "M")[0].toUpperCase(),
    location: tenant?.location || tenant?.city || "", handle: igHandle(tenant?.instagram_url),
    kicker: resto ? "Now serving smarter with Miracurl" : "Now part of the Miracurl family",
    features: resto ? "QR table ordering · Kitchen tickets · Smart billing · Reservations" : "Online bookings · Mira AI assistant · Smart billing · WhatsApp reminders",
    brandHandle, site,
  };
  drawBackground(ctx, w, h, bgImg, accent);
  if (sparkles) drawSparkles(ctx, w, h, accent);
  (TPL_FNS[template] || tplClassic)(ctx, o);
  drawFooter(ctx, o, emblem);
}

export function buildCaption(tenant, brandHandle) {
  const resto = tenant?.business_type === "restaurant";
  const handle = igHandle(tenant?.instagram_url);
  const who = `${tenant?.name || ""}${handle ? ` ${handle}` : ""}`.trim();
  const loc = tenant?.location ? ` in ${tenant.location}` : "";
  const tags = resto
    ? "#MiracurlSuite #RestaurantTech #QROrdering #KitchenDisplay #RestaurantOwners #NewPartner #WelcomeOnboard"
    : "#MiracurlSuite #SalonSoftware #SalonOwners #BeautyBusiness #OnlineBooking #NewPartner #WelcomeOnboard";
  return `🎉 Congratulations & a warm welcome to ${who}${loc}!\n\nYou're now part of the Miracurl family ✦ ${resto ? "QR table ordering, live kitchen tickets and one-tap billing" : "Online bookings, Mira AI assistant and smart billing"} — all in one suite.\n\nHere's to growing together 🥂\n\n${brandHandle} · miracurl-suite.com\n${tags}`;
}
