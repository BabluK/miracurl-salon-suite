import { useEffect, useState } from "react";
import api from "@/lib/api";
import { CalendarClock } from "lucide-react";
import { PlannedLeaveCard } from "@/components/staff/PlannedLeaveCard";
import { LeaveSection, WeekOffSection } from "@/components/staff/LeaveAndWeekOff";

export default function StaffNoticePeriod() {
  const [profile, setProfile] = useState(null);
  useEffect(() => { api.get("/staff/me/profile").then(r => setProfile(r.data)).catch(() => setProfile({})); }, []);
  return (
    <div className="space-y-5 text-white" data-testid="staff-notice-page">
      <div className="rounded-2xl bg-gradient-to-br from-gold/20 via-blush/10 to-transparent border border-gold/30 p-5 sm:p-6">
        <div className="font-playfair text-2xl sm:text-3xl flex items-center gap-3"><CalendarClock className="w-6 h-6 text-gold" /> Leave &amp; Notice Period</div>
        <p className="text-sm text-white/60 mt-1">Plan time off, request a week-off change, and see your leave history in one place.</p>
        {profile?.serving_notice && (
          <div className="mt-3 inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-200" data-testid="staff-notice-banner">
            Serving notice · last working day {profile.last_working_day || "—"}
          </div>
        )}
      </div>
      <PlannedLeaveCard />
      <LeaveSection />
      {profile && <WeekOffSection profile={profile} />}
    </div>
  );
}
