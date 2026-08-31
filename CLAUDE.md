# Dispatch Monorepo

This is the **root documentation** for the Dispatch monorepo, which contains both the web and mobile applications plus shared packages.

---

## 🚧 WORK IN PROGRESS - MONOREPO MIGRATION 🚧

**Status**: Phases 1–4 & 7 complete. Remaining: mobile scaffold (Phase 5), docs polish (Phase 8).

**TODO:**
- [ ] Document mobile app once created (Phase 5)
- [ ] Final documentation polish (Phase 8)

---

## Repository Structure

```
dispatch/
├── apps/
│   ├── web/                    # React web application (Vite + React + TypeScript)
│   │   ├── src/
│   │   ├── CLAUDE.md           # ← Web app specific documentation
│   │   └── package.json
│   └── mobile/                 # React Native mobile app (coming soon)
│       └── ...
├── packages/
│   ├── api/                    # 🚧 Shared API client and services
│   │   ├── src/
│   │   │   ├── client.ts       # Platform-agnostic API client
│   │   │   ├── customerApi.ts  # Customer API service
│   │   │   └── ...
│   │   └── package.json
│   ├── types/                  # 🚧 Shared TypeScript types
│   │   ├── src/
│   │   │   └── index.ts        # Domain types (Customer, WorkOrder, etc.)
│   │   └── package.json
│   └── utils/                  # 🚧 Shared utilities
│       ├── src/
│       │   ├── formatters.ts   # Date, currency, phone formatters
│       │   └── index.ts
│       └── package.json
├── package.json                # Root workspace configuration
├── pnpm-workspace.yaml         # Workspace definition
└── turbo.json                  # Turborepo pipeline configuration
```

---

## Technology Stack

### Monorepo Tools
- **Package Manager**: pnpm 8.15.9 (workspaces)
- **Build System**: Turborepo 2.10.11 (caching, orchestration)
- **Language**: TypeScript 5.9.3

### Applications
- **Web**: Vite + React 19 + TypeScript + Tailwind CSS 4 + Catalyst UI
- **Mobile**: React Native + Expo (coming soon)

### Shared Packages
- **API**: Axios + platform-agnostic auth provider pattern
- **Types**: TypeScript interfaces for domain models
- **Utils**: Shared business logic (formatters, validators, etc.)

---

## Quick Start

### Install Dependencies

```bash
# Install pnpm globally (if not already installed)
npm install -g pnpm

# Install all dependencies (root + all packages)
pnpm install
```

### Development Commands

```bash
# Run all apps
pnpm dev

# Run specific app
pnpm web:dev          # Web app only
pnpm mobile:dev       # Mobile app only (when ready)

# Build all apps
pnpm build

# Build specific app
pnpm turbo run build --filter=web
pnpm turbo run build --filter=mobile

# Run tests
pnpm test             # All packages
pnpm turbo run test --filter=web

# Lint
pnpm lint             # All packages

# Clean everything
pnpm clean
```

---

## Working with Shared Packages

### Importing from Shared Packages

```typescript
// In apps/web or apps/mobile

// Import types
import type { Customer, WorkOrder, ServiceLocation } from '@dispatch/types';

// Import API services
import { customerApi, workOrderApi } from '@dispatch/api';

// Import utilities
import { formatDate, formatCurrency, formatPhone } from '@dispatch/utils';
```

### Platform-Specific API Setup

Shared packages are **platform-agnostic**. Each app provides its own auth configuration.

**Web app** (`apps/web/src/api/setup.ts`):
```typescript
import { apiClient } from '@dispatch/api';
import { fetchAuthSession } from 'aws-amplify/auth';

// Configure with Amplify auth
apiClient.setAuthProvider({
  getAccessToken: async () => {
    const session = await fetchAuthSession();
    return session.tokens?.accessToken?.toString() || null;
  },
});

// Re-export everything
export * from '@dispatch/api';
```

**Mobile app** (`apps/mobile/src/api/setup.ts` - coming soon):
```typescript
import { apiClient } from '@dispatch/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configure with mobile auth
apiClient.setAuthProvider({
  getAccessToken: async () => {
    return await AsyncStorage.getItem('auth_token');
  },
});

// Re-export everything
export * from '@dispatch/api';
```

### Adding Dependencies

```bash
# Add to specific app
pnpm --filter web add react-query

# Add to shared package
pnpm --filter @dispatch/api add axios

# Add to root (workspace dev dependencies)
pnpm add -Dw typescript
```

---

## Branching Strategy

### ⚠️ CRITICAL: NEVER PUSH DIRECTLY TO DEV ⚠️

**Always use feature branches:**

```bash
# 1. Create feature branch from dev
git checkout dev
git pull origin dev
git checkout -b feat/your-feature-name

# 2. Make changes and commit
git add .
git commit -m "Your message"

# 3. Push feature branch
git push -u origin feat/your-feature-name

# 4. Create PR targeting dev
gh pr create --base dev --title "Your PR title"
```

**Branch workflow:**
```
dev (default) ──→ qa ──→ main (production)
```

---

## CI/CD

### GitHub Actions Workflows

