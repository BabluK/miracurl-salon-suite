import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { X, MessageSquare, Bot, Megaphone, ShieldCheck, ShieldOff, Loader2, Phone, CheckCircle2, Rocket, PauseCircle, Send, FileSignature } from "lucide-react";

function Switch({ on, onChange, busy, testid }) {
  return (
    <button data-testid={testid} onClick={() => onChange(!on)} disabled={busy} aria-pressed={on}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? "bg-emerald-500" : "bg-slate-300"} disabled:opacity-50`}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

const STEPS = [["invited", "Invited"], ["agreed", "Agreement signed"], ["call_scheduled", "Call scheduled"], ["call_done", "Setup done"], ["live", "Live"]];
const stepIdx = (s) => STEPS.findIndex(([k]) => k === s);

export function TenantFeaturesModal({ tenant, onClose, onChanged }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState("");
  const [callAt, setCallAt] = useState("");
  const [notes, setNotes] = useState("");
  const load = () => api.get(`/super-admin/tenants/${tenant.id}/features`).then(r => { setD(r.data); setNotes(r.data.onboarding?.notes || ""); setCallAt(r.data.onboarding?.call_at || ""); }).catch(() => toast.error("Couldn't load features"));
  useEffect(() => { load(); }, [tenant.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const put = async (body, label) => {
    setBusy(label);
    try {
      const r = await api.put(`/super-admin/tenants/${tenant.id}/features`, body);
      setD(r.data); onChanged?.(r.data);
      if (r.data.invite) toast.success(r.data.invite.emailed ? `Campaign invite emailed to ${r.data.invite.to}` : "Campaign switched on — owner notified in-app (no email on file)");
      else toast.success("Saved");
    } catch (e) { toast.error(e.response?.data?.detail || "Update failed"); } finally { setBusy(""); }
  };
  const onboard = async (action, extra = {}) => {
    setBusy(action);
    try {
      const r = await api.put(`/super-admin/rewards-campaign/onboarding/${tenant.id}`, { action, call_at: callAt || undefined, notes, ...extra });
      setD(x => ({ ...x, onboarding: r.data.onboarding || x.onboarding }));
      if (action !== "checklist") toast.success({ schedule: "Call scheduled & owner notified", call_done: "Marked setup done", go_live: "Campaign is LIVE for this salon 🎉", pause: "Campaign paused", resend_invite: "Invite re-sent" }[action]);
    } catch (e) { toast.error(e.response?.data?.detail || "Action failed"); } finally { setBusy(""); }
  };

  const ob = d?.onboarding || {};
  const cur = stepIdx(ob.status);
  const cl = ob.checklist || {};
  const items = ob.checklist_items || [];
  const checklistDone = items.length > 0 && items.every(i => cl[i.key]);
  const canGoLive = d?.agreement?.accepted && checklistDone;
  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto" onClick={onClose} data-testid="tenant-features-modal">
      <div className="relative w-full max-w-2xl rounded-3xl bg-white shadow-2xl my-auto p-6 space-y-5" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center" data-testid="tenant-features-close"><X className="w-4 h-4" /></button>
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#9b3a4e] font-semibold">Tenant features</div>
          <h3 className="font-playfair text-2xl text-slate-900">{tenant.name}</h3>
          <p className="text-xs text-slate-500">You decide which paid channels & programmes this tenant gets. OFF = hidden in their app and sending blocked.</p>
        </div>
        {!d ? <div className="py-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div> : (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              {[["sms", "SMS", MessageSquare, "Guest receipts, reminders, OTPs (MSG91)"], ["whatsapp", "WhatsApp", Bot, "Mira auto-replies, booking confirmations (Meta)"]].map(([k, l, Icon, sub]) => (
                <div key={k} className="rounded-2xl border border-slate-200 p-4 flex items-center gap-3" data-testid={`feature-row-${k}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${d[k] ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}><Icon className="w-5 h-5" /></div>
                  <div className="flex-1 min-w-0"><div className="text-sm font-semibold text-slate-800">{l}</div><div className="text-[11px] text-slate-500 truncate">{sub}</div></div>
                  <Switch on={d[k]} busy={busy === k} testid={`feature-toggle-${k}`} onChange={v => put({ [k]: v }, k)} />
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 space-y-3" data-testid="feature-row-campaign">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${d.campaign.on ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-400"}`}><Megaphone className="w-5 h-5" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800">{d.campaign.name}</div>
                  <div className="text-[11px] text-slate-500">{d.campaign.manual === true ? "Forced ON" : d.campaign.manual === false ? "Forced OFF" : `Auto · plan ${d.campaign.plan_ok ? "eligible" : "not eligible"}`}{!d.campaign.enabled && " · campaign not enabled globally"}</div>
                </div>
                <div className="flex gap-1">
                  {[["on", "On"], ["auto", "Auto"], ["off", "Off"]].map(([v, l]) => (
                    <button key={v} data-testid={`campaign-flag-${v}`} disabled={!!busy} onClick={() => put({ campaign: v }, "campaign")}
                      className={`text-xs px-3 py-1.5 rounded-full border font-semibold ${(d.campaign.manual === true && v === "on") || (d.campaign.manual === false && v === "off") || (d.campaign.manual == null && v === "auto") ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 text-slate-600 hover:bg-white"}`}>{l}</button>
                  ))}
                </div>
              </div>
              {d.campaign.on && (
                <div className="space-y-3">
                  <ol className="flex flex-wrap gap-1.5" data-testid="onboarding-steps">
                    {STEPS.map(([k, l], i) => (
                      <li key={k} className={`text-[11px] px-2.5 py-1 rounded-full border ${i <= cur ? "bg-emerald-50 border-emerald-200 text-emerald-700 font-semibold" : "border-slate-200 text-slate-400"}`}>{i + 1}. {l}</li>
                    ))}
                    {ob.status === "paused" && <li className="text-[11px] px-2.5 py-1 rounded-full border border-red-200 bg-red-50 text-red-600 font-semibold">Paused</li>}
                  </ol>
                  <div className="text-xs text-slate-600 flex items-center gap-2 flex-wrap">
                    <FileSignature className="w-3.5 h-3.5" />
                    {d.agreement.accepted ? <span data-testid="hq-agreement-status">Agreement signed by <b>{d.agreement.acceptance.full_name}</b> · {String(d.agreement.acceptance.accepted_at).slice(0, 10)} · consents: 10% share ✔ · HQ visibility ✔</span>
                      : <span data-testid="hq-agreement-status">Agreement not yet accepted by the owner</span>}
                    {!d.agreement.accepted && <button onClick={() => onboard("resend_invite")} disabled={!!busy} className="text-amber-700 font-semibold inline-flex items-center gap-1 hover:underline" data-testid="onboarding-resend"><Send className="w-3 h-3" /> Re-send invite</button>}
                  </div>
                  <div className="grid sm:grid-cols-[1fr_auto] gap-2">
                    <input type="datetime-local" value={callAt} onChange={e => setCallAt(e.target.value)} data-testid="onboarding-call-at" className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-800" />
                    <button onClick={() => onboard("schedule")} disabled={!!busy || !callAt} className="h-10 px-4 rounded-full border border-slate-300 text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5 hover:bg-white disabled:opacity-40" data-testid="onboarding-schedule"><Phone className="w-4 h-4" /> Schedule call</button>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3" data-testid="golive-checklist">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">Go-live checklist</div>
                    <label className="flex items-center gap-2 text-sm py-1 text-slate-700"><input type="checkbox" checked={!!d.agreement.accepted} disabled className="accent-emerald-600" /> Participation agreement signed by owner <span className="text-[10px] text-slate-400">(auto)</span></label>
                    {items.map(i => (
                      <label key={i.key} className="flex items-center gap-2 text-sm py-1 text-slate-700 cursor-pointer">
                        <input type="checkbox" data-testid={`checklist-${i.key}`} checked={!!cl[i.key]} disabled={busy === "checklist"} className="accent-emerald-600"
                          onChange={e => onboard("checklist", { checklist: { [i.key]: e.target.checked } })} /> {i.label}
                      </label>
                    ))}
                    <div className="flex items-center gap-2 text-sm py-1 text-slate-500"><span className={`w-3.5 h-3.5 rounded-sm border ${ob.entries > 0 ? "bg-emerald-500 border-emerald-500" : "border-slate-300"}`} /> First customer entry <span className="text-[10px] text-slate-400" data-testid="checklist-entries">({ob.entries || 0} so far · after go-live)</span></div>
                  </div>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="HQ notes (poster placed, staff briefed, issues…)" data-testid="onboarding-notes" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-800" />
                  <div className="flex gap-2 flex-wrap justify-end">
                    <button onClick={() => onboard("call_done")} disabled={!!busy} className="h-9 px-4 rounded-full border border-slate-300 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 hover:bg-white" data-testid="onboarding-call-done"><CheckCircle2 className="w-4 h-4" /> Setup / call done</button>
                    {ob.live
                      ? <button onClick={() => onboard("pause")} disabled={!!busy} className="h-9 px-4 rounded-full bg-red-50 border border-red-200 text-xs font-semibold text-red-600 inline-flex items-center gap-1.5" data-testid="onboarding-pause"><PauseCircle className="w-4 h-4" /> Pause campaign</button>
                      : <button onClick={() => onboard("go_live")} disabled={!!busy || !canGoLive} title={!d.agreement.accepted ? "Owner must accept the agreement first" : !checklistDone ? "Finish the go-live checklist first" : ""} className="h-9 px-4 rounded-full bg-gradient-to-r from-[#7f2d3f] to-[#a83d54] text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40" data-testid="onboarding-go-live"><Rocket className="w-4 h-4" /> Go live</button>}
                  </div>
                </div>
              )}
            </div>

            <div className={`rounded-2xl border p-3 flex items-center gap-3 text-xs ${d.support_access ? "border-emerald-200 bg-emerald-50/50 text-emerald-800" : "border-red-200 bg-red-50/50 text-red-700"}`} data-testid="support-access-status">
              {d.support_access ? <ShieldCheck className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
              {d.support_access ? "Owner allows Miracurl support to open this workspace (all HQ edits are logged in their Audit log)." : "Owner has switched OFF Miracurl support access — 'Open' will be refused until they re-enable it."}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
