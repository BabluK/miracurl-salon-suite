import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import html2canvas from "html2canvas";
import { toast } from "sonner";
import { Crown, Download, RefreshCw, Wallet, Award, Mail, Loader2 } from "lucide-react";
import { MembershipCardVisual } from "@/components/MembershipCardVisual";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TIERS = {
  silver:   { hex: "#94a3b8", text: "#e2e8f0" },
  gold:     { hex: "#d4af37", text: "#f2cf63" },
  platinum: { hex: "#8b5cf6", text: "#c4b5fd" },
  diamond:  { hex: "#22d3ee", text: "#67e8f9" },
  custom:   { hex: "#fb923c", text: "#fdba74" },
};

export default function MemberCardPublic() {
  const { memberId } = useParams();
  const [m, setM] = useState(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    axios.get(`${API}/public/member/${memberId}`).then(r => setM(r.data)).catch(() => setM(false));
  }, [memberId]);

  if (m === null) return <div className="min-h-screen bg-bg-base flex items-center justify-center text-white/60">Loading…</div>;
  if (m === false) return <div className="min-h-screen bg-bg-base flex items-center justify-center text-white/60">Membership not found</div>;

  const tier = TIERS[m.tier] || TIERS.custom;
  const active = m.status === "Active";
  const logo = m.salon?.logo_url ? (m.salon.logo_url.startsWith("/api/") ? `${process.env.REACT_APP_BACKEND_URL}${m.salon.logo_url}` : m.salon.logo_url) : "";
  const thru = (() => { try { const d = new Date(m.expires_at); return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; } catch { return ""; } })();

  async function downloadCard() {
    setBusy("download");
    try {
      const el = document.getElementById("member-card-visual");
      const canvas = await html2canvas(el, { backgroundColor: null, scale: 2, useCORS: true });
      const a = document.createElement("a");
      a.download = `membership-card-${m.member_id}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
      toast.success("Card downloaded 🪪");
    } catch {
      window.open(`${API}/public/member/${m.member_id}/card.pdf`, "_blank");
    } finally { setBusy(""); }
  }

  async function emailCard() {
    setBusy("email");
    try {
      const { data } = await axios.post(`${API}/public/member/${m.member_id}/email-card`);
      toast.success(`📧 Card sent to ${data.sent_to}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't send the email");
    } finally { setBusy(""); }
  }

  async function addToGoogleWallet() {
    setBusy("gwallet");
    try {
      const { data } = await axios.get(`${API}/public/member/${m.member_id}/google-wallet`);
      window.open(data.save_url, "_blank");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Google Wallet isn't available right now");
    } finally { setBusy(""); }
  }

  return (
    <div className="min-h-screen bg-bg-base text-white p-4 sm:p-8 flex items-center justify-center">
      <div className="max-w-md w-full space-y-5">
        <h1 className="text-center font-bold text-lg tracking-wide" style={{ color: tier.text }} data-testid="member-card-title">
          Your {(m.tier || "Member").charAt(0).toUpperCase() + (m.tier || "member").slice(1)} Membership Card
        </h1>

        {/* Credit-card style card */}
        <MembershipCardVisual
          id="member-card-visual"
          tier={(m.tier || "custom").toLowerCase()}
          salonName={m.salon?.name}
          logoUrl={logo}
          memberName={m.name}
          memberId={m.member_id}
          thru={thru}
          qrB64={m.qr_b64}
        />

        {/* Add to Google Wallet */}
        <button onClick={addToGoogleWallet} disabled={!!busy} data-testid="member-add-google-wallet"
          className="w-full bg-black text-white font-semibold py-3.5 rounded-full flex items-center justify-center gap-2.5 border border-white/25 hover:border-white/60 transition disabled:opacity-60">
          {busy === "gwallet" ? <Loader2 className="w-5 h-5 animate-spin" /> : (
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
              <path d="M3 8.5C3 6.6 4.6 5 6.5 5h11C19.4 5 21 6.6 21 8.5v7c0 1.9-1.6 3.5-3.5 3.5h-11C4.6 19 3 17.4 3 15.5v-7z" fill="#fff"/>
              <path d="M3 9h18v3.2H3z" fill="#4285F4"/>
              <path d="M3 12.2h18v2H3z" fill="#34A853"/>
              <circle cx="17" cy="15.6" r="1.6" fill="#FBBC04"/>
            </svg>
          )}
          Add to Google Wallet
        </button>

        {/* Download + Email */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={downloadCard} disabled={!!busy} data-testid="member-download-card"
            className="border border-white/20 bg-white/5 text-white/90 font-semibold py-3 rounded-2xl flex items-center justify-center gap-2 hover:border-white/50 disabled:opacity-60">
            {busy === "download" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download Card
          </button>
          <button onClick={emailCard} disabled={!!busy} data-testid="member-email-card"
            className="border border-white/20 bg-white/5 text-white/90 font-semibold py-3 rounded-2xl flex items-center justify-center gap-2 hover:border-white/50 disabled:opacity-60">
            {busy === "email" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Email My Card
          </button>
        </div>
        <div className="text-center -mt-2">
          <a href={`${API}/public/member/${m.member_id}/card.pdf`} data-testid="member-download-pdf"
            className="text-white/40 text-xs hover:text-white underline underline-offset-2">Download as PDF instead</a>
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

        <Link to={`/membership/${m.salon?.slug}?renew=${m.member_id}`} data-testid="member-renew-btn"
          className="bg-gold text-bg-base font-bold py-3 rounded-full flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4" /> Renew Membership
        </Link>

        <div className="text-center">
          <Link to={`/book/${m.salon?.slug}`} className="text-white/40 text-sm hover:text-white inline-flex items-center gap-1">
            <Crown className="w-3.5 h-3.5" /> Book at {m.salon?.name} →
          </Link>
        </div>
      </div>
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
