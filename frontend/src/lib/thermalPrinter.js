// Thermal receipt printing: ESC/POS builder + Web Bluetooth / Web Serial transports.

const ENC = new TextEncoder();

// ---- ESC/POS command helpers ----
const CMD = {
  INIT: [0x1b, 0x40],
  ALIGN_LEFT: [0x1b, 0x61, 0],
  ALIGN_CENTER: [0x1b, 0x61, 1],
  BOLD_ON: [0x1b, 0x45, 1],
  BOLD_OFF: [0x1b, 0x45, 0],
  DOUBLE_ON: [0x1d, 0x21, 0x11],
  DOUBLE_OFF: [0x1d, 0x21, 0x00],
  FEED4: [0x1b, 0x64, 4],
  CUT: [0x1d, 0x56, 66, 0],
};

// Thermal printers rarely support ₹ — use "Rs." and strip non-ASCII.
const ascii = (s) => String(s ?? "").replace(/₹/g, "Rs.").replace(/[^\x20-\x7E]/g, "");
const money = (n) => `Rs.${Number(n || 0).toFixed(2)}`;

function wrap(text, width) {
  const words = ascii(text).split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width) {
      if (cur) lines.push(cur);
      cur = w.slice(0, width);
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

const lr = (left, right, width) => {
  const l = ascii(left); const r = ascii(right);
  const pad = width - l.length - r.length;
  return pad >= 1 ? l + " ".repeat(pad) + r : l.slice(0, Math.max(width - r.length - 1, 0)) + " " + r;
};

// ESC/POS native QR code (GS ( k) — supported by most modern thermal printers.
function qrBytes(data) {
  const payload = ENC.encode(data);
  const len = payload.length + 3;
  const out = [
    [0x1d, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0x00],          // model 2
    [0x1d, 0x28, 0x6b, 3, 0, 0x31, 0x43, 0x06],                 // module size 6
    [0x1d, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31],                 // error correction M
    [0x1d, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30], // store
  ];
  const chunks = out.map(a => new Uint8Array(a));
  chunks.splice(4, 0, payload);
  chunks.push(new Uint8Array([0x1d, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30])); // print
  return chunks;
}

export function buildReceiptBytes(invoice, tenant, paperWidth = 32) {
  const W = paperWidth; // 32 chars (58mm) or 48 chars (80mm)
  const out = [];
  const raw = (arr) => out.push(new Uint8Array(arr));
  const txt = (s) => out.push(ENC.encode(s + "\n"));
  const rule = () => txt("-".repeat(W));

  raw(CMD.INIT);
  raw(CMD.ALIGN_CENTER);
  raw(CMD.DOUBLE_ON); raw(CMD.BOLD_ON);
  wrap(tenant?.name || "Your Salon", Math.floor(W / 2)).forEach(txt);
  raw(CMD.DOUBLE_OFF); raw(CMD.BOLD_OFF);
  if (tenant?.location) wrap(tenant.location, W).forEach(txt);
  if (tenant?.phone) txt(`Ph: ${ascii(tenant.phone)}`);
  if (tenant?.gst_number) txt(`GSTIN: ${ascii(tenant.gst_number)}`);
  rule();

  raw(CMD.ALIGN_LEFT);
  txt(lr(`Bill: ${ascii(invoice.invoice_no)}`, "", W));
  txt(lr("Date:", new Date(invoice.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }), W));
  txt(lr("Customer:", ascii(invoice.customer_name).slice(0, W - 10), W));
  if (invoice.staff_name) txt(lr("Stylist:", ascii(invoice.staff_name).slice(0, W - 9), W));
  if (invoice.branch_name) txt(lr("Branch:", ascii(invoice.branch_name).slice(0, W - 8), W));
  rule();

  for (const it of invoice.items || []) {
    wrap(it.name, W).forEach(txt);
    txt(lr(`  ${it.qty} x ${money(it.price)}`, money(it.qty * it.price), W));
  }
  rule();

  txt(lr("Subtotal", money(invoice.subtotal), W));
  if (Number(invoice.discount) > 0) txt(lr("Discount", `-${money(invoice.discount)}`, W));
  if (Number(invoice.tax) > 0) txt(lr("Tax (GST)", money(invoice.tax), W));
  raw(CMD.BOLD_ON); raw(CMD.DOUBLE_ON);
  txt(lr("TOTAL", money(invoice.total), Math.floor(W / 2)));
  raw(CMD.DOUBLE_OFF); raw(CMD.BOLD_OFF);
  txt(lr("Paid by", (invoice.payment_mode || "").toUpperCase(), W));
  if (invoice.points_earned) txt(lr("Points earned", `+${invoice.points_earned}`, W));
  if (invoice.points_used) txt(lr("Points redeemed", `-${invoice.points_used}`, W));
  rule();

  raw(CMD.ALIGN_CENTER);
  const reviewUrl = tenant?.google_review_url || "";
  const bookUrl = !reviewUrl && tenant?.slug && typeof window !== "undefined"
    ? `${window.location.origin}/book/${tenant.slug}` : "";
  const qrUrl = reviewUrl || bookUrl;
  if (qrUrl) {
    txt(reviewUrl ? "Loved it? Scan & rate us on Google!" : "Scan to book your next visit!");
    qrBytes(qrUrl).forEach(c => out.push(c));
    txt("");
  }
  txt("Thank you! Visit again :)");
  txt("Powered by Miracurl");
  raw(CMD.FEED4);
  raw(CMD.CUT);

  const total = out.reduce((n, a) => n + a.length, 0);
  const bytes = new Uint8Array(total);
  let off = 0;
  for (const a of out) { bytes.set(a, off); off += a.length; }
  return bytes;
}

