import { Scissors } from "lucide-react";

/**
 * Sidebar brand mark that shows the tenant's own logo & name (per-tenant white-label).
 * Vertical layout: logo on top, name below, location under the name — everything
 * stays inside the sidebar width. Falls back to Miracurl when no tenant is loaded.
 */
export default function TenantBrandMark({ tenant }) {
  const name = tenant?.name?.trim();
  const location = tenant?.location?.trim();
  const logo = tenant?.logo_url
    ? (tenant.logo_url.startsWith("/api/") ? `${process.env.REACT_APP_BACKEND_URL}${tenant.logo_url}` : tenant.logo_url)
    : "";

  const subtitle = location || (tenant?.business_type === "restaurant" ? "Restaurant Suite" : "Salon Suite");

  return (
    <div className="flex flex-col items-start gap-2 select-none relative w-full min-w-0" data-testid="tenant-brand-mark">
      <span className="tenant-sparkle" style={{ top: "-4px", left: "58px" }}>✦</span>
      <span className="tenant-sparkle" style={{ top: "34px", left: "-4px", animationDelay: "0.9s" }}>✦</span>
      {logo ? (
        <img src={logo} alt={name || "Logo"} data-testid="tenant-logo-img" className="tenant-logo-glow w-12 h-12 rounded-xl object-cover bg-[#14141a] flex-shrink-0 border border-white/15" />
      ) : (
        <div className="brand-pill tenant-logo-glow w-12 h-12 rounded-xl flex items-center justify-center relative overflow-hidden flex-shrink-0">
          <Scissors className="w-5 h-5 text-white brand-scissors relative z-10" />
        </div>
      )}
      <div className="leading-tight min-w-0 w-full">
        <div className="font-playfair text-sm tracking-tight break-words" title={name || "Miracurl"}>
          {name ? (
            <span className="tenant-name-shimmer">{name}</span>
          ) : (
            <>
              <span className="tenant-name-shimmer">MIRA</span>
              <span className="brand-curl">CURL</span>
            </>
          )}
        </div>
        <div className="tracking-[0.18em] uppercase text-slate-400 mt-1 text-[9px] break-words leading-relaxed" title={subtitle}>
          {subtitle}
        </div>
      </div>
    </div>
  );
}
