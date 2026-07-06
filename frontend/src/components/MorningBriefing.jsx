import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Sun, Moon, Sunset, Send, Plus, X, Loader2 } from "lucide-react";

export function MorningBriefing() {
  const [brief, setBrief] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [sending, setSending] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [vForm, setVForm] = useState({ name: "", email: "", phone: "" });

  const todayKey = `mira_briefing_${new Date().toISOString().slice(0, 10)}`;

  useEffect(() => {
    if (localStorage.getItem(todayKey)) { setDismissed(true); return; }
    api.get("/reports/morning-briefing").then(r => {
      setBrief(r.data);
      if (r.data.vendors?.length) setVendorId(r.data.vendors[0].id);
    }).catch(() => {});
  }, [todayKey]);

  if (dismissed || !brief) return null;
  const Icon = brief.salutation === "Good Morning" ? Sun : brief.salutation === "Good Afternoon" ? Sunset : Moon;
  const low = brief.low_stock || [];

  function dismiss() {
    localStorage.setItem(todayKey, "1");
    setDismissed(true);
  }

  async function addVendor(e) {
    e.preventDefault();
    try {
      const { data } = await api.post("/vendors", { ...vForm, email: vForm.email.trim() });
      setBrief(b => ({ ...b, vendors: [...b.vendors, data] }));
      setVendorId(data.id);
      setAddOpen(false);
      setVForm({ name: "", email: "", phone: "" });
      toast.success(`Vendor ${data.name} added ✦`);
    } catch (err) {
      toast.error(err.response?.data?.detail?.[0]?.msg || err.response?.data?.detail || "Couldn't add vendor");
    }
  }

  async function sendMail() {
    if (!vendorId) { toast.info("Add a vendor first"); return; }
    setSending(true);
    try {
      const { data } = await api.post("/vendors/send-low-stock", { vendor_id: vendorId });
      toast.success(`Restock request for ${data.products} products emailed to ${data.sent_to} ✦`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Email failed");
    } finally { setSending(false); }
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 p-5 relative" data-testid="morning-briefing-card">
      <button onClick={dismiss} data-testid="briefing-dismiss-btn" className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-playfair text-xl text-slate-800" data-testid="briefing-greeting">
            {brief.salutation}, {brief.name} ✦
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {brief.date_label} · {brief.today_appointments} appointment{brief.today_appointments === 1 ? "" : "s"} today — Mira's daily briefing
          </p>

          {low.length === 0 ? (
            <p className="text-sm text-emerald-700 mt-3" data-testid="briefing-stock-ok">✅ Inventory looks healthy — no product is below {brief.low_stock_limit} units.</p>
          ) : (
            <div className="mt-3" data-testid="briefing-low-stock">
              <p className="text-sm text-slate-700">
                <b className="text-rose-600">⚠ {low.length} product{low.length === 1 ? " is" : "s are"} running low</b> (below {brief.low_stock_limit} units) — consider reordering today:
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {low.slice(0, 8).map(p => (
                  <span key={p.id} className="text-[11px] px-2 py-1 rounded-full bg-white border border-rose-200 text-rose-700" data-testid={`low-stock-chip-${p.id}`}>
                    {p.name} · {p.stock} left
                  </span>
                ))}
                {low.length > 8 && <span className="text-[11px] text-slate-400 self-center">+{low.length - 8} more</span>}
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-3">
                {brief.vendors.length > 0 && (
                  <select data-testid="briefing-vendor-select" value={vendorId} onChange={e => setVendorId(e.target.value)}
                    className="text-xs px-2 py-2 rounded-lg border border-slate-200 bg-white text-slate-700">
                    {brief.vendors.map(v => <option key={v.id} value={v.id}>{v.name} ({v.email})</option>)}
                  </select>
                )}
                <button data-testid="briefing-send-mail-btn" onClick={sendMail} disabled={sending || !brief.vendors.length}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-medium disabled:opacity-50">
                  {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Email restock list to vendor
                </button>
                <button data-testid="briefing-add-vendor-btn" onClick={() => setAddOpen(!addOpen)}
                  className="inline-flex items-center gap-1 text-xs px-3 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-white">
                  <Plus className="w-3.5 h-3.5" /> Add vendor
                </button>
              </div>

              {addOpen && (
                <form onSubmit={addVendor} className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-2" data-testid="vendor-add-form">
                  <input required placeholder="Vendor name (e.g. Suresh)" value={vForm.name} onChange={e => setVForm({ ...vForm, name: e.target.value })}
                    data-testid="vendor-name-input" className="text-xs px-2 py-2 rounded-lg border border-slate-200 bg-white" />
                  <input required type="email" placeholder="Email" value={vForm.email} onChange={e => setVForm({ ...vForm, email: e.target.value })}
                    data-testid="vendor-email-input" className="text-xs px-2 py-2 rounded-lg border border-slate-200 bg-white" />
                  <input placeholder="Phone" value={vForm.phone} onChange={e => setVForm({ ...vForm, phone: e.target.value })}
                    data-testid="vendor-phone-input" className="text-xs px-2 py-2 rounded-lg border border-slate-200 bg-white" />
                  <button type="submit" data-testid="vendor-save-btn" className="text-xs px-3 py-2 rounded-lg bg-slate-800 text-white font-medium">Save vendor</button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