// ---- Transports ----
const BLE_PRINTER_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "0000ff00-0000-1000-8000-00805f9b34fb",
];

const state = { type: null, device: null, characteristic: null, port: null, name: "" };

export const printerSupport = () => ({
  bluetooth: typeof navigator !== "undefined" && !!navigator.bluetooth,
  serial: typeof navigator !== "undefined" && !!navigator.serial,
});

export const getConnectedPrinter = () =>
  state.type ? { type: state.type, name: state.name } : null;

export async function connectBluetooth() {
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: BLE_PRINTER_SERVICES,
  });
  const server = await device.gatt.connect();
  const services = await server.getPrimaryServices();
  let ch = null;
  for (const svc of services) {
    const chars = await svc.getCharacteristics();
    ch = chars.find(c => c.properties.writeWithoutResponse) || chars.find(c => c.properties.write);
    if (ch) break;
  }
  if (!ch) {
    device.gatt.disconnect();
    throw new Error("This Bluetooth device doesn't accept print data — is it a thermal printer?");
  }
  device.addEventListener("gattserverdisconnected", () => {
    if (state.device === device) Object.assign(state, { type: null, device: null, characteristic: null, name: "" });
  });
  Object.assign(state, { type: "bluetooth", device, characteristic: ch, port: null, name: device.name || "Bluetooth printer" });
  return state.name;
}

export async function connectSerial(baudRate = 9600) {
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate });
  Object.assign(state, { type: "serial", port, device: null, characteristic: null, name: "USB/Serial printer" });
  return state.name;
}

export async function disconnectPrinter() {
  try {
    if (state.type === "bluetooth" && state.device?.gatt?.connected) state.device.gatt.disconnect();
    if (state.type === "serial" && state.port) await state.port.close();
  } catch { /* already gone */ }
  Object.assign(state, { type: null, device: null, characteristic: null, port: null, name: "" });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function printBytes(bytes) {
  if (state.type === "bluetooth") {
    if (!state.device?.gatt?.connected) await state.device.gatt.connect();
    const CHUNK = 100;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const part = bytes.slice(i, i + CHUNK);
      if (state.characteristic.properties.writeWithoutResponse) {
        await state.characteristic.writeValueWithoutResponse(part);
      } else {
        await state.characteristic.writeValue(part);
      }
      await sleep(25);
    }
    return;
  }
  if (state.type === "serial") {
    const writer = state.port.writable.getWriter();
    try { await writer.write(bytes); } finally { writer.releaseLock(); }
    return;
  }
  throw new Error("No printer connected");
}

export const getPaperWidth = () => Number(localStorage.getItem("thermal_paper_width") || 32);
export const setPaperWidth = (w) => localStorage.setItem("thermal_paper_width", String(w));
