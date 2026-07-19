// Receipt HTML builder + hidden-iframe printing for POS invoices.
import { toast } from "sonner";
import { payLabel } from "@/components/pos/payLabels";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function buildReceiptHtml(inv, tenant) {
  const brandName = tenant?.name || "Your Salon";
  const brandLoc = tenant?.location || "";
  const sym = { INR: "₹", USD: "$", GBP: "£", EUR: "€", AED: "AED " }[tenant?.currency || "INR"] || "₹";
  const itemsHtml = inv.items.map(it => {
    const sub = (it.qty * it.price).toFixed(2);
    const staffLine = it.staff_name
      ? `<div style="font-size:10px;color:#666">by ${escapeHtml(it.staff_name)}</div>`
      : "";
    return `<tr><td>${escapeHtml(it.name)} × ${Number(it.qty)}${staffLine}</td><td style="text-align:right">${sym}${sub}</td></tr>`;
  }).join("");
  const showTax = Number(inv.tax) > 0;
  const tipHtml = Number(inv.tip) > 0
    ? `<div class="row"><span>Tip${inv.tip_staff_name ? ` (for ${escapeHtml(inv.tip_staff_name)})` : ""}</span><span>${sym}${inv.tip.toFixed(2)}</span></div>
<div class="row total"><span>Total incl. tip</span><span>${sym}${(inv.total + inv.tip).toFixed(2)}</span></div>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(inv.invoice_no)}</title>
<style>
  body{font-family:Arial,sans-serif;color:#000;padding:24px;max-width:420px;margin:auto}
  h1{font-family:Georgia,serif;text-align:center;margin:0;color:#a08300}
  .sub{text-align:center;font-size:11px;color:#666;margin-bottom:16px}
  .row{display:flex;justify-content:space-between;font-size:12px;padding:3px 0}
  table{width:100%;border-top:1px dashed #999;border-bottom:1px dashed #999;margin-top:12px}
  table td{padding:4px 0;font-size:12px}
  .total{font-family:Georgia,serif;font-size:18px;font-weight:700;border-top:2px solid #000;padding-top:6px;margin-top:6px}
  .foot{text-align:center;font-size:10px;color:#888;margin-top:20px}
</style></head><body>
<h1>${escapeHtml(brandName)} ✦</h1>
<div class="sub">${escapeHtml(brandLoc)}${brandLoc ? "<br/>" : ""}${escapeHtml(new Date(inv.created_at).toLocaleString())}</div>
<div class="row"><b>Invoice #</b><span>${escapeHtml(inv.invoice_no)}</span></div>
<div class="row"><b>Customer</b><span>${escapeHtml(inv.customer_name)}</span></div>
${inv.staff_name ? `<div class="row"><b>Stylist</b><span>${escapeHtml(inv.staff_name)}</span></div>` : ""}
<div class="row"><b>Payment</b><span>${escapeHtml(payLabel(inv.payment_mode))}</span></div>
<table>${itemsHtml}</table>
<div class="row"><span>Subtotal</span><span>${sym}${inv.subtotal.toFixed(2)}</span></div>
<div class="row"><span>Discount</span><span>−${sym}${inv.discount.toFixed(2)}</span></div>
${showTax ? `<div class="row"><span>Tax</span><span>${sym}${inv.tax.toFixed(2)}</span></div>` : ""}
<div class="row total"><span>Total</span><span>${sym}${inv.total.toFixed(2)}</span></div>
${tipHtml}
<div class="foot">Thank you for visiting ${escapeHtml(brandName)} ✦</div>
</body></html>`;
}

export function printInvoice(inv, tenant) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  iframe.srcdoc = buildReceiptHtml(inv, tenant);
  iframe.onload = () => {
    try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
    catch { toast.error("Unable to open print dialog"); }
    setTimeout(() => iframe.remove(), 1000);
  };
  document.body.appendChild(iframe);
}
