import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard, Calendar, Users, UserCog, Scissors, Package,
  ShoppingCart, BarChart3, LogOut, ChevronDown, Star,
  Settings as SettingsIcon, Menu, X, Gift, Clock, Download, Bot,
  Image as ImageIcon, MessageSquare, BadgePercent, ShieldCheck, Megaphone,
  Landmark, FileText, Music, Sparkles, Cctv, Briefcase, Activity, Lock, ChefHat, Wallet, Headphones } from "lucide-react";
import { ManagerLockScreen } from "./ManagerLockScreen";
import { RoleBadge } from "./RoleBadge";
import { AdminLockScreen } from "./AdminLockScreen";
import { FloatingPlayer } from "@/components/FloatingPlayer";
import BranchSwitcher from "./BranchSwitcher";
import SalonSwitcher from "./SalonSwitcher";
import api from "@/lib/api";
import { useEffect, useState } from "react";
import BrandMark from "./BrandMark";
import TenantBrandMark from "./TenantBrandMark";
import { TenantMiraAssistant } from "./TenantMiraAssistant";
import InstallAppPrompt from "./InstallAppPrompt";
import TrialReminder from "./TrialReminder";
import ActAsBanner from "./ActAsBanner";
import { useNewBookingNotifier, NotifBell } from "./NewBookingNotifier";
import { FixRequestButton } from "./FixRequestButton";
import WhatsNewModal from "./WhatsNewModal";
import { NoticePopup } from "./NoticePopup";
import { NetSpeedIndicator } from "./NetSpeedIndicator";

const NAV_ADMIN = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/appointments", label: "Appointments", icon: Calendar, testid: "nav-appointments" },
  { to: "/customers", label: "CRM", icon: Users, testid: "nav-customers" },
  { to: "/receptionist", label: "Mira Receptionist", icon: Headphones, testid: "nav-receptionist" },
  { to: "/staff", label: "Staff", icon: UserCog, testid: "nav-staff" },
  { to: "/registry", label: "Staff Registry", icon: ShieldCheck, testid: "nav-registry" },
  { to: "/attendance", label: "Attendance", icon: Clock, testid: "nav-attendance" },
  { to: "/services", label: "Services", icon: Scissors, testid: "nav-services" },
  { to: "/inventory", label: "Inventory", icon: Package, testid: "nav-inventory" },
  { to: "/pos", label: "POS / Billing", icon: ShoppingCart, testid: "nav-pos" },
  { to: "/cash", label: "Cash Register", icon: Wallet, testid: "nav-cash" },
  { to: "/reviews", label: "Reviews", icon: Star, testid: "nav-reviews" },
  { to: "/plans", label: "Offers & Plans", icon: BadgePercent, testid: "nav-plans" },
  { to: "/offers-studio", label: "Offer Maker", icon: Megaphone, testid: "nav-offers-studio" },
  { to: "/mira-studio", label: "Mira Studio", icon: Sparkles, testid: "nav-mira-studio" },
  { to: "/cctv", label: "AI CCTV", icon: Cctv, testid: "nav-cctv" },
  { to: "/hire", label: "Hire Staff", icon: Briefcase, testid: "nav-hire" },
  { to: "/refer", label: "Refer & Earn", icon: Gift, testid: "nav-refer" },
  { to: "/reports", label: "Reports", icon: BarChart3, testid: "nav-reports" },
  { to: "/messages", label: "Messages", icon: MessageSquare, testid: "nav-messages" },
  { to: "/gallery", label: "Gallery", icon: ImageIcon, testid: "nav-gallery" },
  { to: "/entertainment", label: "Entertainment", icon: Music, testid: "nav-entertainment" },
  { to: "/assistant", label: "AI Assistant", icon: Bot, testid: "nav-assistant" },
  { to: "/staff-activities", label: "Staff Activities", icon: Activity, testid: "nav-staff-activities" },
  { to: "/settings", label: "Settings", icon: SettingsIcon, testid: "nav-settings" },
];

