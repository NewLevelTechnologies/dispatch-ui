import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { COVERAGE_THRESHOLDS } from '../../coverage-thresholds.mjs';

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
        '**/*.config.{ts,js}',
        '**/main.tsx',
        '**/vite-env.d.ts',
        // Exclude third-party Catalyst UI components
        'src/components/catalyst/**',
        // Exclude placeholder pages (not yet implemented)
        'src/pages/DashboardPage.tsx',
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
        // Exclude utils (tested indirectly)
        'src/utils/**',
        // The api layer now lives in @dispatch/api and is gated by that
        // package's own thresholds. src/api holds only setup.ts.
        // Dev-only mock fixtures (DCE'd in production builds)
        'src/dev/**',
        // Exclude temporary/debug files
        '**/check-menu-sizes.js',
        'coverage/**',
      ],
      thresholds: COVERAGE_THRESHOLDS,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
