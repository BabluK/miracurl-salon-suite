import { Scissors } from "lucide-react";

/**
 * Sidebar brand mark that shows the salon's own name (per-tenant white-label).
 * Falls back to Miracurl if no tenant is loaded (e.g. super-admin console,
 * initial render before /tenants/current resolves).
 *
 * Keeps the pink scissors pill for visual continuity across all salons so
 * platform identity remains — only the wordmark switches to the tenant name.
 */
export default function TenantBrandMark({ tenant }) {
  const name = tenant?.name?.trim();
  const location = tenant?.location?.trim();
  const logo = tenant?.logo_url
    ? (tenant.logo_url.startsWith("/api/") ? `${process.env.REACT_APP_BACKEND_URL}${tenant.logo_url}` : tenant.logo_url)
    : "";

  const subtitle = location || "Salon Suite";

  return (
    <div className="inline-flex items-center gap-3 select-none relative" data-testid="tenant-brand-mark">
      <span className="tenant-sparkle" style={{ top: "-4px", left: "30px" }}>✦</span>
      <span className="tenant-sparkle" style={{ bottom: "-2px", left: "2px", animationDelay: "0.9s" }}>✦</span>
      <span className="tenant-sparkle" style={{ top: "2px", right: "6px", animationDelay: "1.8s" }}>✦</span>
      {logo ? (
        <img src={logo} alt={name || "Salon logo"} data-testid="tenant-logo-img" className="tenant-logo-glow w-9 h-9 rounded-xl object-cover flex-shrink-0 border border-white/15" />
      ) : (
        <div className="brand-pill tenant-logo-glow w-9 h-9 rounded-xl flex items-center justify-center relative overflow-hidden flex-shrink-0">
          <Scissors className="w-4 h-4 text-white brand-scissors relative z-10" />
        </div>
      )}
      <div className="leading-tight min-w-0 flex-1">
        <div className="font-playfair text-sm sm:text-[15px] tracking-tight break-words" title={name || "Miracurl"}>
          {name ? (
            <span className="tenant-name-shimmer">{name}</span>
          ) : (
            <>
              <span className="tenant-name-shimmer">MIRA</span>
              <span className="brand-curl">CURL</span>
            </>
          )}
        </div>
        <div className="tracking-[0.22em] uppercase text-slate-400 mt-1 text-[9px] truncate" title={subtitle}>
          {subtitle}
        </div>
      </div>
    </div>
  );
}
