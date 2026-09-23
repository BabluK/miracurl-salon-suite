import { useState } from "react";
import { MailWarning, Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

export function LeadEmailFix({ lead, onSaved }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return toast.error("Enter a valid email");
    setBusy(true);
    try {
      const { data } = await api.put(`/super-admin/mira-leads/${lead.id}`, { email: email.trim() });
      toast.success("Real inbox saved — follow-ups will resume for this lead ✦");
      setOpen(false); onSaved?.(data);
    } catch (e) { toast.error(e.response?.data?.detail || "Couldn't save email"); }
    finally { setBusy(false); }
  };

  return (
    <span className="inline-flex items-center gap-1.5 align-middle" data-testid={`lead-email-fix-${lead.id}`}>
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700"
        title={lead.email ? `${lead.email} is a login-only / placeholder address — emails to it are skipped` : "No email on file — follow-ups are skipped"}
        data-testid={`lead-no-inbox-${lead.id}`}>
        <MailWarning className="w-3 h-3" /> {lead.email ? "no real inbox" : "no email"}
      </span>
      {open ? (
        <span className="inline-flex items-center gap-1">
          <input autoFocus value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setOpen(false); }}
            placeholder="owner@salon.com" data-testid={`lead-email-input-${lead.id}`}
            className="h-6 w-44 px-2 rounded-md border border-slate-300 bg-white text-[11px] text-slate-800 outline-none focus:border-sky-400" />
          <button onClick={save} disabled={busy} data-testid={`lead-email-save-${lead.id}`} className="h-6 px-2 rounded-md bg-emerald-600 text-white text-[10px] font-bold inline-flex items-center gap-1 disabled:opacity-50"><Check className="w-3 h-3" /> Save</button>
          <button onClick={() => setOpen(false)} className="h-6 px-1.5 rounded-md text-[10px] text-slate-500 hover:bg-slate-100">Cancel</button>
        </span>
      ) : (
        <button onClick={() => { setEmail(lead.email && !/@miracurl\.com$/i.test(lead.email) ? lead.email : ""); setOpen(true); }} data-testid={`lead-email-edit-${lead.id}`}
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-700 hover:underline"><Pencil className="w-3 h-3" /> add real email</button>
      )}
    </span>
  );
}
