import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { ShoppingBag } from "lucide-react";

export const ProductsLaunchPanel = () => {
  const [cfg, setCfg] = useState({ available: false, razorpay_link: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/public/products-config").then(({ data }) => setCfg(data)).catch(() => {});
  }, []);

  async function save(next) {
    setBusy(true);
    try {
      await api.put("/super-admin/products-config", next);
      setCfg(next);
      toast.success(next.available ? "Products are LIVE — Order Now enabled on /products 🎉" : "Products set to Coming Soon");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't save");
    } finally { setBusy(false); }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5" data-testid="products-launch-panel">
      <h3 className="font-semibold text-slate-800 flex items-center gap-2"><ShoppingBag className="w-4 h-4 text-rose-500" /> Miracurl Products Launch</h3>
      <p className="text-xs text-slate-500 mt-1">Controls the public <a href="/products" target="_blank" rel="noreferrer" className="text-sky-600 underline">/products</a> page. When ON, "Coming Soon" disappears and everyone can Order Now &amp; pay via your Razorpay link.</p>
      <div className="flex items-center justify-between mt-4">
        <span className="text-sm font-medium text-slate-700">Products available to order</span>
        <button
          data-testid="products-available-toggle"
          disabled={busy}
          onClick={() => save({ ...cfg, available: !cfg.available })}
          className={`w-12 h-6 rounded-full relative transition-colors ${cfg.available ? "bg-emerald-500" : "bg-slate-300"}`}>
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${cfg.available ? "left-6" : "left-0.5"}`} />
        </button>
      </div>
      <div className="mt-3">
        <label className="text-xs text-slate-500 font-medium">Razorpay payment link (rzp.io/…)</label>
        <div className="flex gap-2 mt-1">
          <input
            data-testid="products-razorpay-link-input"
            value={cfg.razorpay_link}
            onChange={e => setCfg(c => ({ ...c, razorpay_link: e.target.value }))}
            placeholder="https://rzp.io/l/miracurl-products"
            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200" />
          <button data-testid="products-config-save-btn" disabled={busy} onClick={() => save(cfg)}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-700 disabled:opacity-50">Save</button>
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5">Orders are saved in the system; payment queries go to payments@miracurl-suite.com.</p>
      </div>
    </div>
  );
};
