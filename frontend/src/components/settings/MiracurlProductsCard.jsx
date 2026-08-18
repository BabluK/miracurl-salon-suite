import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { ShoppingBag } from "lucide-react";

export function MiracurlProductsCard() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    api.get("/settings/miracurl-products").then(r => setEnabled(r.data.enabled)).catch(() => {});
  }, []);

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    try {
      await api.put("/settings/miracurl-products", { enabled: next });
      toast.success(next ? "Miracurl Products now shown on your booking page ✦" : "Miracurl Products hidden from your booking page");
    } catch (e) {
      setEnabled(!next);
      toast.error(e.response?.data?.detail || "Couldn't save");
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 mt-6" data-testid="miracurl-products-card">
      <div className="flex items-center justify-between">
        <h3 className="text-slate-800 font-semibold flex items-center gap-2"><ShoppingBag className="w-4 h-4 text-amber-600" /> Miracurl Products on booking page</h3>
        <button type="button" role="switch" aria-checked={enabled} onClick={toggle} data-testid="miracurl-products-toggle"
          className={`relative inline-flex h-5 w-9 rounded-full transition ${enabled ? "bg-amber-500" : "bg-slate-300"}`}>
          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition mt-0.5 ${enabled ? "ml-4" : "ml-0.5"}`} />
        </button>
      </div>
      <p className="text-xs text-slate-500 mt-2">
        Show the Miracurl Hair Science product range (shampoo, conditioner, hair botox) on your public booking page so your customers can order online.
      </p>
    </div>
  );
}
