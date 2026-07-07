import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Phone, MessageCircle, CalendarPlus, Trash2, ChevronDown, ChevronUp, Users, UserPlus } from "lucide-react";

const STATUS_STYLE = {
  new: "bg-rose-50 text-rose-700 border-rose-200",
  contacted: "bg-amber-50 text-amber-700 border-amber-200",
  converted: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function gcalLink(i) {
  const start = new Date(Date.now() + 24 * 3600 * 1000);
  start.setHours(11, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60000);
  const fmt = d => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Miracurl demo — ${i.name}`)}&add=${encodeURIComponent(i.email)}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(`Demo call with ${i.name} (${i.phone}). Inquiry from the Miracurl website chat.`)}`;
}

export function InquiriesPanel({ onNewCount, onConvert }) {
  const [items, setItems] = useState([]);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/super-admin/inquiries");
      setItems(data.items || []);
      onNewCount?.(data.new_count || 0);
    } catch { toast.error("Couldn't load inquiries"); }
  }, [onNewCount]);
  useEffect(() => { load(); }, [load]);

  async function setStatus(i, status) {
    try {
      await api.patch(`/super-admin/inquiries/${i.id}`, { status });
      setItems(prev => {
        const next = prev.map(x => x.id === i.id ? { ...x, status } : x);
        onNewCount?.(next.filter(x => x.status === "new").length);
        return next;
      });
    } catch { toast.error("Couldn't update status"); }
  }

  async function remove(i) {
    if (!window.confirm(`Delete inquiry from ${i.name}?`)) return;
    try {
      await api.delete(`/super-admin/inquiries/${i.id}`);
      setItems(prev => prev.filter(x => x.id !== i.id));
    } catch { toast.error("Couldn't delete"); }
  }

  return (
    <div data-testid="inquiries-panel">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-playfair text-3xl">Tenant Inquiries</h1>
          <p className="text-slate-500 text-sm mt-1">Prospects who chatted with Sales Mira on the website — call, WhatsApp or schedule a demo.</p>
        </div>
        <span className="text-xs text-slate-400">{items.length} total · {items.filter(i => i.status === "new").length} new</span>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 text-slate-400 border border-dashed border-slate-200 rounded-2xl">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No inquiries yet — they'll appear here when visitors chat with Mira on the landing page.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(i => (
            <div key={i.id} className="bg-white rounded-xl border border-slate-200 shadow-sm" data-testid={`inquiry-row-${i.id}`}>
              <div className="px-4 py-3 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-800 text-sm">{i.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {i.email} · {i.phone} · {new Date(i.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                </div>
                <select value={i.status} onChange={e => setStatus(i, e.target.value)} data-testid={`inquiry-status-${i.id}`}
                  className={`text-xs px-2 py-1.5 rounded-lg border font-medium ${STATUS_STYLE[i.status] || STATUS_STYLE.new}`}>
                  <option value="new">🔴 New</option>
                  <option value="contacted">🟡 Contacted</option>
                  <option value="converted">🟢 Converted</option>
                </select>
                <div className="flex items-center gap-1.5">
                  {i.status !== "converted" && (
                    <button onClick={() => { setStatus(i, "converted"); onConvert?.(i); }} title="Convert to tenant — opens a pre-filled New Salon form"
                      data-testid={`inquiry-convert-${i.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-500">
                      <UserPlus className="w-3.5 h-3.5" /> Convert
                    </button>
                  )}
                  <a href={`tel:+91${i.phone}`} title="Call" data-testid={`inquiry-call-${i.id}`}
                    className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-sky-50 hover:text-sky-600"><Phone className="w-4 h-4" /></a>
                  <a href={`https://wa.me/91${i.phone}?text=${encodeURIComponent(`Hi ${i.name.split(" ")[0]}! This is the Miracurl team — thanks for your interest in our salon suite. When's a good time for a quick demo?`)}`}
                    target="_blank" rel="noreferrer" title="WhatsApp" data-testid={`inquiry-wa-${i.id}`}
                    className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-600"><MessageCircle className="w-4 h-4" /></a>
                  <a href={gcalLink(i)} target="_blank" rel="noreferrer" title="Schedule Google Calendar demo invite" data-testid={`inquiry-gcal-${i.id}`}
                    className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-amber-50 hover:text-amber-600"><CalendarPlus className="w-4 h-4" /></a>
                  <button onClick={() => remove(i)} title="Delete" data-testid={`inquiry-delete-${i.id}`}
                    className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                  <button onClick={() => setExpanded(expanded === i.id ? null : i.id)} data-testid={`inquiry-toggle-${i.id}`}
                    className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                    {expanded === i.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {expanded === i.id && (
                <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 space-y-2 max-h-72 overflow-y-auto" data-testid={`inquiry-transcript-${i.id}`}>
                  {(i.messages || []).map((m, idx) => (
                    <div key={idx} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] px-3 py-1.5 rounded-xl text-xs leading-relaxed ${
                        m.role === "user" ? "bg-fuchsia-600 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {(!i.messages || i.messages.length === 0) && <p className="text-xs text-slate-400">No messages.</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
