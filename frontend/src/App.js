import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { GoogleAuthCallback } from "@/components/GoogleAuthCallback";
import { useEffect, lazy, Suspense } from "react";

import { BrandSplash } from "@/components/BrandSplash";
const PageLoader = () => <BrandSplash />;

let _lastGaPath = null;
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    // GA4 page views for this single-page app (route changes don't reload the page); guard against double-mount
    if (_lastGaPath === pathname) return;
    _lastGaPath = pathname;
    // Warm the chunks the user will need next, so the post-login screen paints instantly
    if (pathname === "/login" || pathname === "/") {
      const warm = () => { import("@/pages/Dashboard"); import("@/pages/Appointments"); };
      if ("requestIdleCallback" in window) window.requestIdleCallback(warm, { timeout: 1500 }); else setTimeout(warm, 600);
    }
    if (typeof window.gtag === "function") window.gtag("event", "page_view", { page_path: pathname, page_location: window.location.href, page_title: document.title });
  }, [pathname]);
  return null;
}

// BookPublic mounts its own top-center Toaster — rendering the global one there
// too would show every toast twice (prod bug: double "Booking confirmed!").
function GlobalToaster() {
  const { pathname } = useLocation();
  if (pathname.startsWith("/book/")) return null;
  return <Toaster theme="dark" position="top-right" toastOptions={TOAST_OPTIONS} />;
}
import { Toaster, toast } from "sonner";

