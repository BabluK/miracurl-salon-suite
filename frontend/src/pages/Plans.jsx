import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { BadgePercent, Package as PackageIcon, Crown, Ticket, Plus, Trash2, Edit3, X } from "lucide-react";
import { MembersPanel } from "@/components/offers/MembersPanel";
import { confirmAsync } from "@/components/ConfirmDialog";

const TABS = [
  { k: "packages", label: "Packages", icon: PackageIcon },
  { k: "memberships", label: "Memberships", icon: Crown },
  { k: "coupons", label: "Coupons", icon: Ticket },
];

export default function Plans() {
  const [tab, setTab] = useState("packages");
  const [packages, setPackages] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [services, setServices] = useState([]);
  const [modal, setModal] = useState(null); // {kind, item?}

  const load = useCallback(() => {
    api.get("/packages").then(r => setPackages(r.data));
    api.get("/memberships").then(r => setMemberships(r.data));
    api.get("/coupons").then(r => setCoupons(r.data));
    api.get("/services").then(r => setServices(r.data.filter(s => s.active)));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(kind, id) {
    if (!await confirmAsync("Delete this item?")) return;
    try {
      await api.delete(`/${kind}/${id}`);
      toast.success("Deleted");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Delete failed");
    }
  }

  return (
    <div className="app-canvas -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-4rem)] text-slate-800 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 flex items-center gap-2" data-testid="plans-title">
            <BadgePercent className="w-6 h-6 text-violet-600" /> Offers &amp; Plans
          </h1>
          <p className="text-sm text-slate-500 mt-1">Packages, memberships and coupon codes — sold at POS, applied on the booking page.</p>
        </div>
        <button data-testid="plans-add-btn" onClick={() => setModal({ kind: tab })}
          className="btn-blue flex items-center gap-2"><Plus className="w-4 h-4" /> New {tab.slice(0, -1)}</button>
      </div>

      <div className="flex gap-2">
        {TABS.map(t => (
          <button key={t.k} data-testid={`plans-tab-${t.k}`} onClick={() => setTab(t.k)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border flex items-center gap-1.5 transition ${
              tab === t.k ? "bg-violet-50 border-violet-300 text-violet-700" : "bg-white border-slate-200 text-slate-600 hover:border-violet-200"}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "packages" && (
        <Grid empty="No packages yet — e.g. '5 Classic Facials for ₹5000'." items={packages} testPrefix="package"
          render={p => (
            <>
              <div className="font-semibold text-slate-800">{p.name}</div>
              <div className="text-sm text-slate-500 mt-1">{p.sessions}× {p.service_name}</div>
              <div className="text-lg font-bold text-violet-700 mt-2">₹{p.price}</div>
              <div className="text-[11px] text-slate-400">Valid {p.validity_days} days {!p.active && "· INACTIVE"}</div>
            </>
          )}
          onEdit={p => setModal({ kind: "packages", item: p })} onDelete={p => remove("packages", p.id)} />
      )}
      {tab === "memberships" && (
        <>
        <Grid empty="No memberships yet — e.g. 'Gold Member: 15% off for 6 months'." items={memberships} testPrefix="membership"
          render={m => (
            <>
              <div className="font-semibold text-slate-800 flex items-center gap-1.5"><Crown className="w-4 h-4 text-amber-500" /> {m.name}</div>
              <div className="text-sm text-slate-500 mt-1">
                {m.discount_pct}% off services{Number(m.cashback_pct) > 0 && <> · {m.cashback_pct}% wallet cashback</>}
              </div>
              <div className="text-lg font-bold text-violet-700 mt-2">₹{m.price}{m.custom && "+"}</div>
              <div className="text-[11px] text-slate-400">
                Valid {m.validity_days} days {m.public_purchase && "· 🌐 On booking page"} {!m.active && "· INACTIVE"}
              </div>
            </>
          )}
          onEdit={m => setModal({ kind: "memberships", item: m })} onDelete={m => remove("memberships", m.id)} />
        <MembersPanel />
        </>
      )}
      {tab === "coupons" && (
        <Grid empty="No coupons yet — e.g. FESTIVE20 = 20% off." items={coupons} testPrefix="coupon"
          render={c => (
            <>
              <div className="font-mono font-bold text-slate-800 text-lg tracking-wider">{c.code}</div>
              <div className="text-sm text-slate-500 mt-1">{c.type === "percent" ? `${c.value}% off` : `₹${c.value} off`}</div>
              <div className="text-[11px] text-slate-400 mt-2">
                Used {c.used_count || 0}{c.max_uses ? ` / ${c.max_uses}` : ""} · {c.expires_at ? `Expires ${c.expires_at}` : "No expiry"} {!c.active && "· INACTIVE"}
              </div>
            </>
          )}
          onEdit={c => setModal({ kind: "coupons", item: c })} onDelete={c => remove("coupons", c.id)} />
      )}

      {modal && <PlanModal kind={modal.kind} item={modal.item} services={services}
        onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </div>
  );
}

function Grid({ items, render, onEdit, onDelete, empty, testPrefix }) {
  if (items.length === 0) {
    return <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-sm text-slate-400">{empty}</div>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {items.map(it => (
        <div key={it.id} data-testid={`${testPrefix}-card-${it.id}`} className={`bg-white border rounded-2xl p-4 shadow-sm relative ${it.active === false ? "border-slate-100 opacity-60" : "border-slate-200"}`}>
          {render(it)}
          <div className="absolute top-3 right-3 flex gap-1">
            <button data-testid={`${testPrefix}-edit-${it.id}`} onClick={() => onEdit(it)} className="p-1.5 text-slate-300 hover:text-sky-600"><Edit3 className="w-3.5 h-3.5" /></button>
            <button data-testid={`${testPrefix}-delete-${it.id}`} onClick={() => onDelete(it)} className="p-1.5 text-slate-300 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

const DEFAULTS = {
  packages: { name: "", price: "", service_id: "", sessions: 5, validity_days: 365, active: true },
  memberships: { name: "", price: "", discount_pct: 10, validity_days: 180, active: true, cashback_pct: 0, benefits: [], public_purchase: false },
  coupons: { code: "", type: "percent", value: 10, expires_at: "", max_uses: "", active: true },
};

function PlanModal({ kind, item, services, onClose, onSaved }) {
  const [f, setF] = useState(item ? { ...DEFAULTS[kind], ...item } : DEFAULTS[kind]);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { ...f };
      if (kind === "packages") { payload.price = parseFloat(f.price); payload.sessions = parseInt(f.sessions); payload.validity_days = parseInt(f.validity_days); }
      if (kind === "memberships") {
        payload.price = parseFloat(f.price); payload.discount_pct = parseFloat(f.discount_pct);
        payload.validity_days = parseInt(f.validity_days);
        payload.cashback_pct = parseFloat(f.cashback_pct || 0);
        payload.benefits = typeof f.benefits === "string"
          ? f.benefits.split(",").map(b => b.trim()).filter(Boolean)
          : (f.benefits || []);
      }
      if (kind === "coupons") { payload.value = parseFloat(f.value); payload.max_uses = f.max_uses ? parseInt(f.max_uses) : null; payload.expires_at = f.expires_at || null; }
      if (item) await api.put(`/${kind}/${item.id}`, payload);
      else await api.post(`/${kind}`, payload);
      toast.success("Saved ✦");
      onSaved();
    } catch (err) {
      const d = err.response?.data?.detail;
      toast.error(typeof d === "string" ? d : Array.isArray(d) ? d.map(x => x.msg).join(" · ") : "Save failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={save} className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-3" onClick={e => e.stopPropagation()} data-testid="plan-modal">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-slate-800 capitalize">{item ? "Edit" : "New"} {kind.slice(0, -1)}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        {kind !== "coupons" && (
          <Field label="Name *"><input data-testid="plan-name-input" required className="inp" value={f.name} onChange={e => set("name", e.target.value)} placeholder={kind === "packages" ? "5 Facial Package" : "Gold Membership"} /></Field>
        )}
        {kind === "coupons" && (
          <Field label="Code *"><input data-testid="coupon-code-input" required className="inp font-mono uppercase" value={f.code} onChange={e => set("code", e.target.value.toUpperCase())} placeholder="FESTIVE20" /></Field>
        )}
        {kind === "packages" && (
          <>
            <Field label="Service *">
              <select data-testid="plan-service-select" required className="inp" value={f.service_id} onChange={e => set("service_id", e.target.value)}>
                <option value="">— choose service —</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name} · ₹{s.price}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Sessions"><input data-testid="plan-sessions-input" type="number" min="1" className="inp" value={f.sessions} onChange={e => set("sessions", e.target.value)} /></Field>
              <Field label="Price ₹ *"><input data-testid="plan-price-input" type="number" required min="1" className="inp" value={f.price} onChange={e => set("price", e.target.value)} /></Field>
              <Field label="Valid (days)"><input type="number" min="1" className="inp" value={f.validity_days} onChange={e => set("validity_days", e.target.value)} /></Field>
            </div>
          </>
        )}
        {kind === "memberships" && (
          <>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Discount %"><input data-testid="plan-discount-input" type="number" min="1" max="90" className="inp" value={f.discount_pct} onChange={e => set("discount_pct", e.target.value)} /></Field>
            <Field label="Price ₹ *"><input data-testid="plan-price-input" type="number" required min="1" className="inp" value={f.price} onChange={e => set("price", e.target.value)} /></Field>
            <Field label="Valid (days)"><input type="number" min="1" className="inp" value={f.validity_days} onChange={e => set("validity_days", e.target.value)} /></Field>
          </div>
          <Field label="Wallet cashback % (premium perk — every bill credits this % to the member's wallet)">
            <input data-testid="plan-cashback-input" type="number" min="0" max="50" className="inp" value={f.cashback_pct} onChange={e => set("cashback_pct", e.target.value)} />
          </Field>
          <Field label="Benefits (comma separated — shown on the member's card)">
            <input data-testid="plan-benefits-input" className="inp" placeholder="Birthday Offer, Priority Booking, Free Hair Wash"
              value={Array.isArray(f.benefits) ? f.benefits.join(", ") : (f.benefits || "")} onChange={e => set("benefits", e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={!!f.public_purchase} onChange={e => set("public_purchase", e.target.checked)} data-testid="plan-public-checkbox" />
            Sell on the public booking page (💳 Premium Membership)
          </label>
          </>
        )}
        {kind === "coupons" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Type">
                <select data-testid="coupon-type-select" className="inp" value={f.type} onChange={e => set("type", e.target.value)}>
                  <option value="percent">% off</option>
                  <option value="flat">₹ flat off</option>
                </select>
              </Field>
              <Field label={f.type === "percent" ? "Percent off *" : "Amount ₹ *"}>
                <input data-testid="coupon-value-input" type="number" required min="1" className="inp" value={f.value} onChange={e => set("value", e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Expiry (optional)"><input data-testid="coupon-expiry-input" type="date" className="inp" value={f.expires_at || ""} onChange={e => set("expires_at", e.target.value)} /></Field>
              <Field label="Max uses (optional)"><input data-testid="coupon-maxuses-input" type="number" min="1" className="inp" value={f.max_uses || ""} onChange={e => set("max_uses", e.target.value)} placeholder="∞" /></Field>
            </div>
          </>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-600 pt-1">
          <input type="checkbox" checked={!!f.active} onChange={e => set("active", e.target.checked)} data-testid="plan-active-checkbox" /> Active
        </label>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
          <button type="submit" data-testid="plan-save-btn" disabled={busy}
            className="flex-1 px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-60">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs text-slate-500 font-medium block mb-1">{label}</label>
      {children}
    </div>
  );
}
