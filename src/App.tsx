import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthenticator } from '@aws-amplify/ui-react';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CustomersPage from './pages/CustomersPage';
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

// ProtectedRoute component - defined outside of App to avoid recreation on every render
const ProtectedRoute = ({ element, isAuthenticated }: { element: React.ReactElement; isAuthenticated: boolean }) => {
  return isAuthenticated ? element : <Navigate to="/login" replace />;
};

function App() {
  const { authStatus } = useAuthenticator((context) => [context.authStatus]);

  // Show loading while checking auth status
  if (authStatus === 'configuring') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  const isAuthenticated = authStatus === 'authenticated';

  return (
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
  );
}

export default App;
