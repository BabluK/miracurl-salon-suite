import { Check, XCircle, MessageSquare, BadgeCheck, Image as ImageIcon, Trash2, MapPin } from "lucide-react";
import { Avatar, StatusPill } from "@/components/shell/PageShell";
import { ColorPickCard } from "@/components/appointments/ColorPickCard";

const WA = () => <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>;

const IconBtn = ({ tone, title, testid, onClick, children }) => (
  <button data-testid={testid} onClick={onClick} title={title} className={`w-8 h-8 inline-flex items-center justify-center rounded-lg border border-transparent hover:border-current/20 transition ${tone}`}>{children}</button>
);

export function AppointmentRow({ a, view, phone, canDirectWA, selected, onSelect, onStatus, onRemind, onCard, onReview, onDelete }) {
  const dt = new Date(a.scheduled_at);
  const open = a.status === "scheduled" || a.status === "confirmed";
  return (
    <tr data-testid={`appt-row-${a.id}`} className={`border-t border-slate-100 hover:bg-amber-50/30 transition ${a.status === "scheduled" ? "bg-sky-50/30" : ""}`}>
      <td className="px-5 py-4 w-10"><input type="checkbox" checked={selected} onChange={onSelect} className="accent-[#b8893a] w-4 h-4" data-testid={`appt-select-${a.id}`} /></td>
      <td className="px-5 py-4">
        {view !== "list" && <div className="text-xs text-slate-500">{dt.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</div>}
        <div className="font-semibold text-slate-900 tabular-nums whitespace-nowrap">{dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
        <div className="text-[11px] text-slate-400">{a.duration_min} min</div>
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={a.customer_name} />
          <div className="min-w-0">
            <div className="font-medium text-slate-900 truncate">{a.customer_name}
              {a.color_pick && <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold px-1.5 py-0.5" title={a.color_pick.color_name} data-testid={`color-badge-${a.id}`}>🎨 {a.color_pick.color_name}</span>}
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-1.5 flex-wrap">
              <span>{phone || (a.booked_via ? "Online booking" : "Walk-in")}</span>
              {a.branch_name && a.branch_name !== "__main__" && (
                <span data-testid={`appt-branch-tag-${a.id}`} title={a.branch_name} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#fbf3e0] border border-[#e6d3a3] text-[10px] text-[#8a6d1f] max-w-[140px] truncate">
                  <MapPin className="w-2.5 h-2.5 shrink-0" /> {a.branch_name.replace(/^.*?-\s*/, "") || a.branch_name}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="flex flex-wrap gap-1.5 max-w-[320px]">
          {(a.service_names || []).map((s, i) => <span key={i} className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-700">{s}</span>)}
        </div>
        {a.color_pick && <ColorPickCard appt={a} />}
      </td>
      <td className="px-5 py-4 text-sm text-slate-700">{a.staff_name || <span className="text-slate-400">Any stylist</span>}</td>
      <td className="px-5 py-4 font-semibold text-slate-900 tabular-nums">₹{(a.total || 0).toLocaleString("en-IN")}</td>
      <td className="px-5 py-4"><StatusPill status={a.status} testid={`appt-status-${a.id}`} /></td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-1 justify-end">
          {open && <IconBtn tone="text-emerald-600 hover:bg-emerald-50" title="Send WhatsApp confirmation / reminder" testid={`remind-appt-${a.id}`} onClick={onRemind}><WA /></IconBtn>}
          {open && canDirectWA && <IconBtn tone="text-amber-600 hover:bg-amber-50" title="Open designed confirmation card" testid={`card-appt-${a.id}`} onClick={onCard}><ImageIcon className="w-4 h-4" /></IconBtn>}
          {a.status === "scheduled" && <>
            <IconBtn tone="text-sky-600 hover:bg-sky-50" title="Confirm & notify customer" testid={`confirm-appt-${a.id}`} onClick={() => onStatus("confirmed")}><BadgeCheck className="w-4 h-4" /></IconBtn>
            <IconBtn tone="text-emerald-600 hover:bg-emerald-50" title="Mark completed" testid={`complete-appt-${a.id}`} onClick={() => onStatus("completed")}><Check className="w-4 h-4" /></IconBtn>
            <IconBtn tone="text-red-500 hover:bg-red-50" title="Cancel" testid={`cancel-appt-${a.id}`} onClick={() => onStatus("cancelled")}><XCircle className="w-4 h-4" /></IconBtn>
          </>}
          {a.status === "confirmed" && <IconBtn tone="text-emerald-600 hover:bg-emerald-50" title="Mark completed" testid={`complete-appt-${a.id}`} onClick={() => onStatus("completed")}><Check className="w-4 h-4" /></IconBtn>}
          {a.status === "completed" && <IconBtn tone="text-[#8f6a2a] hover:bg-amber-50" title="Send review link via WhatsApp" testid={`send-review-${a.id}`} onClick={onReview}><MessageSquare className="w-4 h-4" /></IconBtn>}
          <IconBtn tone="text-slate-400 hover:text-red-500 hover:bg-red-50" title="Delete booking" testid={`delete-appt-${a.id}`} onClick={onDelete}><Trash2 className="w-4 h-4" /></IconBtn>
        </div>
      </td>
    </tr>
  );
}