function VersionWatcher() {
  useEffect(() => {
    let initial = null, notified = false;
    const check = async () => {
      try {
        const r = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/public/build`);
        const d = await r.json();
        if (!d.build) return;
        if (initial === null) { initial = d.build; return; }
        if (!notified && d.build !== initial) {
          notified = true;
          toast("✨ New version available", {
            description: "Miracurl has been updated — refresh to load the latest version.",
            duration: Infinity,
            action: { label: "Refresh", onClick: () => window.location.reload() },
          });
        }
      } catch { /* offline — retry next tick */ }
    };
    check();
    const iv = setInterval(check, 5 * 60 * 1000);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  return null;
}
import "@/App.css";
import { ConfirmHost } from "@/components/ConfirmDialog";

import { AuthProvider, useAuth } from "@/context/AuthContext";
import { getActAsSalon } from "@/lib/api";

const TOAST_OPTIONS = { style: { background: '#121212', color: '#fff', border: '1px solid rgba(212,175,55,0.3)' } };
import Login from "@/pages/Login";
import AppLayout from "@/components/AppLayout";
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Appointments = lazy(() => import("@/pages/Appointments"));
const Customers = lazy(() => import("@/pages/Customers"));
const Staff = lazy(() => import("@/pages/Staff"));
const Services = lazy(() => import("@/pages/Services"));
const Inventory = lazy(() => import("@/pages/Inventory"));
const POS = lazy(() => import("@/pages/POS"));
const Reports = lazy(() => import("@/pages/Reports"));
const CashRegister = lazy(() => import("@/pages/CashRegister"));
const Reviews = lazy(() => import("@/pages/Reviews"));
const OffersStudio = lazy(() => import("@/pages/OffersStudio"));
import BookPublic from "@/pages/BookPublic";
const RewardsCampaign = lazy(() => import("@/pages/RewardsCampaign"));
import ColorTryOn from "@/pages/ColorTryOn";
const LoyaltyClubJoin = lazy(() => import("@/pages/LoyaltyClubJoin"));
const OrderPublic = lazy(() => import("@/pages/OrderPublic"));
const Kitchen = lazy(() => import("@/pages/Kitchen"));
const PartnerLanding = lazy(() => import("@/pages/PartnerLanding"));
const SuccessStories = lazy(() => import("@/pages/SuccessStories"));
const Blog = lazy(() => import("@/pages/Blog"));
const BlogPost = lazy(() => import("@/pages/BlogPost"));
const MiraAIStudio = lazy(() => import("@/pages/MiraAIStudio"));
const StaffActivities = lazy(() => import("@/pages/StaffActivities"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const ReviewPublic = lazy(() => import("@/pages/ReviewPublic"));
const RatePublic = lazy(() => import("@/pages/RatePublic"));
const SuperAdmin = lazy(() => import("@/pages/SuperAdmin"));
const SignupSalon = lazy(() => import("@/pages/SignupSalon"));
const RestaurantLanding = lazy(() => import("@/pages/RestaurantLanding"));
import Landing from "@/pages/Landing";
const ContactUs = lazy(() => import("@/pages/ContactUs"));
const WhoCanUse = lazy(() => import("@/pages/WhoCanUse"));
const AboutCeo = lazy(() => import("@/pages/AboutCeo"));
const Terms = lazy(() => import("@/pages/Terms"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Refund = lazy(() => import("@/pages/Refund"));
const GiftCardPublic = lazy(() => import("@/pages/GiftCardPublic"));
const MembershipPublic = lazy(() => import("@/pages/MembershipPublic"));
const MemberCardPublic = lazy(() => import("@/pages/MemberCardPublic"));
const PayLinkPublic = lazy(() => import("@/pages/PayLinkPublic"));
const FeedbackPublic = lazy(() => import("@/pages/FeedbackPublic"));
const Settings = lazy(() => import("@/pages/Settings"));
const Assistant = lazy(() => import("@/pages/Assistant"));
const MiraStudio = lazy(() => import("@/pages/MiraStudio"));
const SetupWizard = lazy(() => import("@/pages/SetupWizard"));
const ReferEarn = lazy(() => import("@/pages/ReferEarn"));
const Receptionist = lazy(() => import("@/pages/Receptionist"));
const StaffPortal = lazy(() => import("@/pages/StaffPortal"));
const StaffBankDetails = lazy(() => import("@/pages/StaffBankDetails"));
const StaffResume = lazy(() => import("@/pages/StaffResume"));
const StaffProfileSettings = lazy(() => import("@/pages/StaffProfileSettings"));
const StaffNoticePeriod = lazy(() => import("@/pages/StaffNoticePeriod"));
const Attendance = lazy(() => import("@/pages/Attendance"));
import ErrorBoundary from "@/components/ErrorBoundary";
import ManifestSwitcher from "@/components/ManifestSwitcher";
import MicroInteractions from "@/components/MicroInteractions";
const SalonFinder = lazy(() => import("@/pages/SalonFinder"));
import ForceChangePassword from "@/pages/ForceChangePassword";
const Gallery = lazy(() => import("@/pages/Gallery"));
const Messages = lazy(() => import("@/pages/Messages"));
const Plans = lazy(() => import("@/pages/Plans"));
const CctvAnalytics = lazy(() => import("@/pages/CctvAnalytics"));
const CctvCapture = lazy(() => import("@/pages/CctvCapture"));
const HireStaff = lazy(() => import("@/pages/HireStaff"));
const JobsBoard = lazy(() => import("@/pages/JobsBoard"));
const CandidateProfile = lazy(() => import("@/pages/CandidateProfile"));
const StaffRegistry = lazy(() => import("@/pages/StaffRegistry"));
const RegistryPublic = lazy(() => import("@/pages/RegistryPublic"));
const Partners = lazy(() => import("@/pages/Partners"));
const SalonPublic = lazy(() => import("@/pages/SalonPublic"));
const MiracurlProducts = lazy(() => import("@/pages/MiracurlProducts"));
const EmployeePortal = lazy(() => import("@/pages/EmployeePortal"));
const DemoSlot = lazy(() => import("@/pages/DemoSlot"));
const PublicDemo = lazy(() => import("@/pages/PublicDemo"));
import { PlayerProvider } from "@/context/PlayerContext";
const Entertainment = lazy(() => import("@/pages/Entertainment"));

function Protected({ children }) {
  const { user, loading, refresh } = useAuth();
  if (loading) {
    return <BrandSplash />;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "super_admin" && !getActAsSalon()) return <Navigate to="/super-admin" replace />;
  // Onboarding gate: owners created via super-admin have a temp password that
  // MUST be changed on first login before they see any tenant data.
  if (user.must_change_password) {
    return <ForceChangePassword user={user} onDone={() => refresh?.()} />;
  }
  return children;
}

// Restrict certain routes to admin only — staff visiting these gets bounced to their portal.
function AdminOnly({ children }) {
  const { user } = useAuth();
  if (user?.role === "staff") return <Navigate to="/staff-portal" replace />;
  return children;
}

// Owner-only routes (financials, staff mgmt, settings) — managers get bounced to dashboard.
function OwnerOnly({ children }) {
  const { user } = useAuth();
  if (user?.role === "staff") return <Navigate to="/staff-portal" replace />;
  // managers get the full menu — sensitive sections are gated by the Admin PIN lock screen in AppLayout
  return children;
}

function RootRoute() {
  // Public marketing landing for guests; logged-in users go to their workspace.
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Landing />;
  if (user.role === "super_admin") return <Navigate to="/super-admin" replace />;
  if (user.role === "staff") return <Navigate to="/staff-portal" replace />;
  return <Navigate to="/dashboard" replace />;
}

function SuperAdminProtected({ children }) {
  const { user, loading, refresh } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "super_admin") return <Navigate to="/dashboard" replace />;
  if (user.must_change_password) {
    return <ForceChangePassword user={user} onDone={() => refresh?.()} />;
  }
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  const { search } = useLocation();
  if (loading) return <PageLoader />;
  if (user) {
    const next = new URLSearchParams(search).get("next") || "";
    if (/^\/(?!\/)[^\s]*$/.test(next) && !next.startsWith("/login")) return <Navigate to={next} replace />;
    if (user.role === "super_admin") return <Navigate to="/super-admin" replace />;
    if (user.role === "staff") return <Navigate to="/staff-portal" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function ContentGuard() {
  // Deters casual scraping of sensitive info: blocks right-click site-wide.
  // Text selection & copy/paste stay fully allowed.
  useEffect(() => {
    const block = (e) => e.preventDefault();
    document.addEventListener("contextmenu", block);
    return () => document.removeEventListener("contextmenu", block);
  }, []);
  return null;
}

// Remount the whole page tree when the active salon changes → branch switch is an instant SPA swap, no full reload.
function TenantKeyedRoutes({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <GoogleAuthCallback />;
  return <Routes key={user?.tenant_id || user?.active_tenant_id || "anon"}>{children}</Routes>;
}

export default function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter basename={window.location.pathname.startsWith("/partner/") ? "/partner" : ""}>
          <ScrollToTop />
          <ContentGuard />
          <VersionWatcher />
          <ManifestSwitcher />
          <MicroInteractions />
          <GlobalToaster />
          <ConfirmHost />
          <ErrorBoundary>
          <PlayerProvider>
          <Suspense fallback={<PageLoader />}>
          <TenantKeyedRoutes>
            <Route path="/book/:slug" element={<BookPublic />} />
            <Route path="/rewards/:slug" element={<RewardsCampaign />} />
            <Route path="/color/:slug" element={<ColorTryOn />} />
            <Route path="/order/:slug" element={<OrderPublic />} />
            <Route path="/gift/:slug" element={<GiftCardPublic />} />
            <Route path="/membership/:slug" element={<MembershipPublic />} />
            <Route path="/member/:memberId" element={<MemberCardPublic />} />
            <Route path="/gift" element={<GiftCardPublic />} />
            <Route path="/pay/:token" element={<PayLinkPublic />} />
            <Route path="/feedback/:token" element={<FeedbackPublic />} />
            <Route path="/salon/:slug" element={<SalonPublic />} />
            <Route path="/products" element={<MiracurlProducts />} />
            <Route path="/employee" element={<EmployeePortal />} />
            <Route path="/demo-slot/:iid" element={<DemoSlot />} />
            <Route path="/demo" element={<PublicDemo />} />
            <Route path="/partner" element={<PartnerLanding />} />
            <Route path="/success-stories" element={<SuccessStories />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/mira.ai" element={<MiraAIStudio />} />
            <Route path="/mira-ai" element={<MiraAIStudio />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/staff-registry" element={<RegistryPublic />} />
            <Route path="/partners" element={<Partners />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/terms-of-service" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/privacy-policy" element={<Privacy />} />
            <Route path="/refund-policy" element={<Refund />} />
            <Route path="/book" element={<SalonFinder />} />
            <Route path="/review/:token" element={<ReviewPublic />} />
            <Route path="/loyalty/:slug" element={<LoyaltyClubJoin />} />
            <Route path="/rate/:slug" element={<RatePublic />} />
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/signup-salon" element={<PublicOnly><SignupSalon /></PublicOnly>} />
            <Route path="/signup-restaurant" element={<PublicOnly><SignupSalon /></PublicOnly>} />
            <Route path="/restaurant" element={<RestaurantLanding />} />
            <Route path="/super-admin" element={<SuperAdminProtected><SuperAdmin /></SuperAdminProtected>} />
            <Route path="/" element={<RootRoute />} />
            <Route path="/features" element={<Landing scrollTo="features" />} />
            <Route path="/pricing" element={<Landing scrollTo="pricing" />} />
            <Route path="/about-us" element={<Landing scrollTo="about" />} />
            <Route path="/contact-us" element={<ContactUs />} />
            <Route path="/who-can-use" element={<WhoCanUse />} />
            <Route path="/ceo" element={<AboutCeo />} />
            <Route element={<Protected><AppLayout /></Protected>}>
              <Route path="dashboard" element={<AdminOnly><Dashboard /></AdminOnly>} />
              <Route path="staff-portal" element={<StaffPortal />} />
              <Route path="bank-details" element={<StaffBankDetails />} />
              <Route path="build-resume" element={<StaffResume />} />
              <Route path="my-profile" element={<StaffProfileSettings />} />
              <Route path="notice-period" element={<StaffNoticePeriod />} />
              <Route path="appointments" element={<Appointments />} />
              <Route path="customers" element={<AdminOnly><Customers /></AdminOnly>} />
              <Route path="staff" element={<OwnerOnly><Staff /></OwnerOnly>} />
              <Route path="registry" element={<OwnerOnly><StaffRegistry /></OwnerOnly>} />
              <Route path="attendance" element={<OwnerOnly><Attendance /></OwnerOnly>} />
              <Route path="services" element={<AdminOnly><Services /></AdminOnly>} />
              <Route path="inventory" element={<OwnerOnly><Inventory /></OwnerOnly>} />
              <Route path="pos" element={<POS />} />
              <Route path="kitchen" element={<Kitchen />} />
              <Route path="reviews" element={<AdminOnly><Reviews /></AdminOnly>} />
              <Route path="offers-studio" element={<AdminOnly><OffersStudio /></AdminOnly>} />
              <Route path="refer" element={<OwnerOnly><ReferEarn /></OwnerOnly>} />
              <Route path="receptionist" element={<AdminOnly><Receptionist /></AdminOnly>} />
              <Route path="reports" element={<OwnerOnly><Reports /></OwnerOnly>} />
              <Route path="cash" element={<CashRegister />} />
              <Route path="assistant" element={<OwnerOnly><Assistant /></OwnerOnly>} />
              <Route path="mira-studio" element={<OwnerOnly><MiraStudio /></OwnerOnly>} />
              <Route path="setup" element={<OwnerOnly><SetupWizard /></OwnerOnly>} />
              <Route path="gallery" element={<OwnerOnly><Gallery /></OwnerOnly>} />
              <Route path="entertainment" element={<AdminOnly><Entertainment /></AdminOnly>} />
              <Route path="messages" element={<OwnerOnly><Messages /></OwnerOnly>} />
              <Route path="plans" element={<OwnerOnly><Plans /></OwnerOnly>} />
              <Route path="cctv" element={<OwnerOnly><CctvAnalytics /></OwnerOnly>} />
              <Route path="hire" element={<OwnerOnly><HireStaff /></OwnerOnly>} />
              <Route path="settings" element={<OwnerOnly><Settings /></OwnerOnly>} />
              <Route path="staff-activities" element={<OwnerOnly><StaffActivities /></OwnerOnly>} />
            </Route>
            <Route path="/cctv-capture" element={<Protected><OwnerOnly><CctvCapture /></OwnerOnly></Protected>} />
            <Route path="/jobs" element={<JobsBoard />} />
            <Route path="/candidate/:token" element={<CandidateProfile />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </TenantKeyedRoutes>
          </Suspense>
          </PlayerProvider>
          </ErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}
