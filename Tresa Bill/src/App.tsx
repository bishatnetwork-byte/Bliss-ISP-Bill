import { Toaster } from "@/components/ui/toaster";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { GoogleOAuthProvider } from '@react-oauth/google';
import type React from 'react';
import { useEffect } from 'react';
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { Toaster as SonnerToaster } from "sonner";
import { AuthProvider, OwnerRoute, PermissionRoute, ProtectedRoute, useAuth } from './lib/auth';
import PageNotFound from './lib/PageNotFound';

import ForgotPassword from './pages/Auth/ForgotPassword';
import GoogleCallback from './pages/Auth/GoogleCallback';
import Login from './pages/Auth/Login';
import ResetPassword from './pages/Auth/ResetPassword';
import SetPassword from './pages/Auth/SetPassword';
import Signup from './pages/Auth/Signup';
import CaptiveIndex from './pages/CaptivePages/index';
import CaptivePreview from './pages/CaptivePages/preview_page';
import HotspotPages from './pages/CaptivePages/HotspotPages';
import BranchesPage from './pages/Branches';
import Dashboard from './pages/Dashboard';
import MessagesPage from './pages/Messages';
import Networks from './pages/Networks/index';
import NotificationsPage from './pages/Notifications';
import RemoteAccess from './pages/Networks/RemoteAccess';
import ProfilePage from './pages/ProfilePage';
import ConfigureRouter from './pages/Routers/ConfigureRouter';
import RouterPackages from './pages/Routers/Packages';
import RoutersIndex from './pages/Routers/index';
import SetUpProvison from './pages/SetUpProvision/SetUpProvison';
import SalesIndex from './pages/Sales/index';
import CustomerDetail from './pages/Sales/CustomerDetail';
import Withdrawal from './pages/Sales/Withdrawal';
import SupportsIndex from './pages/Supports/index';
import VouchersIndex from './pages/Vouchers/index';
import ActiveUsersPage from './pages/Vouchers/ActiveUsers';
import { renultApi } from './api/foreform';

/* ── settings sub-pages ── */
import MyDetailsPage from "./pages/Settings/MyDetails";
import PasswordPage from "./pages/Settings/Password";

import BillingPage from "./pages/Settings/Billing";
import Campign from "./pages/Settings/Campign";
import SettingsPage from "./pages/Settings/Settings";
import WalletManagementPage from "./pages/Settings/WalletManagement";
import RouterLogsPage from "./pages/Settings/RouterLogs";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: true,
    },
  },
});

const protectedElement = (element: React.ReactNode) => (
  <ProtectedRoute>{element}</ProtectedRoute>
);

function AccountLoadingProgress() {
  const { isLoading } = useAuth();

  if (!isLoading) return null;

  return (
    <>
      <style>{`
        @keyframes account-loading-progress {
          0% { transform: translateX(-100%) scaleX(0.35); }
          55% { transform: translateX(45%) scaleX(0.7); }
          100% { transform: translateX(220%) scaleX(0.35); }
        }
      `}</style>
      <div className="fixed inset-x-0 top-0 z-[200] h-1 overflow-hidden text-primary" role="progressbar" aria-label="Loading account">
        <div
          className="h-full w-1/2 origin-left bg-current"
          style={{ animation: "account-loading-progress 1.15s ease-in-out infinite" }}
        />
      </div>
    </>
  );
}

function VoucherSyncAgent() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let running = false;
    const reconcile = async () => {
      const branchId = localStorage.getItem("selected-workspace");
      if (!branchId || running) return;
      running = true;
      try {
        const routers = await renultApi.routers.list(branchId);
        await Promise.allSettled(
          routers.filter((router) => router.is_active).map((router) => renultApi.packages.fetchVouchers(router.id)),
        );
        queryClient.invalidateQueries({ queryKey: ["branchVouchers", branchId] });
        queryClient.invalidateQueries({ queryKey: ["voucherSupportSummary", branchId] });
      } catch {
        // Router reconciliation is best-effort and should never interrupt the UI.
      } finally {
        running = false;
      }
    };

    const initial = window.setTimeout(reconcile, 5000);
    const interval = window.setInterval(reconcile, 60000);
    window.addEventListener("renult-branch-change", reconcile);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("renult-branch-change", reconcile);
    };
  }, [queryClient]);

  return null;
}

