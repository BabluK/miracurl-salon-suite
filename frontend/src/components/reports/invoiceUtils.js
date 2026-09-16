export const istDay = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
export const shiftDay = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return istDay(x); };
export const inr = (n) => `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export const MODE_STYLE = {
  upi: "bg-violet-50 text-violet-700 border-violet-100", cash: "bg-emerald-50 text-emerald-700 border-emerald-100",
  card: "bg-sky-50 text-sky-700 border-sky-100", salon_wallet: "bg-amber-50 text-amber-700 border-amber-100",
  other: "bg-slate-100 text-slate-600 border-slate-200",
};
export const MODE_LABEL = { upi: "UPI", cash: "Cash", card: "Card", salon_wallet: "Wallet", other: "Other" };
export const modeKey = (i) => { const m = (i.payment_mode || "other").toLowerCase(); return MODE_STYLE[m] ? m : "other"; };

export const RANGES = [["today", "Today"], ["yesterday", "Yesterday"], ["week", "This Week"], ["month", "This Month"], ["custom", "Custom Range"]];

export function rangeBounds(range, from, to) {
  const today = istDay(new Date());
  if (range === "today") return [today, today];
  if (range === "yesterday") return [shiftDay(-1), shiftDay(-1)];
  if (range === "week") return [shiftDay(-((new Date().getDay() + 6) % 7)), today];
  if (range === "month") return [today.slice(0, 8) + "01", today];
  return [from || null, to || null];
}

export function filterInvoices(rows, { q, range, from, to }) {
  const [lo, hi] = rangeBounds(range, from, to);
  const needle = q.trim().toLowerCase();
  return rows.filter(i => {
    const d = istDay(i.created_at);
    if (lo && d < lo) return false;
    if (hi && d > hi) return false;
    if (!needle) return true;
    return `${i.invoice_no || ""} ${i.id} ${i.customer_name || ""} ${i.customer_phone || ""}`.toLowerCase().includes(needle);
  });
}

export function downloadCsv(rows, name) {
  const esc = (v) => { const t = String(v ?? ""); return `"${(/^[=+\-@\t\r]/.test(t) ? "'" + t : t).replace(/"/g, '""')}"`; };
  const head = ["Booking ID", "Customer", "Phone", "Date", "Mode", "Status", "Subtotal", "Discount", "GST", "Total"];
  const lines = rows.map(i => [i.invoice_no || i.id, i.customer_name || "Walk-in", i.customer_phone || "",
    new Date(i.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), MODE_LABEL[modeKey(i)],
    i.status === "voided" ? "Void" : i.status === "open" ? "Open" : "Paid", i.subtotal || 0, i.discount || 0, i.tax || 0, i.total || 0].map(esc).join(","));
  const blob = new Blob([[head.map(esc).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
