import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import './index.css';
import './config/amplify';
import './i18n/config';
import App from './App';
import { ThemeProvider } from './contexts/ThemeContext';

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
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <Authenticator.Provider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </Authenticator.Provider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>
);
