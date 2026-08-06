import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { Crown, Download, RefreshCw, Wallet, Award } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TIER_GRAD = {
  silver: "from-slate-500 to-slate-700", gold: "from-amber-500 to-yellow-700",
  platinum: "from-violet-500 to-purple-800", diamond: "from-cyan-500 to-sky-800",
};

export default function MemberCardPublic() {
  const { memberId } = useParams();
  const [m, setM] = useState(null);

  useEffect(() => {
    axios.get(`${API}/public/member/${memberId}`).then(r => setM(r.data)).catch(() => setM(false));
  }, [memberId]);

  if (m === null) return <div className="min-h-screen bg-bg-base flex items-center justify-center text-white/60">Loading…</div>;
  if (m === false) return <div className="min-h-screen bg-bg-base flex items-center justify-center text-white/60">Membership not found</div>;

  const fmt = (d) => { try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; } };
  const active = m.status === "Active";

  return (
    <div className="min-h-screen bg-bg-base text-white p-4 sm:p-8 flex items-center justify-center">
      <div className="max-w-md w-full space-y-5">
        {/* The card */}
        <div className="rounded-3xl border-2 border-gold/60 bg-[#141418] p-6 shadow-2xl relative overflow-hidden" data-testid="member-card">
          <div className={`absolute -top-16 -right-16 w-48 h-48 rounded-full bg-gradient-to-br ${TIER_GRAD[m.tier] || TIER_GRAD.gold} opacity-20 blur-2xl`} />
          <div className="flex items-start justify-between">
            <div>
              <div className="text-gold font-bold tracking-[0.25em] text-sm">MIRACURL SUITE</div>
              <div className="text-white/50 text-[11px] mt-0.5">Premium Membership Card</div>
              <div className="text-base font-bold uppercase tracking-wider mt-2" data-testid="member-tier"
                style={{ color: { silver: "#cbd5e1", gold: "#f2cf63", platinum: "#c4b5fd", diamond: "#67e8f9" }[m.tier] || "#f2cf63" }}>
                {m.tier} member
              </div>
            </div>
            {m.qr_b64 && <img src={`data:image/png;base64,${m.qr_b64}`} alt="Member QR" className="w-24 h-24 rounded-lg bg-white p-1.5" data-testid="member-qr" />}
          </div>
          <div className="mt-5 space-y-3 text-sm">
            <Row label="Name" value={m.name} big />
            <Row label="Member ID" value={m.member_id} mono />
            <div className="grid grid-cols-2 gap-3">
              <Row label="Plan" value={`${m.plan} · ₹${Number(m.amount || 0).toLocaleString("en-IN")}`} />
              <Row label="Validity" value={`${fmt(m.purchased_at)} → ${fmt(m.expires_at)}`} />
            </div>
            <Row label="Salon" value={m.salon?.name} />
          </div>
          <div className="text-white/30 text-[10px] mt-4 italic">Powered by Miracurl Suite ✦</div>
        </div>

        {/* Status strip */}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Status" value={m.status} accent={active ? "text-emerald-400" : "text-rose-400"} testid="member-status" />
          <Stat label="Balance" value={`₹${Number(m.wallet_balance || 0).toLocaleString("en-IN")}`} icon={Wallet} testid="member-balance" />
          <Stat label="Points" value={Number(m.loyalty_points || 0).toLocaleString("en-IN")} icon={Award} testid="member-points" />
        </div>

        {m.benefits?.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-2">Member benefits</div>
            <div className="flex flex-wrap gap-1.5">
              {m.benefits.map((b, i) => <span key={i} className="text-[11px] bg-gold/10 text-gold border border-gold/30 px-2.5 py-1 rounded-full">{b}</span>)}
            </div>
            {(m.cashback_pct > 0 || m.discount_pct > 0) && (
              <div className="text-xs text-white/60 mt-2.5">
                {m.cashback_pct > 0 && <>💰 {m.cashback_pct}% wallet cashback on every bill</>}
                {m.cashback_pct > 0 && m.discount_pct > 0 && " · "}
                {m.discount_pct > 0 && <>✂️ {m.discount_pct}% off services</>}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Link to={`/membership/${m.salon?.slug}?renew=${m.member_id}`} data-testid="member-renew-btn"
            className="bg-gold text-bg-base font-bold py-3 rounded-full flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4" /> Renew
          </Link>
          <a href={`${API}/public/member/${m.member_id}/card.pdf`} data-testid="member-download-card"
            className="border border-white/20 text-white/90 font-semibold py-3 rounded-full flex items-center justify-center gap-2 hover:border-gold/60">
            <Download className="w-4 h-4" /> Download Card
          </a>
        </div>

        <div className="text-center">
          <Link to={`/book/${m.salon?.slug}`} className="text-white/40 text-sm hover:text-white inline-flex items-center gap-1">
            <Crown className="w-3.5 h-3.5" /> Book at {m.salon?.name} →
          </Link>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, big, mono }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`${big ? "text-xl font-semibold" : "text-sm"} ${mono ? "font-mono tracking-widest text-gold" : "text-white/90"}`}>{value}</div>
    </div>
  );
}

function Stat({ label, value, accent = "text-white", icon: Icon, testid }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center" data-testid={testid}>
      <div className="text-[10px] uppercase tracking-wider text-white/40 flex items-center justify-center gap-1">
        {Icon && <Icon className="w-3 h-3" />} {label}
      </div>
      <div className={`text-lg font-bold mt-1 ${accent}`}>{value}</div>
    </div>
  );
}
