import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { COVERAGE_THRESHOLDS } from '../../coverage-thresholds.mjs';

export default defineConfig({
  plugins: [react()],
  // Mirrors the `define` in vite.config.ts. Vitest does not read that file, so
  // without this the build-time literal is undefined and any component
  // rendering it throws a ReferenceError. Fixed, so snapshots cannot drift by
  // the day they run.
  define: {
    __BUILD_DATE__: JSON.stringify('2026-01-01'),
  },
  test: {
    globals: true,
    environment: './src/test/jsdom-fixed-env.ts',
    setupFiles: './src/test/setup.ts',
    css: true,

    // Vitest defaults to 5000ms, which this suite has outgrown.
    //
    // The form-heavy tests drive long userEvent sequences, dispatching per
    // keystroke with a React re-render each time. Measured locally *under
    // coverage*, several sit just under the default with no margin left:
    //
    //   CustomerFormDialog  all form fields ............. 4770ms
    //   WorkOrderIntakePage one contact channel ......... 4027ms
    //   WorkOrderIntakePage standardized address ........ 3926ms
    //   CustomerFormPage    separate billing ............ 3809ms
    //
    // CI roughly doubles those: 171 files share a couple of runner cores, and
    // coverage instrumentation adds its own overhead — the full run takes ~800s
    // of test time there versus ~50s locally. A 4770ms test on a 5000ms budget
    // is not flaky by luck, it is a failure waiting for a slow runner, and
    // patching whichever one fails first just relocates the problem (see #385,
    // then CustomerFormPage failing next).
    //
    // 15s gives roughly 3x headroom over the slowest default-timeout test while
    // still surfacing a genuinely hung test quickly. The three heaviest tests in
    // WorkOrderIntakePage keep their explicit 30s — they exceed even this.
    testTimeout: 15_000,
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
