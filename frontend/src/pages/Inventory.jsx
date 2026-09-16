import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { Plus, X, Edit3, Trash2, AlertTriangle, Package, Download, Upload, Minus, ShoppingBag, Droplets } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import ImageUploader from "@/components/ImageUploader";
import { usePager } from "@/components/crm/CrmBits";
import { PageHeader, SearchBox, GoldBtn, GhostBtn, ExportBtn, KpiStrip, KpiTile } from "@/components/shell/PageShell";
import { PackageX, IndianRupee } from "lucide-react";

export default function Inventory() {
  const [invQ, setInvQ] = useState("");
  const [list, setList] = useState([]);
  const [confirmAsk, setConfirmAsk] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", brand: "", category: "Hair Care", sku: "", price: "", cost: "", stock: "", low_stock_threshold: 5, image_url: "", vendor_id: "", product_type: "retail" });
  const [vendors, setVendors] = useState([]);
  const [tab, setTab] = useState("all"); // all | retail | in_house
  const [useFor, setUseFor] = useState(null); // product being deducted
  const [useQty, setUseQty] = useState(1);

  const load = useCallback(async () => { const { data } = await api.get("/products"); setList(data); }, []);
  useEffect(() => {
    load();
    api.get("/vendors").then(r => setVendors(r.data)).catch(() => {});
  }, [load]);
  const csvRef = useRef(null);

  async function exportCsv() {
    try {
      const res = await api.get("/products/export", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = "products.csv"; a.click();
      URL.revokeObjectURL(url);
      toast.success("products.csv downloaded — opens in Excel / Google Sheets");
    } catch { toast.error("Export failed"); }
  }

  async function handleImportCsv(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    try {
      const { data } = await api.post("/products/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`Imported: ${data.added} added · ${data.updated} updated${data.skipped ? ` · ${data.skipped} skipped` : ""}`);
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Import failed"); }
    finally { e.target.value = ""; }
  }

  function startNew() { setEditing(null); setForm({ name: "", brand: "", category: "Hair Care", sku: "", price: "", cost: "", stock: "", low_stock_threshold: 5, image_url: "", vendor_id: "", product_type: "retail" }); setOpen(true); }
  function startEdit(p) { setEditing(p); setForm({ ...p, vendor_id: p.vendor_id || "", product_type: p.product_type || "retail" }); setOpen(true); }

  async function save(e) {
    e.preventDefault();
    try {
      const payload = { ...form, price: parseFloat(form.price), cost: parseFloat(form.cost), stock: parseInt(form.stock), low_stock_threshold: parseInt(form.low_stock_threshold), vendor_id: form.vendor_id || null };
      if (editing) await api.put(`/products/${editing.id}`, payload);
      else await api.post("/products", payload);
      toast.success(editing ? "Updated" : "Added"); setOpen(false); load();
    } catch (err) { toast.error(err.response?.data?.detail || "Save failed"); }
  }
  async function remove(id) {
    setConfirmAsk({
      title: "Delete product?", message: "It will be removed from your inventory.", confirmLabel: "Yes, delete", danger: true,
      action: async () => {
        try { await api.delete(`/products/${id}`); toast.success("Deleted"); load(); }
        catch (err) { toast.error(err.response?.data?.detail || "Delete failed"); }
      },
    });
  }

  const lowStock = list.filter(p => p.stock <= p.low_stock_threshold);
  const shown = list.filter(p => (tab === "all" ? true : (p.product_type || "retail") === tab) &&
    (!invQ.trim() || `${p.name} ${p.brand || ""} ${p.sku || ""}`.toLowerCase().includes(invQ.trim().toLowerCase())));
  const { paged: shownPage, pager, resetPage } = usePager(shown, "products");

  async function recordUse(e) {
    e.preventDefault();
    try {
      const { data } = await api.post(`/products/${useFor.id}/use`, { qty: parseInt(useQty) });
      toast.success(`Deducted ${useQty} — ${data.stock} left${data.low_stock ? " · LOW STOCK, remind your vendor!" : ""}`);
      setUseFor(null); setUseQty(1); load();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
  }

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800 space-y-6">
      <PageHeader title="Inventory" subtitle="Track products, stock levels and reorder alerts."
        right={<>
          <SearchBox value={invQ} onChange={setInvQ} placeholder="Search product, brand or SKU…" testid="inventory-search" className="w-[280px] max-w-full" />
          <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleImportCsv} data-testid="import-products-csv-input" />
          <GhostBtn icon={Upload} data-testid="import-products-csv-btn" onClick={() => csvRef.current?.click()} title="Bulk add/update products from CSV">Import CSV</GhostBtn>
          <ExportBtn data-testid="export-products-csv-btn" onClick={exportCsv} title="Download all products as CSV">Export</ExportBtn>
          <GoldBtn data-testid="add-product-btn" onClick={startNew} icon={Plus}>Add Product</GoldBtn>
        </>} />

      <KpiStrip cols={4}>
        <KpiTile icon={Package} tone="gold" label="Products" value={list.length} sub={`${list.filter(p => (p.product_type || "retail") === "retail").length} retail · ${list.filter(p => p.product_type === "in_house").length} in-house`} testid="inv-kpi-total" />
        <KpiTile icon={AlertTriangle} tone="amber" label="Low Stock" value={lowStock.length} sub="at or below reorder level" testid="inv-kpi-low" />
        <KpiTile icon={PackageX} tone="rose" label="Out of Stock" value={list.filter(p => (p.stock || 0) <= 0).length} sub="needs reorder now" testid="inv-kpi-out" />
        <KpiTile icon={IndianRupee} tone="emerald" label="Stock Value" value={`₹${list.reduce((a, p) => a + (p.stock || 0) * (p.cost_price || p.price || 0), 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} sub="at cost / list price" testid="inv-kpi-value" />
      </KpiStrip>

      {lowStock.length > 0 && (
        <div className="card-light bg-amber-500/5 border-amber-500/20 flex items-start gap-3" data-testid="low-stock-banner">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
          <div>
            <div className="font-medium text-amber-400">{lowStock.length} product(s) low on stock</div>
            <div className="text-xs text-slate-500 mt-1">{lowStock.map(p => p.name).join(" • ")}</div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {[["all", "All"], ["retail", "Retail · For Sale"], ["in_house", "In-house · Service Use"]].map(([k, l]) => (
          <button key={k} data-testid={`inv-tab-${k}`} onClick={() => { setTab(k); resetPage(); }}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${tab === k ? "bg-gradient-to-r from-[#b8893a] to-[#8f6a2a] text-white border-transparent" : "bg-white text-slate-500 border-slate-200 hover:border-[#b8893a]/40"}`}>
            {l}
          </button>
        ))}
        <span className="text-xs text-slate-400 ml-2 hidden sm:block">Retail = sold to guests (staff earn commission) · In-house = colours/consumables used by services</span>
      </div>

      <div className="card-light p-0 overflow-x-auto">
        <table className="luxe-table-light min-w-[780px]">
          <thead>
            <tr>
              <th>Product</th><th>Type</th><th>SKU</th><th>Category</th><th>Vendor</th><th>Cost</th><th>Price</th><th>Stock</th><th></th>
            </tr>
          </thead>
          <tbody>
            {shownPage.map(p => {
              const low = p.stock <= p.low_stock_threshold;
              const inHouse = (p.product_type || "retail") === "in_house";
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
                  <td>
                    <span data-testid={`product-type-${p.id}`} className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full font-semibold ${inHouse ? "bg-violet-500/10 text-violet-500" : "bg-sky-500/10 text-sky-600"}`}>
                      {inHouse ? <Droplets className="w-3 h-3" /> : <ShoppingBag className="w-3 h-3" />}
                      {inHouse ? "In-house" : "Retail"}
                    </span>
                  </td>
                  <td className="font-mono text-xs text-slate-500">{p.sku}</td>
                  <td className="text-sm">{p.category}</td>
                  <td className="text-xs text-slate-500" data-testid={`product-vendor-${p.id}`}>
                    {vendors.find(v => v.id === p.vendor_id)?.name || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="text-sm">₹{p.cost}</td>
                  <td className="text-sky-600 font-medium">₹{p.price}</td>
                  <td>
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded font-mono ${low ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                      <Package className="w-3 h-3" /> {p.stock}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2 justify-end">
                      {inHouse && (
                        <button data-testid={`use-product-${p.id}`} onClick={() => { setUseFor(p); setUseQty(1); }}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-violet-500/10 text-violet-500 hover:bg-violet-500/20 transition-colors" title="Deduct stock used by services today">
                          <Minus className="w-3.5 h-3.5" /> Use
                        </button>
                      )}
                      <button data-testid={`edit-product-${p.id}`} onClick={() => startEdit(p)} className="p-2 hover:bg-slate-50 rounded text-slate-500 hover:text-sky-600"><Edit3 className="w-4 h-4" /></button>
                      <button data-testid={`delete-product-${p.id}`} onClick={() => remove(p.id)} className="p-2 hover:bg-red-500/10 rounded text-slate-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && <tr><td colSpan="9" className="text-center text-slate-500 py-12">No products {tab !== "all" ? "in this category" : "yet"}</td></tr>}
          </tbody>
        </table>
        {pager}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="card-light w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-playfair text-2xl">{editing ? "Edit Product" : "New Product"}</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div>
                <label className="label-light block mb-1">Product type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" data-testid="ptype-retail-btn" onClick={() => setForm({ ...form, product_type: "retail" })}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-colors ${form.product_type !== "in_house" ? "border-sky-500 bg-sky-500/5 text-sky-700 font-semibold" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                    <ShoppingBag className="w-4 h-4" />
                    <span className="text-left">Retail<span className="block text-[10px] font-normal text-slate-400">For sale · staff commission</span></span>
                  </button>
                  <button type="button" data-testid="ptype-inhouse-btn" onClick={() => setForm({ ...form, product_type: "in_house" })}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-colors ${form.product_type === "in_house" ? "border-violet-500 bg-violet-500/5 text-violet-700 font-semibold" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                    <Droplets className="w-4 h-4" />
                    <span className="text-left">In-house<span className="block text-[10px] font-normal text-slate-400">Colour/consumables · service use</span></span>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label-light block mb-1">Name *</label><input data-testid="product-name-input" required className="input-light" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div><label className="label-light block mb-1">Brand</label><input className="input-light" value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label-light block mb-1">SKU *</label><input data-testid="product-sku-input" required className="input-light" value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} /></div>
                <div><label className="label-light block mb-1">Category</label><input className="input-light" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
              </div>
              <div>
                <label className="label-light block mb-1">Vendor / Supplier <span className="text-slate-400 normal-case">(restock emails go to them)</span></label>
                <select data-testid="product-vendor-select" className="input-light w-full" value={form.vendor_id || ""} onChange={e => setForm({ ...form, vendor_id: e.target.value })}>
                  <option value="">— No vendor —</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}{v.contact_person ? ` (${v.contact_person})` : ""}</option>)}
                </select>
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
      {useFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setUseFor(null)}>
          <div className="card-light w-full max-w-sm mx-4" onClick={e => e.stopPropagation()} data-testid="use-stock-modal">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-playfair text-xl">Record usage</h3>
              <button onClick={() => setUseFor(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-slate-500 mb-4"><b className="text-slate-700">{useFor.name}</b> — {useFor.stock} in stock. How many units did services consume?</p>
            <form onSubmit={recordUse} className="space-y-4">
              <input data-testid="use-qty-input" type="number" min="1" max={Math.max(1, useFor.stock)} required autoFocus
                     className="input-light w-full text-center text-lg font-semibold" value={useQty} onChange={e => setUseQty(e.target.value)} />
              <div className="flex gap-3">
                <button type="button" onClick={() => setUseFor(null)} className="btn-slate flex-1">Cancel</button>
                <button data-testid="use-confirm-btn" type="submit" className="flex-1 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors">
                  Deduct from stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {confirmAsk && (
        <ConfirmDialog open key={confirmAsk.title} title={confirmAsk.title} message={confirmAsk.message}
          confirmLabel={confirmAsk.confirmLabel} danger={confirmAsk.danger}
          onConfirm={() => { setConfirmAsk(null); confirmAsk.action(); }} onClose={() => setConfirmAsk(null)} />
      )}
    </div>
  );
}

