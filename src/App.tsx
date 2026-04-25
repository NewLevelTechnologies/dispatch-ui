import { useEffect } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantSettingsApi } from './api';
import { GlossaryProvider } from './contexts/GlossaryContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CustomersPage from './pages/CustomersPage';
import CustomerDetailPage from './pages/CustomerDetailPage';
import ServiceLocationsPage from './pages/ServiceLocationsPage';
import ServiceLocationDetailPage from './pages/ServiceLocationDetailPage';
import WorkOrdersPage from './pages/WorkOrdersPage';
import EquipmentPage from './pages/EquipmentPage';
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
import RolesPage from './pages/RolesPage';
import RoleDetailPage from './pages/RoleDetailPage';
import SettingsLayout from './pages/settings/SettingsLayout';
import GeneralPanel from './pages/settings/GeneralPanel';
import TerminologyPanel from './pages/settings/TerminologyPanel';
import NotificationTemplatesPanel from './pages/settings/NotificationTemplatesPanel';
import DispatchRegionsPanel from './pages/settings/DispatchRegionsPanel';
import WorkOrderTypesPanel from './pages/settings/work-orders/WorkOrderTypesPanel';
import DivisionsPanel from './pages/settings/work-orders/DivisionsPanel';
import ItemStatusesPanel from './pages/settings/work-orders/ItemStatusesPanel';
import StatusWorkflowsPanel from './pages/settings/work-orders/StatusWorkflowsPanel';
import WorkflowConfigPanel from './pages/settings/work-orders/WorkflowConfigPanel';
import AccountSettingsPage from './pages/AccountSettingsPage';

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

  // Clear React Query cache on logout to prevent showing old tenant's data
  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      queryClient.clear();
    }
  }, [authStatus, queryClient]);

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
      <Routes>
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
      <Route path="/customers/:id" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<CustomerDetailPage />} />} />
      <Route path="/service-locations" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<ServiceLocationsPage />} />} />
      <Route path="/service-locations/:id" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<ServiceLocationDetailPage />} />} />
      <Route path="/work-orders" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<WorkOrdersPage />} />} />
      <Route path="/equipment" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<EquipmentPage />} />} />
      <Route path="/parts-inventory" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<PartsInventoryPage />} />} />
      <Route path="/warehouses" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<WarehousesPage />} />} />
      <Route path="/invoices" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<InvoicesPage />} />} />
      <Route path="/quotes" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<QuotesPage />} />} />
      <Route path="/payments" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<PaymentsPage />} />} />
      <Route path="/dispatches" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<DispatchesPage />} />} />
      <Route path="/availability" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<AvailabilityPage />} />} />
      <Route path="/recurring-orders" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<RecurringOrdersPage />} />} />
      <Route path="/scheduling" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<SchedulingPage />} />} />
      <Route path="/users" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<UsersPage />} />} />
      <Route path="/users/:id" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<UserDetailPage />} />} />
      {/* Legacy redirects: /roles moved under /settings/access */}
      <Route path="/roles" element={<Navigate to="/settings/access/roles" replace />} />
      <Route path="/roles/:id" element={<LegacyRolesRedirect />} />
      <Route path="/settings" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<SettingsLayout />} />}>
        <Route index element={<Navigate to="/settings/general" replace />} />
        <Route path="general" element={<GeneralPanel />} />
        <Route path="terminology" element={<TerminologyPanel />} />
        <Route path="notification-templates" element={<NotificationTemplatesPanel />} />
        <Route path="dispatch-regions" element={<DispatchRegionsPanel />} />
        <Route path="work-orders/types" element={<WorkOrderTypesPanel />} />
        <Route path="work-orders/divisions" element={<DivisionsPanel />} />
        <Route path="work-orders/item-statuses" element={<ItemStatusesPanel />} />
        <Route path="work-orders/status-workflows" element={<StatusWorkflowsPanel />} />
        <Route path="work-orders/workflow-config" element={<WorkflowConfigPanel />} />
        <Route path="access/roles" element={<RolesPage />} />
        <Route path="access/roles/:id" element={<RoleDetailPage />} />
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
