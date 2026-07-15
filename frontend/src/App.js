import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import "@/App.css";
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
import Reviews from "@/pages/Reviews";
import OffersStudio from "@/pages/OffersStudio";
import BookPublic from "@/pages/BookPublic";
import PartnerLanding from "@/pages/PartnerLanding";
import SuccessStories from "@/pages/SuccessStories";
import MiraAIStudio from "@/pages/MiraAIStudio";
import StaffActivities from "@/pages/StaffActivities";
import ResetPassword from "@/pages/ResetPassword";
import ReviewPublic from "@/pages/ReviewPublic";
import SuperAdmin from "@/pages/SuperAdmin";
import SignupSalon from "@/pages/SignupSalon";
import Landing from "@/pages/Landing";
import Settings from "@/pages/Settings";
import Assistant from "@/pages/Assistant";
import MiraStudio from "@/pages/MiraStudio";
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
import EmployeePortal from "@/pages/EmployeePortal";
import DemoSlot from "@/pages/DemoSlot";
import { PlayerProvider } from "@/context/PlayerContext";
import Entertainment from "@/pages/Entertainment";

function Protected({ children }) {
  const { user, loading, refresh } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base">
        <div className="text-gold font-playfair text-2xl animate-pulse">Miracurl</div>
      </div>
    );
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
  if (loading) return null;
  if (user) {
    if (user.role === "super_admin") return <Navigate to="/super-admin" replace />;
    if (user.role === "staff") return <Navigate to="/staff-portal" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

export default function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <ManifestSwitcher />
          <MicroInteractions />
          <Toaster theme="dark" position="top-right" toastOptions={TOAST_OPTIONS} />
          <ErrorBoundary>
          <PlayerProvider>
          <Routes>
            <Route path="/book/:slug" element={<BookPublic />} />
            <Route path="/salon/:slug" element={<SalonPublic />} />
            <Route path="/employee" element={<EmployeePortal />} />
            <Route path="/demo-slot/:iid" element={<DemoSlot />} />
            <Route path="/partner" element={<PartnerLanding />} />
            <Route path="/success-stories" element={<SuccessStories />} />
            <Route path="/mira.ai" element={<MiraAIStudio />} />
            <Route path="/mira-ai" element={<MiraAIStudio />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/staff-registry" element={<RegistryPublic />} />
            <Route path="/partners" element={<Partners />} />
            <Route path="/book" element={<SalonFinder />} />
            <Route path="/review/:token" element={<ReviewPublic />} />
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/signup-salon" element={<PublicOnly><SignupSalon /></PublicOnly>} />
            <Route path="/super-admin" element={<SuperAdminProtected><SuperAdmin /></SuperAdminProtected>} />
            <Route path="/" element={<RootRoute />} />
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
              <Route path="reviews" element={<AdminOnly><Reviews /></AdminOnly>} />
              <Route path="offers-studio" element={<AdminOnly><OffersStudio /></AdminOnly>} />
              <Route path="refer" element={<OwnerOnly><ReferEarn /></OwnerOnly>} />
              <Route path="reports" element={<OwnerOnly><Reports /></OwnerOnly>} />
              <Route path="assistant" element={<OwnerOnly><Assistant /></OwnerOnly>} />
              <Route path="mira-studio" element={<OwnerOnly><MiraStudio /></OwnerOnly>} />
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
