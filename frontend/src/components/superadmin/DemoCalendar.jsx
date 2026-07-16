import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { CalendarCheck, Clock, Phone, Mail, MapPin, CheckCircle2, ExternalLink, MessageCircle, History } from "lucide-react";

const SOURCE_BADGE = {
  public_demo_page: { label: "Booked via /demo", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  invite: { label: "Email invite", cls: "bg-sky-50 text-sky-700 border-sky-200" },
};

function prettyDate(d) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}

function DemoCard({ demo, isToday, onDone }) {
  const badge = SOURCE_BADGE[demo.source] || SOURCE_BADGE.invite;
  const waNum = (demo.phone || "").replace(/\D/g, "");
  return (
    <div className={`bg-white rounded-2xl border p-4 flex flex-wrap items-center gap-4 ${isToday ? "border-amber-300 shadow-sm" : "border-slate-200"} ${demo.done ? "opacity-60" : ""}`}
      data-testid={`demo-cal-card-${demo.id}`}>
      <div className={`shrink-0 w-16 text-center rounded-xl py-2 ${isToday ? "bg-amber-100 text-amber-800" : "bg-slate-900 text-white"}`}>
        <div className="text-sm font-bold">{demo.time}</div>
        <div className="text-[9px] uppercase tracking-wider opacity-70">IST</div>
      </div>
      <div className="flex-1 min-w-[180px]">
        <p className="text-sm font-semibold text-slate-800">
          {demo.name || demo.email}
          {demo.done && <span className="ml-2 text-[10px] text-emerald-600 font-bold">✓ DONE</span>}
        </p>
        <p className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
          {demo.salon_name && <span>{demo.salon_name}</span>}
          {demo.city && <span className="inline-flex items-center gap-0.5"><MapPin className="w-3 h-3" />{demo.city}</span>}
          <span className="inline-flex items-center gap-0.5"><Mail className="w-3 h-3" />{demo.email}</span>
          {demo.phone && <span className="inline-flex items-center gap-0.5"><Phone className="w-3 h-3" />{demo.phone}</span>}
        </p>
      </div>
      <span className={`text-[10px] px-2 py-1 rounded-full border font-semibold ${badge.cls}`}>{badge.label}</span>
      <div className="flex items-center gap-1.5">
        {waNum && (
          <a href={`https://wa.me/${waNum.length === 10 ? "91" + waNum : waNum}`} target="_blank" rel="noreferrer"
            data-testid={`demo-cal-wa-${demo.id}`} title="WhatsApp them"
            className="p-2 rounded-lg bg-[#25D366]/10 text-[#128C7E] hover:bg-[#25D366]/20"><MessageCircle className="w-4 h-4" /></a>
        )}
        <a href={demo.gcal} target="_blank" rel="noreferrer" data-testid={`demo-cal-gcal-${demo.id}`} title="Add to Google Calendar"
          className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"><ExternalLink className="w-4 h-4" /></a>
        {!demo.done && (
          <button onClick={() => onDone(demo.id)} data-testid={`demo-cal-done-${demo.id}`} title="Mark demo completed"
            className="p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100"><CheckCircle2 className="w-4 h-4" /></button>
        )}
      </div>
    </div>
  );
}

export function DemoCalendar() {
  const [data, setData] = useState(null);
  const [showPast, setShowPast] = useState(false);

  const load = useCallback(() => {
    api.get("/super-admin/demo-calendar").then(r => setData(r.data)).catch(() => toast.error("Couldn't load demo calendar"));
  }, []);
  useEffect(() => { load(); }, [load]);

  const markDone = async (id) => {
    try {
      await api.post(`/super-admin/demo-calendar/${id}/done`);
      toast.success("Marked as completed 🎉");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  if (!data) return <div className="text-slate-500 p-4">Loading demo calendar…</div>;

  const byDate = data.upcoming.reduce((acc, d) => { (acc[d.date] = acc[d.date] || []).push(d); return acc; }, {});

  return (
    <div className="space-y-6" data-testid="demo-calendar-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-playfair text-3xl flex items-center gap-3"><CalendarCheck className="w-7 h-7 text-amber-500" /> Demo Calendar</h1>
          <p className="text-slate-500 text-sm mt-1">Every booked demo slot in one place — never miss a call.</p>
        </div>
        {data.today_count > 0 && (
          <span className="bg-amber-100 text-amber-800 border border-amber-200 rounded-full px-4 py-1.5 text-sm font-bold" data-testid="demo-cal-today-badge">
            🔥 {data.today_count} demo{data.today_count > 1 ? "s" : ""} today
          </span>
        )}
      </div>

      {data.upcoming.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400 text-sm" data-testid="demo-cal-empty">
          No upcoming demos yet — share <b>miracurl-suite.com/demo</b> with prospects, or approve leads in the Mira Lead Agent.
        </div>
      )}

      {Object.entries(byDate).map(([date, demos]) => (
        <div key={date} className="space-y-2">
          <p className={`text-xs font-bold tracking-widest uppercase flex items-center gap-2 ${date === data.today ? "text-amber-600" : "text-slate-400"}`}>
            <Clock className="w-3.5 h-3.5" /> {date === data.today ? "Today — " : ""}{prettyDate(date)}
          </p>
          {demos.map(d => <DemoCard key={d.id} demo={d} isToday={date === data.today} onDone={markDone} />)}
        </div>
      ))}

      {data.past.length > 0 && (
        <div>
          <button onClick={() => setShowPast(s => !s)} data-testid="demo-cal-past-toggle"
            className="text-xs text-slate-500 font-semibold inline-flex items-center gap-1.5 hover:text-slate-700">
            <History className="w-3.5 h-3.5" /> {showPast ? "Hide" : "Show"} past demos ({data.past.length}, last 30 days)
          </button>
          {showPast && (
            <div className="space-y-2 mt-3 opacity-80">
              {data.past.map(d => (
                <div key={d.id} className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-2.5 text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1 items-center" data-testid={`demo-cal-past-${d.id}`}>
                  <b className="text-slate-700">{d.date} · {d.time}</b>
                  <span>{d.name || d.email}</span>
                  {d.salon_name && <span>{d.salon_name}</span>}
                  {d.done ? <span className="text-emerald-600 font-semibold">✓ completed</span>
                    : <button onClick={() => markDone(d.id)} className="text-emerald-600 underline">mark done</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
