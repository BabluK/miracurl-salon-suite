import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { X, Save, KeyRound, Mail, Copy, Link2, Unlink, Store, Loader2, Fingerprint, CreditCard } from "lucide-react";
import { confirmAsync } from "@/components/ConfirmDialog";

const inputCls = "mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200";

function copyText(text, label) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`)).catch(() => toast.error("Couldn't copy — long-press the text to copy manually"));
    return;
  }
  // Fallback for older mobile browsers
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    toast.success(`${label} copied`);
  } catch {
    toast.error("Couldn't copy — long-press the text to copy manually");
  }
  document.body.removeChild(ta);
}

export function EditTenantModal({ tenant, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: tenant.name || "", location: tenant.location || "", phone: tenant.phone || "",
    salon_email: tenant.salon_email || "", owner_name: tenant.owner_name || "",
    owner_email: tenant.owner_email || "", whatsapp_number: tenant.whatsapp_number || "",
    branch_limit: tenant.branch_limit != null ? String(tenant.branch_limit) : "",
  });
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [creds, setCreds] = useState(null);
  const [linked, setLinked] = useState(null);
  const [linkId, setLinkId] = useState("");
  const [linking, setLinking] = useState(false);
  const [plans, setPlans] = useState([]);
  const [newPlan, setNewPlan] = useState("");
  const [planRef, setPlanRef] = useState("");
  const [planBusy, setPlanBusy] = useState(false);
  const [currentPlan, setCurrentPlan] = useState({ plan: tenant.plan, end: tenant.subscription_end_date });

  const loadLinked = () => api.get(`/super-admin/tenants/${tenant.id}/linked-branches`)
    .then(r => setLinked(r.data)).catch(() => {});
  useEffect(() => {
    loadLinked();
    api.get("/super-admin/plans").then(r => setPlans((r.data.plans || r.data || []).filter(p => (p.branches || 1) === 1))).catch(() => {});
  }, [tenant.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function changePlan() {
    if (!newPlan) { toast.error("Pick a plan first"); return; }
    const label = plans.find(p => p.key === newPlan)?.label || newPlan;
    if (!await confirmAsync(`Activate "${label}" for ${tenant.name}?\n\nThis replaces the current plan (${currentPlan.plan || "trial"}) and records the payment.`)) return;
    setPlanBusy(true);
    try {
      const { data } = await api.post("/super-admin/subscriptions", {
        tenant_id: tenant.id, plan: newPlan,
        payment_ref: planRef.trim() || "manual-plan-change",
      });
      setCurrentPlan({ plan: data.subscription.plan, end: data.subscription.end_date });
      setNewPlan(""); setPlanRef("");
      toast.success(`Plan changed — active till ${data.subscription.end_date} ✦`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't change plan");
    } finally { setPlanBusy(false); }
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const patch = {};
      const src = {
        name: tenant.name, location: tenant.location, phone: tenant.phone,
        salon_email: tenant.salon_email, owner_name: tenant.owner_name,
        owner_email: tenant.owner_email, whatsapp_number: tenant.whatsapp_number,
        branch_limit: tenant.branch_limit != null ? String(tenant.branch_limit) : "",
      };
      Object.entries(form).forEach(([k, v]) => { if ((v || "") !== (src[k] || "")) patch[k] = v; });
      if ("branch_limit" in patch) {
        if (!String(patch.branch_limit).trim()) delete patch.branch_limit;
        else patch.branch_limit = Math.max(1, parseInt(patch.branch_limit, 10) || 1);
      }
      if (Object.keys(patch).length === 0) { toast.info("Nothing changed"); setBusy(false); return; }
      await api.put(`/super-admin/tenants/${tenant.id}`, patch);
      toast.success("Salon details updated ✦");
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't update salon");
    } finally { setBusy(false); }
  }

  async function resetCredentials() {
    if (!await confirmAsync(`Reset the owner's password and email new credentials to ${form.owner_email}?\n\nThis logs the owner out everywhere and affects ALL salons using this login.`)) return;
    setResetting(true);
    try {
      const { data } = await api.post(`/super-admin/tenants/${tenant.id}/resend-credentials`);
      setCreds(data);
      toast.success(data.email_status?.ok === false ? "Password reset — but email failed, share it manually" : "New credentials emailed ✦");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't reset credentials");
    } finally { setResetting(false); }
  }

  async function linkBranch() {
    const bid = linkId.trim();
    if (!bid) { toast.error("Paste the Tenant ID of the salon to link"); return; }
    setLinking(true);
    try {
      const { data } = await api.post(`/super-admin/tenants/${tenant.id}/link-branch`, { branch_tenant_id: bid });
      toast.success(`Linked "${data.linked.name}" to ${data.owner_email} ✦`);
      setLinkId("");
      loadLinked();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't link branch");
    } finally { setLinking(false); }
  }

  async function unlinkBranch(s) {
    if (!await confirmAsync(`Unlink "${s.name}" from this owner's login?`)) return;
    try {
      await api.post(`/super-admin/tenants/${tenant.id}/unlink-branch`, { branch_tenant_id: s.id });
      toast.success(`"${s.name}" unlinked`);
      loadLinked();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't unlink");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-slate-900/50 backdrop-blur-sm p-3 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg m-auto flex flex-col max-h-[88vh] overflow-hidden" onClick={e => e.stopPropagation()} data-testid="edit-tenant-modal">
        {/* Pinned header — always visible, never scrolls away */}
        <div className="p-4 sm:p-5 pb-3 border-b border-slate-100 space-y-3 shrink-0 bg-white">
          <div className="flex items-center justify-between">
            <h3 className="text-base sm:text-lg font-semibold text-slate-800 truncate pr-2">Edit — {tenant.name}</h3>
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 shrink-0" data-testid="edit-tenant-close"><X className="w-5 h-5" /></button>
          </div>
          {/* Unique Tenant ID — whole row is tap-to-copy */}
          <button type="button" onClick={() => copyText(tenant.id, "Tenant ID")}
            className="w-full flex items-center gap-2 bg-fuchsia-50/60 hover:bg-fuchsia-50 border border-fuchsia-200 rounded-lg px-3 py-2 text-left cursor-pointer"
            data-testid="tenant-id-row" title="Tap to copy Tenant ID">
            <Fingerprint className="w-4 h-4 text-fuchsia-500 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-fuchsia-500 font-semibold">Unique Tenant ID — tap to copy</div>
              <div className="font-mono text-xs text-slate-700 break-all" data-testid="tenant-id-value">{tenant.id}</div>
            </div>
            <span className="p-1.5 text-fuchsia-600 bg-white border border-fuchsia-200 rounded shrink-0" data-testid="copy-tenant-id"><Copy className="w-4 h-4" /></span>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="p-4 sm:p-5 space-y-5 overflow-y-auto">

        {/* Details form */}
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="text-xs text-slate-500 font-medium">Salon name</label>
              <input data-testid="edit-tenant-name" value={form.name} onChange={set("name")} className={inputCls} /></div>
            <div><label className="text-xs text-slate-500 font-medium">Location</label>
              <input data-testid="edit-tenant-location" value={form.location} onChange={set("location")} className={inputCls} /></div>
            <div><label className="text-xs text-slate-500 font-medium">Phone</label>
              <input data-testid="edit-tenant-phone" value={form.phone} onChange={set("phone")} className={inputCls} /></div>
            <div><label className="text-xs text-slate-500 font-medium">WhatsApp number</label>
              <input data-testid="edit-tenant-whatsapp" value={form.whatsapp_number} onChange={set("whatsapp_number")} className={inputCls} /></div>
            <div><label className="text-xs text-slate-500 font-medium">Salon email</label>
              <input data-testid="edit-tenant-salon-email" type="email" value={form.salon_email} onChange={set("salon_email")} className={inputCls} /></div>
            <div><label className="text-xs text-slate-500 font-medium">Owner name</label>
              <input data-testid="edit-tenant-owner-name" value={form.owner_name} onChange={set("owner_name")} className={inputCls} /></div>
            <div><label className="text-xs text-slate-500 font-medium">Branch limit (paid allowance)</label>
              <input data-testid="edit-tenant-branch-limit" type="number" min="1" max="50" value={form.branch_limit} onChange={set("branch_limit")} placeholder="e.g. 5" className={inputCls} />
              <p className="text-[10px] text-slate-400 mt-1">Max branches the salon can add in Settings — raise it after payment.</p></div>
            <div className="sm:col-span-2"><label className="text-xs text-slate-500 font-medium">Owner login email</label>
              <input data-testid="edit-tenant-owner-email" type="email" value={form.owner_email} onChange={set("owner_email")} className={inputCls} />
              <p className="text-[10px] text-amber-600 mt-1">⚠ Changing this changes the owner&apos;s LOGIN email (applies to all their linked salons).</p></div>
          </div>
          <button type="submit" data-testid="edit-tenant-save" disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-sky-500 to-blue-500 text-white text-sm font-semibold disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save changes
          </button>
        </form>

        {/* Plan change */}
        <div className="border-t border-slate-100 pt-4">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2 flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5 text-emerald-500" /> Plan &amp; subscription</div>
          <div className="flex items-center gap-2 text-sm mb-2.5" data-testid="current-plan-row">
            <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold border ${currentPlan.plan === "trial" || !currentPlan.plan ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
              {currentPlan.plan || "trial"}
            </span>
            {currentPlan.end && <span className="text-[11px] text-slate-500">valid till {currentPlan.end}</span>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select data-testid="change-plan-select" value={newPlan} onChange={e => setNewPlan(e.target.value)}
              className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200">
              <option value="">Change plan to…</option>
              {plans.map(p => <option key={p.key} value={p.key}>{p.label} — ₹{Number(p.price).toLocaleString("en-IN")}</option>)}
            </select>
            <input data-testid="change-plan-ref" value={planRef} onChange={e => setPlanRef(e.target.value)}
              placeholder="Payment ref (optional)"
              className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>
          <button type="button" data-testid="change-plan-btn" onClick={changePlan} disabled={planBusy || !newPlan}
            className="mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold disabled:opacity-50">
            {planBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            {planBusy ? "Activating…" : "Activate plan"}
          </button>
          <p className="text-[10px] text-slate-400 mt-1.5">Instantly upgrades trial → paid. Replaces any current subscription and records the payment against this salon.</p>
        </div>

        {/* Credentials reset */}
        <div className="border-t border-slate-100 pt-4">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2 flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5 text-amber-500" /> Owner login credentials</div>
          {!creds ? (
            <button type="button" data-testid="reset-credentials-btn" onClick={resetCredentials} disabled={resetting}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm font-semibold hover:bg-amber-100 disabled:opacity-60">
              {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              {resetting ? "Resetting…" : "Reset password & email new credentials"}
            </button>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm" data-testid="new-credentials-box">
              <p className="text-emerald-800 font-medium">✅ New temp password {creds.email_status?.ok === false ? "(email FAILED — share manually)" : `emailed to ${creds.email_recipients.join(", ")}`}</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 bg-white border border-dashed border-emerald-300 rounded px-3 py-1.5 font-mono text-emerald-900 text-xs" data-testid="temp-password-value">{creds.temp_password}</code>
                <button type="button" data-testid="copy-temp-password" onClick={() => copyText(creds.temp_password, "Temp password")}
                  className="p-1.5 text-emerald-700 hover:bg-emerald-100 rounded"><Copy className="w-4 h-4" /></button>
              </div>
              <p className="text-[10px] text-emerald-700 mt-1.5">Owner must set a new password on first login. Affects {creds.affects_salons} salon{creds.affects_salons === 1 ? "" : "s"} on this login.</p>
            </div>
          )}
        </div>

        {/* Branch linking */}
        <div className="border-t border-slate-100 pt-4">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2 flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5 text-fuchsia-500" /> Linked branches (this owner&apos;s login)</div>
          <div className="space-y-1.5 mb-3">
            {(linked?.salons || []).map(s => (
              <div key={s.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2" data-testid={`linked-branch-${s.slug}`}>
                <Store className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-medium text-slate-700">{s.name}</span>
                  {s.active_for_owner && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-200 uppercase">active</span>}
                  <div className="text-[10px] text-slate-400 font-mono truncate">{s.id}</div>
                </div>
                {s.id !== tenant.id && !s.active_for_owner && (
                  <button type="button" data-testid={`unlink-branch-${s.slug}`} onClick={() => unlinkBranch(s)}
                    title="Unlink from this owner" className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded shrink-0"><Unlink className="w-3.5 h-3.5" /></button>
                )}
              </div>
            ))}
            {linked && linked.salons?.length <= 1 && <p className="text-[11px] text-slate-400">Only this salon is on the owner&apos;s login.</p>}
            {linked && !linked.owner_found && <p className="text-[11px] text-amber-600">No owner login found for {form.owner_email} — fix the owner email first.</p>}
          </div>
          <div className="flex gap-2">
            <input data-testid="link-branch-id-input" value={linkId} onChange={e => setLinkId(e.target.value)}
              placeholder="Paste the other salon's Tenant ID to link…" className={`${inputCls} mt-0 flex-1 font-mono text-xs`} />
            <button type="button" data-testid="link-branch-btn" onClick={linkBranch} disabled={linking || !linkId.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-fuchsia-500 hover:bg-fuchsia-600 text-white text-sm font-semibold disabled:opacity-50 shrink-0">
              {linking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />} Link
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5">Works even if the two salons were registered with different emails — the branch joins THIS owner&apos;s login and appears in their salon switcher.</p>
        </div>
        </div>
      </div>
    </div>
  );
}
