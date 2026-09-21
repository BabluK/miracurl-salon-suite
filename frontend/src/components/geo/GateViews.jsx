import { ArrowRight, Clock, HelpCircle, Loader2, LocateFixed, Lock, LogOut, MapPin, Scissors, Search, ShieldCheck, Store, Users } from "lucide-react";

const GOLD = "linear-gradient(135deg, #D4AF37 0%, #C9A24A 50%, #B8893A 100%)";
export const fmtDist = (m) => (m == null ? "" : m < 1000 ? `${Math.round(m)} m away` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km away`);

function Brand({ compact = false }) {
  return (
    <div className="flex items-center gap-3" data-testid="geo-brand">
      <img src="/assets/brand/gold-lockup-transparent.png" alt="Miracurl Suite" className={`${compact ? "h-11" : "h-14 sm:h-16"} w-auto drop-shadow-[0_2px_8px_rgba(201,162,74,0.25)]`} style={{ filter: "brightness(0.82) saturate(1.15)" }} />
      {!compact && <span className="sr-only">Manage · Automate · Grow</span>}
    </div>
  );
}

function GoldButton({ children, className = "", ...rest }) {
  return (
    <button type="button" {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-xl text-white font-semibold px-6 py-3 text-sm sm:text-base shadow-[0_4px_20px_rgba(201,162,74,0.28)] transition-[transform,box-shadow,filter] duration-200 hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${className}`}
      style={{ background: GOLD }}>
      {children}
    </button>
  );
}

