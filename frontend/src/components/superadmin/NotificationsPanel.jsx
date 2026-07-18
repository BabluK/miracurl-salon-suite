import { useState } from "react";
import { BellRing } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

const TYPES = [
  ["all", "All"], ["hiring", "💼 Hiring"], ["inbox", "📩 Messages"],
  ["lead", "🧲 Leads"], ["demo", "📬 Demo invites"], ["renewal", "⏳ Renewals"], ["signup", "🎉 Signups"],
];

export function NotificationsPanel({ feed, onGoTab }) {
  const [filter, setFilter] = useState("all");
  const [sentIds, setSentIds] = useState({});
  const items = (feed?.items || []).filter(i => filter === "all" || i.type === filter);

  const sendPicker = async (e, i) => {
    e.stopPropagation();
    try {
      await api.post(`/super-admin/demo-campaign/${i.invite_id}/send-slot-picker`);
      setSentIds(s => ({ ...s, [i.id]: true }));
      toast.success(`Time-picker sent to ${i.email} ✦`);
    } catch (err) { toast.error(err.response?.data?.detail || "Couldn't send"); }
  };
  return (
    <div className="space-y-5" data-testid="notifications-panel">
      <div>
        <h1 className="font-playfair text-3xl flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-rose-100 text-rose-500 flex items-center justify-center"><BellRing className="w-5 h-5" /></span>
          Notifications
          {feed?.unread > 0 && <span className="text-xs px-2.5 py-1 rounded-full bg-rose-500 text-white font-bold">{feed.unread} new</span>}
        </h1>
        <p className="text-slate-500 text-sm mt-1">Everything happening across your platform — hiring, messages, leads, renewals and signups (last 30 days).</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TYPES.map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} data-testid={`notif-filter-${k}`}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${filter === k ? "bg-slate-900 border-slate-900 text-white" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
            {l}
          </button>
        ))}
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 shadow-sm overflow-hidden">
        {items.length === 0 && <div className="p-10 text-center text-sm text-slate-400">Nothing here ✦</div>}
        {items.map(i => (
          <button key={i.id} onClick={() => onGoTab(i.tab)} data-testid={`notif-item-${i.id}`}
            className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition ${i.unread ? "bg-amber-50/50" : ""}`}>
            <span className="text-xl leading-none mt-0.5">{i.icon}</span>
            <span className="min-w-0 flex-1">
              <span className={`block text-sm ${i.unread ? "font-semibold text-slate-900" : "text-slate-700"}`}>{i.title}</span>
              {i.body && <span className="block text-xs text-slate-500 truncate">{i.body}</span>}
              {i.invite_id && i.email && (
                <span onClick={(e) => sendPicker(e, i)} data-testid={`notif-slot-picker-${i.id}`}
                  className={`inline-flex items-center gap-1 mt-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold cursor-pointer transition ${sentIds[i.id] ? "bg-emerald-100 text-emerald-600" : "bg-amber-500 text-white hover:bg-amber-600"}`}>
                  📅 {sentIds[i.id] ? "Time-picker sent ✓" : "Send time-picker email"}
                </span>
              )}
            </span>
            <span className="text-[10px] text-slate-400 whitespace-nowrap mt-1">
              {i.at ? new Date(i.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}
              {i.unread && <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-rose-500" />}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
