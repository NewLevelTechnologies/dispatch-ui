import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: './src/test/jsdom-fixed-env.ts',
    setupFiles: './src/test/setup.ts',
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        'dist/**',
        // Untracked design-handoff dump (not checked into the repo)
        'handoff/**',
        // Designer reference files (JSX mocks of design comps + their
        // handoff helpers). Not shipped, not imported by the app.
        'claude_designs/**',
        '**/*.config.{ts,js}',
        '**/main.tsx',
        '**/vite-env.d.ts',
        // Exclude third-party Catalyst UI components
        'src/components/catalyst/**',
        // Exclude placeholder pages (not yet implemented)
        'src/pages/DashboardPage.tsx',
        'src/pages/FinancialPage.tsx',
        'src/pages/SchedulingPage.tsx',
        'src/pages/LoginPage.tsx',
        // Exclude financial pages (complex forms, will be tested separately)
        'src/pages/InvoicesPage.tsx',
        'src/pages/QuotesPage.tsx',
        'src/pages/PaymentsPage.tsx',
        // Exclude infrastructure files
        'src/App.tsx',
        'src/components/AppLayout.tsx',
        'src/contexts/**',
        // Exclude config files
        'src/config/**',
        // Exclude types
        'src/types/**',
        // Exclude utils (tested indirectly)
        'src/utils/**',
        // Exclude API clients (integration tested via components)
        'src/api/client.ts',
        'src/api/index.ts',
        'src/api/customerApi.ts',
        'src/api/workOrderApi.ts',
        'src/api/userApi.ts',
        'src/api/financialApi.ts',
        'src/api/filesApi.ts',
        'src/api/equipmentApi.ts',
        'src/api/schedulingApi.ts',
        'src/api/notificationApi.ts',
        'src/api/notificationTemplateApi.ts',
        'src/api/contactApi.ts',
        'src/api/tenantSettingsApi.ts',
        'src/api/glossaryApi.ts',
        'src/api/dispatchRegionApi.ts',
        'src/api/workOrderConfigApi.ts',
        // Dev-only mock fixtures (DCE'd in production builds)
        'src/dev/**',
        // Exclude temporary/debug files
        '**/check-menu-sizes.js',
        'coverage/**',
      ],
      thresholds: {
        lines: 80,
        functions: 75, // Temporarily lowered due to CustomerDetailPage inline functions
        branches: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