const AppRoutes = () => {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/set-password" element={<SetPassword />} />
        <Route path="/auth/google/callback" element={<GoogleCallback />} />
        <Route path="/google/callback" element={<GoogleCallback />} />

        <Route path="/" element={protectedElement(<Dashboard />)} />
        <Route path="/profile" element={protectedElement(<ProfilePage />)} />
        <Route path="/captive-portals" element={protectedElement(<PermissionRoute permission="captive"><HotspotPages /></PermissionRoute>)} />
        <Route path="/captive-portals/customize" element={protectedElement(<PermissionRoute permission="captive"><CaptiveIndex /></PermissionRoute>)} />
        <Route path="/captive-portals/preview" element={protectedElement(<PermissionRoute permission="captive"><CaptivePreview /></PermissionRoute>)} />
        <Route path="/network" element={protectedElement(<PermissionRoute permission="network"><Networks /></PermissionRoute>)} />
        <Route path="/voucher-support" element={protectedElement(<PermissionRoute permission="support"><SupportsIndex /></PermissionRoute>)} />
        <Route path="/messages" element={protectedElement(<PermissionRoute permission="support"><MessagesPage /></PermissionRoute>)} />
        <Route path="/sales" element={protectedElement(<PermissionRoute permission="sales"><SalesIndex /></PermissionRoute>)} />
        <Route path="/sales/customer/:phone" element={protectedElement(<PermissionRoute permission="sales"><CustomerDetail /></PermissionRoute>)} />
        <Route path="/vouchers" element={protectedElement(<PermissionRoute permission="vouchers"><VouchersIndex /></PermissionRoute>)} />
        <Route path="/vouchers/active-users" element={protectedElement(<PermissionRoute permission="vouchers"><ActiveUsersPage /></PermissionRoute>)} />
        <Route path="/router" element={protectedElement(<PermissionRoute permission="routers"><RoutersIndex /></PermissionRoute>)} />
        <Route path="/router/configure" element={protectedElement(<PermissionRoute permission="routers"><ConfigureRouter /></PermissionRoute>)} />
        <Route path="/router/setup" element={protectedElement(<PermissionRoute permission="routers"><SetUpProvison /></PermissionRoute>)} />
        <Route path="/packages" element={protectedElement(<PermissionRoute permission="routers"><RouterPackages /></PermissionRoute>)} />
        <Route path="/withdraw" element={protectedElement(<OwnerRoute><Withdrawal /></OwnerRoute>)} />
        <Route path="/withdrawals" element={protectedElement(<OwnerRoute><Withdrawal /></OwnerRoute>)} />
        <Route path="/remote-access" element={protectedElement(<PermissionRoute permission="network"><RemoteAccess /></PermissionRoute>)} />
        <Route path="/branches" element={protectedElement(<OwnerRoute><BranchesPage /></OwnerRoute>)} />
        <Route path="/notifications" element={protectedElement(<NotificationsPage />)} />

        {/* ── settings routes ── */}
        <Route path="/settings" element={protectedElement(<OwnerRoute><MyDetailsPage /></OwnerRoute>)} />
        <Route path="/settings/password" element={protectedElement(<OwnerRoute><PasswordPage /></OwnerRoute>)} />

        <Route path="/settings/billing" element={protectedElement(<OwnerRoute><BillingPage /></OwnerRoute>)} />
        <Route path="/settings/wallet" element={protectedElement(<OwnerRoute><WalletManagementPage /></OwnerRoute>)} />
        <Route path="/settings/router-logs" element={protectedElement(<OwnerRoute><RouterLogsPage /></OwnerRoute>)} />
        <Route path="/settings/notifications" element={protectedElement(<OwnerRoute><SettingsPage /></OwnerRoute>)} />
        <Route path="/settings/support" element={protectedElement(<OwnerRoute><Campign /></OwnerRoute>)} />
        <Route path="/campaigns" element={protectedElement(<Campign />)} />

        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </>
  );
};

function App() {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || ""}>
      <QueryClientProvider client={queryClient}>
        <Router future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <AuthProvider>
            <AccountLoadingProgress />
            <VoucherSyncAgent />
            <AppRoutes />
          </AuthProvider>
        </Router>
        <Toaster />
        <SonnerToaster richColors position="top-center" className="rounded-none shadow-none" />
      </QueryClientProvider>
    </GoogleOAuthProvider>
  );
}

export default App
