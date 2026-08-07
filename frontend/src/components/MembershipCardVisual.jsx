import { Wifi, QrCode } from "lucide-react";

const TIER_HEX = {
  silver: "#94a3b8",
  gold: "#d4af37",
  platinum: "#8b5cf6",
  diamond: "#22d3ee",
  custom: "#fb923c",
};

export function cardDigits(id) {
  const s = String(id || "X");
  let h = 0; const out = [];
  for (let i = 0; out.length < 16; i++) {
    h = (h * 31 + s.charCodeAt(i % s.length) + i) % 1000000007;
    out.push(h % 10);
  }
  return out.join("").replace(/(\d{4})(?=\d)/g, "$1 ");
}

export function MembershipCardVisual({ id, tier = "custom", salonName, logoUrl, memberName, memberId, thru, qrB64, preview = false }) {
  const hex = TIER_HEX[tier] || TIER_HEX.custom;
  return (
    <div id={id} data-testid="member-card"
      className="rounded-3xl p-6 shadow-2xl relative overflow-hidden text-left"
      style={{
        border: `2px solid ${hex}`,
        background: `radial-gradient(circle at 85% 0%, ${hex}66, transparent 55%), radial-gradient(circle at 0% 100%, ${hex}2e, transparent 50%), linear-gradient(135deg, #17121f, #0c0a11)`,
        boxShadow: `0 18px 60px ${hex}44`,
      }}>
      {preview && (
        <span className="absolute top-3 right-3 text-[8px] tracking-[0.25em] text-white/35 border border-white/15 rounded-full px-2 py-0.5">PREVIEW</span>
      )}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {logoUrl && <img src={logoUrl} alt="" crossOrigin="anonymous" className="w-11 h-11 rounded-xl object-cover ring-1 ring-white/20" data-testid="member-card-logo" />}
          <div>
            <div className="text-[#e6c65a] font-bold tracking-[0.18em] text-[15px] leading-tight" data-testid="member-card-salon">
              {(salonName || "YOUR SALON").toUpperCase()}
            </div>
            <div className="text-white/45 text-[9px] tracking-[0.2em] mt-0.5">PREMIUM MEMBERSHIP CARD</div>
          </div>
        </div>
        <div className={`text-right shrink-0 ${preview ? "mt-3" : ""}`}>
          <div className="font-bold text-[16px] tracking-wide text-white" data-testid="member-tier">{tier.toUpperCase()}</div>
          <div className="text-white/50 text-[10px] tracking-widest">MEMBER</div>
        </div>
      </div>

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

      <div className="font-mono text-[20px] sm:text-[23px] tracking-[0.14em] mt-4 text-[#e6c65a]" data-testid="member-card-number">
        {cardDigits(memberId || `PREVIEW-${tier}`)}
      </div>

      <div className="flex items-end justify-between mt-5 gap-3">
        <div className="space-y-3 min-w-0">
          <div className="flex gap-8">
            <div>
              <div className="text-[8px] tracking-[0.2em] text-white/45">MEMBER ID</div>
              <div className="font-mono font-bold text-[13px] text-white/95" data-testid="member-card-id">{memberId || "MC-XXXX-XXXX-XXXX"}</div>
            </div>
            <div>
              <div className="text-[8px] tracking-[0.2em] text-white/45">VALID THRU</div>
              <div className="font-mono font-bold text-[13px] text-white/95" data-testid="member-card-thru">{thru || "—"}</div>
            </div>
          </div>
          <div>
            <div className="text-[8px] tracking-[0.2em] text-white/45">MEMBER NAME</div>
            <div className="font-bold text-[15px] text-white truncate" data-testid="member-card-name">{(memberName || "YOUR NAME").toUpperCase()}</div>
          </div>
        </div>
        {qrB64 ? (
          <img src={`data:image/png;base64,${qrB64}`} alt="Member QR"
            className="w-[86px] h-[86px] rounded-lg bg-white p-1.5 shrink-0" data-testid="member-qr" />
        ) : (
          <div className="w-[86px] h-[86px] rounded-lg bg-white/90 shrink-0 flex flex-col items-center justify-center gap-1" data-testid="member-qr-placeholder">
            <QrCode className="w-11 h-11 text-slate-800" />
            <span className="text-[7px] font-bold tracking-wider text-slate-500">QR AFTER PURCHASE</span>
          </div>
        )}
      </div>
    </div>
  );
}
