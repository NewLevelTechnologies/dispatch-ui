import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import './index.css';
import './config/amplify';
import './api/setup'; // Configure API client with Amplify auth
import '@dispatch/i18n'; // Initialize i18n
import App from './App';
import { ThemeProvider } from './components/ThemeProvider';
import { TenantProvider } from './contexts/TenantContext';

// Create a React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Authenticator.Provider>
        {/* Above App: App's own tenant-scoped queries (settings, glossary) have
            to wait on the workspace this resolves, or a multi-tenant person
            loads one workspace's glossary into another's session. */}
        <TenantProvider>
          <ThemeProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ThemeProvider>
        </TenantProvider>
      </Authenticator.Provider>
    </QueryClientProvider>
  </StrictMode>
);