function GhostButton({ children, className = "", ...rest }) {
  return (
    <button type="button" {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-[#E8E2D9] bg-white text-[#0F1E33] font-semibold px-6 py-3 text-sm sm:text-base shadow-[0_2px_10px_rgba(15,30,51,0.04)] transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#C9A24A]/60 active:translate-y-0 ${className}`}>
      {children}
    </button>
  );
}

export function DeniedView({ reason, features, nearest, nearestLabel, nearestSub, dirUrl, onRetry, onLogout, locating }) {
  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-[#FAF8F5] text-[#0F1E33]" data-testid="geo-branch-gate">
      <div className="min-h-full flex items-center justify-center p-3 sm:p-6">
        <div className="relative w-full max-w-6xl rounded-[24px] bg-white/70 border border-[#E8E2D9] shadow-[0_8px_30px_rgba(15,30,51,0.06)] p-6 sm:p-10 lg:p-12" data-testid="geo-branch-denied">
          <div className="flex items-start justify-between gap-4">
            <Brand />
            <span className="font-caveat text-xl sm:text-2xl text-[#C9A24A] rotate-6 text-right leading-tight select-none">Salon<br />Smarter<br />Everyday ♡</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 pt-8">
            <div className="lg:col-span-6">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#FFEFEF] text-[#9B1C1C] border border-[#FCA5A5]/60 px-4 py-1.5 text-sm font-medium" data-testid="geo-outside-pill">
                <MapPin className="w-4 h-4" /> You are here <span className="text-[#FCA5A5]">•</span> Outside branch
              </span>
              <div className="font-playfair text-6xl sm:text-7xl text-[#C9A24A] leading-none mt-5">Oops!</div>
              <h3 className="font-playfair text-3xl sm:text-4xl lg:text-5xl text-[#0F1E33] leading-[1.1] mt-2">You can&apos;t sign in<br />from this location</h3>
              <p className="mt-4 text-sm sm:text-base text-[#6B7280] leading-relaxed max-w-xl" data-testid="geo-branch-denied-reason">{reason}</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-3 py-6 mt-2">
                {features.map(([Icon, text], i) => (
                  <div key={i} className={`flex flex-col gap-3 px-1 ${i > 0 ? "md:border-l md:border-[#E8E2D9] md:pl-5" : ""}`}>
                    <span className="w-12 h-12 rounded-full bg-[#F9F3EA] text-[#B8893A] flex items-center justify-center"><Icon className="w-6 h-6" /></span>
                    <span className="text-sm text-[#1E324D] leading-snug">{text}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <GoldButton onClick={onRetry} data-testid="geo-branch-retry" disabled={locating}>
                  {locating ? <Loader2 className="w-5 h-5 animate-spin" /> : <LocateFixed className="w-5 h-5" />} Retry GPS
                </GoldButton>
                <GhostButton onClick={onLogout} data-testid="geo-branch-logout"><LogOut className="w-5 h-5" /> Sign out</GhostButton>
              </div>
              <a href="mailto:support@miracurl-suite.com?subject=Cannot%20sign%20in%20from%20my%20branch" className="inline-flex items-center gap-2 text-sm text-[#6B7280] hover:text-[#0F1E33] mt-5" data-testid="geo-branch-support">
                <HelpCircle className="w-4 h-4" /> Need help? <span className="text-[#B8893A] font-semibold underline underline-offset-4">Contact support</span> <ArrowRight className="w-4 h-4 text-[#B8893A]" />
              </a>
            </div>

            <div className="lg:col-span-6 flex flex-col gap-5">
              <div className="relative rounded-[20px] overflow-hidden border border-[#E8E2D9] bg-[#F7F4EF] shadow-[0_8px_30px_rgba(15,30,51,0.06)] min-h-[220px] grid grid-cols-5">
                <div className="col-span-2 p-6 flex flex-col justify-center">
                  <div className="font-playfair italic text-2xl sm:text-3xl leading-tight text-[#0F1E33]">Secure<br />Salons<br />Brighter<br /><span className="text-[#C9A24A]">Tomorrows</span></div>
                  <span className="block w-10 h-0.5 bg-[#C9A24A] my-4" />
                  <p className="text-sm text-[#6B7280] leading-relaxed">Your data.<br />Your business.<br />Always protected.</p>
                </div>
                <img src="/assets/branch-gate/thumb-main.jpg" alt="" className="col-span-3 w-full h-full object-cover" />
              </div>

              {nearest && (
                <div className="relative rounded-[20px] border border-[#E8E2D9] bg-white p-6 shadow-[0_8px_30px_rgba(15,30,51,0.06)] overflow-hidden" data-testid="geo-branch-nearest">
                  <div className="absolute inset-y-0 right-0 w-1/3 opacity-[0.12] bg-[radial-gradient(circle_at_70%_40%,#C9A24A_0,transparent_45%),repeating-linear-gradient(45deg,#0F1E33_0_1px,transparent_1px_18px)] pointer-events-none" />
                  <div className="flex items-center gap-4">
                    <span className="w-14 h-14 rounded-full bg-[#F9F3EA] text-[#B8893A] flex items-center justify-center shrink-0"><Store className="w-7 h-7" /></span>
                    <div className="min-w-0">
                      <div className="text-base font-medium text-[#B8893A]">Your nearest branch</div>
                      <div className="font-playfair text-xl sm:text-2xl text-[#0F1E33] leading-tight truncate">{nearestLabel}</div>
                      <div className="mt-1 text-sm text-[#6B7280] inline-flex items-center gap-1.5"><MapPin className="w-4 h-4 text-[#B8893A]" /> {nearestSub}{nearest.distance_m != null ? ` · ${fmtDist(nearest.distance_m)}` : ""}</div>
                    </div>
                  </div>
                  <a href={dirUrl} target="_blank" rel="noreferrer" data-testid="geo-branch-directions"
                    className="mt-5 inline-flex items-center gap-2 rounded-xl text-white font-semibold px-6 py-3 text-sm shadow-[0_4px_20px_rgba(201,162,74,0.28)] transition-transform hover:-translate-y-0.5" style={{ background: GOLD }}>
                    <MapPin className="w-4 h-4" /> Get Directions <ArrowRight className="w-4 h-4" />
                  </a>
                </div>
              )}
            </div>
          </div>

          <div className="mt-10 flex items-center justify-center gap-4 text-[#B8893A] text-[10px] sm:text-xs tracking-[0.34em] font-semibold whitespace-nowrap">
            <span className="h-px flex-1 max-w-[300px] bg-[#C9A24A]/50" />FOR SALONS THAT DREAM BIGGER<span className="h-px flex-1 max-w-[300px] bg-[#C9A24A]/50" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SalonCard({ c, i, hot, picking, hours, locating, onPick }) {
  const stat = "flex items-center gap-2.5 rounded-xl bg-[#F7F4EF] px-3 py-2.5 text-xs sm:text-[13px] text-[#1E324D] min-w-0";
  const locked = c.disabled && !locating;
  return (
    <button type="button" disabled={c.disabled || !!picking} onClick={() => onPick(c)}
      data-testid={`geo-branch-option-${c.main ? "main" : c.value}`}
      style={{ animationDelay: `${i * 90}ms` }}
      className={`group relative text-left rounded-[24px] p-3.5 sm:p-4 border bg-white transition-[transform,box-shadow,border-color] duration-200 animate-[fadeUp_.5s_ease-out_both] ${locked ? "border-[#E2D9CE] bg-[#F3ECE3] cursor-not-allowed" : hot ? "border-[#C9A24A] shadow-[0_14px_40px_rgba(201,162,74,0.18)] ring-1 ring-[#C9A24A]/40" : "border-[#E8E2D9] shadow-[0_8px_30px_rgba(15,30,51,0.06)] hover:-translate-y-1 hover:border-[#C9A24A]/60 hover:shadow-[0_14px_40px_rgba(15,30,51,0.12)]"}`}>
      <div className="relative">
        <img src={c.thumb} alt="" className={`w-full h-44 sm:h-52 object-cover rounded-[18px] ${locked ? "grayscale opacity-70" : ""}`} />
        <span className={`absolute top-3 left-3 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full ${c.main ? "bg-[#F3D98A] text-[#3a2f18]" : "bg-[#0F1E33]/85 text-white"}`}>
          {c.main ? <Store className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}{c.badge}
        </span>
        <span className={`absolute top-3 right-3 inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full border ${locked ? "bg-[#F3F4F6] text-[#6B7280] border-[#D1D5DB]" : locating ? "bg-white text-[#B8893A] border-[#C9A24A]/40" : "bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]"}`} data-testid={`geo-branch-pill-${c.main ? "main" : c.value}`}>
          {locked ? <><Lock className="w-3 h-3" /> Locked · out of range</> : locating ? <><Loader2 className="w-3 h-3 animate-spin" /> Checking location…</> : <><span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" /> {c.within ? "You're here" : "Available"}</>}
        </span>
        <span className="font-caveat text-xl text-white drop-shadow absolute bottom-3 right-4 -rotate-6 leading-tight select-none pointer-events-none">{c.script}</span>
      </div>
      <div className="px-1 pt-4">
        <div className={`font-semibold text-lg sm:text-xl leading-tight ${locked ? "text-[#9CA3AF]" : "text-[#0F1E33]"}`}>{c.label}</div>
        <div className="mt-1.5 text-sm text-[#6B7280] inline-flex items-start gap-1.5"><MapPin className="w-4 h-4 mt-0.5 shrink-0 text-[#B8893A]" /><span>{c.sub && c.sub !== c.label ? c.sub : (c.main ? "Main salon" : c.salon ? "Salon" : "Branch")}</span></div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className={stat}><Users className="w-4 h-4 text-[#B8893A] shrink-0" /><span className="truncate">{c.pinned && c.distance_m != null ? (c.within ? `${Math.round(c.distance_m)} m · here` : fmtDist(c.distance_m)) : (c.main ? "Main salon" : "Branch")}</span></div>
          <div className={stat}><Scissors className="w-4 h-4 text-[#B8893A] shrink-0" /><span className="truncate">{(c.chips || []).slice(0, 3).join(" · ") || "Hair · Skin · Beauty"}</span></div>
          <div className={stat}><Clock className="w-4 h-4 text-[#B8893A] shrink-0" /><span className="truncate">{hours}</span></div>
        </div>
        {locked ? (
          <div className="mt-4 w-full rounded-xl border border-[#E2D9CE] bg-[#F3F4F6] text-[#6B7280] text-sm font-semibold py-3 text-center inline-flex items-center justify-center gap-2"><Lock className="w-4 h-4" /> Walk in to this branch to open it</div>
        ) : locating ? (
          <div className="mt-4 w-full rounded-xl border border-[#E8E2D9] bg-white text-[#6B7280] text-sm font-semibold py-3 text-center inline-flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-[#B8893A]" /> Checking your location…</div>
        ) : (
          <div className={`mt-4 w-full rounded-xl text-sm font-semibold py-3 text-center inline-flex items-center justify-center gap-2 transition-transform group-hover:-translate-y-0.5 ${hot ? "text-white shadow-[0_4px_20px_rgba(201,162,74,0.28)]" : "border border-[#E8E2D9] text-[#0F1E33] bg-white"}`} style={hot ? { background: GOLD } : undefined}>
            {picking === c.value ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Open This Salon
          </div>
        )}
      </div>
    </button>
  );
}

export function PickerView({ user, cards, gateTitle, subtitle, footNote, locating, showRetry, picking, hours, query, setQuery, onPick, onRetry, onLogout, statusTestId }) {
  const q = (query || "").trim().toLowerCase();
  const visible = q ? cards.filter(c => `${c.label} ${c.sub}`.toLowerCase().includes(q)) : cards;
  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-[#FAF8F5] text-[#0F1E33]" data-testid="geo-branch-gate" onWheel={e => e.stopPropagation()}>
      <div className="min-h-full flex items-start justify-center p-3 sm:p-6">
        <div className="relative w-full max-w-6xl rounded-[24px] bg-white/70 border border-[#E8E2D9] shadow-[0_8px_30px_rgba(15,30,51,0.06)] p-5 sm:p-8 lg:p-10" data-testid="geo-branch-modal">
          <div className="flex items-center justify-between gap-4">
            <Brand compact />
            <GhostButton onClick={onLogout} data-testid="geo-branch-logout" className="!px-4 !py-2 !text-sm"><LogOut className="w-4 h-4" /> Sign out</GhostButton>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pt-6">
            <div className="lg:col-span-7">
              <div className="text-xs tracking-[0.3em] font-bold text-[#B8893A] uppercase">Welcome back, {(user?.name || "").split(" ")[0] || "there"}</div>
              <h3 className="font-playfair text-3xl sm:text-4xl lg:text-5xl leading-[1.08] mt-2 text-[#0F1E33]">{gateTitle[0]}<br /><span className="text-[#C9A24A]">{gateTitle[1]}</span></h3>
              <p className="mt-3 text-sm sm:text-base text-[#6B7280]">{subtitle}</p>
            </div>
            <div className="lg:col-span-5 rounded-[20px] border border-[#C9A24A]/30 bg-[#F9F3EA] p-5 flex items-center gap-4 shadow-[0_8px_30px_rgba(201,162,74,0.10)]" data-testid="geo-secure-callout">
              <span className="w-11 h-11 rounded-full bg-white text-[#B8893A] flex items-center justify-center shrink-0"><MapPin className="w-6 h-6" /></span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[#0F1E33]">Secure &amp; location verified</div>
                <div className="text-sm text-[#6B7280]">Staff can only access the branch they are at.</div>
              </div>
              <ShieldCheck className="w-10 h-10 text-[#C9A24A] shrink-0" strokeWidth={1.4} />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
            <label className="flex items-center gap-3 rounded-xl border border-[#E8E2D9] bg-white px-4 py-3 shadow-[0_2px_10px_rgba(15,30,51,0.04)] focus-within:border-[#C9A24A]">
              <Search className="w-5 h-5 text-[#6B7280]" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by salon name, area or location…" data-testid="geo-branch-search"
                className="flex-1 bg-transparent text-sm sm:text-base focus:outline-none placeholder:text-[#9CA3AF]" style={{ color: "#0F1E33", WebkitTextFillColor: "#0F1E33" }} />
            </label>
            <GhostButton onClick={onRetry} data-testid="geo-branch-retry" disabled={locating} className="!py-3">
              {locating ? <Loader2 className="w-5 h-5 animate-spin text-[#B8893A]" data-testid="geo-branch-locating" /> : <LocateFixed className="w-5 h-5 text-[#B8893A]" />} Use my current location
            </GhostButton>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6" data-testid="geo-branch-options">
            {visible.map((c, i) => <SalonCard key={c.value} c={c} i={i} hot={!locating && !c.disabled && (c.within || i === 0)} picking={picking} hours={hours} locating={locating} onPick={onPick} />)}
            {visible.length === 0 && <div className="col-span-full text-sm text-[#6B7280] py-8 text-center">No salon matches “{query}”.</div>}
          </div>

          <div className="mt-6 flex items-center gap-3 rounded-xl border border-[#E8E2D9] bg-white px-4 py-3 text-sm text-[#1E324D]" data-testid={statusTestId}>
            {locating ? <Loader2 className="w-5 h-5 animate-spin text-[#B8893A] shrink-0" /> : <LocateFixed className="w-5 h-5 text-[#B8893A] shrink-0" />}
            <span className="flex-1">{footNote}</span>
            {showRetry && !locating && <button type="button" onClick={onRetry} className="text-[#B8893A] font-semibold hover:underline whitespace-nowrap">Retry GPS</button>}
          </div>

          <div className="mt-8 flex flex-col items-center gap-2">
            <div className="flex items-center gap-4 w-full text-[#0F1E33] text-[11px] tracking-[0.34em] font-semibold whitespace-nowrap"><span className="h-px flex-1 bg-[#C9A24A]/50" />MIRACURL SUITE<span className="h-px flex-1 bg-[#C9A24A]/50" /></div>
            <div className="text-[10px] tracking-[0.34em] text-[#6B7280] font-medium">MANAGE · AUTOMATE · GROW</div>
          </div>
        </div>
      </div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
