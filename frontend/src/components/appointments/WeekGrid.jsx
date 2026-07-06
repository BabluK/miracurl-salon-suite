export const STATUS_DOT = {
  scheduled: "bg-blue-400",
  completed: "bg-emerald-400",
  cancelled: "bg-red-400",
  no_show: "bg-amber-400",
};

export function WeekGrid({ weekData, onOpenDay }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3" data-testid="appt-week-grid">
      {weekData.map(day => {
        const d = new Date(day.date + "T00:00:00");
        const isToday = day.date === new Date().toISOString().slice(0, 10);
        return (
          <div key={day.date} data-testid={`week-col-${day.date}`} className={`card-light p-0 overflow-hidden min-h-[280px] ${isToday ? "border-sky-400 ring-1 ring-sky-200" : ""}`}>
            <div className={`px-3 py-2 border-b border-slate-100 ${isToday ? "bg-sky-50" : "bg-slate-50/40"}`}>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
              <div className={`font-playfair text-2xl ${isToday ? "text-sky-600" : ""}`}>{d.getDate()}</div>
              <div className="text-[10px] text-slate-400">{day.items.length} bookings</div>
            </div>
            <div className="p-2 space-y-2">
              {day.items.length === 0 ? (
                <div className="text-[10px] text-slate-400 text-center py-4">—</div>
              ) : day.items.map(a => (
                <button
                  key={a.id}
                  data-testid={`week-appt-${a.id}`}
                  onClick={() => onOpenDay(day.date)}
                  className="w-full text-left bg-slate-50/50 hover:bg-slate-50 border border-slate-100 hover:border-sky-300 rounded-md p-2 transition-all"
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[a.status]}`} />
                    <span className="text-[10px] font-mono text-sky-600">{new Date(a.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="text-xs font-medium mt-1 line-clamp-1">{a.customer_name}</div>
                  <div className="text-[10px] text-slate-500 line-clamp-1">{a.service_names.join(", ")}</div>
                  <div className="text-[10px] text-slate-400 mt-1">with {a.staff_name}</div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
