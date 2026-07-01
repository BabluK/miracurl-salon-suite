import { useEffect, useState, useCallback } from "react";
import api, { API, formatApiError, getAccessToken } from "@/lib/api";
import { toast } from "sonner";
import {
  Clock, LogIn, LogOut, IndianRupee, Download, User as UserIcon,
  Calendar, Sparkles, CheckCircle2, TrendingUp, FileText,
} from "lucide-react";

function monthOptions(count = 6) {
  const now = new Date();
  const arr = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    arr.push({
      value: `${y}-${m}`,
      label: d.toLocaleString("en-IN", { month: "long", year: "numeric" }),
    });
  }
  return arr;
}

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

export default function StaffPortal() {
  const [profile, setProfile] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [month, setMonth] = useState(monthOptions()[0].value);
  const [slip, setSlip] = useState(null);
  const [slipLoading, setSlipLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([
        api.get("/staff/me/profile"),
        api.get("/staff/me/attendance"),
      ]);
      setProfile(p.data);
      setAttendance(a.data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to load portal");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!profile || profile.salary_visible === false) { setSlip(null); return; }
    let cancelled = false;
    (async () => {
      setSlipLoading(true);
      try {
        const { data } = await api.get("/staff/me/salary-slip", { params: { month } });
        if (!cancelled) setSlip(data);
      } catch (e) {
        if (!cancelled) {
          if (e.response?.status === 403) setSlip({ hidden: true });
          else toast.error(formatApiError(e.response?.data?.detail) || "Failed to load salary");
        }
      } finally { if (!cancelled) setSlipLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [month, profile]);

  async function checkIn() {
    setBusy(true);
    try {
      await api.post("/staff/me/check-in");
      toast.success("Checked in ✦ Have a great shift");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Check-in failed");
    } finally { setBusy(false); }
  }

  async function checkOut() {
    setBusy(true);
    try {
      await api.post("/staff/me/check-out");
      toast.success("Checked out — see you tomorrow");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Check-out failed");
    } finally { setBusy(false); }
  }

  async function downloadSlip() {
    try {
      const token = getAccessToken();
      const url = `${API}/staff/me/salary-slip.pdf?month=${encodeURIComponent(month)}`;
      const resp = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!resp.ok) {
        const text = await resp.text();
        toast.error(text || "Failed to download slip");
        return;
      }
      const blob = await resp.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `salary-slip-${month}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      toast.success("Salary slip downloaded");
    } catch (e) {
      toast.error("Download failed");
    }
  }

  if (!profile || !attendance) {
    return <div className="text-white/50" data-testid="staff-portal-loading">Loading your portal…</div>;
  }

  const today = attendance.today || null;
  const checkedIn = !!today?.check_in_at;
  const checkedOut = !!today?.check_out_at;
  const canCheckOut = checkedIn && !checkedOut;
  const salaryHidden = profile.salary_visible === false;

  return (
    <div className="space-y-6" data-testid="staff-portal">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gold/20 via-blush/10 to-transparent border border-gold/30 p-5 sm:p-8">
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-gold/20 rounded-full blur-3xl" />
        <div className="relative flex items-center gap-4">
          <img
            src={profile.image_url || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300"}
            alt={profile.name}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-gold/50"
          />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">Welcome back</div>
            <div className="font-playfair text-2xl sm:text-3xl truncate">{profile.name}</div>
            <div className="text-white/60 text-sm mt-1">{profile.role}</div>
          </div>
        </div>
      </div>

      {/* Check In/Out */}
      <div className="rounded-2xl bg-[#0F0F0F] border border-white/5 p-5 sm:p-6" data-testid="attendance-card">
        <div className="flex items-center justify-between mb-4">
          <div className="font-playfair text-lg flex items-center gap-2"><Clock className="w-4 h-4 text-gold" /> Today</div>
          <div className="text-xs text-white/40">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}</div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-lg bg-white/5 border border-white/10 p-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-1">Check-in</div>
            <div className="text-lg font-medium" data-testid="today-checkin-time">{fmtTime(today?.check_in_at)}</div>
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-1">Check-out</div>
            <div className="text-lg font-medium" data-testid="today-checkout-time">{fmtTime(today?.check_out_at)}</div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={checkIn}
            disabled={busy || checkedIn}
            data-testid="check-in-btn"
            className={`inline-flex items-center justify-center gap-2 px-4 py-3 font-medium rounded-md text-sm transition ${
              checkedIn ? "bg-white/5 text-white/40 cursor-not-allowed" : "bg-gradient-to-r from-gold to-blush text-bg-base hover:opacity-90"
            }`}
          >
            {checkedIn ? <CheckCircle2 className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
            {checkedIn ? "Checked in" : "Check in"}
          </button>
          <button
            onClick={checkOut}
            disabled={busy || !canCheckOut}
            data-testid="check-out-btn"
            className={`inline-flex items-center justify-center gap-2 px-4 py-3 font-medium rounded-md text-sm transition ${
              !canCheckOut ? "bg-white/5 text-white/40 cursor-not-allowed" : "bg-white/10 hover:bg-white/15 border border-white/10"
            }`}
          >
            <LogOut className="w-4 h-4" />
            {checkedOut ? "Checked out" : "Check out"}
          </button>
        </div>
      </div>

      {/* Month summary */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <MiniStat label="Days present" value={attendance.total_days} icon={Calendar} testid="days-present" />
        <MiniStat label="Hours this month" value={`${attendance.total_hours}h`} icon={TrendingUp} testid="hours-month" />
        <MiniStat label="Commission %" value={`${profile.commission_pct || 0}%`} icon={Sparkles} testid="commission-pct" />
      </div>

      {/* Salary slip */}
      <div className="rounded-2xl bg-[#0F0F0F] border border-white/5 p-5 sm:p-6" data-testid="salary-card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="font-playfair text-lg flex items-center gap-2">
            <IndianRupee className="w-4 h-4 text-gold" /> Salary slip
          </div>
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            data-testid="salary-month-select"
            className="bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90"
          >
            {monthOptions(12).map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {salaryHidden || slip?.hidden ? (
          <div className="text-center py-10 text-white/50 text-sm" data-testid="salary-hidden">
            Salary details are not visible on your account.<br />
            Please contact your salon admin to enable them.
          </div>
        ) : slipLoading || !slip ? (
          <div className="text-white/40 text-sm py-6">Loading slip…</div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <SlipRow label="Monthly base" value={`₹${(slip.monthly_base_salary || 0).toLocaleString("en-IN")}`} />
              <SlipRow label={`Commission (${slip.commission_pct || 0}%)`} value={`₹${(slip.commission_amount || 0).toLocaleString("en-IN")}`} />
              <SlipRow label="Days present" value={slip.days_present || 0} />
              <SlipRow label="Hours worked" value={`${slip.total_hours || 0} h`} />
              <SlipRow label="Service gross" value={`₹${(slip.service_gross || 0).toLocaleString("en-IN")}`} sub={`${slip.service_count || 0} service line(s)`} />
              <div className="rounded-lg bg-gradient-to-r from-gold/20 to-blush/10 border border-gold/40 p-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/60 mb-1">Net payable</div>
                <div className="font-playfair text-2xl text-gold">₹{(slip.net_payable || 0).toLocaleString("en-IN")}</div>
              </div>
            </div>
            <button
              onClick={downloadSlip}
              data-testid="download-slip-btn"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-white/10 hover:bg-white/15 border border-white/10 rounded-md text-sm transition"
            >
              <Download className="w-4 h-4" /> Download PDF salary slip
            </button>
          </>
        )}
      </div>

      {/* Attendance history */}
      <div className="rounded-2xl bg-[#0F0F0F] border border-white/5 p-5 sm:p-6">
        <div className="font-playfair text-lg mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-gold" /> Attendance — this month
        </div>
        {attendance.records.length === 0 ? (
          <div className="text-center py-8 text-white/40 text-sm">No attendance yet this month.</div>
        ) : (
          <div className="divide-y divide-white/5" data-testid="attendance-list">
            {attendance.records.map(r => (
              <div key={r.id || r.date} className="py-2.5 flex items-center justify-between text-sm">
                <div className="text-white/80">
                  {new Date(r.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                </div>
                <div className="text-white/60 text-xs tabular-nums">
                  {fmtTime(r.check_in_at)} → {fmtTime(r.check_out_at)}
                  {r.hours_worked ? <span className="ml-2 text-gold">{r.hours_worked}h</span> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Profile footer */}
      <div className="rounded-2xl bg-[#0F0F0F] border border-white/5 p-5 sm:p-6">
        <div className="font-playfair text-lg mb-4 flex items-center gap-2">
          <UserIcon className="w-4 h-4 text-gold" /> Profile
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <SlipRow label="Email" value={profile.email || "—"} />
          <SlipRow label="Phone" value={profile.phone || "—"} />
          <SlipRow label="Joining date" value={profile.joining_date || "—"} />
          <SlipRow label="Status" value={profile.active ? "Active" : "Inactive"} />
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, icon: Icon, testid }) {
  return (
    <div className="rounded-xl bg-[#0F0F0F] border border-white/5 p-4" data-testid={testid}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/40 mb-2">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className="font-playfair text-2xl sm:text-3xl text-gold">{value}</div>
    </div>
  );
}

function SlipRow({ label, value, sub }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 p-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-1">{label}</div>
      <div className="text-white/90 text-base">{value}</div>
      {sub && <div className="text-[11px] text-white/40 mt-0.5">{sub}</div>}
    </div>
  );
}
