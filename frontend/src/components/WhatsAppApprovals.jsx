import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { MessageSquare, Check, X } from "lucide-react";

const KIND_LABEL = { confirmation: "Booking Confirmation", reminder: "Reminder", review: "Review Request" };

export const WhatsAppApprovals = () => {
  const [items, setItems] = useState([]);

  const load = useCallback(() => {
    api.get("/whatsapp-requests?status=pending").then(r => setItems(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  async function approve(id) {
    try {
      const { data } = await api.post(`/whatsapp-requests/${id}/approve`);
      toast.success("Approved ✦ Opening WhatsApp…");
      if (data.wa_url) window.open(data.wa_url, "_blank", "noopener,noreferrer");
      load();
    } catch { toast.error("Couldn't approve request"); }
  }

  async function reject(id) {
    try {
      await api.post(`/whatsapp-requests/${id}/reject`);
      toast.success("Request rejected");
      load();
    } catch { toast.error("Couldn't reject request"); }
  }

  if (!items.length) return null;

  return (
    <div className="bg-white rounded-2xl border border-emerald-200 p-5 shadow-sm" data-testid="wa-approvals-widget">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
          <MessageSquare className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500 font-medium">WhatsApp Approvals</div>
          <div className="text-sm text-slate-600 mt-0.5">
            <span className="font-semibold text-emerald-600" data-testid="wa-approvals-count">{items.length}</span> message{items.length > 1 ? "s" : ""} from your manager awaiting approval
          </div>
        </div>
      </div>
      <div className="space-y-3">
        {items.map(r => (
          <div key={r.id} className="border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3" data-testid={`wa-request-${r.id}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-800">{r.client_name}</span>
                {r.client_phone && <span className="text-xs text-slate-500">+{r.client_phone}</span>}
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{KIND_LABEL[r.kind] || r.kind}</span>
              </div>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2 whitespace-pre-line">{r.message}</p>
              <div className="text-[11px] text-slate-400 mt-1">Requested by {r.requested_by_name} · {new Date(r.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                data-testid={`wa-approve-${r.id}`}
                onClick={() => approve(r.id)}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1 transition"
              >
                <Check className="w-3.5 h-3.5" /> Approve & Send
              </button>
              <button
                data-testid={`wa-reject-${r.id}`}
                onClick={() => reject(r.id)}
                className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-semibold flex items-center gap-1 transition"
              >
                <X className="w-3.5 h-3.5" /> Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
