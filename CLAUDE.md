# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Attribution Policy

**IMPORTANT**: Never include Claude, Claude Code, or any AI attribution in documentation, commits, or code comments.

## Project Overview

Dispatch UI is the frontend for the Dispatch management platform, built with **Vite + React + TypeScript + Tailwind CSS 4 + Catalyst UI**.

**Repository**: dispatch-ui (React frontend)
**Live URL**: https://dev.dispatch.newleveltech.net

## End Users & Context

**IMPORTANT**: This is an **internal business tool** for CSRs, dispatchers, field technicians, and office managers.

**Critical UI/UX Implications**:

1. **Data Density Over Simplicity** - CSRs are trained users; prefer dense tables over minimal designs
2. **Efficiency Over Aesthetics** - Fast data entry, keyboard shortcuts, bulk actions
3. **Desktop-First Design** - Use screen real estate (1920x1080+); show 8-10+ table columns
4. **Industry Terminology** - Use domain language: "PO", "Net 30", "service location"
5. **Context Switching is Expensive** - Show related data on same screen; use dialogs for quick edits

**CSR-Optimized UI Patterns**: See **[CSR_PATTERNS.md](./CSR_PATTERNS.md)** for detailed implementation patterns. Quick checklist: dense tables (`dense` prop + `[--gutter:theme(spacing.1)] text-sm`), InputGroup search, mt-4/mt-2 spacing, row counts.

---

## Technology Stack

