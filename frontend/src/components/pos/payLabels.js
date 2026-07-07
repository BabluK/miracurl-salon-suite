// Single source of truth: what the cashier taps is exactly what prints on every receipt.
export const PAY_LABELS = {
  cash: "Cash",
  card: "Card",
  upi: "GPay",
  wallet: "Phone Pay",
};

export function payLabel(mode) {
  return PAY_LABELS[String(mode || "").toLowerCase()] || String(mode || "").toUpperCase();
}