// Sections a manager can only open with the Admin (Owner) PIN — every attempt is logged
const MANAGER_LOCKED = ["/staff", "/registry", "/cctv", "/attendance", "/messages", "/settings", "/staff-activities"];
// Sections even the OWNER must unlock with the Owner PIN on shared devices
const ADMIN_LOCKED = ["/settings", "/staff"];

const NAV_STAFF = [
  { to: "/staff-portal", label: "My Dashboard", icon: LayoutDashboard, testid: "nav-staff-portal" },
  { to: "/appointments", label: "Appointments", icon: Calendar, testid: "nav-appointments" },
  { to: "/pos", label: "POS / Billing", icon: ShoppingCart, testid: "nav-pos" },
  { to: "/cash", label: "Cash Register", icon: Wallet, testid: "nav-cash" },
  { to: "/notice-period", label: "Serve Notice Period", icon: Calendar, testid: "nav-notice-period" },
  { to: "/my-profile", label: "Profile Settings", icon: LayoutDashboard, testid: "nav-my-profile" },
  { to: "/bank-details", label: "Bank Details", icon: Landmark, testid: "nav-bank-details" },
  { to: "/build-resume", label: "Build Your Resume", icon: FileText, testid: "nav-build-resume" },
];

const NAV_MANAGER = NAV_ADMIN.filter((i) => i.to !== "/assistant");

