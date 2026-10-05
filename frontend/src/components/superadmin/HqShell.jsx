import { useEffect, useMemo, useState } from "react";
import { Menu, X, LogOut, ChevronDown, Store, Search, Sparkles } from "lucide-react";
import { SidebarMiracurlLogo } from "@/components/MasterBrand";
import { NetSpeedIndicator } from "@/components/NetSpeedIndicator";
import { GoldSparkles } from "@/components/GoldSparkles";
import "@/styles/hq-light.css";

// Super Admin shell — same chrome as the tenant app (dark gold-night sidebar + header, cream content).
export const HQ_NAV_GROUPS = [
  ["Command", ["mira-home", "platform-map", "notifications", "inbox"]],
  ["Business", ["tenants", "billing", "credits", "revenue"]],
  ["Growth", ["mira-leads", "lead-email", "pipeline", "inquiries", "demo-calendar", "partners", "growth-advisory"]],
  ["Operations", ["docs", "hiring", "mira-studio", "ai", "studio"]],
  ["System", ["team", "security"]],
];

function NavButton({ item, active, onClick }) {
  return (
    <button data-testid={`super-tab-${item.id}`} onClick={onClick}
      className={`w-full flex items-center gap-3 mx-3 my-0.5 px-4 py-2.5 text-sm rounded-full border transition-all text-left ${active ? "nav-gold-plate font-semibold" : item.hot ? "nav-gold-hover text-amber-300 border-transparent animate-pulse" : "nav-gold-hover text-white/60 border-transparent"}`}
      style={{ width: "calc(100% - 1.5rem)" }}>
      <item.icon className="w-4 h-4 flex-shrink-0" />
      <span className="truncate">{item.label}</span>
      {item.badge > 0 && <span className={`ml-auto min-w-[18px] h-[18px] px-1 rounded-full ${item.hot ? "bg-amber-500" : "bg-rose-500"} text-white text-[10px] font-bold inline-flex items-center justify-center`}>{item.badge}</span>}
    </button>
  );
}

