import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { CalendarDays, Loader2, Check, Send, Trash2, Pencil, Sparkles } from "lucide-react";

const TYPE_EMOJI = { offer: "🏷️", reel: "🎥", festival: "🪔", tip: "💡", spotlight: "✨", post: "📝" };
const STATUS_STYLE = {
  suggested: "bg-slate-100 text-slate-600",
  approved: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  posted: "bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200",
  skipped: "bg-slate-50 text-slate-400 line-through",
};

export const MiraCalendar = ({ canPost }) => {
  const [items, setItems] = useState([]);
  const [planning, setPlanning] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [editId, setEditId] = useState("");
  const [editText, setEditText] = useState("");

  const load = () => api.get("/mira-studio/calendar").then(r => setItems(r.data.items)).catch(() => {});
  useEffect(() => { load(); }, []);

  const plan = async () => {
    setPlanning(true);
    try {
      const { data } = await api.post("/mira-studio/calendar/plan", {});
      toast.success(`Mira planned ${data.count} posts for your week ✦`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Planning failed — try again");
    } finally { setPlanning(false); }
  };

  const update = async (id, payload, msg) => {
    setBusyId(id);
    try {
      await api.put(`/mira-studio/calendar/${id}`, payload);
      if (msg) toast.success(msg);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Update failed");
    } finally { setBusyId(""); }
  };

  const remove = async (id) => {
    await api.delete(`/mira-studio/calendar/${id}`);
    load();
  };

  const publish = async (id) => {
    setBusyId(id);
    try {
      const { data } = await api.post(`/mira-studio/calendar/${id}/publish`);
      if (data.posted) toast.success("Posted to your social accounts 🎉");
      else toast.error("Publishing failed on all platforms — check Settings → Connected Accounts");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Publish failed");
    } finally { setBusyId(""); }
  };

  const saveEdit = (id) => {
    update(id, { caption: editText }, "Caption updated");
    setEditId("");
  };

  return (
    <div className="space-y-4" data-testid="mira-calendar">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-800 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-fuchsia-500" /> Content Calendar</h3>
          <p className="text-xs text-slate-500 mt-0.5">Mira plans a week of posts — festivals, offers, reels. You just approve.</p>
        </div>
        <button data-testid="calendar-plan-week" onClick={plan} disabled={planning}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-600 text-white text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-2">
          {planning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {planning ? "Mira is planning…" : "Plan my week ✦"}
        </button>
      </div>

      {items.length === 0 && !planning && (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-10 text-center text-slate-400 text-sm" data-testid="calendar-empty">
          No plan yet — click “Plan my week ✦” and Mira will map out 7 days of posts for you.
        </div>
      )}

      <div className="space-y-2.5">
        {items.map(it => (
          <div key={it.id} data-testid={`calendar-item-${it.id}`} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xl">{TYPE_EMOJI[it.post_type] || "📝"}</span>
              <span className="text-xs font-bold text-slate-700 bg-slate-100 rounded-md px-2 py-0.5">
                {new Date(it.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
              </span>
              <span className="text-sm font-semibold text-slate-800 flex-1">{it.topic}</span>
              <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${STATUS_STYLE[it.status] || ""}`}>{it.status}</span>
            </div>

            {editId === it.id ? (
              <div className="mt-2">
                <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={3}
                  className="w-full text-sm border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-fuchsia-400" />
                <div className="flex gap-2 mt-1.5">
                  <button onClick={() => saveEdit(it.id)} className="text-xs px-3 py-1 rounded-lg bg-fuchsia-600 text-white">Save</button>
                  <button onClick={() => setEditId("")} className="text-xs px-3 py-1 rounded-lg text-slate-500">Cancel</button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600 mt-1.5 whitespace-pre-line">{it.caption}</p>
            )}
            {it.hashtags?.length > 0 && <p className="text-xs text-fuchsia-600 mt-1">{it.hashtags.join(" ")}</p>}

            {it.status !== "posted" && (
              <div className="flex flex-wrap gap-2 mt-3">
                {it.status === "suggested" && (
                  <button data-testid={`calendar-approve-${it.id}`} onClick={() => update(it.id, { status: "approved" }, "Approved ✦")} disabled={busyId === it.id}
                    className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-medium inline-flex items-center gap-1 disabled:opacity-50"><Check className="w-3 h-3" /> Approve</button>
                )}
                {it.status === "approved" && canPost && (
                  <button data-testid={`calendar-publish-${it.id}`} onClick={() => publish(it.id)} disabled={busyId === it.id}
                    className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-fuchsia-500 to-pink-600 text-white font-medium inline-flex items-center gap-1 disabled:opacity-50">
                    {busyId === it.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Post now
                  </button>
                )}
                {it.status === "approved" && !canPost && (
                  <span className="text-[11px] text-amber-600">Connect Instagram/Facebook in Settings to post directly</span>
                )}
                <button onClick={() => { setEditId(it.id); setEditText(it.caption); }}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 inline-flex items-center gap-1"><Pencil className="w-3 h-3" /> Edit</button>
                <button onClick={() => remove(it.id)}
                  className="text-xs px-3 py-1.5 rounded-lg text-slate-400 hover:text-red-500 inline-flex items-center gap-1"><Trash2 className="w-3 h-3" /> Skip</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
