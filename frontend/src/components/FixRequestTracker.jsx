import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Check, Clock, Hammer, Inbox, RefreshCw, MessageSquareText } from "lucide-react";

export const STEPS = [
  { key: "open", label: "Sent to HQ", Icon: Clock },
  { key: "in_progress", label: "HQ working on it", Icon: Hammer },
  { key: "resolved", label: "Fixed", Icon: Check },
];
const IDX = { open: 0, in_progress: 1, resolved: 2 };
export const STATUS_PILL = {
  open: ["bg-amber-50 text-amber-700 border-amber-200", "Sent · waiting for HQ"],
  in_progress: ["bg-sky-50 text-sky-700 border-sky-200", "HQ working on it"],
  resolved: ["bg-emerald-50 text-emerald-700 border-emerald-200", "Fixed"],
};

const ago = (iso) => {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

export function useFixRequests(live) {
  const [data, setData] = useState({ items: [], active: 0 });
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const load = () => { setLoading(true); return api.get("/support/fix-requests").then(r => { setData(r.data); setUpdatedAt(Date.now()); }).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!live) return undefined;
    const iv = setInterval(load, 20000);
    return () => clearInterval(iv);
  }, [live]);
  return { ...data, loading, updatedAt, reload: load };
}

function Timeline({ status }) {
  const cur = IDX[status] ?? 0;
  return (
    <ol className="flex items-center gap-1 mt-3" data-testid="fix-ticket-timeline">
      {STEPS.map((s, i) => {
        const done = i <= cur, now = i === cur && status !== "resolved";
        return (
          <li key={s.key} className="flex items-center gap-1 flex-1 min-w-0">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border ${done ? "bg-[#15130f] border-[#15130f] text-[#f3e5ab]" : "bg-white border-slate-200 text-slate-300"} ${now ? "ring-4 ring-[#d4af37]/25" : ""}`}>
              <s.Icon className={`w-3 h-3 ${now ? "animate-pulse" : ""}`} />
            </span>
            <span className={`text-[10px] truncate ${done ? "text-slate-800 font-semibold" : "text-slate-400"}`}>{s.label}</span>
            {i < STEPS.length - 1 && <span className={`h-px flex-1 mx-1 ${i < cur ? "bg-[#d4af37]" : "bg-slate-200"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

export function FixRequestTracker({ items, loading, updatedAt, reload }) {
  if (!items.length) {
    return (
      <div className="text-center py-10 text-slate-400" data-testid="fix-tracker-empty">
        <Inbox className="w-8 h-8 mx-auto mb-2 text-slate-300" />
        <div className="text-sm">No requests yet — send your first one from the “New request” tab.</div>
      </div>
    );
  }
  return (
    <div className="space-y-3" data-testid="fix-tracker">
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>Updates live every 20s{updatedAt ? ` · checked ${ago(new Date(updatedAt).toISOString())}` : ""}</span>
        <button onClick={reload} disabled={loading} className="inline-flex items-center gap-1 hover:text-slate-700 disabled:opacity-50" data-testid="fix-tracker-refresh"><RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh</button>
      </div>
      {items.map(tk => {
        const [cls, label] = STATUS_PILL[tk.status] || STATUS_PILL.open;
        return (
          <div key={tk.id} className="rounded-2xl border border-[#eee4c8] bg-[#fffdf8] px-4 py-3.5" data-testid={`fix-ticket-${tk.ticket_no}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold text-[#15130f]">#{tk.ticket_no}</span>
              <span className="text-[11px] text-slate-500 truncate">{tk.page_title || tk.page}</span>
              <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full border ${cls}`} data-testid={`fix-ticket-status-${tk.ticket_no}`}>{label}</span>
            </div>
            <p className="text-sm text-slate-800 mt-1.5 line-clamp-2">{tk.message}</p>
            <Timeline status={tk.status} />
            <div className="mt-2 text-[10px] text-slate-400 flex gap-3 flex-wrap">
              <span>Sent {ago(tk.created_at)}</span>
              {tk.in_progress_at && <span>· HQ started {ago(tk.in_progress_at)}</span>}
              {tk.resolved_at && <span>· Fixed {ago(tk.resolved_at)}</span>}
            </div>
            {tk.hq_note && (
              <div className="mt-2.5 flex items-start gap-2 rounded-xl bg-[#15130f] text-[#f3e5ab] px-3 py-2 text-[12px]" data-testid={`fix-ticket-note-${tk.ticket_no}`}>
                <MessageSquareText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#d4af37]" />
                <span><b className="text-[#d4af37]">Miracurl Support:</b> {tk.hq_note}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