function TenantSwitch({ tenants, onOpen }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (tenants || []).filter(t => t.status !== "deleted" && (!s || (t.name || "").toLowerCase().includes(s) || (t.slug || "").includes(s))).slice(0, 12);
  }, [tenants, q]);
  useEffect(() => { if (!open) setQ(""); }, [open]);
  return (
    <div className="relative hidden md:block">
      <button onClick={() => setOpen(o => !o)} data-testid="hq-tenant-switch"
        className="flex items-center gap-2 h-9 px-3 rounded-full border border-white/10 bg-white/5 text-xs text-white/80 hover:bg-white/10 transition">
        <Store className="w-3.5 h-3.5 text-[#F0D9A5]" /> Jump into a tenant <span className="px-1.5 rounded-full bg-[#F0D9A5]/20 text-[#F0D9A5] text-[10px] font-bold">{(tenants || []).length}</span> <ChevronDown className="w-3 h-3 text-white/50" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-[#16121a] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden" data-testid="hq-tenant-switch-menu">
          <div className="p-2 border-b border-white/10 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-white/40" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search salon or restaurant…" data-testid="hq-tenant-switch-search"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none" />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {list.map(t => (
              <button key={t.id} onClick={() => { setOpen(false); onOpen(t); }} data-testid={`hq-tenant-switch-${t.slug}`}
                className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center gap-2.5">
                <span className="text-base">{t.business_type === "restaurant" ? "🍽️" : "💇"}</span>
                <span className="min-w-0"><span className="block text-sm text-white truncate">{t.name}</span><span className="block text-[10px] text-white/40 truncate">/{t.slug} · {t.status || "active"}</span></span>
              </button>
            ))}
            {list.length === 0 && <div className="px-3 py-4 text-xs text-white/40">No tenant matches</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export function HqShell({ items, tab, onTab, title, user, tenants, onOpenTenant, onLogout, headerRight, children }) {
  const [open, setOpen] = useState(false);
  const byId = useMemo(() => Object.fromEntries(items.map(i => [i.id, i])), [items]);
  const today = new Date().toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" });
  const pick = (id) => { onTab(id); setOpen(false); };
  return (
    <div className="min-h-screen flex bg-[#faf8f5] text-slate-800" data-testid="super-admin-page">
      {open && <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} data-testid="hq-sidebar-backdrop" />}
      <aside data-testid="super-sidebar" className={`gold-night-chrome fixed top-0 left-0 z-50 h-screen w-[80%] max-w-[280px] lg:w-64 border-r border-[#d4af37]/15 flex flex-col transform transition-transform duration-300 ease-out lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="relative px-3 pt-3 pb-2 border-b border-[#d4af37]/10">
          <SidebarMiracurlLogo />
          <span data-testid="super-admin-badge" className="absolute top-3 right-10 lg:right-3 inline-flex items-center gap-1 text-[8px] font-bold tracking-[0.18em] uppercase px-2 py-0.5 rounded-full bg-gradient-to-b from-[#F0D9A5] to-[#C89B52] text-slate-900"><Sparkles className="w-2.5 h-2.5" /> Super Admin</span>
          <button className="lg:hidden absolute top-3 right-3 text-white/60 hover:text-white p-1" onClick={() => setOpen(false)} data-testid="hq-sidebar-close" aria-label="Close menu"><X className="w-5 h-5" /></button>
        </div>
        <nav className="flex-1 py-3 overflow-y-auto" data-testid="hq-sidebar-nav">
          {HQ_NAV_GROUPS.map(([group, ids]) => (
            <div key={group} className="mb-2">
              <div className="px-6 pt-2 pb-1 text-[9px] font-bold uppercase tracking-[0.28em] text-[#e8c37f]/70">{group}</div>
              {ids.map(id => byId[id]).filter(Boolean).map(item => <NavButton key={item.id} item={item} active={tab === item.id} onClick={() => pick(item.id)} />)}
            </div>
          ))}
        </nav>
        <div className="p-4 border-t border-[#d4af37]/15 space-y-3">
          <button data-testid="super-logout-btn" onClick={onLogout} className="nav-gold-hover flex items-center gap-3 text-[15px] text-white/80 w-full px-4 py-2.5 rounded-full border border-transparent transition-all"><LogOut className="w-5 h-5" /> Sign Out</button>
          <div className="font-caveat text-[#F0D9A5] text-xl leading-tight px-2">Manage. Automate.<br />Grow ♡</div>
        </div>
      </aside>

      <div className="flex-1 lg:ml-64 flex flex-col min-w-0 overflow-x-clip">
        <header className="gold-night-chrome sticky top-0 z-30 h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between border-b border-gold/20" data-testid="hq-header">
          <GoldSparkles count={16} stars={4} bokeh={4} seed={11} className="-z-10" />
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button className="lg:hidden p-2 -ml-2 rounded-md hover:bg-white/5 transition text-white/80 flex-shrink-0" onClick={() => setOpen(true)} data-testid="hq-sidebar-open" aria-label="Open menu"><Menu className="w-5 h-5" /></button>
            <div className="min-w-0">
              <div className="font-playfair text-lg sm:text-2xl leading-none truncate text-white" data-testid="hq-page-title">{title}</div>
              <div className="hidden sm:block text-[9px] tracking-[0.32em] uppercase text-white/55 mt-1.5">Miracurl HQ · Manage · Automate · Grow</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            <div className="hidden sm:block"><NetSpeedIndicator /></div>
            <div className="hidden md:flex items-center h-9 px-3 rounded-full border border-white/10 bg-white/5 text-xs text-white/60 tracking-wider" data-testid="hq-header-date">{today}</div>
            <TenantSwitch tenants={tenants} onOpen={onOpenTenant} />
            {headerRight}
            <div className="flex items-center gap-2 pl-1" data-testid="hq-header-user">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold to-blush flex items-center justify-center text-bg-base font-semibold text-sm ring-2 ring-white/10">{(user?.name || user?.email || "A").charAt(0).toUpperCase()}</div>
              <div className="hidden sm:block text-left"><div className="text-xs font-medium text-white truncate max-w-[140px]">{user?.name || user?.email}</div><div className="text-[9px] uppercase tracking-wider text-[#F0D9A5]">Super Admin</div></div>
            </div>
          </div>
        </header>
        <main className={`${tab === "mira-home" ? "" : "hq-l "}relative z-10 flex-1 px-4 sm:px-6 lg:px-8 py-6 space-y-6 pb-24`} data-testid="hq-main">{children}</main>
      </div>
    </div>
  );
}
