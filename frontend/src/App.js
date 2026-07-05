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
import ReviewPublic from "@/pages/ReviewPublic";
import SuperAdmin from "@/pages/SuperAdmin";
import SignupSalon from "@/pages/SignupSalon";
import Landing from "@/pages/Landing";
import Settings from "@/pages/Settings";
import Assistant from "@/pages/Assistant";
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
import StaffRegistry from "@/pages/StaffRegistry";
import RegistryPublic from "@/pages/RegistryPublic";

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
  if (user?.role === "manager") return <Navigate to="/dashboard" replace />;
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
          <Routes>
            <Route path="/book/:slug" element={<BookPublic />} />
            <Route path="/staff-registry" element={<RegistryPublic />} />
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
              <Route path="gallery" element={<OwnerOnly><Gallery /></OwnerOnly>} />
              <Route path="messages" element={<OwnerOnly><Messages /></OwnerOnly>} />
              <Route path="plans" element={<OwnerOnly><Plans /></OwnerOnly>} />
              <Route path="settings" element={<OwnerOnly><Settings /></OwnerOnly>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </ErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}
