import { useState } from "react";
import { BellRing, X, CheckCheck } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

const TYPES = [
  ["all", "All"], ["hiring", "💼 Hiring"], ["inbox", "📩 Messages"],
  ["lead", "🧲 Leads"], ["demo", "📬 Demo invites"], ["renewal", "⏳ Renewals"], ["signup", "🎉 Signups"],
  ["verify", "🪪 Staff Verification"],
];

export function NotificationsPanel({ feed, onGoTab, onRefresh }) {
  const [filter, setFilter] = useState("all");
  const [sentIds, setSentIds] = useState({});
  const [readIds, setReadIds] = useState({});
  const [hiddenIds, setHiddenIds] = useState({});
  const items = (feed?.items || []).filter(i => !hiddenIds[i.id] && (filter === "all" || i.type === filter));
  const isUnread = (i) => i.unread && !readIds[i.id];
  const unreadCount = (feed?.items || []).filter(i => !hiddenIds[i.id] && isUnread(i)).length;

  const markRead = async (ids, dismiss = false) => {
    try {
      await api.post("/super-admin/notifications/mark-read", { ids, dismiss });
      onRefresh?.();
    } catch { /* silent — optimistic UI already applied */ }
  };

  const clickItem = (i) => {
    if (isUnread(i)) { setReadIds(s => ({ ...s, [i.id]: true })); markRead([i.id]); }
    onGoTab(i.tab);
  };

  const dismissItem = (e, i) => {
    e.stopPropagation();
    setHiddenIds(s => ({ ...s, [i.id]: true }));
    markRead([i.id], true);
  };

  const markAllRead = () => {
    const ids = (feed?.items || []).filter(isUnread).map(i => i.id);
    if (!ids.length) return;
    setReadIds(s => ({ ...s, ...Object.fromEntries(ids.map(id => [id, true])) }));
    markRead(ids);
    toast.success("All notifications marked as read ✦");
  };

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
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-playfair text-3xl flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-rose-100 text-rose-500 flex items-center justify-center"><BellRing className="w-5 h-5" /></span>
            Notifications
            {unreadCount > 0 && <span className="text-xs px-2.5 py-1 rounded-full bg-rose-500 text-white font-bold">{unreadCount} new</span>}
          </h1>
          <p className="text-slate-500 text-sm mt-1">Everything happening across your platform — hiring, messages, leads, renewals and signups (last 30 days).</p>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} data-testid="notif-mark-all-read"
            className="inline-flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-semibold transition">
            <CheckCheck className="w-3.5 h-3.5" /> Mark all as read
          </button>
        )}
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
          <div key={i.id} onClick={() => clickItem(i)} role="button" tabIndex={0} data-testid={`notif-item-${i.id}`}
            className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition cursor-pointer group ${isUnread(i) ? "bg-amber-50/50" : ""}`}>
            <span className="text-xl leading-none mt-0.5">{i.icon}</span>
            <span className="min-w-0 flex-1">
              <span className={`block text-sm ${isUnread(i) ? "font-semibold text-slate-900" : "text-slate-700"}`}>{i.title}</span>
              {i.body && <span className="block text-xs text-slate-500 truncate">{i.body}</span>}
              {i.invite_id && i.email && (
                <span onClick={(e) => (sentIds[i.id] || i.picker_sent) ? e.stopPropagation() : sendPicker(e, i)} data-testid={`notif-slot-picker-${i.id}`}
                  className={`inline-flex items-center gap-1 mt-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold cursor-pointer transition ${(sentIds[i.id] || i.picker_sent) ? "bg-emerald-100 text-emerald-600" : "bg-amber-500 text-white hover:bg-amber-600"}`}>
                  📅 {(sentIds[i.id] || i.picker_sent) ? "Time-picker sent ✓" : "Send time-picker email"}
                </span>
              )}
            </span>
            <span className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-slate-400 whitespace-nowrap">
                {i.at ? new Date(i.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}
                {isUnread(i) && <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-rose-500" />}
              </span>
              <button onClick={(e) => dismissItem(e, i)} data-testid={`notif-dismiss-${i.id}`} title="Dismiss"
                className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 transition p-0.5">
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
