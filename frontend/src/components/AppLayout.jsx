import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard, Calendar, Users, UserCog, Scissors, Package,
  ShoppingCart, BarChart3, LogOut, ChevronDown, Star,
  Settings as SettingsIcon, Menu, X, Gift, Clock, Download, Bot,
  Image as ImageIcon, MessageSquare, BadgePercent, ShieldCheck, Megaphone,
  Landmark, FileText, Music, Sparkles
} from "lucide-react";
import { FloatingPlayer } from "@/components/FloatingPlayer";
import BranchSwitcher from "./BranchSwitcher";
import SalonSwitcher from "./SalonSwitcher";
import api from "@/lib/api";
import { useEffect, useState } from "react";
import BrandMark from "./BrandMark";
import TenantBrandMark from "./TenantBrandMark";
import InstallAppPrompt from "./InstallAppPrompt";
import MiraFab from "./MiraFab";
import TrialReminder from "./TrialReminder";
import ActAsBanner from "./ActAsBanner";
import { useNewBookingNotifier, NotifBell } from "./NewBookingNotifier";

const NAV_ADMIN = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/appointments", label: "Appointments", icon: Calendar, testid: "nav-appointments" },
  { to: "/customers", label: "CRM", icon: Users, testid: "nav-customers" },
  { to: "/staff", label: "Staff", icon: UserCog, testid: "nav-staff" },
  { to: "/registry", label: "Staff Registry", icon: ShieldCheck, testid: "nav-registry" },
  { to: "/attendance", label: "Attendance", icon: Clock, testid: "nav-attendance" },
  { to: "/services", label: "Services", icon: Scissors, testid: "nav-services" },
  { to: "/inventory", label: "Inventory", icon: Package, testid: "nav-inventory" },
  { to: "/pos", label: "POS / Billing", icon: ShoppingCart, testid: "nav-pos" },
  { to: "/reviews", label: "Reviews", icon: Star, testid: "nav-reviews" },
  { to: "/plans", label: "Offers & Plans", icon: BadgePercent, testid: "nav-plans" },
  { to: "/offers-studio", label: "Offer Maker", icon: Megaphone, testid: "nav-offers-studio" },
  { to: "/mira-studio", label: "Mira Studio", icon: Sparkles, testid: "nav-mira-studio" },
  { to: "/refer", label: "Refer & Earn", icon: Gift, testid: "nav-refer" },
  { to: "/reports", label: "Reports", icon: BarChart3, testid: "nav-reports" },
  { to: "/messages", label: "Messages", icon: MessageSquare, testid: "nav-messages" },
  { to: "/gallery", label: "Gallery", icon: ImageIcon, testid: "nav-gallery" },
  { to: "/entertainment", label: "Entertainment", icon: Music, testid: "nav-entertainment" },
  { to: "/assistant", label: "AI Assistant", icon: Bot, testid: "nav-assistant" },
  { to: "/settings", label: "Settings", icon: SettingsIcon, testid: "nav-settings" },
];

const NAV_STAFF = [
  { to: "/staff-portal", label: "My Dashboard", icon: LayoutDashboard, testid: "nav-staff-portal" },
  { to: "/appointments", label: "Appointments", icon: Calendar, testid: "nav-appointments" },
  { to: "/bank-details", label: "Bank Details", icon: Landmark, testid: "nav-bank-details" },
  { to: "/build-resume", label: "Build Your Resume", icon: FileText, testid: "nav-build-resume" },
];

const NAV_MANAGER = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/appointments", label: "Appointments", icon: Calendar, testid: "nav-appointments" },
  { to: "/customers", label: "CRM", icon: Users, testid: "nav-customers" },
  { to: "/services", label: "Services", icon: Scissors, testid: "nav-services" },
  { to: "/pos", label: "POS / Billing", icon: ShoppingCart, testid: "nav-pos" },
  { to: "/reviews", label: "Reviews", icon: Star, testid: "nav-reviews" },
  { to: "/offers-studio", label: "Offer Maker", icon: Megaphone, testid: "nav-offers-studio" },
];

export default function AppLayout() {
  const { user, tenant, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const today = new Date().toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });

  const NAV = user?.role === "staff" ? NAV_STAFF : user?.role === "manager" ? NAV_MANAGER : NAV_ADMIN;
  const current = NAV.find(n => loc.pathname.startsWith(n.to));

  // Booking notification poller — only for owners/admins. Fires a chime + OS
  // notification when a customer self-books via the public link.
  const isAdmin = user?.role === "admin";
  const isOwner = user?.role === "admin" || user?.role === "super_admin";
  const notifier = useNewBookingNotifier({ enabled: isAdmin });

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
                `flex items-center gap-3 px-6 py-3 text-sm transition-all border-l-2 ${
                  isActive
                    ? "bg-gradient-to-r from-gold/15 to-transparent border-gold text-gold"
                    : "text-white/60 hover:text-white hover:bg-white/5 border-transparent"
                }`
              }
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.label}</span>
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
            className="flex items-center gap-2 text-sm text-white/60 hover:text-gold w-full px-2 py-2 rounded-md hover:bg-white/5 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 lg:ml-64 flex flex-col min-w-0">
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
          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            <div className="hidden md:flex items-center px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs text-white/60 tracking-wider">{today}</div>
            {isAdmin ? <SalonSwitcher /> : null}
            {(isAdmin || user?.role === "manager") ? <BranchSwitcher /> : null}
            {isAdmin ? (
              <NotifBell
                unread={notifier.unread}
                permission={notifier.permission}
                requestPermission={notifier.requestPermission}
                clearUnread={notifier.clearUnread}
                onNavigate={nav}
              />
            ) : null}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-md hover:bg-white/5 transition"
                data-testid="profile-menu-btn"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold to-blush flex items-center justify-center text-bg-base font-semibold text-sm">
                  {(user?.name || "A").charAt(0).toUpperCase()}
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-medium truncate max-w-[120px]">{user?.name}</div>
                  <div className="text-[10px] text-white/40 uppercase tracking-wider">{user?.role}</div>
                </div>
                <ChevronDown className="hidden sm:block w-3 h-3 text-white/50" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-[#121212] border border-white/10 rounded-md shadow-card-luxe py-1 z-40">
                  <div className="px-4 py-2 text-xs text-white/50 border-b border-white/5 truncate">{user?.email}</div>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      try { localStorage.removeItem("miracurl_pwa_install_dismissed"); } catch (e) { /* noop */ }
                      window.dispatchEvent(new CustomEvent("miracurl:open-install"));
                    }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-white/5 text-white/80 flex items-center gap-2"
                    data-testid="profile-install-app-btn"
                  >
                    <Download className="w-3.5 h-3.5" /> Install app
                  </button>
                  <button
                    onClick={async () => { await logout(); nav("/login"); }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-white/5 text-red-400"
                    data-testid="profile-signout-btn"
                  >
                    Sign Out
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
          <Outlet />
        </main>
      </div>

      {/* Movable music mini-player — persists across pages while playing */}
      <FloatingPlayer />

      {/* PWA install banner — auto-shown when installable, or on demand via
          the "Install app" menu item. Copy tuned for the logged-in salon app. */}
      <InstallAppPrompt variant="app" />

      {/* Act-as-salon banner for super-admin */}
      {user?.role === "super_admin" && <ActAsBanner tenant={tenant} />}

      {/* Mira AI agent — floats on every portal section (admins only; staff/manager navs don't include /assistant) */}
      {user?.role === "admin" && <MiraFab />}

      {/* Once-a-day polite trial expiry reminder for owners */}
      {user?.role === "admin" && <TrialReminder />}
    </div>
  );
}
