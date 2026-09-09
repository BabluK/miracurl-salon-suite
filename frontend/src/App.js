import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    // GA4 page views for this single-page app (route changes don't reload the page)
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
import Dashboard from "@/pages/Dashboard";
import Appointments from "@/pages/Appointments";
import Customers from "@/pages/Customers";
import Staff from "@/pages/Staff";
import Services from "@/pages/Services";
import Inventory from "@/pages/Inventory";
import POS from "@/pages/POS";
import Reports from "@/pages/Reports";
import CashRegister from "@/pages/CashRegister";
import Reviews from "@/pages/Reviews";
import OffersStudio from "@/pages/OffersStudio";
import BookPublic from "@/pages/BookPublic";
import RewardsCampaign from "@/pages/RewardsCampaign";
import LoyaltyClubJoin from "@/pages/LoyaltyClubJoin";
import OrderPublic from "@/pages/OrderPublic";
import Kitchen from "@/pages/Kitchen";
import PartnerLanding from "@/pages/PartnerLanding";
import SuccessStories from "@/pages/SuccessStories";
import Blog from "@/pages/Blog";
import BlogPost from "@/pages/BlogPost";
import MiraAIStudio from "@/pages/MiraAIStudio";
import StaffActivities from "@/pages/StaffActivities";
import ResetPassword from "@/pages/ResetPassword";
import ReviewPublic from "@/pages/ReviewPublic";
import RatePublic from "@/pages/RatePublic";
import SuperAdmin from "@/pages/SuperAdmin";
import SignupSalon from "@/pages/SignupSalon";
import RestaurantLanding from "@/pages/RestaurantLanding";
import Landing from "@/pages/Landing";
import ContactUs from "@/pages/ContactUs";
import WhoCanUse from "@/pages/WhoCanUse";
import AboutCeo from "@/pages/AboutCeo";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
import Refund from "@/pages/Refund";
import GiftCardPublic from "@/pages/GiftCardPublic";
import MembershipPublic from "@/pages/MembershipPublic";
import MemberCardPublic from "@/pages/MemberCardPublic";
import PayLinkPublic from "@/pages/PayLinkPublic";
import FeedbackPublic from "@/pages/FeedbackPublic";
import Settings from "@/pages/Settings";
import Assistant from "@/pages/Assistant";
import MiraStudio from "@/pages/MiraStudio";
import SetupWizard from "@/pages/SetupWizard";
import ReferEarn from "@/pages/ReferEarn";
import StaffPortal from "@/pages/StaffPortal";
import StaffBankDetails from "@/pages/StaffBankDetails";
import StaffResume from "@/pages/StaffResume";
import Attendance from "@/pages/Attendance";
import ErrorBoundary from "@/components/ErrorBoundary";
import ManifestSwitcher from "@/components/ManifestSwitcher";
import MicroInteractions from "@/components/MicroInteractions";
import SalonFinder from "@/pages/SalonFinder";
import ForceChangePassword from "@/pages/ForceChangePassword";
import Gallery from "@/pages/Gallery";
import Messages from "@/pages/Messages";
import Plans from "@/pages/Plans";
import CctvAnalytics from "@/pages/CctvAnalytics";
import CctvCapture from "@/pages/CctvCapture";
import HireStaff from "@/pages/HireStaff";
import JobsBoard from "@/pages/JobsBoard";
import CandidateProfile from "@/pages/CandidateProfile";
import StaffRegistry from "@/pages/StaffRegistry";
import RegistryPublic from "@/pages/RegistryPublic";
import Partners from "@/pages/Partners";
import SalonPublic from "@/pages/SalonPublic";
import MiracurlProducts from "@/pages/MiracurlProducts";
import EmployeePortal from "@/pages/EmployeePortal";
import DemoSlot from "@/pages/DemoSlot";
import PublicDemo from "@/pages/PublicDemo";
import { PlayerProvider } from "@/context/PlayerContext";
import Entertainment from "@/pages/Entertainment";
import { BrandSplash } from "@/components/BrandSplash";

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
  if (loading) return null;
  if (!user) return <Landing />;
  if (user.role === "super_admin") return <Navigate to="/super-admin" replace />;
  if (user.role === "staff") return <Navigate to="/staff-portal" replace />;
  return <Navigate to="/dashboard" replace />;
}

function SuperAdminProtected({ children }) {
  const { user, loading, refresh } = useAuth();
  if (loading) return null;
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
  if (loading) return null;
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
          <Routes>
            <Route path="/book/:slug" element={<BookPublic />} />
            <Route path="/rewards/:slug" element={<RewardsCampaign />} />
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
              <Route path="appointments" element={<Appointments />} />
              <Route path="customers" element={<AdminOnly><Customers /></AdminOnly>} />
              <Route path="staff" element={<OwnerOnly><Staff /></OwnerOnly>} />
              <Route path="registry" element={<OwnerOnly><StaffRegistry /></OwnerOnly>} />
              <Route path="attendance" element={<OwnerOnly><Attendance /></OwnerOnly>} />
              <Route path="services" element={<AdminOnly><Services /></AdminOnly>} />
              <Route path="inventory" element={<OwnerOnly><Inventory /></OwnerOnly>} />
              <Route path="pos" element={<AdminOnly><POS /></AdminOnly>} />
              <Route path="kitchen" element={<Kitchen />} />
              <Route path="reviews" element={<AdminOnly><Reviews /></AdminOnly>} />
              <Route path="offers-studio" element={<AdminOnly><OffersStudio /></AdminOnly>} />
              <Route path="refer" element={<OwnerOnly><ReferEarn /></OwnerOnly>} />
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
          </Routes>
          </PlayerProvider>
          </ErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}
