import api from "@/lib/api";
import { toast } from "sonner";

export const CUR = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };
export const fmtAmt = (inv) => `${CUR[inv.currency] || inv.currency + " "}${Number(inv.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 0 })}`;

export async function downloadInvoicePdf(base, inv, kind) {
  try {
    const r = await api.get(`${base}/${inv.id}/${kind}.pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = kind === "terms" ? "Miracurl-Terms-and-Conditions.pdf" : `Miracurl-${kind}-${inv.number}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) { toast.error("Couldn't download PDF"); }
}

export function InvoiceDocButtons({ base, inv, testPrefix }) {
  const btn = "px-2.5 py-1 rounded-full border text-[11px] font-semibold hover:bg-slate-50 transition-colors";
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button onClick={() => downloadInvoicePdf(base, inv, "invoice")} className={`${btn} border-amber-300 text-amber-800`} data-testid={`${testPrefix}-invoice-${inv.id}`}>Invoice PDF</button>
      <button onClick={() => downloadInvoicePdf(base, inv, "receipt")} className={`${btn} border-emerald-300 text-emerald-800`} data-testid={`${testPrefix}-receipt-${inv.id}`}>Receipt</button>
      <button onClick={() => downloadInvoicePdf(base, inv, "terms")} className={`${btn} border-slate-300 text-slate-600`} data-testid={`${testPrefix}-terms-${inv.id}`}>T&amp;C</button>
    </div>
  );
}
