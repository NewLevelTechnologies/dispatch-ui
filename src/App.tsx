import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthenticator } from '@aws-amplify/ui-react';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CustomersPage from './pages/CustomersPage';
import WorkOrdersPage from './pages/WorkOrdersPage';
import EquipmentPage from './pages/EquipmentPage';
import InvoicesPage from './pages/InvoicesPage';
import QuotesPage from './pages/QuotesPage';
import PaymentsPage from './pages/PaymentsPage';
import SchedulingPage from './pages/SchedulingPage';

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
      <Route path="/invoices" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<InvoicesPage />} />} />
      <Route path="/quotes" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<QuotesPage />} />} />
      <Route path="/payments" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<PaymentsPage />} />} />
      <Route path="/scheduling" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<SchedulingPage />} />} />
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
