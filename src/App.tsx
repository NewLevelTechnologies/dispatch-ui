import { useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { tenantSettingsApi, auditApi } from './api';
import { GlossaryProvider } from './contexts/GlossaryContext';
import { useTheme } from './components/ThemeProvider';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CustomersPage from './pages/CustomersPage';
import PayersPage from './pages/PayersPage';
import CustomerDetailPage from './pages/CustomerDetailPage';
import CustomerFormPage from './pages/CustomerFormPage';
import AgreementDetailPage from './pages/AgreementDetailPage';
import ServiceLocationsPage from './pages/ServiceLocationsPage';
import ServiceLocationDetailPage from './pages/ServiceLocationDetailPage';
import WorkOrdersPage from './pages/WorkOrdersPage';
import WorkOrderDetailPage from './pages/WorkOrderDetailPage';
import EquipmentPage from './pages/EquipmentPage';
import EquipmentDetailPage from './pages/EquipmentDetailPage';
import ReportsPage from './pages/ReportsPage';
import ReportDetailPage from './pages/ReportDetailPage';
import PartsInventoryPage from './pages/PartsInventoryPage';
import WarehousesPage from './pages/WarehousesPage';
import InvoicesPage from './pages/InvoicesPage';
import QuotesPage from './pages/QuotesPage';
import PaymentsPage from './pages/PaymentsPage';
import DispatchesPage from './pages/DispatchesPage';
import AvailabilityPage from './pages/AvailabilityPage';
import RecurringOrdersPage from './pages/RecurringOrdersPage';
import SchedulingPage from './pages/SchedulingPage';
import UsersPage from './pages/UsersPage';
import UserDetailPage from './pages/UserDetailPage';
import { UserInvitePage, UserEditPage } from './pages/UserFormPage';
import AddLocationPage from './pages/AddLocationPage';
import RolesPage from './pages/RolesPage';
import RoleDetailPage from './pages/RoleDetailPage';
import { RoleAddPage, RoleEditPage } from './pages/RoleFormPage';
import SettingsLayout from './pages/settings/SettingsLayout';
import CompanyProfilePanel from './pages/settings/CompanyProfilePanel';
import TerminologyPanel from './pages/settings/TerminologyPanel';
import NotificationTemplatesPanel from './pages/settings/NotificationTemplatesPanel';
import NotificationTemplateEditPage from './pages/settings/NotificationTemplateEditPage';
import DispatchRegionsPanel from './pages/settings/DispatchRegionsPanel';
import WorkOrderTypesPanel from './pages/settings/work-orders/WorkOrderTypesPanel';
import DivisionsPanel from './pages/settings/work-orders/DivisionsPanel';
import ItemStatusesPanel from './pages/settings/work-orders/ItemStatusesPanel';
import WorkflowsPage from './pages/settings/work-orders/WorkflowsPage';
import WorkflowEditorPage from './pages/settings/work-orders/WorkflowEditorPage';
import EquipmentTaxonomyPage from './pages/settings/equipment/EquipmentTaxonomyPage';
import FilterSizesPanel from './pages/settings/equipment/FilterSizesPanel';
import AccountSettingsPage from './pages/AccountSettingsPage';
import ApprovalsPage from './pages/ApprovalsPage';
import PublicInvoicePage from './pages/PublicInvoicePage';
import PublicQuotePage from './pages/PublicQuotePage';

// ProtectedRoute component - defined outside of App to avoid recreation on every render
const ProtectedRoute = ({ element, isAuthenticated }: { element: React.ReactElement; isAuthenticated: boolean }) => {
  return isAuthenticated ? element : <Navigate to="/login" replace />;
};

// Preserves the :id param when redirecting from old /roles/:id route to the new location.
const LegacyRolesRedirect = () => {
  const { id } = useParams();
  return <Navigate to={`/settings/access/roles/${id}`} replace />;
};

function App() {
  const { authStatus } = useAuthenticator((context) => [context.authStatus]);
  const queryClient = useQueryClient();
  // Sonner's `theme="system"` reads `prefers-color-scheme`, not our
  // `.theme-dark` class. Pass the resolved mode explicitly so toasts
  // re-tint immediately when the user toggles theme in Account settings.
  const { mode } = useTheme();

  // Clear React Query cache on logout to prevent showing old tenant's data
  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      queryClient.clear();
    }
  }, [authStatus, queryClient]);

  // After a successful sign-in, back-fill IP + User-Agent onto the most
  // recent SIGN_IN_SUCCESS audit row. Cognito's post-auth Lambda can't see
  // the originating request, so the backend reads them from the first
  // authenticated request instead. Fire only on the unauthenticated →
  // authenticated transition (not on 'configuring' → 'authenticated', which
  // is a token refresh on page reload — those rows already exist enriched).
  // 2s delay smooths over SNS→SQS propagation lag per backend guidance.
  const prevAuthStatus = useRef(authStatus);
  useEffect(() => {
    const wasUnauthenticated = prevAuthStatus.current === 'unauthenticated';
    prevAuthStatus.current = authStatus;
    if (wasUnauthenticated && authStatus === 'authenticated') {
      const t = setTimeout(() => {
        auditApi.enrichLatestSignIn().catch(() => {
          // 204 on success, anything else is non-fatal — the row stays
          // un-enriched but the user is signed in and the page works.
        });
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [authStatus]);

  // Load tenant settings (includes glossary)
  const { data: tenantSettings, isLoading: settingsLoading, error: settingsError } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.getSettings(),
    enabled: authStatus === 'authenticated',
    staleTime: 30 * 60 * 1000, // 30 minutes - settings change rarely, but should propagate reasonably fast
    retry: 2, // Retry failed requests twice before giving up
  });

  // Log error but continue with defaults (GlossaryProvider will fall back to GLOSSARY_DEFAULTS)
  if (settingsError) {
    console.error('Failed to load tenant settings:', settingsError);
  }

  // Show loading while checking auth OR loading settings
  if (authStatus === 'configuring' || (authStatus === 'authenticated' && settingsLoading)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  const isAuthenticated = authStatus === 'authenticated';

  return (
    <GlossaryProvider glossary={tenantSettings?.glossary}>
      <Toaster
        position="bottom-right"
        theme={mode === 'dark' ? 'dark' : 'light'}
        duration={4000}
        toastOptions={{
          classNames: {
            toast:
              'border border-border bg-bg-elev text-fg-strong shadow-md',
            title: 'text-fg-strong text-[13px] font-semibold',
            description: 'text-fg-muted text-[12px]',
            success: '!border-success-500/30',
            error: '!border-danger-500/30',
            info: '!border-info-500/30',
          },
        }}
      />
      <Routes>
      {/* Customer-facing share-link pages — outside ProtectedRoute (no auth
          required, the share token IS the auth) and intentionally ignore
          the GlossaryProvider context (these are unauthenticated viewers
          who don't share the tenant's glossary). */}
      <Route path="/p/invoice/:token" element={<PublicInvoicePage />} />
      <Route path="/p/quote/:token" element={<PublicQuotePage />} />
      <Route
        path="/login"
        element={
          authStatus === 'authenticated' ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <LoginPage />
          )
        }
      />
      <Route path="/dashboard" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<DashboardPage />} />} />
      <Route path="/customers" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<CustomersPage />} />} />
      <Route path="/payers" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<PayersPage />} />} />
      <Route path="/customers/new" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<CustomerFormPage />} />} />
      <Route path="/customers/:id" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<CustomerDetailPage />} />} />
      <Route path="/customers/:customerId/service-locations/new" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<AddLocationPage />} />} />
      <Route path="/agreements/:id" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<AgreementDetailPage />} />} />
      <Route path="/service-locations" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<ServiceLocationsPage />} />} />
      <Route path="/service-locations/new" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<AddLocationPage />} />} />
      <Route path="/service-locations/:id" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<ServiceLocationDetailPage />} />} />
      <Route path="/work-orders" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<WorkOrdersPage />} />} />
      <Route path="/work-orders/:id" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<WorkOrderDetailPage />} />} />
      <Route path="/equipment" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<EquipmentPage />} />} />
      <Route path="/equipment/:id" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<EquipmentDetailPage />} />} />
      <Route path="/reports" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<ReportsPage />} />} />
      <Route path="/reports/:slug" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<ReportDetailPage />} />} />
      <Route path="/parts-inventory" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<PartsInventoryPage />} />} />
      <Route path="/warehouses" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<WarehousesPage />} />} />
      <Route path="/invoices" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<InvoicesPage />} />} />
      <Route path="/quotes" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<QuotesPage />} />} />
      <Route path="/payments" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<PaymentsPage />} />} />
      <Route path="/dispatches" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<DispatchesPage />} />} />
      <Route path="/availability" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<AvailabilityPage />} />} />
      <Route path="/recurring-orders" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<RecurringOrdersPage />} />} />
      <Route path="/scheduling" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<SchedulingPage />} />} />
      <Route path="/approvals" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<ApprovalsPage />} />} />
      {/* Legacy redirects: /roles moved under /settings/access */}
      <Route path="/roles" element={<Navigate to="/settings/access/roles" replace />} />
      <Route path="/roles/:id" element={<LegacyRolesRedirect />} />
      <Route path="/settings" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<SettingsLayout />} />}>
        <Route index element={<Navigate to="/settings/company-profile" replace />} />
        <Route path="general" element={<Navigate to="/settings/company-profile" replace />} />
        <Route path="company-profile" element={<CompanyProfilePanel />} />
        <Route path="terminology" element={<TerminologyPanel />} />
        <Route path="notifications" element={<NotificationTemplatesPanel />} />
        <Route path="notifications/:id" element={<NotificationTemplateEditPage />} />
        <Route path="notification-templates" element={<Navigate to="/settings/notifications" replace />} />
        <Route path="dispatch-regions" element={<DispatchRegionsPanel />} />
        <Route path="work-orders/types" element={<WorkOrderTypesPanel />} />
        <Route path="work-orders/divisions" element={<DivisionsPanel />} />
        <Route path="work-orders/item-statuses" element={<ItemStatusesPanel />} />
        <Route path="work-orders/workflows" element={<WorkflowsPage />} />
        <Route path="work-orders/workflows/:id" element={<WorkflowEditorPage />} />
        <Route
          path="work-orders/status-workflows"
          element={<Navigate to="/settings/work-orders/workflows" replace />}
        />
        <Route
          path="work-orders/workflow-config"
          element={<Navigate to="/settings/work-orders/workflows" replace />}
        />
        <Route path="equipment/types" element={<EquipmentTaxonomyPage />} />
        <Route
          path="equipment/categories"
          element={<Navigate to="/settings/equipment/types" replace />}
        />
        <Route path="equipment/filter-sizes" element={<FilterSizesPanel />} />
        <Route path="access/users" element={<UsersPage />} />
        <Route path="access/users/new" element={<UserInvitePage />} />
        <Route path="access/users/:id" element={<UserDetailPage />} />
        <Route path="access/users/:id/edit" element={<UserEditPage />} />
        <Route path="access/roles" element={<RolesPage />} />
        <Route path="access/roles/new" element={<RoleAddPage />} />
        <Route path="access/roles/:id" element={<RoleDetailPage />} />
        <Route path="access/roles/:id/edit" element={<RoleEditPage />} />
      </Route>
      <Route path="/account/settings" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<AccountSettingsPage />} />} />
      <Route
        path="/"
        element={
          authStatus === 'authenticated' ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      </Routes>
    </GlossaryProvider>
  );
}

export default App;
