import { Edit3, Trash2, Phone, Mail, Percent, IndianRupee, KeyRound, Power, Clock, ShieldCheck, FileDown } from "lucide-react";
import { API } from "@/lib/api";

export function StaffCard({ s, onEdit, onAdvance, onCreateLogin, onResetLogin, onToggleActive, onDelete, isManager = false, onPromote, mainLabel = "Main salon" }) {
  return (
    <div data-testid={`staff-card-${s.id}`} className="card-light text-center group hover:border-sky-300 transition-all">
      <div className="relative inline-block">
        <img src={s.image_url || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300"} alt={s.name} className={`w-24 h-24 rounded-full object-cover mx-auto border-2 ${s.active ? 'border-sky-400' : 'border-gray-300 grayscale'} transition`} />
        <span className={`absolute bottom-1 right-1 w-3 h-3 rounded-full border-2 border-white ${s.active ? 'bg-emerald-400' : 'bg-gray-400'}`} />
      </div>
      <h4 className="font-playfair text-xl mt-3">{s.name}</h4>
      <p className="text-xs uppercase tracking-[0.2em] text-sky-600 mt-1">{s.role}</p>
      <div className="flex flex-wrap gap-1 justify-center mt-3">
        {(s.specialties || []).map(sp => (
          <span key={sp} className="text-[10px] bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">{sp}</span>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-slate-100 space-y-1 text-xs text-slate-500">
        <div className="flex items-center gap-2 justify-center"><Phone className="w-3 h-3" /> {s.phone}</div>
        {s.email && <div className="flex items-center gap-2 justify-center"><Mail className="w-3 h-3" /> {s.email}</div>}
        <div className="flex items-center gap-2 justify-center text-sky-600"><Percent className="w-3 h-3" /> {s.commission_pct}% commission</div>
        <div className="flex items-center gap-2 justify-center text-slate-500" data-testid={`shift-chip-${s.id}`}>
          <Clock className="w-3 h-3" /> {s.shift_start || "10:00"}–{s.shift_end || "21:00"}
          {s.week_off_day && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[9px] font-semibold uppercase">off: {s.week_off_day.slice(0, 3)}</span>}
          {Number(s.overtime_rate) > 0 && <span className="text-violet-600">· OT ₹{s.overtime_rate}/hr</span>}
        </div>
        <div className="inline-flex items-center gap-1 text-[10px] mt-1 px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 font-medium max-w-full truncate" data-testid={`branch-tag-${s.id}`} title={s.branch || mainLabel}>
          📍 {s.branch || mainLabel}
        </div>
        {s.serving_notice && (
          <div className="inline-flex items-center gap-1 text-[10px] mt-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-300 text-amber-700 font-medium" data-testid={`notice-badge-${s.id}`}>
            Serving notice{s.last_working_day ? ` · last day ${s.last_working_day}` : ""}
          </div>
        )}
        {s.aadhaar_last4 && (
          <div className="text-[10px] text-slate-400">Aadhaar · XXXX-XXXX-{s.aadhaar_last4}</div>
        )}
        {s.monthly_base_salary > 0 && (
          <div className="flex items-center gap-2 justify-center text-emerald-600 font-medium">
            <IndianRupee className="w-3 h-3" /> ₹{Number(s.monthly_base_salary).toLocaleString("en-IN")}/mo base
          </div>
        )}
        {s.user_id ? (
          <div className="inline-flex items-center gap-1 text-[10px] mt-1 px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700">
            <KeyRound className="w-3 h-3" /> Login active
          </div>
        ) : (
          <div className="inline-flex items-center gap-1 text-[10px] mt-1 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-500">
            No login
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 justify-center mt-4">
        <button data-testid={`edit-staff-${s.id}`} onClick={() => onEdit(s)} className="btn-slate flex items-center gap-1 text-xs py-1.5 px-3"><Edit3 className="w-3 h-3" /> Edit</button>
        <button
          data-testid={`advance-staff-${s.id}`}
          onClick={() => onAdvance(s)}
          className="text-xs py-1.5 px-3 rounded-md bg-violet-50 border border-violet-200 text-violet-700 hover:bg-violet-100 inline-flex items-center gap-1"
          title="Give / view salary advance"
        >
          <IndianRupee className="w-3 h-3" /> Advance
        </button>
        {!isManager && (
          <button
            data-testid={`salary-slip-${s.id}`}
            onClick={() => window.open(`${API}/staff/${s.id}/salary-slip.pdf`, "_blank")}
            className="text-xs py-1.5 px-3 rounded-md bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 inline-flex items-center gap-1"
            title="Download this month's salary slip (commissions, fines & advances combined)"
          >
            <FileDown className="w-3 h-3" /> Slip
          </button>
        )}
        {!s.user_id ? (
          <button
            data-testid={`create-login-${s.id}`}
            onClick={() => onCreateLogin(s)}
            className="text-xs py-1.5 px-3 rounded-md bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 inline-flex items-center gap-1"
            title="Create login credentials for this staff"
          >
            <KeyRound className="w-3 h-3" /> Give login
          </button>
        ) : (
          <button
            data-testid={`reset-login-${s.id}`}
            onClick={() => onResetLogin(s)}
            className="text-xs py-1.5 px-3 rounded-md bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 inline-flex items-center gap-1"
            title="Generate a new temporary password for this staff"
          >
            <KeyRound className="w-3 h-3" /> Reset password
          </button>
        )}
        {onPromote && (isManager ? (
          <span data-testid={`manager-badge-${s.id}`} className="text-xs py-1.5 px-3 rounded-md bg-violet-50 border border-violet-200 text-violet-700 inline-flex items-center gap-1" title="This staff has a Manager login">
            <ShieldCheck className="w-3 h-3" /> Manager
          </span>
        ) : (
          <button
            data-testid={`promote-staff-${s.id}`}
            onClick={() => onPromote(s)}
            className="text-xs py-1.5 px-3 rounded-md bg-violet-50 border border-violet-200 text-violet-700 hover:bg-violet-100 inline-flex items-center gap-1"
            title="Promote to Manager — keeps all their staff history (PIN protected)"
          >
            <ShieldCheck className="w-3 h-3" /> {/^manager/i.test((s.role || "").trim()) ? "Make Manager Login" : "Promote"}
          </button>
        ))}
        <button
          data-testid={`toggle-active-${s.id}`}
          onClick={() => onToggleActive(s)}
          className={`text-xs py-1.5 px-3 rounded-md inline-flex items-center gap-1 border ${s.active ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'}`}
          title={s.active ? "Disable this staff — they cannot log in" : "Enable this staff"}
        >
          <Power className="w-3 h-3" /> {s.active ? "Disable" : "Enable"}
        </button>
        <button data-testid={`delete-staff-${s.id}`} onClick={() => onDelete(s.id)} className="p-1.5 text-slate-500 hover:text-red-500 transition"><Trash2 className="w-4 h-4" /></button>
      </div>
    </div>
  );
}