**PR Checks** (`.github/workflows/pr-checks.yml`):
- Uses pnpm for package management
- Runs `pnpm turbo run lint`
- Runs `pnpm turbo run test`
- Runs `pnpm turbo run build`

**Deploy Web** (`.github/workflows/deploy.yml`):
- Triggers on push to `dev` (with path filters)
- Builds web app: `pnpm turbo run build --filter=web`
- Deploys `apps/web/dist/` to S3
- Invalidates CloudFront cache

### Path Filters

Workflows only run when relevant code changes:

```yaml
paths:
  - 'apps/web/**'       # Web app code
  - 'packages/**'       # Shared packages
  - '.github/workflows/deploy.yml'
```

This prevents deploying web when only mobile code changes.

---

## Turborepo Caching

Turborepo caches task outputs to speed up builds.

**First run:**
```bash
pnpm turbo run build
# ✓ packages/types:build   (10s)
# ✓ packages/utils:build   (5s)
# ✓ packages/api:build     (8s)
# ✓ apps/web:build         (45s)
# Total: 68s
```

**Second run (no changes):**
```bash
pnpm turbo run build
# ✓ packages/types:build   (CACHED)
# ✓ packages/utils:build   (CACHED)
# ✓ packages/api:build     (CACHED)
# ✓ apps/web:build         (CACHED)
# Total: 0.5s
```

**Partial changes (only web UI changed):**
```bash
pnpm turbo run build
# ✓ packages/types:build   (CACHED)
# ✓ packages/utils:build   (CACHED)
# ✓ packages/api:build     (CACHED)
# ✓ apps/web:build         (45s)
# Total: 45s
```

---

## App-Specific Documentation

- **Web App**: See [apps/web/CLAUDE.md](./apps/web/CLAUDE.md)
  - React patterns, Catalyst UI, CSR optimization
  - Glossary integration, i18n, authentication
  - Testing, linting, troubleshooting
- **Mobile App**: Coming soon

---

## Monorepo Conventions

### Package Naming

- Apps: Simple names (`web`, `mobile`)
- Packages: Scoped with `@dispatch/` prefix (`@dispatch/api`, `@dispatch/types`)

### Import Paths

```typescript
// ✅ Correct - Import from package name
import { Customer } from '@dispatch/types';
import { customerApi } from '@dispatch/api';

// ❌ Wrong - Don't use relative paths across packages
import { Customer } from '../../../packages/types/src';
```

### TypeScript Configuration

- Root `tsconfig.json` (if needed for IDE)
- Each package has its own `tsconfig.json`
- Web app has its own `tsconfig.json` (Vite-specific)

### Code Sharing Guidelines

**✅ Share in packages:**
- API service layer (axios calls, endpoints)
- Domain types (Customer, WorkOrder, etc.)
- Business logic (formatters, validators, calculations)
- Utility functions (pure functions, no platform dependencies)

**❌ Keep in apps:**
- UI components (React vs React Native)
- Routing (react-router vs React Navigation)
- Platform-specific auth setup
- App configuration (Vite, Metro, etc.)

---

## Troubleshooting

### "Cannot find module '@dispatch/api'"

**Solution**: Run `pnpm install` from root. Workspace linking may not have completed.

### TypeScript errors in shared packages

**Solution**: Each package needs its own `tsconfig.json`. Check that it exists and is configured correctly.

### Vite not recognizing workspace packages

**Solution**: Ensure `apps/web/vite.config.ts` has:
```typescript
export default defineConfig({
  resolve: {
    preserveSymlinks: true, // Important for workspace packages
  },
});
```

### Changes not detected by Turborepo

**Solution**: 
1. Check `.gitignore` - ignored files won't trigger cache invalidation
2. Clear Turborepo cache: `rm -rf .turbo`
3. Ensure `turbo.json` has correct `outputs` configured

---

## Migration Status

**Current Phase**: Phases 1–4 & 7 Complete ✅

- [x] Create monorepo structure
- [x] Set up root package.json with Turborepo
- [x] Create pnpm workspace configuration
- [x] Move web app to `apps/web/`
- [x] Create shared package scaffolds
- [x] Extract `packages/api` (Phase 2)
- [x] Extract `packages/utils` (Phase 2)
- [x] Extract `packages/i18n` (Phase 2)
- [x] `packages/types` — placeholder; types colocated with APIs (Phase 2)
- [x] Update imports in web app (Phase 3)
- [x] Test web app in monorepo (Phase 4)
- [ ] Add mobile app scaffold (Phase 5)
- [x] Update CI/CD workflows (Phase 7)
- [ ] Update documentation (Phase 8)

---

## Related Repositories

- **dispatch-api**: Spring Boot backend (separate repo)
- **dispatch-infra**: Terraform infrastructure (separate repo)

---

## Summary

This monorepo uses **pnpm workspaces** + **Turborepo** to share code between web and mobile apps.

**Key benefits:**
- ✅ Share API services, types, and utilities
- ✅ Type-safe imports across packages
- ✅ Fast, cached builds
- ✅ Single source of truth for business logic
- ✅ No version lag between apps

**Key principles:**
- Keep UI separate (platform-specific)
- Share business logic (platform-agnostic)
- Each app configures its own auth/routing/platform features
- Use Turborepo for smart caching and orchestration
