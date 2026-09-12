import { useEffect, useState, useCallback, useRef } from "react";
import api, { API, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import {
  Clock, LogIn, LogOut, IndianRupee, Download, User as UserIcon,
  Calendar, Sparkles, CheckCircle2, TrendingUp, FileText, Camera, QrCode, MapPin,
} from "lucide-react";
import { PlannedLeaveCard } from "@/components/staff/PlannedLeaveCard";
import { QrScanCheckIn } from "@/components/QrScanCheckIn";
import { playCheckinGreeting, playCheckoutGreeting } from "@/lib/checkinSound";


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

function getPositionOnce(opts) {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      opts,
    );
  });
}

async function getPosition() {
  if (!navigator.geolocation) return null;
  const precise = await getPositionOnce({ enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  if (precise) return precise;
  return getPositionOnce({ enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 });
}

const MOTIVATION = [
  "You make people feel beautiful — that's a superpower ✨",
  "Every client you touch today leaves happier. Keep shining!",
  "Great stylists don't just cut hair — they lift spirits. That's you 💛",
  "Your hands create confidence. Make today count!",
  "Smile — your energy is the first thing every client feels ✦",
  "Small details, big magic. You've got this today!",
  "Someone will walk out feeling amazing today — because of you 🌟",
];

export default function StaffPortal() {
  const [profile, setProfile] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [month, setMonth] = useState(monthOptions()[0].value);
  const [slip, setSlip] = useState(null);
  const [slipLoading, setSlipLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lateInfo, setLateInfo] = useState(null);
  const [fence, setFence] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const autoQrTried = useRef(false);

  const load = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([
        api.get("/staff/me/profile"),
        api.get("/staff/me/attendance"),
      ]);
      setProfile(p.data);
      setAttendance(a.data);
      try { const { data } = await api.get("/staff/me/fence"); setFence(data); } catch { /* info-only */ }
      try {
        const { data } = await api.get("/staff/me/late-status");
        setLateInfo(data);
        if (data.late) {
          toast.error(`⏰ You're running late — please check in! (${data.minutes_late} min past your ${data.shift_start} shift)`, { duration: 8000 });
        }
      } catch { /* banner is best-effort */ }
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

  async function checkIn(scannedToken) {
    setBusy(true);
    try {
      const qrToken = scannedToken || new URLSearchParams(window.location.search).get("qr") || "";
      const pos = qrToken ? null : await getPosition();
      await api.post("/staff/me/check-in", { ...(pos || {}), ...(qrToken ? { qr_token: qrToken } : {}) });
      toast.success(qrToken ? "✅ Checked in via desk QR — instant, no GPS needed ✦" : "Checked in ✦ Have a great shift");
      playCheckinGreeting(profile?.name);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Check-in failed");
      if (!scannedToken && e.response?.status === 403 && !String(e.response?.data?.detail || "").includes("week-off")) {
        toast.info("Tip: tap 'Scan desk QR' below to check in instantly without GPS.", { duration: 8000 });
      }
    } finally { setBusy(false); }
  }

  // Arrived via the desk QR link → check in instantly, no button press needed
  useEffect(() => {
    const qrTok = new URLSearchParams(window.location.search).get("qr");
    if (!qrTok || autoQrTried.current || !attendance) return;
    if (attendance.today?.check_in_at) { autoQrTried.current = true; return; }
    autoQrTried.current = true;
    checkIn(qrTok);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendance]);

  const [confirmOut, setConfirmOut] = useState(false);

  async function checkOut() {
    setConfirmOut(false);
    setBusy(true);
    try {
      const pos = await getPosition();
      await api.post("/staff/me/check-out", pos || {});
      toast.success("Checked out — see you tomorrow");
      playCheckoutGreeting(profile?.name);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Check-out failed");
    } finally { setBusy(false); }
  }

  async function uploadPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error("Image too large — max 8MB"); return; }
    const fd = new FormData();
    fd.append("file", file);
    try {
      await api.post("/staff/me/photo", fd);
      toast.success("Photo updated ✦ It now shows on the booking page & admin portal");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Photo upload failed");
    }
  }

  async function downloadSlip() {
    try {
      const url = `${API}/staff/me/salary-slip.pdf?month=${encodeURIComponent(month)}`;
      const resp = await fetch(url, {
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
  const isWeekOffToday = (profile.week_off_day || "").toLowerCase()
    === new Date().toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();

  return (
    <div className="space-y-6" data-testid="staff-portal">
      {lateInfo?.late && !checkedIn && !isWeekOffToday && (
        <div className="rounded-2xl bg-red-500/15 border border-red-400/40 px-4 py-3 flex items-center gap-3 animate-pulse" data-testid="staff-late-banner">
          <span className="text-xl">⏰</span>
          <div>
            <div className="text-sm font-semibold text-red-300">You're running late — please check in!</div>
            <div className="text-xs text-red-200/70">Your shift started at {lateInfo.shift_start} · {lateInfo.minutes_late} min ago. Check in below as soon as you arrive.</div>
          </div>
        </div>
      )}
      {isWeekOffToday && !checkedIn && (
        <div className="rounded-2xl bg-teal-500/10 border border-teal-400/30 px-4 py-3 flex items-center gap-3" data-testid="staff-weekoff-banner">
          <span className="text-xl">🌴</span>
          <div>
            <div className="text-sm font-semibold text-teal-300">Today is your week-off — enjoy!</div>
            <div className="text-xs text-teal-200/70">Check-in is disabled on your week-off day. Needed at work? Ask your owner to change your week-off day in the Staff section.</div>
          </div>
        </div>
      )}
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gold/20 via-blush/10 to-transparent border border-gold/30 p-5 sm:p-8">
        <div className="absolute -top-8 -right-8 w-40 h-40 bg-gold/20 rounded-full blur-3xl" />
        <div className="relative flex items-center gap-4">
          <div className="relative shrink-0">
            <img
              src={profile.image_url || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300"}
              alt={profile.name}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-gold/50"
            />
            <label
              data-testid="staff-photo-upload-label"
              title="Change photo — shows on the booking page & admin portal"
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-gold text-bg-base flex items-center justify-center cursor-pointer hover:opacity-90 border-2 border-bg-base"
            >
              <Camera className="w-3.5 h-3.5" />
              <input data-testid="staff-photo-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={uploadPhoto} />
            </label>
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">
              {(() => { const h = new Date().getHours(); return h < 12 ? "☀️ Good morning" : h < 17 ? "🌤 Good afternoon" : "🌙 Good evening"; })()}
            </div>
            <div className="font-playfair text-2xl sm:text-3xl truncate" data-testid="staff-portal-greeting">
              {profile.name?.split(" ")[0]} — have a wonderful day!
            </div>
            <div className="text-white/60 text-sm mt-1">{profile.role}</div>
            <div className="text-gold/80 text-xs sm:text-sm mt-2 italic" data-testid="staff-motivation-line">
              “{MOTIVATION[new Date().getDate() % MOTIVATION.length]}”
            </div>
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
        {(today?.late_penalty > 0 || today?.overtime_pay > 0 || today?.auto_checked_out) && (
          <div className="flex flex-wrap gap-2 mb-4" data-testid="today-flags">
            {today?.late_penalty > 0 && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-300" data-testid="today-late-chip">
                Late by {today.late_minutes} min · fine ₹{today.late_penalty}
              </span>
            )}
            {today?.overtime_pay > 0 && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300" data-testid="today-ot-chip">
                Overtime {today.overtime_hours}h · +₹{today.overtime_pay}{today.ot_status === "pending" ? " · awaiting approval" : today.ot_status === "rejected" ? " · not approved" : today.ot_status === "approved" ? " · approved" : ""}
              </span>
            )}
            {today?.auto_checked_out && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
                Auto checked-out (12h limit)
              </span>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => checkIn()}
            disabled={busy || checkedIn || isWeekOffToday}
            data-testid="check-in-btn"
            title={isWeekOffToday ? "Check-in is disabled on your week-off day" : undefined}
            className={`inline-flex items-center justify-center gap-2 px-4 py-3 font-medium rounded-md text-sm transition ${
              checkedIn || isWeekOffToday ? "bg-white/5 text-white/40 cursor-not-allowed" : "bg-gradient-to-r from-gold to-blush text-bg-base hover:opacity-90"
            }`}
          >
            {checkedIn ? <CheckCircle2 className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
            {checkedIn ? "Checked in" : isWeekOffToday ? "Week off 🌴" : "Check in"}
          </button>
          <button
            onClick={() => setConfirmOut(true)}
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
        {confirmOut && (
          <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setConfirmOut(false)}>
            <div className="bg-[#16121a] border border-white/15 rounded-3xl w-full max-w-xs p-6 text-center" onClick={e => e.stopPropagation()} data-testid="checkout-confirm-modal">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-center mb-3">
                <LogOut className="w-6 h-6 text-amber-400" />
              </div>
              <h3 className="text-white font-semibold text-lg">Check out now?</h3>
              <p className="text-white/50 text-xs mt-2">
                You checked in at <b className="text-white/85">{fmtTime(today?.check_in_at)}</b>.
                Once you check out, your day is closed — if it's a mistake, the owner will have to correct it.
              </p>
              <button onClick={checkOut} disabled={busy} data-testid="checkout-confirm-yes"
                className="mt-4 w-full bg-gradient-to-r from-gold to-blush text-bg-base font-bold py-3 rounded-xl disabled:opacity-60">
                Yes, check me out
              </button>
              <button onClick={() => setConfirmOut(false)} data-testid="checkout-confirm-no"
                className="mt-2 w-full border border-white/15 text-white/70 font-semibold py-2.5 rounded-xl hover:border-white/40">
                Not yet
              </button>
            </div>
          </div>
        )}
        {fence && (fence.fenced ? (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-white/50" data-testid="fence-info">
            <MapPin className="w-3.5 h-3.5 text-gold shrink-0" />
            Check-in location: <span className="text-white/80">{fence.label}</span> · within {fence.fence_m}m
          </div>
        ) : fence.branch ? (
          <div className="mt-3 flex items-start gap-1.5 text-xs text-amber-300/80" data-testid="fence-warning">
            <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Your branch "{fence.branch}" has no pinned GPS location yet — you can check in from anywhere. Ask your owner to pin it (Attendance page → GPS check-in fence).</span>
          </div>
        ) : null)}
        {!checkedIn && (
          <button
            onClick={() => setShowScanner(true)}
            data-testid="scan-qr-checkin-btn"
            className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-md text-sm font-medium border border-gold/40 text-gold hover:bg-gold/10 transition"
          >
            <QrCode className="w-4 h-4" /> Scan desk QR — instant check-in (no GPS)
          </button>
        )}
        {showScanner && (
          <QrScanCheckIn
            onScan={(token) => { setShowScanner(false); checkIn(token); }}
            onClose={() => setShowScanner(false)}
          />
        )}
      </div>

      <PlannedLeaveCard />

      {/* Month summary */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <MiniStat label="Days present" value={attendance.total_days} icon={Calendar} testid="days-present" />
        <MiniStat label="Hours this month" value={`${attendance.total_hours}h`} icon={TrendingUp} testid="hours-month" />
        <MiniStat label="Commission %" value={`${profile.commission_pct || 0}%`} icon={Sparkles} testid="commission-pct" />
      </div>

      {/* Leave requests */}
      <LeaveSection />

      {/* Week-off change request */}
      <WeekOffSection profile={profile} />

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
              <SlipRow label={`Commission (${slip.commission_pct || 0}%)`} value={`₹${(slip.commission_amount || 0).toLocaleString("en-IN")}`}
                sub={slip.commission_withheld ? (slip.monthly_target > 0 ? `withheld — monthly target ₹${Number(slip.monthly_target).toLocaleString("en-IN")} not reached` : "withheld — no monthly target set")
                  : slip.service_gross ? `${slip.commission_pct || 0}% of ₹${Number(slip.service_gross).toLocaleString("en-IN")} services · target reached` : undefined} />
              <SlipRow label={`Product sales (${slip.product_commission_pct || 2}%)`} value={`+ ₹${(slip.product_commission_amount || 0).toLocaleString("en-IN")}`} sub={slip.product_count ? `${slip.product_count} product${slip.product_count > 1 ? "s" : ""} sold · ₹${(slip.product_gross || 0).toLocaleString("en-IN")}` : "no products sold"} />
              <SlipRow label="Overtime" value={`+ ₹${(slip.overtime_total || 0).toLocaleString("en-IN")}`}
                sub={slip.overtime_pending_total > 0 ? `${slip.overtime_hours_total || 0}h approved · ₹${Number(slip.overtime_pending_total).toLocaleString("en-IN")} awaiting owner approval` : slip.overtime_hours_total ? `${slip.overtime_hours_total}h approved past shift end` : "no overtime"} />
              <SlipRow label="Late fines" value={`− ₹${(slip.late_penalty_total || 0).toLocaleString("en-IN")}`} sub={slip.late_days ? `${slip.late_days} late day(s)` : "no late marks"} />
              <SlipRow label="Advance taken" value={`− ₹${(slip.advance_total || 0).toLocaleString("en-IN")}`} />
              <SlipRow label="Days present" value={slip.days_present || 0} />
              <SlipRow label="Hours worked" value={`${slip.total_hours || 0} h`} />
              <SlipRow label="Service gross" value={`₹${(slip.service_gross || 0).toLocaleString("en-IN")}`} sub={`${slip.service_count || 0} service line(s)`} />
              {(slip.monthly_target || 0) > 0 && (
                <div className="sm:col-span-2 rounded-lg bg-black/40 border border-white/10 p-3" data-testid="target-progress-card">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/60">
                      Monthly target · ₹{(slip.monthly_target || 0).toLocaleString("en-IN")} @ {slip.target_commission_pct || 0}% bonus
                    </div>
                    <div className={`text-xs font-semibold ${slip.target_achieved ? "text-emerald-400" : "text-gold"}`}>
                      {slip.target_achieved ? `Achieved ✦ +₹${(slip.target_bonus || 0).toLocaleString("en-IN")} bonus` : `${Math.min(100, Math.round(((slip.gross_earnings ?? slip.gross ?? 0) / slip.monthly_target) * 100))}%`}
                    </div>
                  </div>
                  <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                    <div className={`h-full rounded-full transition-[width] duration-700 ${slip.target_achieved ? "bg-emerald-400" : "bg-gradient-to-r from-gold to-blush"}`}
                      style={{ width: `${Math.min(100, ((slip.gross_earnings ?? slip.gross ?? 0) / slip.monthly_target) * 100)}%` }} />
                  </div>
                  <div className="text-[11px] text-white/45 mt-1.5">
                    {slip.target_achieved
                      ? "Target hit — the bonus is already included in your net payable 🎉"
                      : `₹${Math.max(0, (slip.monthly_target || 0) - (slip.gross_earnings ?? slip.gross ?? 0)).toLocaleString("en-IN")} more business to unlock a ₹${Math.round(((slip.monthly_target || 0) * (slip.target_commission_pct || 0)) / 100).toLocaleString("en-IN")}+ bonus`}
                  </div>
                </div>
              )}
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

      {/* Deductions this month */}
      <DeductionsCard month={month} />

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

function DeductionsCard({ month }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get("/staff/me/deductions", { params: { month } })
      .then(r => setData(r.data)).catch(() => setData(null));
  }, [month]);
  if (!data || data.items.length === 0) return null;
  return (
    <div className="rounded-2xl bg-[#0F0F0F] border border-rose-500/30 p-5 sm:p-6" data-testid="deductions-card">
      <div className="font-playfair text-lg mb-1 flex items-center gap-2 text-rose-300">
        ⚠️ Deductions — {new Date(data.month + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
      </div>
      <p className="text-[11px] text-white/40 mb-3">
        These amounts reduce your net payable. Check in on time to avoid late fines.
      </p>
      <div className="divide-y divide-white/5" data-testid="deductions-list">
        {data.items.map((d, i) => (
          <div key={i} className="py-2.5 flex items-center justify-between text-sm" data-testid={`deduction-row-${i}`}>
            <div>
              <div className="text-white/80">
                {d.type === "advance" ? "💸" : d.type === "half_day" ? "🌗" : "⏰"} {d.label}
              </div>
              <div className="text-[11px] text-white/40">
                {d.date ? new Date(d.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) : ""}
              </div>
            </div>
            <div className="text-rose-400 font-semibold tabular-nums">− ₹{(d.amount || 0).toLocaleString("en-IN")}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg bg-rose-500/10 border border-rose-500/30 px-4 py-2.5 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.2em] text-rose-200/70">Total deductions</span>
        <span className="font-playfair text-xl text-rose-300" data-testid="deductions-total">− ₹{(data.total || 0).toLocaleString("en-IN")}</span>
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

const LEAVE_BADGE = {
  pending: "bg-amber-500/15 border-amber-500/30 text-amber-300",
  approved: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
  rejected: "bg-red-500/15 border-red-500/30 text-red-300",
};

function LeaveSection() {
  const [reqs, setReqs] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/staff/me/leave-requests").then(r => setReqs(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  async function submit() {
    if (!from || !to) { toast.error("Pick both dates"); return; }
    setBusy(true);
    try {
      await api.post("/staff/me/leave-requests", { from_date: from, to_date: to, reason });
      toast.success("Leave request sent to your salon admin 🌴");
      setShowForm(false); setFrom(""); setTo(""); setReason("");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't send request");
    } finally { setBusy(false); }
  }

  async function cancel(rid) {
    try { await api.delete(`/staff/me/leave-requests/${rid}`); toast.success("Request cancelled"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Couldn't cancel"); }
  }

  return (
    <div className="rounded-2xl bg-[#0F0F0F] border border-white/5 p-5 sm:p-6" data-testid="leave-card">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="font-playfair text-lg flex items-center gap-2">🌴 Leave</div>
        <button data-testid="apply-leave-btn" onClick={() => setShowForm(f => !f)}
          className="text-xs px-4 py-2 rounded-full bg-gold/15 border border-gold/40 text-gold hover:bg-gold/25 transition">
          {showForm ? "Close" : "Apply for leave"}
        </button>
      </div>
      {showForm && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4 bg-white/5 border border-white/10 rounded-xl p-4">
          <div><label className="text-[10px] uppercase tracking-widest text-white/40 block mb-1">From</label>
            <input data-testid="leave-from-input" type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90" /></div>
          <div><label className="text-[10px] uppercase tracking-widest text-white/40 block mb-1">To</label>
            <input data-testid="leave-to-input" type="date" value={to} onChange={e => setTo(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90" /></div>
          <div><label className="text-[10px] uppercase tracking-widest text-white/40 block mb-1">Reason</label>
            <input data-testid="leave-reason-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Optional" className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90" /></div>
          <div className="flex items-end">
            <button data-testid="leave-submit-btn" onClick={submit} disabled={busy}
              className="w-full py-2 rounded-md bg-gold text-black text-sm font-semibold hover:bg-gold/90 disabled:opacity-50">
              {busy ? "Sending…" : "Send request"}
            </button>
          </div>
        </div>
      )}
      {reqs.length === 0 ? (
        <p className="text-white/40 text-sm">No leave requests yet. Your approved leaves show "On leave" on the salon board automatically.</p>
      ) : (
        <div className="space-y-2">
          {reqs.slice(0, 6).map(r => (
            <div key={r.id} className="flex items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-lg px-3 py-2" data-testid={`leave-req-${r.id}`}>
              <div className="text-sm text-white/80">
                {r.from_date} → {r.to_date} <span className="text-white/40">· {r.days} day{r.days > 1 ? "s" : ""}</span>
                {r.reason && <span className="text-white/40 text-xs"> · {r.reason}</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full border ${LEAVE_BADGE[r.status] || ""}`}>{r.status}</span>
                {r.status === "pending" && (
                  <button onClick={() => cancel(r.id)} className="text-[10px] text-white/40 hover:text-red-300 underline" data-testid={`cancel-leave-${r.id}`}>Cancel</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const WEEK_OFF_DAYS = ["monday", "tuesday", "wednesday", "thursday"];

function WeekOffSection({ profile }) {
  const [reqs, setReqs] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [day, setDay] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const todayName = new Date().toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  const currentDay = (profile?.week_off_day || "").toLowerCase();
  const options = WEEK_OFF_DAYS.filter(d => d !== todayName && d !== currentDay);
  const load = () => api.get("/staff/me/week-off-requests").then(r => setReqs(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  async function submit() {
    if (!day) { toast.error("Pick your new week-off day"); return; }
    setBusy(true);
    try {
      await api.post("/staff/me/week-off-requests", { requested_day: day, reason });
      toast.success("Week-off change request sent to your owner 📅 The request time is now locked.");
      setShowForm(false); setDay(""); setReason("");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't send request");
    } finally { setBusy(false); }
  }

  const fmtReqTime = (iso) => iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";

  return (
    <div className="rounded-2xl bg-[#0F0F0F] border border-white/5 p-5 sm:p-6" data-testid="week-off-card">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="font-playfair text-lg flex items-center gap-2">📅 Week-off day</div>
        <button data-testid="request-week-off-btn" onClick={() => setShowForm(f => !f)}
          className="text-xs px-4 py-2 rounded-full bg-gold/15 border border-gold/40 text-gold hover:bg-gold/25 transition">
          {showForm ? "Close" : "Request change"}
        </button>
      </div>
      <p className="text-xs text-white/45 mb-4" data-testid="current-week-off">
        Current week-off: <b className="text-white/80">{currentDay ? currentDay[0].toUpperCase() + currentDay.slice(1) : "Not set"}</b>
        {" "}· Allowed days: Mon–Thu only (Fri/Sat/Sun are peak days) · Can't pick today
      </p>
      {showForm && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 bg-white/5 border border-white/10 rounded-xl p-4">
          <div><label className="text-[10px] uppercase tracking-widest text-white/40 block mb-1">New day</label>
            <select data-testid="week-off-day-select" value={day} onChange={e => setDay(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90">
              <option value="">Choose day…</option>
              {options.map(d => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}
            </select></div>
          <div><label className="text-[10px] uppercase tracking-widest text-white/40 block mb-1">Reason</label>
            <input data-testid="week-off-reason-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Optional"
              className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white/90" /></div>
          <div className="flex items-end">
            <button data-testid="week-off-submit-btn" onClick={submit} disabled={busy}
              className="w-full py-2 rounded-md bg-gold text-black text-sm font-semibold hover:bg-gold/90 disabled:opacity-50">
              {busy ? "Sending…" : "Send request"}
            </button>
          </div>
        </div>
      )}
      {reqs.length === 0 ? (
        <p className="text-white/40 text-sm">No change requests yet. Once your owner approves, the new week-off starts from the next day.</p>
      ) : (
        <div className="space-y-2">
          {reqs.slice(0, 5).map(r => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2" data-testid={`week-off-req-${r.id}`}>
              <div className="text-sm text-white/80">
                {(r.current_day || "—")} → <b className="text-gold">{r.requested_day}</b>
                <span className="text-white/40 text-xs"> · requested {fmtReqTime(r.requested_at)} 🔒</span>
                {r.status === "approved" && r.effective_from && (
                  <span className="text-emerald-300/80 text-xs"> · effective from {r.effective_from}</span>
                )}
              </div>
              <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full border ${LEAVE_BADGE[r.status] || ""}`}>{r.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