export default function AppLayout() {
  const { user, tenant, logout } = useAuth();

  // Remote cache purge: when super admin clears a salon's cache, every device
  // of that salon gets a one-time full cache wipe + reload on next app open.
  useEffect(() => {
    if (!tenant?.slug) return;
    api.get("/public/cache-version").then(async ({ data }) => {
      const v = data?.v || "";
      const key = "mira_cache_v";
      const stored = localStorage.getItem(key);
      if (!v) return;
      if (stored === null) { localStorage.setItem(key, v); return; }
      if (stored === v) return;
      if (sessionStorage.getItem("mira_cache_wiped") === v) { localStorage.setItem(key, v); return; } // already wiped this session — never loop
      sessionStorage.setItem("mira_cache_wiped", v);
      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        }
        if (window.caches) {
          const keys = await window.caches.keys();
          await Promise.all(keys.map(k => window.caches.delete(k)));
        }
      } catch { /* best effort */ }
      localStorage.setItem(key, v);
      window.location.reload();
    }).catch(() => {});
  }, [tenant?.slug]);
  const nav = useNavigate();
  const loc = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const today = new Date().toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });

  const NAV_BASE = user?.role === "staff" ? NAV_STAFF : user?.role === "manager" ? NAV_MANAGER : NAV_ADMIN;
  // Restaurant tenants see restaurant language on the same engine
  const NAV = tenant?.business_type === "restaurant"
    ? [...NAV_BASE.map(i =>
        i.to === "/services" ? { ...i, label: "Menu" } :
        i.to === "/appointments" ? { ...i, label: "Reservations" } :
        i.to === "/pos" ? { ...i, label: "POS / Orders" } : i)
        .flatMap(i => i.to === "/pos" ? [{ to: "/kitchen", label: "Kitchen", icon: ChefHat, testid: "nav-kitchen" }, i] : [i])]
    : NAV_BASE;
  const current = NAV.find(n => loc.pathname.startsWith(n.to));

  // Manager Admin-PIN gate: sensitive sections render a lock screen until unlocked this session
  const [, setUnlockTick] = useState(0);
  const lockedPath = user?.role === "manager"
    ? MANAGER_LOCKED.find((p) => loc.pathname === p || loc.pathname.startsWith(`${p}/`))
    : user?.role === "admin"
      ? ADMIN_LOCKED.find((p) => loc.pathname === p || loc.pathname.startsWith(`${p}/`))
      : null;
  const isLockedNow = lockedPath && !sessionStorage.getItem(`mgr_unlock:${user?.id}:${lockedPath}`);

  // Booking notification poller — only for owners/admins. Fires a chime + OS
  // notification when a customer self-books via the public link.
  const isAdmin = user?.role === "admin";
  const isOwner = user?.role === "admin" || user?.role === "super_admin";
  const canNotify = isAdmin || user?.role === "manager" || user?.role === "staff";
  const notifier = useNewBookingNotifier({ enabled: canNotify });

  // Poll unread customer-chat count for the Messages nav badge
  const [chatUnread, setChatUnread] = useState(0);
  useEffect(() => {
    if (!isAdmin) return;
    const fetchUnread = () => api.get("/owner-chats/unread-count").then(r => setChatUnread(r.data.unread)).catch(() => {});
    fetchUnread();
    const t = setInterval(fetchUnread, 30000);
    return () => clearInterval(t);
  }, [isAdmin, loc.pathname]);

  // Close mobile sidebar on route change
  useEffect(() => { setSidebarOpen(false); setMenuOpen(false); }, [loc.pathname]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen flex bg-bg-base text-ink-primary" style={user?.role === "super_admin" ? { paddingTop: "46px" } : undefined}>
      <NoticePopup />
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          data-testid="sidebar-backdrop"
          aria-hidden="true"
        />
      )}

      {/* Sidebar — hidden on mobile by default, slides in when opened */}
      <aside
        data-testid="app-sidebar"
        className={`fixed top-0 left-0 z-50 h-screen w-[80%] max-w-[280px] lg:w-64 bg-[#0A0A0A] border-r border-white/5 flex flex-col transform transition-transform duration-300 ease-out lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          {tenant ? <TenantBrandMark tenant={tenant} /> : <BrandMark variant="dark" size="xs" />}
          <button
            className="lg:hidden text-white/60 hover:text-white p-1"
            onClick={() => setSidebarOpen(false)}
            data-testid="sidebar-close-btn"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto" data-testid="sidebar-nav">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              data-testid={item.testid}
              className={({ isActive }) =>
                `flex items-center gap-3 mx-3 my-1 px-4 py-2.5 text-sm rounded-full border transition-all ${
                  isActive
                    ? "nav-gold-plate font-semibold"
                    : "nav-gold-hover text-white/60 border-transparent"
                }`
              }
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.label}</span>
              {user?.role === "manager" && MANAGER_LOCKED.includes(item.to) && (
                <Lock className="w-3 h-3 ml-auto text-amber-400/70" data-testid={`nav-lock-${item.to.slice(1)}`} />
              )}
              {item.to === "/messages" && chatUnread > 0 && (
                <span data-testid="nav-messages-unread" className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                  {chatUnread}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-white/5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}>
          <button
            data-testid="logout-btn"
            onClick={async () => { await logout(); nav("/login"); }}
            className="nav-gold-hover flex items-center gap-2 text-sm text-white/60 w-full px-4 py-2.5 rounded-full border border-transparent transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 lg:ml-64 flex flex-col min-w-0 overflow-x-clip">
        {/* Top bar */}
        <header
          className="sticky top-0 z-30 h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between bg-gradient-to-r from-[#0A0A0A] via-[#151210] to-[#0A0A0A] backdrop-blur-xl border-b border-gold/20"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Hamburger — only visible on mobile/tablet */}
            <button
              className="lg:hidden p-2 -ml-2 rounded-md hover:bg-white/5 transition text-white/80 flex-shrink-0"
              onClick={() => setSidebarOpen(true)}
              data-testid="sidebar-open-btn"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="font-playfair text-base sm:text-lg leading-none truncate">
                {current?.label || tenant?.name || "Dashboard"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-4 min-w-0">
            <div className="hidden sm:block"><NetSpeedIndicator /></div>
            <div className="hidden md:flex items-center px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs text-white/60 tracking-wider">{today}</div>
            {user?.role === "admin" ? <FixRequestButton /> : null}
            {isAdmin ? <SalonSwitcher /> : null}
            {(isAdmin || user?.role === "manager") ? <BranchSwitcher /> : null}
            {canNotify ? (
              <div className="flex-shrink-0">
                <NotifBell
                  items={notifier.items}
                  permission={notifier.permission}
                  requestPermission={notifier.requestPermission}
                  dismiss={notifier.dismiss}
                  clearAll={notifier.clearAll}
                  onNavigate={nav}
                />
              </div>
            ) : null}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-md hover:bg-white/5 transition"
                data-testid="profile-menu-btn"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold to-blush flex items-center justify-center text-bg-base font-semibold text-sm ring-2 ring-white/10">
                  {(user?.name || "A").charAt(0).toUpperCase()}
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-medium truncate max-w-[120px]">{user?.name}</div>
                  <div className="mt-0.5"><RoleBadge role={user?.role} size="xs" /></div>
                </div>
                <ChevronDown className="hidden sm:block w-3 h-3 text-white/50" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-[#16121a] border border-white/10 rounded-2xl shadow-2xl z-40 overflow-hidden" data-testid="profile-menu">
                  <div className="relative px-4 pt-4 pb-3 border-b border-white/10">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-gold via-blush to-gold" />
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-gold to-blush flex items-center justify-center text-bg-base font-bold text-lg ring-2 ring-white/15">
                        {(user?.name || "A").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{user?.name}</div>
                        <div className="text-[11px] text-white/40 truncate">{user?.email}</div>
                      </div>
                    </div>
                    <div className="mt-2.5"><RoleBadge role={user?.role} /></div>
                  </div>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      try { localStorage.removeItem("miracurl_pwa_install_dismissed"); } catch (e) { /* noop */ }
                      window.dispatchEvent(new CustomEvent("miracurl:open-install"));
                    }}
                    className="w-full text-left px-4 py-3 text-sm hover:bg-white/5 text-white/85 flex items-center gap-2.5"
                    data-testid="profile-install-app-btn"
                  >
                    <Download className="w-4 h-4 text-gold" /> Install app
                  </button>
                  <button
                    onClick={async () => { await logout(); nav("/login"); }}
                    className="w-full text-left px-4 py-3 text-sm hover:bg-rose-500/10 text-rose-400 flex items-center gap-2.5 border-t border-white/5"
                    data-testid="profile-signout-btn"
                  >
                    <LogOut className="w-4 h-4" /> Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main
          className="flex-1 p-4 sm:p-6 lg:p-8 animate-fade-up"
          data-testid="main-content"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 5.5rem)" }}
        >
          {isLockedNow ? (
            user?.role === "admin" ? (
              <AdminLockScreen key={lockedPath} path={lockedPath}
                label={NAV.find((i) => i.to === lockedPath)?.label || "This section"}
                onUnlocked={() => { sessionStorage.setItem(`mgr_unlock:${user?.id}:${lockedPath}`, "1"); setUnlockTick((v) => v + 1); }} />
            ) : (
              <ManagerLockScreen key={lockedPath} path={lockedPath}
                label={NAV.find((i) => i.to === lockedPath)?.label || "This section"}
                onUnlocked={() => { sessionStorage.setItem(`mgr_unlock:${user?.id}:${lockedPath}`, "1"); setUnlockTick((v) => v + 1); }} />
            )
          ) : (
            <Outlet />
          )}
        </main>
      </div>

      {/* Movable music mini-player — persists across pages while playing */}
      <FloatingPlayer />

      {/* PWA install banner — auto-shown when installable, or on demand via
          the "Install app" menu item. Copy tuned for the logged-in salon app. */}
      <InstallAppPrompt variant="app" />

      {/* Act-as-salon banner for super-admin */}
      {user?.role === "super_admin" && <ActAsBanner tenant={tenant} />}

      {/* Mira AI agent — tap the avatar for a spoken briefing (collection, bookings, staff) */}

      {/* Once-a-day polite trial expiry reminder for owners */}
      {user?.role === "admin" && <TrialReminder />}

      {/* Dedicated Mira AI for every salon — voice briefing & Q&A on the salon's own numbers */}
      {(user?.role === "admin" || user?.role === "manager") && <TenantMiraAssistant />}

      {/* Post-deployment "What's New ✨" highlights for owners — shown once per build */}
      {user?.role === "admin" && <WhatsNewModal />}
    </div>
  );
}
