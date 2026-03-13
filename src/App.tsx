import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthenticator } from '@aws-amplify/ui-react';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CustomersPage from './pages/CustomersPage';

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
      <Route
        path="/dashboard"
        element={
          authStatus === 'authenticated' ? (
            <DashboardPage />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/customers"
        element={
          authStatus === 'authenticated' ? (
            <CustomersPage />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
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
