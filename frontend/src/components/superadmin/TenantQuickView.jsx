import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Loader2, IdCard, CalendarRange, Activity, Receipt, BellRing, Link2, StickyNote, Trash2, Send } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

const fmtD = (v) => (v ? String(v).slice(0, 10) : "—");
const fmtDT = (v) => (v ? new Date(v).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never");
const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN")}`;
const STATUS_TONE = { active: "bg-emerald-100 text-emerald-700", trial: "bg-amber-100 text-amber-700", cancelled: "bg-slate-100 text-slate-500", refunded: "bg-rose-100 text-rose-700", suspended: "bg-rose-100 text-rose-700", paid: "bg-emerald-100 text-emerald-700", pending: "bg-amber-100 text-amber-700", expired: "bg-slate-100 text-slate-500" };
const Pill = ({ s }) => <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${STATUS_TONE[s] || "bg-slate-100 text-slate-500"}`}>{s}</span>;

function Section({ icon: Icon, title, children, testid }) {
  return (
    <section className="mt-5" data-testid={testid}>
      <h4 className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#b08d3f] flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" /> {title}</h4>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function KV({ rows }) {
  return (
    <dl className="grid grid-cols-[130px_1fr] gap-y-1.5 gap-x-3 text-xs">
      {rows.map(([k, v]) => <><dt key={k + "k"} className="text-slate-500">{k}</dt><dd key={k + "v"} className="font-semibold text-slate-800 break-words min-w-0">{v || "—"}</dd></>)}
    </dl>
  );
}

function Stat({ label, value, testid }) {
  return <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2" data-testid={testid}><div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</div><div className="text-base font-bold text-slate-800 mt-0.5">{value}</div></div>;
}

function TenantNotes({ tenantId }) {
  const [notes, setNotes] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => api.get(`/super-admin/tenants/${tenantId}/notes`).then(r => setNotes(r.data.notes)).catch(() => setNotes([]));
  useEffect(() => { setNotes(null); setText(""); load(); }, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { const { data } = await api.post(`/super-admin/tenants/${tenantId}/notes`, { text }); setNotes(n => [data, ...(n || [])]); setText(""); toast.success("Note saved"); }
    catch (e) { toast.error(e.response?.data?.detail || "Couldn't save note"); }
    finally { setBusy(false); }
  };
  const del = async (id) => {
    try { await api.delete(`/super-admin/tenants/${tenantId}/notes/${id}`); setNotes(n => n.filter(x => x.id !== id)); }
    catch { toast.error("Couldn't delete note"); }
  };
  return (
    <Section icon={StickyNote} title={`HQ notes${notes?.length ? ` · ${notes.length}` : ""}`} testid="qv-notes">
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-2.5">
        <textarea value={text} onChange={e => setText(e.target.value)} rows={2} maxLength={2000} data-testid="qv-note-input"
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") add(); }}
          placeholder="Jot what was discussed — call outcome, promises made, follow-up date… (private to HQ)"
          className="w-full text-xs bg-white border border-amber-200 rounded-lg px-3 py-2 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-200 resize-none" />
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[10px] text-slate-400">Ctrl/⌘ + Enter to save · {2000 - text.length} left</span>
          <button onClick={add} disabled={busy || !text.trim()} data-testid="qv-note-save" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#15151b] text-[#F0D9A5] text-[11px] font-bold disabled:opacity-40">
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Save note
          </button>
        </div>
      </div>
      {notes === null ? <div className="text-xs text-slate-400 mt-2">Loading…</div> : notes.length === 0 ? <div className="text-xs text-slate-400 mt-2">No notes yet — the first conversation goes here.</div> : (
        <ul className="mt-2 space-y-2">
          {notes.map(n => (
            <li key={n.id} className="group rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs" data-testid={`qv-note-${n.id}`}>
              <div className="whitespace-pre-wrap text-slate-800">{n.text}</div>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                <span className="font-semibold text-slate-500">{n.by_name || n.by}</span><span>· {fmtDT(n.at)}</span>
                <button onClick={() => del(n.id)} title="Delete note" data-testid={`qv-note-del-${n.id}`} className="ml-auto opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition-opacity"><Trash2 className="w-3 h-3" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function TenantQuickView({ tenant, onClose, onProfilePdf }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    if (!tenant) return;
    setD(null);
    api.get(`/super-admin/tenants/${tenant.id}/overview`).then(r => setD(r.data)).catch(() => { toast.error("Couldn't load tenant overview"); onClose(); });
  }, [tenant?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = tenant;
  return (
    <Sheet open={!!tenant} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[520px] overflow-y-auto bg-white text-slate-800 p-0" data-testid="tenant-quick-view">
        {t && (
          <>
            <div className="bg-[#15151b] text-white px-6 pt-6 pb-5">
              <SheetHeader className="text-left space-y-0">
                <div className="flex items-center gap-3">
                  {t.logo_url
                    ? <img src={t.logo_url} alt="" className="w-12 h-12 rounded-full object-cover ring-2 ring-[#d4af37]/70 bg-white" />
                    : <div className="w-12 h-12 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-[#15151b] font-playfair text-xl font-bold flex items-center justify-center">{(t.name || "M")[0]}</div>}
                  <div className="min-w-0">
                    <SheetTitle className="text-white font-playfair text-xl leading-tight truncate" data-testid="quick-view-title">{t.name}</SheetTitle>
                    <SheetDescription className="text-white/50 text-[11px] mt-0.5">{(t.business_type || "salon").toUpperCase()} · {t.location || t.slug}</SheetDescription>
                  </div>
                  <Pill s={t.status} />
                </div>
              </SheetHeader>
              <button onClick={() => onProfilePdf(t)} data-testid="quick-view-profile-pdf" className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#d4af37] text-[#15151b] text-[11px] font-bold hover:bg-[#e6c66e]"><IdCard className="w-3.5 h-3.5" /> Account Profile PDF</button>
            </div>
            <div className="px-6 pb-8">
              <TenantNotes tenantId={t.id} />
              {!d ? <div className="py-16 flex justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div> : (
                <>
                  <div className="grid grid-cols-3 gap-2 mt-5">
                    <Stat label="Bookings · 30d" value={d.activity.appointments_30d} testid="qv-appts" />
                    <Stat label="Billed · 30d" value={money(d.activity.billed_30d)} testid="qv-billed" />
                    <Stat label="Guests" value={d.activity.customers} testid="qv-customers" />
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500 flex flex-wrap gap-x-3">
                    <span>{d.activity.bills_30d} bills</span><span>· {d.activity.staff} staff</span><span>· {d.activity.sms_points} SMS pts</span><span>· owner last login {fmtDT(d.activity.owner_last_login)}</span>
                  </div>
                  <Section icon={IdCard} title="Profile" testid="qv-profile">
                    <KV rows={[...d.profile.business.filter(([k]) => !["Booking slug", "Public page", "Type"].includes(k)), ...d.profile.owner]} />
                  </Section>
                  <Section icon={CalendarRange} title="Plan timeline" testid="qv-timeline">
                    <KV rows={d.profile.access.filter(([k]) => k !== "GSTIN")} />
                    {d.timeline.length > 0 && (
                      <ol className="mt-3 relative border-l-2 border-[#d4af37]/40 ml-1.5 space-y-2.5">
                        {d.timeline.map(s => (
                          <li key={s.id} className="pl-4 relative text-xs" data-testid={`qv-sub-${s.id}`}>
                            <span className={`absolute -left-[7px] top-1 w-3 h-3 rounded-full ring-2 ring-white ${s.status === "active" ? "bg-emerald-500" : s.status === "refunded" ? "bg-rose-500" : "bg-slate-300"}`} />
                            <div className="flex items-center gap-2 flex-wrap"><span className="font-semibold text-slate-800">{s.plan}</span><Pill s={s.status} /><span className="text-slate-400">{money(s.price)}</span></div>
                            <div className="text-slate-500">{fmtD(s.start_date)} → {fmtD(s.end_date)}</div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </Section>
                  {d.invoices.length > 0 && (
                    <Section icon={Receipt} title="Invoices" testid="qv-invoices">
                      <ul className="divide-y divide-slate-100 text-xs">
                        {d.invoices.map(i => <li key={i.id} className="py-1.5 flex items-center gap-2"><span className="font-mono text-slate-700">{i.number}</span><span className="text-slate-400 truncate flex-1">{i.plan_label}</span>{i.kind === "trial" && <Pill s="trial" />}<span className="font-semibold">{money(i.amount)}</span><span className="text-slate-400">{i.issued_on}</span></li>)}
                      </ul>
                    </Section>
                  )}
                  <Section icon={Activity} title="Recent activity" testid="qv-activity">
                    <ul className="text-xs space-y-1.5">
                      {d.reminders.map((r, i) => <li key={"r" + i} className="flex items-center gap-2"><BellRing className="w-3 h-3 text-amber-500" /> {r.source === "trial" ? "Trial-ending" : "Renewal"} reminder · {r.days_mark}d mark {r.manual ? "· manual" : ""} {r.email_sent ? "✓" : "✗"} <span className="text-slate-400 ml-auto">{fmtDT(r.at)}</span></li>)}
                      {d.pay_links.map(l => <li key={l.token} className="flex items-center gap-2"><Link2 className="w-3 h-3 text-sky-500" /> Pay link {l.plan_label} · {money(l.amount)}{l.discount ? " 🎁" : ""} <Pill s={l.status} /><span className="text-slate-400 ml-auto">{fmtDT(l.created_at)}</span></li>)}
                      {d.activity.trial_kit?.invoice_number && <li className="flex items-center gap-2">🎉 Welcome kit sent · {d.activity.trial_kit.invoice_number}<span className="text-slate-400 ml-auto">{fmtDT(d.activity.trial_kit.at)}</span></li>}
                      {d.activity.last_refund_notice && <li className="flex items-center gap-2">↩️ Refund notice · {money(d.activity.last_refund_notice.amount)}<span className="text-slate-400 ml-auto">{fmtDT(d.activity.last_refund_notice.at)}</span></li>}
                      {!d.reminders.length && !d.pay_links.length && !d.activity.trial_kit && <li className="text-slate-400">No billing activity yet.</li>}
                    </ul>
                  </Section>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