- **Build**: Vite 6.4.1 | **Framework**: React 19.2.4 | **Language**: TypeScript 5.9.3
- **UI**: Tailwind Catalyst (Headless UI + Tailwind CSS 4.2)
- **Data**: @tanstack/react-query 5.90.21 | **Routing**: react-router-dom 7.13.1
- **Auth**: AWS Amplify 6.16.3 (Cognito) | **HTTP**: Axios 1.13.6

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Dev server (http://localhost:5173)
npm run build        # Production build
npm run lint         # Run linter
npm test             # Run tests (watch mode)
```

**Environment Variables**: Copy `.env.example` to `.env`. All `VITE_*` variables are public (bundled into client).

---

## Branching Strategy

### ⚠️ CRITICAL: NEVER PUSH DIRECTLY TO DEV ⚠️

**Required workflow**:
1. Create feature branch from `dev` FIRST
2. Make commits on feature branch
3. Push feature branch: `git push -u origin feat/your-feature-name`
4. Create PR: `gh pr create --base dev --title "Your PR title"`
5. Merge after approval via GitHub UI

**Branch prefixes**: `feat/`, `fix/`, `refactor/`, `test/`, `docs/`, `ci/`

**Key branches**:
- `dev` - Default branch (protected, all PRs target this)
- `qa` - QA testing
- `main` - Production
- `master` - ⚠️ DO NOT USE (legacy)

---

## Architecture Pattern

**Modern Single-Page + Dialog Pattern**:
- Single page per entity (not separate Create/Detail pages)
- Dialog for create/edit (keeps context, no navigation)
- React Query for data management
- Catalyst UI components

**Every entity follows**: `pages/EntityPage.tsx` + `components/EntityFormDialog.tsx`

**Project Structure**:
```
src/
├── api/              # API service classes (customerApi, workOrderApi, etc.)
├── components/       # Reusable components + Catalyst UI library
├── pages/            # Page components (one per entity)
├── contexts/         # React contexts (GlossaryContext, etc.)
├── test/             # Test utilities and setup
└── types/            # TypeScript definitions
```

---

## API Architecture

**Pattern**: Dedicated API service classes in `src/api/`, all exported from `src/api/index.ts`.

```typescript
// Import APIs and types
import { customerApi, type Customer } from '../api';

// Use with React Query
const { data } = useQuery({
  queryKey: ['customers'],
  queryFn: () => customerApi.getAll(),
});

const createMutation = useMutation({
  mutationFn: (data: Customer) => customerApi.create(data),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
});
```

**Creating new API service**: Follow pattern in `src/api/customerApi.ts`, export from `src/api/index.ts`.

**Auth**: `src/api/client.ts` automatically adds JWT tokens via Axios interceptor.

---

## Glossary Integration

**CRITICAL**: All entity names MUST flow through glossary for tenant customization.

### Core Pattern

```typescript
import { useGlossary } from '../contexts/GlossaryContext';

export default function MyPage() {
  const { t } = useTranslation();
  const { getName } = useGlossary(); // Always add this

  return (
    <Heading>{getName('customer', true)}</Heading>
    <Button>{t('common.actions.add', { entity: getName('customer') })}</Button>
  );
}
```

**Entity codes**: `customer`, `work_order`, `service_location`, `equipment`, `invoice`, `quote`, `payment`, `dispatch`, `user`, `role`

**Plural**: Pass `true` as second parameter: `getName('customer', true)` → "Customers"

**✅ DO use `getName()` for**: Page titles, buttons, loading/error/empty states, dialog titles, section headings

**❌ DON'T use `getName()` for**: Generic form fields (Name, Email), non-entity text (Save, Cancel)

**Complete guide**: See **[GLOSSARY_INTEGRATION.md](./GLOSSARY_INTEGRATION.md)** for full pattern reference.

---

## Adding a New Entity Page

**See reference examples**: `CustomersPage.tsx` and `CustomerFormDialog.tsx`

**Steps**:
1. Create `src/pages/EntityPage.tsx` - List page with table + Add button
2. Create `src/components/EntityFormDialog.tsx` - Dialog for create/edit
3. Add route in `src/App.tsx`
4. Import `useGlossary` and use `getName()` for all entity references
5. Use parameterized `common.*` i18n keys
6. Follow Catalyst UI patterns

**Key imports**:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useGlossary } from '../contexts/GlossaryContext'; // ALWAYS
import { entityApi, type Entity } from '../api';
```

---

## Internationalization (i18n)

**Location**: `src/i18n/locales/en_us.json`

**Structure**: Centralized entity names in `entities` section, reusable patterns in `common.actions` and `common.form`.

**Usage**:
```typescript
const { t } = useTranslation();

// Simple
<Heading>{t('entities.customers')}</Heading>

// With interpolation
<Button>{t('common.actions.add', { entity: t('entities.customer') })}</Button>
// Output: "Add Customer"

// With glossary (PREFERRED)
<Button>{t('common.actions.add', { entity: getName('customer') })}</Button>
```

**Adding new entity**: Add to `entities` section (alphabetically), add to test mock in `src/test/setup.ts`.

**CRITICAL**: Keep all sections alphabetically sorted.

---

## Key Patterns & Conventions

### ⚠️ CRITICAL: Always Use Catalyst UI Components

**THIS IS NON-NEGOTIABLE**: ALL UI components MUST use Catalyst components correctly.

**Rules**:
- ✅ Reference `src/components/catalyst/` for documentation
- ✅ Use proper component structure (Field, Label, Description, etc.)
- ❌ NEVER create custom HTML/Tailwind implementations
- ❌ NEVER use components outside required context

**Common components**: `Field`, `FieldGroup`, `Fieldset`, `Label`, `Input`, `Button`, `Dialog`, `Table`, `Badge`, `Dropdown`

**CheckboxField example**:
```typescript
// ✅ CORRECT
<CheckboxField>
  <Checkbox checked={isChecked} onChange={(checked) => handleChange(checked)} />
  <Label>Field Name</Label>
  <Description>Optional description</Description>
</CheckboxField>
```

### React Query Error Handling

```typescript
onError: (error: unknown) => {
  const errorMessage = error instanceof Error && 'response' in error
    ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
    : undefined;
  alert(errorMessage || t('common.form.errorCreate', { entity: getName('entity') }));
}
```

### Badge Colors

`lime` (active/success), `zinc` (inactive/default), `sky` (info), `blue` (in progress), `amber` (warning/pending), `rose` (error/danger)

---

## Testing

**Framework**: Vitest + React Testing Library

**Run tests**: `npm test` (watch) | `npm test -- --run` (CI) | `npm run test:coverage`

**Pattern**: Co-locate test files (`.test.tsx` suffix) with source files.

**Mock API calls**:
```typescript
import { vi } from 'vitest';
import apiClient from '../api/client';

vi.mock('../api/client');
vi.mocked(apiClient.get).mockResolvedValue({ data: mockData });
```

**Test utilities**: Use `renderWithProviders` from `src/test/utils.tsx` (auto-wraps with providers).

**Best practices**: Mock at module level, clear mocks between tests, use `waitFor` for async, test user-facing behavior.

**What to test**:
- Pages: title/buttons render, loading/error/empty states, data in table, dialogs open/close, delete confirmation
- Dialogs: create/edit modes, field validation, submit with correct data, saving state, form reset

---

## CI/CD

**PR Checks** (`.github/workflows/pr-checks.yml`): Runs lint + build on PRs to `dev`, `qa`, `main`

**Deploy** (`.github/workflows/deploy.yml`): Auto-deploys to S3 + CloudFront on push to `dev`
- S3 Bucket: `dispatch-dev-frontend`
- CloudFront: `E21TOAR61GO7PC`

**Variables**: Configured in GitHub repository settings (all `VITE_*` variables are public).

---

## Common Issues

**Env variables not loading**: Prefix with `VITE_`, access via `import.meta.env.VITE_NAME`
**API 401 errors**: JWT expired - re-login via Amplify
**React Query stale data**: Call `queryClient.invalidateQueries()` in mutation `onSuccess`
**Lint errors**: Run `npm run lint -- --fix`

---

## Linting

**Rules**: No `any` types, no unused variables, prefer `const`, no components during render

**Fix**: `npm run lint -- --fix`

**Allowed exceptions**: `react-hooks/set-state-in-effect` for form initialization (with comment)

---

## Related Documentation

- **CSR UI Patterns**: [CSR_PATTERNS.md](./CSR_PATTERNS.md)
- **Glossary Integration**: [GLOSSARY_INTEGRATION.md](./GLOSSARY_INTEGRATION.md)
- **Catalyst UI**: https://catalyst.tailwindui.com
- **React Query**: https://tanstack.com/query/latest

---

## Summary

**Architecture**: Single page + dialog, React Query, Catalyst UI, Glossary system, TypeScript, i18n

**When adding features**:
1. Import `useGlossary` and use `getName()` for entity names (see GLOSSARY_INTEGRATION.md)
2. Create API service in `src/api/` with TypeScript interfaces
3. Follow Entity Page + Form Dialog pattern (see CustomersPage.tsx)
4. Use Catalyst UI components correctly
5. Use parameterized `common.*` i18n keys with glossary
6. Write tests with flexible matchers
7. Run lint and tests before creating PR

**Remember**: Patterns are consistent. Reference CustomersPage, WorkOrdersPage, and GLOSSARY_INTEGRATION.md.
