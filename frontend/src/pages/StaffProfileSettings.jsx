import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { UserRound, Landmark, FileText, KeyRound } from "lucide-react";

const Row = ({ label, value }) => (
  <div className="rounded-lg bg-black/40 border border-white/10 p-3"><div className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-1">{label}</div><div className="text-white/90 text-base break-words">{value || "—"}</div></div>
);

export default function StaffProfileSettings() {
  const [p, setP] = useState(null);
  useEffect(() => { api.get("/staff/me/profile").then(r => setP(r.data)).catch(() => setP({})); }, []);
  if (!p) return null;
  return (
    <div className="space-y-5 text-white" data-testid="staff-profile-page">
      <div className="rounded-2xl bg-gradient-to-br from-gold/20 via-blush/10 to-transparent border border-gold/30 p-5 sm:p-6 flex items-center gap-4">
        {p.image_url ? <img src={p.image_url} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-gold/60" /> : <span className="w-16 h-16 rounded-full bg-gold/20 text-gold flex items-center justify-center"><UserRound className="w-7 h-7" /></span>}
        <div><div className="font-playfair text-2xl sm:text-3xl">{p.name}</div><div className="text-sm text-white/60">{p.role_title || p.designation || "Team member"}</div></div>
      </div>
      <div className="rounded-2xl bg-[#0F0F0F] border border-white/5 p-5 sm:p-6">
        <div className="font-playfair text-lg mb-4">Profile details</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Row label="Email" value={p.email} /><Row label="Phone" value={p.phone} /><Row label="Joining date" value={p.joining_date} />
          <Row label="Status" value={p.active === false ? "Inactive" : "Active"} /><Row label="Shift" value={p.shift_start && p.shift_end ? `${p.shift_start} – ${p.shift_end}` : ""} />
          <Row label="Week-off" value={p.week_off_day} /><Row label="Commission" value={p.commission_pct != null ? `${p.commission_pct}%` : ""} /><Row label="Notice period" value={p.notice_period_days ? `${p.notice_period_days} days` : ""} />
        </div>
        <p className="text-xs text-white/40 mt-3">To change your phone, photo or address, ask your salon admin — changes are logged in the Staff Registry.</p>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Link to="/bank-details" data-testid="profile-link-bank" className="rounded-xl border border-white/10 bg-[#0F0F0F] p-4 hover:border-gold/50 flex items-center gap-3"><Landmark className="w-5 h-5 text-gold" /> Bank details</Link>
        <Link to="/build-resume" data-testid="profile-link-resume" className="rounded-xl border border-white/10 bg-[#0F0F0F] p-4 hover:border-gold/50 flex items-center gap-3"><FileText className="w-5 h-5 text-gold" /> Build your resume</Link>
        <Link to="/notice-period" data-testid="profile-link-notice" className="rounded-xl border border-white/10 bg-[#0F0F0F] p-4 hover:border-gold/50 flex items-center gap-3"><KeyRound className="w-5 h-5 text-gold" /> Leave &amp; notice period</Link>
      </div>
    </div>
  );
}
