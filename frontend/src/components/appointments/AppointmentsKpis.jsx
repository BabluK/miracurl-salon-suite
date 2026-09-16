import { Calendar, UserPlus, Users, IndianRupee, Clock, Star } from "lucide-react";
import { KpiStrip, KpiTile } from "@/components/shell/PageShell";

export function AppointmentsKpis({ list, customers, date, view, sym = "₹" }) {
  const live = list.filter(a => a.status !== "cancelled");
  const revenue = live.filter(a => a.status === "completed").reduce((s, a) => s + (a.total || 0), 0);
  const newCust = customers.filter(c => (c.created_at || "").slice(0, 10) === date).length;
  const walkins = live.filter(a => !a.booked_via).length;
  const avgDur = live.length ? Math.round(live.reduce((s, a) => s + (a.duration_min || 0), 0) / live.length) : null;
  const rated = list.filter(a => a.rating);
  const rating = rated.length ? (rated.reduce((s, a) => s + a.rating, 0) / rated.length).toFixed(1) : null;
  const when = view === "upcoming" ? "upcoming" : view === "month" ? "this month" : `on ${new Date(date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
  const today = view === "list" ? "today" : when;
  return (
    <KpiStrip cols={6}>
      <KpiTile icon={Calendar} tone="gold" label="Total Bookings" value={live.length} sub={when} testid="appt-kpi-total" />
      <KpiTile icon={UserPlus} tone="emerald" label="New Customers" value={newCust} sub={today} testid="appt-kpi-new" />
      <KpiTile icon={Users} tone="rose" label="Walk-ins" value={walkins} sub={today} testid="appt-kpi-walkins" />
      <KpiTile icon={IndianRupee} tone="violet" label="Total Revenue" value={`${sym}${revenue.toLocaleString("en-IN")}`} sub={today} testid="appt-kpi-revenue" />
      <KpiTile icon={Clock} tone="sky" label="Avg. Service Time" value={avgDur ? `${avgDur}m` : "—"} sub={avgDur ? "per booking" : "N/A"} testid="appt-kpi-avg" />
      <KpiTile icon={Star} tone="amber" label="Customer Rating" value={rating || "—"} sub={rating ? `${rated.length} rated` : "N/A"} testid="appt-kpi-rating" />
    </KpiStrip>
  );
}
