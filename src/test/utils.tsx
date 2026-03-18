import type { ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';

// Create a custom render function that includes providers
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient;
  routes?: RouteObject[];
  initialPath?: string;
  // Backward compatibility
  initialEntries?: string[];
  path?: string;
}

export function renderWithProviders(
  ui: ReactElement,
  {
    queryClient = createTestQueryClient(),
    routes,
    initialPath = '/',
    initialEntries,
    path,
    ...renderOptions
  }: CustomRenderOptions = {}
) {
  // Support both new (initialPath) and old (initialEntries) parameter styles
  const routerInitialEntries = initialEntries || [initialPath];

  // Create a memory router with custom routes or default route structure
  const defaultRoutes: RouteObject[] = [
    {
      path: '/',
      element: ui,
    },
    {
      path: '/roles',
      element: <div>Roles List</div>,
    },
    {
      path: '/roles/:id',
      element: ui, // Render the component being tested for detail routes
    },
    {
      path: '*',
      element: ui,
    },
  ];

  const router = createMemoryRouter(routes || defaultRoutes, {
    initialEntries: routerInitialEntries,
  });

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  return {
    ...render(<RouterProvider router={router} />, { wrapper: Wrapper, ...renderOptions }),
    queryClient,
    router,
  };
}

// Re-export everything from testing-library
// eslint-disable-next-line react-refresh/only-export-components
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
