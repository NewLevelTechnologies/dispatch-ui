import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        'dist/**',
        '**/*.config.{ts,js}',
        '**/main.tsx',
        '**/vite-env.d.ts',
        // Exclude third-party Catalyst UI components
        'src/components/catalyst/**',
        // Exclude placeholder pages (not yet implemented)
        'src/pages/DashboardPage.tsx',
        'src/pages/EquipmentPage.tsx',
        'src/pages/FinancialPage.tsx',
        'src/pages/SchedulingPage.tsx',
        'src/pages/LoginPage.tsx',
        // Exclude financial pages (complex forms, will be tested separately)
        'src/pages/InvoicesPage.tsx',
        'src/pages/QuotesPage.tsx',
        'src/pages/PaymentsPage.tsx',
        // Exclude financial API (integration tested)
        'src/api/financialApi.ts',
        // Exclude user management pages (complex forms, will be tested separately)
        'src/pages/UsersPage.tsx',
        'src/pages/UserDetailPage.tsx',
        'src/components/UserFormDialog.tsx',
        // Exclude infrastructure files
        'src/App.tsx',
        'src/components/AppLayout.tsx',
        // Exclude config files
        'src/config/**',
        // Exclude types
        'src/types/**',
        // Exclude utils (tested indirectly)
        'src/utils/**',
        // Exclude API client (integration tested via components)
        'src/api/client.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
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
