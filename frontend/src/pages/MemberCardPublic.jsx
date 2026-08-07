import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import html2canvas from "html2canvas";
import { toast } from "sonner";
import { Crown, Download, RefreshCw, Wallet, Award, Mail, Wifi, Loader2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TIERS = {
  silver:   { hex: "#94a3b8", text: "#e2e8f0" },
  gold:     { hex: "#d4af37", text: "#f2cf63" },
  platinum: { hex: "#8b5cf6", text: "#c4b5fd" },
  diamond:  { hex: "#22d3ee", text: "#67e8f9" },
  custom:   { hex: "#fb923c", text: "#fdba74" },
};

function cardDigits(id) {
  const s = String(id || "X");
  let h = 0; const out = [];
  for (let i = 0; out.length < 16; i++) {
    h = (h * 31 + s.charCodeAt(i % s.length) + i) % 1000000007;
    out.push(h % 10);
  }
  return out.join("").replace(/(\d{4})(?=\d)/g, "$1 ");
}

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

  return (
    <div className="min-h-screen bg-bg-base text-white p-4 sm:p-8 flex items-center justify-center">
      <div className="max-w-md w-full space-y-5">
        <h1 className="text-center font-bold text-lg tracking-wide" style={{ color: tier.text }} data-testid="member-card-title">
          Your {(m.tier || "Member").charAt(0).toUpperCase() + (m.tier || "member").slice(1)} Membership Card
        </h1>

        {/* Credit-card style card */}
        <div id="member-card-visual" data-testid="member-card"
          className="rounded-3xl p-6 shadow-2xl relative overflow-hidden"
          style={{
            border: `2px solid ${tier.hex}`,
            background: `radial-gradient(circle at 85% 0%, ${tier.hex}66, transparent 55%), radial-gradient(circle at 0% 100%, ${tier.hex}2e, transparent 50%), linear-gradient(135deg, #17121f, #0c0a11)`,
            boxShadow: `0 18px 60px ${tier.hex}44`,
          }}>
          {/* Salon branding + tier */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {logo && <img src={logo} alt="" crossOrigin="anonymous" className="w-11 h-11 rounded-xl object-cover ring-1 ring-white/20" data-testid="member-card-logo" />}
              <div>
                <div className="text-[#e6c65a] font-bold tracking-[0.18em] text-[15px] leading-tight" data-testid="member-card-salon">
                  {(m.salon?.name || "YOUR SALON").toUpperCase()}
                </div>
                <div className="text-white/45 text-[9px] tracking-[0.2em] mt-0.5">PREMIUM MEMBERSHIP CARD</div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-bold text-[16px] tracking-wide text-white" data-testid="member-tier">{(m.tier || "member").toUpperCase()}</div>
              <div className="text-white/50 text-[10px] tracking-widest">MEMBER</div>
            </div>
          </div>

          {/* Chip + NFC */}
          <div className="flex items-center justify-between mt-6">
            <div className="w-12 h-9 rounded-md relative overflow-hidden"
              style={{ background: "linear-gradient(135deg,#e8c96a,#b8860b 60%,#e8c96a)" }}>
              <div className="absolute inset-x-0 top-[9px] h-px bg-amber-900/60" />
              <div className="absolute inset-x-0 top-[18px] h-px bg-amber-900/60" />
              <div className="absolute inset-x-0 top-[27px] h-px bg-amber-900/60" />
              <div className="absolute inset-y-0 left-1/2 w-px bg-amber-900/60" />
            </div>
            <Wifi className="w-6 h-6 text-white/70 rotate-90" />
          </div>

          {/* Card number */}
          <div className="font-mono text-[22px] sm:text-[24px] tracking-[0.14em] mt-4 text-[#e6c65a]" data-testid="member-card-number">
            {cardDigits(m.member_id)}
          </div>

          {/* Member ID + Valid thru + QR */}
          <div className="flex items-end justify-between mt-5 gap-3">
            <div className="space-y-3 min-w-0">
              <div className="flex gap-8">
                <div>
                  <div className="text-[8px] tracking-[0.2em] text-white/45">MEMBER ID</div>
                  <div className="font-mono font-bold text-[13px] text-white/95" data-testid="member-card-id">{m.member_id}</div>
                </div>
                <div>
                  <div className="text-[8px] tracking-[0.2em] text-white/45">VALID THRU</div>
                  <div className="font-mono font-bold text-[13px] text-white/95" data-testid="member-card-thru">{thru}</div>
                </div>
              </div>
              <div>
                <div className="text-[8px] tracking-[0.2em] text-white/45">MEMBER NAME</div>
                <div className="font-bold text-[15px] text-white truncate" data-testid="member-card-name">{(m.name || "").toUpperCase()}</div>
              </div>
            </div>
            {m.qr_b64 && (
              <img src={`data:image/png;base64,${m.qr_b64}`} alt="Member QR"
                className="w-[86px] h-[86px] rounded-lg bg-white p-1.5 shrink-0" data-testid="member-qr" />
            )}
          </div>
        </div>

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
