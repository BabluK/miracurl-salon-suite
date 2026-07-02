import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Plus, X, Edit3, Trash2, AlertTriangle, Package } from "lucide-react";
import { toast } from "sonner";
import ImageUploader from "@/components/ImageUploader";

export default function Inventory() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", brand: "", category: "Hair Care", sku: "", price: "", cost: "", stock: "", low_stock_threshold: 5, image_url: "" });

  const load = useCallback(async () => { const { data } = await api.get("/products"); setList(data); }, []);
  useEffect(() => { load(); }, [load]);

  function startNew() { setEditing(null); setForm({ name: "", brand: "", category: "Hair Care", sku: "", price: "", cost: "", stock: "", low_stock_threshold: 5, image_url: "" }); setOpen(true); }
  function startEdit(p) { setEditing(p); setForm({ ...p }); setOpen(true); }

  async function save(e) {
    e.preventDefault();
    try {
      const payload = { ...form, price: parseFloat(form.price), cost: parseFloat(form.cost), stock: parseInt(form.stock), low_stock_threshold: parseInt(form.low_stock_threshold) };
      if (editing) await api.put(`/products/${editing.id}`, payload);
      else await api.post("/products", payload);
      toast.success(editing ? "Updated" : "Added"); setOpen(false); load();
    } catch (err) { toast.error(err.response?.data?.detail || "Save failed"); }
  }
  async function remove(id) { if (!window.confirm("Delete?")) return; await api.delete(`/products/${id}`); toast.success("Deleted"); load(); }

  const lowStock = list.filter(p => p.stock <= p.low_stock_threshold);

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-playfair text-3xl">Inventory</h1>
          <p className="text-slate-500 text-sm mt-1">Track products, stock and reorder alerts.</p>
        </div>
        <button data-testid="add-product-btn" onClick={startNew} className="btn-blue flex items-center gap-2"><Plus className="w-4 h-4" /> Add Product</button>
      </div>

      {lowStock.length > 0 && (
        <div className="card-light bg-amber-500/5 border-amber-500/20 flex items-start gap-3" data-testid="low-stock-banner">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
          <div>
            <div className="font-medium text-amber-400">{lowStock.length} product(s) low on stock</div>
            <div className="text-xs text-slate-500 mt-1">{lowStock.map(p => p.name).join(" • ")}</div>
          </div>
        </div>
      )}

      <div className="card-light p-0 overflow-x-auto">
        <table className="luxe-table-light min-w-[720px]">
          <thead>
            <tr>
              <th>Product</th><th>SKU</th><th>Category</th><th>Cost</th><th>Price</th><th>Stock</th><th></th>
            </tr>
          </thead>
          <tbody>
            {list.map(p => {
              const low = p.stock <= p.low_stock_threshold;
              return (
                <tr key={p.id} data-testid={`product-row-${p.id}`}>
                  <td>
                    <div className="flex items-center gap-3">
                      <img src={p.image_url || "https://images.unsplash.com/photo-1583209814683-c023dd293cc6?w=80"} alt="" className="w-10 h-10 rounded object-cover" />
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-slate-500">{p.brand}</div>
                      </div>
                    </div>
                  </td>
                  <td className="font-mono text-xs text-slate-500">{p.sku}</td>
                  <td className="text-sm">{p.category}</td>
                  <td className="text-sm">₹{p.cost}</td>
                  <td className="text-sky-600 font-medium">₹{p.price}</td>
                  <td>
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded font-mono ${low ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                      <Package className="w-3 h-3" /> {p.stock}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2 justify-end">
                      <button data-testid={`edit-product-${p.id}`} onClick={() => startEdit(p)} className="p-2 hover:bg-slate-50 rounded text-slate-500 hover:text-sky-600"><Edit3 className="w-4 h-4" /></button>
                      <button data-testid={`delete-product-${p.id}`} onClick={() => remove(p.id)} className="p-2 hover:bg-red-500/10 rounded text-slate-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && <tr><td colSpan="7" className="text-center text-slate-500 py-12">No products yet</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="card-light w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-playfair text-2xl">{editing ? "Edit Product" : "New Product"}</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label-light block mb-1">Name *</label><input data-testid="product-name-input" required className="input-light" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div><label className="label-light block mb-1">Brand</label><input className="input-light" value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label-light block mb-1">SKU *</label><input data-testid="product-sku-input" required className="input-light" value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} /></div>
                <div><label className="label-light block mb-1">Category</label><input className="input-light" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div><label className="label-light block mb-1">Cost ₹</label><input type="number" required className="input-light" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} /></div>
                <div><label className="label-light block mb-1">Price ₹</label><input type="number" required className="input-light" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></div>
                <div><label className="label-light block mb-1">Stock</label><input type="number" required className="input-light" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} /></div>
                <div><label className="label-light block mb-1">Low @</label><input type="number" className="input-light" value={form.low_stock_threshold} onChange={e => setForm({ ...form, low_stock_threshold: e.target.value })} /></div>
              </div>
              <div>
                <label className="label-light block mb-1">Product image</label>
                <ImageUploader
                  kind="product"
                  value={form.image_url}
                  onChange={(url) => setForm({ ...form, image_url: url })}
                  onUploaded={async (url) => {
                    if (!editing) { toast.success("Image attached — it saves with the product ✦"); return; }
                    try {
                      await api.put(`/products/${editing.id}`, { ...form, image_url: url, price: parseFloat(form.price), cost: parseFloat(form.cost), stock: parseInt(form.stock), low_stock_threshold: parseInt(form.low_stock_threshold) });
                      toast.success("Image uploaded & saved ✦");
                      load();
                    } catch { toast.error("Auto-save failed — press Save"); }
                  }}
                  fallback="https://images.unsplash.com/photo-1583209814683-c023dd293cc6?w=80"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="btn-slate flex-1">Cancel</button>
                <button data-testid="save-product-btn" type="submit" className="btn-blue flex-1">{editing ? "Update" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
