# Glossary + i18n Integration Architecture

**Date**: 2026-03-29
**Status**: Implementation Guide

---

## Overview

This document describes how the **Glossary system** (tenant-specific entity names) integrates with **i18n** (language localization) in dispatch-ui.

**Key Principle**: Glossary is a **layer on top of i18n**, not a replacement.

```
Component
    ↓
useGlossary() → getName('customer')
    ↓
1. Check glossary (tenant override)
2. Fall back to DEFAULTS (English)
3. Fall back to i18n (if multi-language)
    ↓
Returns: "Client" or "Customer"
```

---

## Two Systems, Working Together

| System | Purpose | Scope | Example |
|--------|---------|-------|---------|
| **i18n** | Language localization | Application-wide | "Customer" (English) vs "Cliente" (Spanish) |
| **Glossary** | Business terminology | Per-tenant | "Customer" vs "Client" (both English) |

**Hierarchy**: Glossary overrides > Hardcoded DEFAULTS > i18n

---

## Architecture Design

### 1. Update TenantSettings Interface

**IMPORTANT**: Glossary is bundled with tenant settings - no separate API call needed!

```typescript
// src/api/tenantSettingsApi.ts
import apiClient from './client';

export interface GlossaryEntry {
  singular: string;
  plural: string;
}

export interface Glossary {
  [entityCode: string]: GlossaryEntry;
}

export interface TenantSettings {
  tenantId: string;
  companyName: string;
  companyNameShort?: string | null;
  companySlogan?: string | null;
  logoOriginalUrl?: string | null;
  logoLargeUrl?: string | null;
  logoMediumUrl?: string | null;
  logoSmallUrl?: string | null;
  logoThumbnailUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone: string;
  defaultTaxRate?: number | null;
  invoiceTerms?: string | null;
  enableOnlineBooking: boolean;
  enableSmsNotifications: boolean;
  enableEmailNotifications: boolean;
  glossary?: Glossary; // ← Glossary is part of tenant settings
  updatedAt: string;
}

// ... existing tenantSettingsApi methods ...
```

### 2. API Service (Only for Settings UI)

```typescript
// src/api/glossaryApi.ts
import apiClient from './client';

export interface EntityInfo {
  code: string;
  defaultSingular: string;
  defaultPlural: string;
  description: string;
}

export const glossaryApi = {
  /**
   * Get all available entity codes with defaults and descriptions.
   * ONLY used by Settings UI to show customization form.
   *
   * NOTE: Do NOT use this to load glossary at runtime!
   * Glossary comes from tenant settings, which are loaded at bootstrap.
   */
  getAvailableEntities: async (): Promise<EntityInfo[]> => {
    const response = await apiClient.get<EntityInfo[]>('/tenant-settings/glossary/available');
    return response.data;
  },
};

export default glossaryApi;
```

**Key Point**: No separate `getGlossary()` method - glossary bundled with tenant settings

### 3. GlossaryContext (Simplified - No API Calls!)

```typescript
// src/contexts/GlossaryContext.tsx
import { createContext, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Glossary, GlossaryEntry } from '../api';

/**
 * Default entity names (English).
 *
 * IMPORTANT: These should match backend EntityType enum exactly.
 * This is hardcoded (not fetched) for optimal performance.
 *
 * When adding a new entity:
 * 1. Backend adds to EntityType enum
 * 2. Add here with defaults
 * 3. Add to i18n (en_us.json entities section)
 * 4. Deploy together
 *
 * Exported for test mocking (DRY - single source of truth).
 */
export const GLOSSARY_DEFAULTS: Record<string, GlossaryEntry> = {
  customer: { singular: 'Customer', plural: 'Customers' },
  service_location: { singular: 'Service Location', plural: 'Service Locations' },
  work_order: { singular: 'Work Order', plural: 'Work Orders' },
  technician: { singular: 'Technician', plural: 'Technicians' },
  equipment: { singular: 'Equipment', plural: 'Equipment' },
  invoice: { singular: 'Invoice', plural: 'Invoices' },
  quote: { singular: 'Quote', plural: 'Quotes' },
  work_item: { singular: 'Work Item', plural: 'Work Items' },
  payment: { singular: 'Payment', plural: 'Payments' },
  schedule: { singular: 'Schedule', plural: 'Schedules' },
  route: { singular: 'Route', plural: 'Routes' },
};

interface GlossaryContextType {
  getName: (entityCode: string, plural?: boolean) => string;
  updateGlossary: (newOverrides: Glossary) => void;
}

const GlossaryContext = createContext<GlossaryContextType | undefined>(undefined);

interface GlossaryProviderProps {
  children: React.ReactNode;
  glossary?: Glossary; // Passed from tenant settings (already loaded)
}

export const GlossaryProvider: React.FC<GlossaryProviderProps> = ({
  children,
  glossary: initialGlossary = {}
}) => {
  const { t } = useTranslation();

  // Initialize immediately from already-loaded tenant settings
  // Deep merge to handle partial overrides (e.g., only singular customized)
  const [glossary, setGlossary] = useState<Record<string, GlossaryEntry>>(() => {
    const merged = { ...GLOSSARY_DEFAULTS };
    Object.keys(initialGlossary).forEach(entityCode => {
      const override = initialGlossary[entityCode];
      merged[entityCode] = {
        singular: override?.singular || GLOSSARY_DEFAULTS[entityCode]?.singular || entityCode,
        plural: override?.plural || GLOSSARY_DEFAULTS[entityCode]?.plural || entityCode + 's',
      };
    });
    return merged;
  });

  /**
   * Update glossary with new overrides (called after saving settings).
   */
  const updateGlossary = (newOverrides: Glossary) => {
    const merged = { ...GLOSSARY_DEFAULTS };
    Object.keys(newOverrides).forEach(entityCode => {
      const override = newOverrides[entityCode];
      merged[entityCode] = {
        singular: override?.singular || GLOSSARY_DEFAULTS[entityCode]?.singular || entityCode,
        plural: override?.plural || GLOSSARY_DEFAULTS[entityCode]?.plural || entityCode + 's',
      };
    });
    setGlossary(merged);
  };

  /**
   * Get display name for an entity.
   *
   * Flow:
   * 1. Check glossary first (tenant override + defaults)
   * 2. Fall back to i18n (for future multi-language support)
   * 3. Last resort: formatted entity code
   *
   * @param entityCode - Backend entity code (snake_case, e.g., "customer", "service_location")
   * @param plural - Whether to return plural form
   * @returns Display name for the entity
   */
  const getName = (entityCode: string, plural = false): string => {
    // 1. Check glossary (includes both overrides and defaults)
    const entry = glossary[entityCode];
    if (entry) {
      return plural ? entry.plural : entry.singular;
    }

    // 2. Fall back to i18n (for future multi-language support)
    const i18nKey = plural
      ? `entities.${entityCode}s`
      : `entities.${entityCode}`;

    const translation = t(i18nKey);
    if (translation !== i18nKey) {
      return translation;
    }

    // 3. Last resort: formatted code (should rarely happen)
    console.warn(`Unknown entity code: ${entityCode}`);
    return entityCode.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <GlossaryContext.Provider value={{ getName, updateGlossary }}>
      {children}
    </GlossaryContext.Provider>
  );
};

/**
 * Hook to access glossary.
 *
 * Returns:
 * - getName(entityCode, plural): Get entity name (glossary override or default)
 * - updateGlossary(overrides): Update glossary after saving settings
 *
 * Note: Does NOT re-export t() - use useTranslation() directly for non-entity strings.
 */
export const useGlossary = () => {
  const context = useContext(GlossaryContext);

  if (!context) {
    throw new Error('useGlossary must be used within GlossaryProvider');
  }

  return context;
};
```

### 4. App Setup (Load Tenant Settings in App.tsx)

**Key Change**: Load tenant settings in `App.tsx` using React Query, then pass glossary to provider.

```typescript
// src/App.tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useQuery } from '@tanstack/react-query';
import { tenantSettingsApi } from './api';
import { GlossaryProvider } from './contexts/GlossaryContext';
// ... other imports

function App() {
  const { authStatus } = useAuthenticator((context) => [context.authStatus]);

  // Load tenant settings (includes glossary)
  const { data: tenantSettings, isLoading: settingsLoading, error: settingsError } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.getSettings(),
    enabled: authStatus === 'authenticated',
    staleTime: 30 * 60 * 1000, // 30 minutes - settings change rarely, but should propagate reasonably fast
    retry: 2, // Retry failed requests twice before giving up
  });

  // Log error but continue with defaults (GlossaryProvider will fall back to GLOSSARY_DEFAULTS)
  if (settingsError) {
    console.error('Failed to load tenant settings:', settingsError);
  }

  // Show loading while checking auth OR loading settings
  if (authStatus === 'configuring' || (authStatus === 'authenticated' && settingsLoading)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  const isAuthenticated = authStatus === 'authenticated';

  return (
    <GlossaryProvider glossary={tenantSettings?.glossary}>
      <Routes>
        <Route path="/login" element={/* ... */} />
        <Route path="/dashboard" element={<ProtectedRoute isAuthenticated={isAuthenticated} element={<DashboardPage />} />} />
        {/* ... other routes */}
      </Routes>
    </GlossaryProvider>
  );
}

export default App;
```

**Benefits**:
- ✅ No separate glossary API call (bundled with tenant settings)
- ✅ No flash (glossary ready before routes render)
- ✅ React Query caches settings (no refetch on navigation)
- ✅ Integrates with existing auth loading state

### Why Bootstrap Loading Is Required

**Critical requirement**: AppLayout renders navigation on every page, using entity names throughout.

**AppLayout.tsx navigation structure:**
```typescript
const mainNavigation = [
  { name: t('entities.customers'), ... },        // "Customers" or "Clients"?
  { name: t('entities.serviceLocations'), ... }, // "Service Locations" or "Sites"?
  { name: t('entities.workOrders'), ... },       // "Work Orders" or "Service Calls"?
];
```

**What users see:**
- Sidebar: "Customers", "Service Locations", "Work Orders", "Equipment", "Invoices", etc.
- Page content: "Add Location", "New Work Order", "Add Equipment", etc.

**Why glossary must be loaded before routes render:**
- ❌ **Lazy loading**: Labels flash "Customer" → "Client" after mount
- ❌ **Custom hook**: Race condition - what if AppLayout renders before query completes?
- ✅ **Bootstrap in App.tsx**: Guarantees correct labels from first render

**This is the same pattern as authentication** - must know auth status before rendering protected routes. Similarly, must know glossary before rendering navigation with entity names.

### 5. Export from API Barrel

```typescript
// src/api/index.ts
export { glossaryApi, type EntityInfo } from './glossaryApi';

// Update tenantSettingsApi exports to include glossary types
export {
  tenantSettingsApi,
  type TenantSettings,
  type UpdateTenantSettingsRequest,
  type LogoUrls,
  type UploadLogoResponse,
  type Glossary,        // ← Add glossary types
  type GlossaryEntry,   // ← Add glossary types
} from './tenantSettingsApi';
```

---

## Component Usage Patterns

### Pattern 1: Entity Names (Most Common)

```typescript
import { useGlossary } from '@/contexts/GlossaryContext';
import { useTranslation } from 'react-i18next';

export default function CustomersPage() {
  const { getName } = useGlossary();
  const { t } = useTranslation(); // Import separately for non-entity strings

  return (
    <div>
      {/* Page heading - plural */}
      <Heading>{getName('customer', true)}</Heading>

      {/* Button with entity name - singular */}
      <Button onClick={handleAdd}>
        {t('common.actions.add', { entity: getName('customer') })}
      </Button>

      {/* Table headers */}
      <Table>
        <TableHead>
          <TableRow>
            <TableHeader>{getName('customer')} Name</TableHeader>
            <TableHeader>{getName('service_location', true)}</TableHeader>
          </TableRow>
        </TableHead>
      </Table>

      {/* Toast messages */}
      <Button onClick={() => {
        createMutation.mutate(data, {
          onSuccess: () => {
            toast.success(`${getName('customer')} created successfully`);
          }
        });
      }}>
        Save
      </Button>
    </div>
  );
}
```

### Pattern 2: Settings Page (Updating Glossary)

```typescript
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useGlossary } from '@/contexts/GlossaryContext';
import { glossaryApi, tenantSettingsApi, type Glossary } from '../api';

export default function GlossarySettingsPage() {
  const queryClient = useQueryClient();
  const { updateGlossary } = useGlossary();

  // Get current tenant settings (already in React Query cache from bootstrap)
  const { data: tenantSettings } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.getSettings(),
  });

  const [customizations, setCustomizations] = useState<Glossary>(
    tenantSettings?.glossary || {}
  );

  // Fetch available entities for settings form
  const { data: availableEntities, isLoading: loadingEntities } = useQuery({
    queryKey: ['glossary', 'available'],
    queryFn: () => glossaryApi.getAvailableEntities(),
  });

  // Update when tenant settings change
  useEffect(() => {
    if (tenantSettings?.glossary) {
      setCustomizations(tenantSettings.glossary);
    }
  }, [tenantSettings]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (glossary: Glossary) =>
      tenantSettingsApi.updateSettings({ glossary }),
    onSuccess: (updatedSettings) => {
      // Update React Query cache
      queryClient.setQueryData(['tenant-settings'], updatedSettings);
      // Update glossary context immediately
      updateGlossary(updatedSettings.glossary || {});
      alert('Terminology updated successfully');
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Failed to update terminology';
      alert(message);
    },
  });

  const handleChange = (entityCode: string, field: 'singular' | 'plural', value: string) => {
    setCustomizations((prev) => ({
      ...prev,
      [entityCode]: {
        singular: prev[entityCode]?.singular || '',
        plural: prev[entityCode]?.plural || '',
        [field]: value,
      },
    }));
  };

  const handleReset = (entityCode: string) => {
    setCustomizations((prev) => {
      const updated = { ...prev };
      delete updated[entityCode];
      return updated;
    });
  };

  const handleSave = () => {
    // Only send non-empty customizations
    const toSave = Object.fromEntries(
      Object.entries(customizations).filter(
        ([_, value]) => value.singular?.trim() || value.plural?.trim()
      )
    );
    saveMutation.mutate(toSave);
  };

  if (loadingEntities) {
    return <div>Loading terminology settings...</div>;
  }

  return (
    <div>
      <h1>Terminology Settings</h1>
      {/* Form UI - see full example in Settings UI section below */}
      <button onClick={handleSave} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  );
}
```

---

## Entity Code Reference

Backend uses **snake_case** entity codes. Frontend should use the same codes with `getName()`.

| Backend Code | Usage | Default Singular | Default Plural |
|--------------|-------|------------------|----------------|
| `customer` | `getName('customer')` | Customer | Customers |
| `service_location` | `getName('service_location')` | Service Location | Service Locations |
| `work_order` | `getName('work_order')` | Work Order | Work Orders |
| `technician` | `getName('technician')` | Technician | Technicians |
| `equipment` | `getName('equipment')` | Equipment | Equipment |
| `invoice` | `getName('invoice')` | Invoice | Invoices |
| `quote` | `getName('quote')` | Quote | Quotes |
| `work_item` | `getName('work_item')` | Work Item | Work Items |
| `payment` | `getName('payment')` | Payment | Payments |
| `schedule` | `getName('schedule')` | Schedule | Schedules |
| `route` | `getName('route')` | Route | Routes |

**Important**: Use snake_case codes (as backend sends them), not camelCase.

---

## Migration Strategy

### Phase 1: Infrastructure (First PR)

**Create these files**:

1. **`src/api/glossaryApi.ts`** - API service (only for Settings UI - see code above)
2. **`src/contexts/GlossaryContext.tsx`** - Context provider (see code above)

**Modify these files**:

3. **`src/api/tenantSettingsApi.ts`** - Add glossary types:
   ```typescript
   export interface GlossaryEntry {
     singular: string;
     plural: string;
   }

   export interface Glossary {
     [entityCode: string]: GlossaryEntry;
   }

   export interface TenantSettings {
     // ... existing fields ...
     glossary?: Glossary; // ← Add this field
     updatedAt: string;
   }

   export interface UpdateTenantSettingsRequest {
     companyName?: string;
     // ... existing fields ...
     glossary?: Glossary; // ← Add this field too
   }
   ```

4. **`src/api/index.ts`** - Add exports:
   ```typescript
   // Glossary API (for Settings UI only)
   export { glossaryApi, type EntityInfo } from './glossaryApi';

   // Update tenantSettingsApi exports to include glossary types
   export {
     tenantSettingsApi,
     type TenantSettings,
     type UpdateTenantSettingsRequest,
     type LogoUrls,
     type UploadLogoResponse,
     type Glossary,        // ← Add
     type GlossaryEntry,   // ← Add
   } from './tenantSettingsApi';
   ```

5. **`src/App.tsx`** - Load tenant settings with React Query and pass to provider:
   ```typescript
   const { authStatus } = useAuthenticator((context) => [context.authStatus]);

   const { data: tenantSettings, isLoading: settingsLoading } = useQuery({
     queryKey: ['tenant-settings'],
     queryFn: () => tenantSettingsApi.getSettings(),
     enabled: authStatus === 'authenticated',
     staleTime: 30 * 60 * 1000, // 30 minutes
   });

   if (authStatus === 'configuring' || (authStatus === 'authenticated' && settingsLoading)) {
     return <div>Loading...</div>;
   }

   return (
     <GlossaryProvider glossary={tenantSettings?.glossary}>
       <Routes>{/* ... routes */}</Routes>
     </GlossaryProvider>
   );
   ```

6. **`src/test/setup.ts`** - Mock useGlossary (reuses GLOSSARY_DEFAULTS for DRY):
   ```typescript
   // Add after react-i18next mock
   // Import GLOSSARY_DEFAULTS to avoid duplication
   import { GLOSSARY_DEFAULTS } from '../contexts/GlossaryContext';

   vi.mock('../contexts/GlossaryContext', () => {
     // Re-import inside mock for proper module resolution
     const { GLOSSARY_DEFAULTS } = await import('../contexts/GlossaryContext');

     return {
       useGlossary: vi.fn(() => ({
         getName: (code: string, plural = false) => {
           const entry = GLOSSARY_DEFAULTS[code];
           return entry ? (plural ? entry.plural : entry.singular) : code;
         },
         updateGlossary: vi.fn(),
       })),
       GlossaryProvider: ({ children }: { children: React.ReactNode }) => children,
       GLOSSARY_DEFAULTS, // Re-export for other tests if needed
     };
   });
   ```

### Phase 2: Component Migration (Incremental PRs)

**Find components that reference entity names**:
```bash
# Search for t('entities.*') patterns
grep -r "t('entities\." src/pages/
grep -r 't("entities\.' src/pages/
grep -r "t(\`entities\." src/pages/
```

**Migration checklist per component**:

1. **Replace imports**:
   ```typescript
   // BEFORE:
   import { useTranslation } from 'react-i18next';
   const { t } = useTranslation();

   // AFTER:
   import { useGlossary } from '@/contexts/GlossaryContext';
   import { useTranslation } from 'react-i18next';
   const { getName } = useGlossary();
   const { t } = useTranslation();
   ```

2. **Replace entity references**:
   ```typescript
   // BEFORE:
   <Heading>{t('entities.customers')}</Heading>
   <Button>{t('common.actions.add', { entity: t('entities.customer') })}</Button>

   // AFTER:
   <Heading>{getName('customer', true)}</Heading>
   <Button>{t('common.actions.add', { entity: getName('customer') })}</Button>
   ```

3. **Update component tests**:
   ```typescript
   // No changes needed! useGlossary is already mocked in src/test/setup.ts
   ```

4. **Test manually**:
   - [ ] Component renders without errors
   - [ ] Entity names display correctly
   - [ ] All tests pass: `npm test -- ComponentName`

**Recommended migration order** (low-risk first):

1. **Start with simple pages**: DashboardPage, EquipmentPage
2. **Then main entity pages**: CustomersPage, WorkOrdersPage
3. **Then detail pages**: CustomerDetailPage, etc.
4. **Finally complex forms**: CustomerFormDialog, WorkOrderFormDialog

**Keep PRs small**: 1-3 components per PR for easy review.

---

## Testing

### Unit Test: GlossaryContext

```typescript
// src/contexts/GlossaryContext.test.tsx
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { GlossaryProvider, useGlossary } from './GlossaryContext';

describe('GlossaryContext', () => {
  it('returns defaults when no glossary override', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GlossaryProvider>{children}</GlossaryProvider>
    );
    const { result } = renderHook(() => useGlossary(), { wrapper });

    expect(result.current.getName('customer', false)).toBe('Customer');
    expect(result.current.getName('customer', true)).toBe('Customers');
    expect(result.current.getName('service_location')).toBe('Service Location');
  });

  it('uses glossary override when provided', () => {
    const customGlossary = {
      customer: { singular: 'Client', plural: 'Clients' },
      work_order: { singular: 'Service Call', plural: 'Service Calls' },
    };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GlossaryProvider glossary={customGlossary}>
        {children}
      </GlossaryProvider>
    );
    const { result } = renderHook(() => useGlossary(), { wrapper });

    // Overridden entities
    expect(result.current.getName('customer', false)).toBe('Client');
    expect(result.current.getName('customer', true)).toBe('Clients');
    expect(result.current.getName('work_order')).toBe('Service Call');

    // Non-overridden entity should use default
    expect(result.current.getName('technician')).toBe('Technician');
  });

  it('handles partial overrides (singular only)', () => {
    const partialGlossary = {
      customer: { singular: 'Client', plural: '' }, // Only singular provided
    };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GlossaryProvider glossary={partialGlossary}>
        {children}
      </GlossaryProvider>
    );
    const { result } = renderHook(() => useGlossary(), { wrapper });

    // Should use override for singular, default for plural
    expect(result.current.getName('customer', false)).toBe('Client');
    expect(result.current.getName('customer', true)).toBe('Customers');
  });

  it('updates glossary when updateGlossary is called', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GlossaryProvider>{children}</GlossaryProvider>
    );
    const { result } = renderHook(() => useGlossary(), { wrapper });

    // Initially uses defaults
    expect(result.current.getName('customer')).toBe('Customer');

    // Update glossary
    result.current.updateGlossary({
      customer: { singular: 'Client', plural: 'Clients' },
    });

    // Should now use updated value
    expect(result.current.getName('customer')).toBe('Client');
  });

  it('handles unknown entity codes', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GlossaryProvider>{children}</GlossaryProvider>
    );
    const { result } = renderHook(() => useGlossary(), { wrapper });

    // Unknown code should return formatted version
    expect(result.current.getName('unknown_entity')).toBe('Unknown Entity');
  });
});
```

### Component Test Example

```typescript
// src/pages/CustomersPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import CustomersPage from './CustomersPage';
import { customerApi } from '../api';

vi.mock('../api');

describe('CustomersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays glossary-aware entity names', async () => {
    vi.mocked(customerApi.getAll).mockResolvedValue([
      { id: '1', name: 'John Doe', email: 'john@example.com', phone: '555-1234' },
    ]);

    renderWithProviders(<CustomersPage />);

    // useGlossary is already mocked in test setup, will return "Customers"
    await waitFor(() => {
      expect(screen.getByText('Customers')).toBeInTheDocument();
    });
  });

  // Note: To test with custom glossary, you'd need to override the mock:
  it('displays custom glossary names', async () => {
    // Override the mock for this test
    vi.mocked(customerApi.getAll).mockResolvedValue([]);

    // Mock useGlossary for this specific test
    vi.doMock('../contexts/GlossaryContext', () => ({
      useGlossary: () => ({
        getName: (code: string, plural = false) => {
          if (code === 'customer') return plural ? 'Clients' : 'Client';
          return code;
        },
        isLoading: false,
        refresh: vi.fn(),
      }),
    }));

    renderWithProviders(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('Clients')).toBeInTheDocument();
    });
  });
});
```

---

## Key Decisions & Rationale

### Why separate getName() instead of enhancing t()?

**Decision**: Use dedicated `getName(entityCode, plural)` function.

**Alternatives considered**:
1. Enhance `t()` to check glossary for `entities.*` keys automatically
2. Use `t('entities.customer')` and intercept in provider

**Rationale**:
- ✅ **Explicit**: Clear in code what's glossary vs i18n
- ✅ **Type-safe**: Can enforce entity codes at runtime
- ✅ **Debuggable**: Easy to trace getName() calls
- ✅ **Flexible**: Can add features (abbreviations, descriptions) later
- ✅ **Clean**: Doesn't pollute i18n with custom logic
- ✅ **Performance**: Direct object lookup vs i18n's key resolution

### Why hardcode DEFAULTS instead of fetching /available?

**Decision**: Hardcode DEFAULTS constant, only fetch `/available` in Settings UI.

**Alternatives considered**:
1. Fetch `/glossary/available` on every app load
2. Fetch both `/glossary` and `/available` and merge
3. Store defaults in i18n files

**Rationale**:
- ✅ **Performance**: 1 API call vs 2 on every app load (100-200ms saved)
- ✅ **Simplicity**: No merging logic for two API calls
- ✅ **Stability**: Entity list changes rarely, always requires code deployment anyway
- ✅ **Consistency**: Like i18n, defaults are build-time constants
- ✅ **Best practice**: Optimize hot path (every user), not cold path (Settings UI)
- ℹ️ **Trade-off**: Need to keep DEFAULTS in sync with backend enum (but this is rare)

**When to use `/available`**: Only in Settings UI to show descriptions and customization form.

### Why load glossary from tenant settings instead of separate API call?

**Decision**: Glossary is included in tenant settings - no separate API call.

**Rationale**:
- ✅ **Required for AppLayout**: Navigation must display correct entity names from first render
- ✅ **Performance**: No separate glossary API call (glossary bundled with tenant settings)
- ✅ **Simplicity**: No React Query management in GlossaryContext
- ✅ **No flash**: Glossary available immediately (correct terminology from first render)
- ✅ **Consistency**: All tenant config comes from one source
- ✅ **Fewer moving parts**: Less code, fewer potential failure points

### Why NOT re-export t() from useGlossary?

**Decision**: `useGlossary()` only returns `getName` and `updateGlossary`. Components import `useTranslation()` separately.

**Rationale**:
- ✅ **Separation of concerns**: Glossary ≠ i18n, keep them distinct
- ✅ **Performance**: Components that don't need glossary don't import it
- ✅ **Clarity**: Clear which features come from which system
- ⚠️ **Trade-off**: Two imports instead of one (acceptable for clarity)

### Why snake_case entity codes?

**Decision**: Use backend's snake_case codes in frontend.

**Rationale**:
- ✅ **Consistency**: Matches API request/response
- ✅ **Clarity**: No confusion about casing conventions
- ✅ **Maintainability**: Single source of truth (backend EntityType enum)
- ✅ **Simplicity**: No ENTITY_CODE_MAP needed (eliminated complexity)

---

## Why Not Alternative Approaches?

### Why not store glossary in i18n JSON files?
i18n files are bundled at build time. Glossary is tenant-specific runtime data from the database. Can't build separately per tenant.

### Why not localStorage caching?
Not needed. Glossary is bundled with tenant settings (already cached by React Query). localStorage adds complexity (invalidation, versioning, sync) with no performance benefit.

---

## Performance Considerations

- **One API call**: Glossary bundled with tenant settings (no separate fetch)
- **Instant lookups**: Hardcoded GLOSSARY_DEFAULTS merged client-side, O(1) getName() lookup
- **No flash**: Glossary loaded before routes render (available in AppLayout navigation from first render)
- **Minimal memory**: <1KB total (11 entity defaults + 0-5 typical overrides)

**Comparison**:
| Approach | API Calls | Glossary Load Time | Flash Risk |
|----------|-----------|-----------|--------------|
| **From tenant settings in App.tsx (chosen)** | 1 call (bundled) | Loaded with auth | ✅ None |
| Separate /glossary call | 2 calls | ~50-100ms extra | ⚠️ Possible |
| Fetch /available every load | 2 calls | ~100-200ms extra | ⚠️ Possible |

**Note**: Detailed Settings UI implementation will be documented in Phase 3 PR. The Settings UI will use `/glossary/available` endpoint to fetch entity descriptions for the customization form.

---

## Summary

**What glossary does**:
- ✅ Allows tenants to customize entity names (per-tenant branding)
- ✅ Provides defaults for all 11 core entities (hardcoded, fast)
- ✅ Overrides defaults with tenant-specific customizations (from API)
- ✅ Falls back gracefully if API fails (uses DEFAULTS)
- ✅ Works seamlessly with existing i18n system (future multi-language support)

**What glossary doesn't do**:
- ❌ Replace i18n (they work together, glossary is a layer on top)
- ❌ Handle language localization (that's i18n's job)
- ❌ Customize non-entity strings (actions, labels, buttons - use i18n)
- ❌ Require /available endpoint on every load (only Settings UI uses it)

**Architecture highlights**:
- 🚀 **Performance**: Single API call for both settings and glossary, <1KB data, <1ms lookups
- 🎯 **Simple**: Hardcoded defaults + sparse overrides from tenant settings = easy mental model
- 🔧 **Maintainable**: Follows project patterns (tenantSettingsApi, React Query, Catalyst)
- 🧪 **Testable**: Mocked in `test/setup.ts`, zero changes to existing tests
- ⚡ **Instant**: No loading state, glossary available immediately at app start

**Migration checklist**:
- [ ] Phase 1: Update TenantSettings interface (add glossary field)
- [ ] Phase 1: Create glossaryApi (only for /available endpoint)
- [ ] Phase 1: Create GlossaryContext (no React Query, accepts glossary prop)
- [ ] Phase 1: Load tenant settings in App.tsx with React Query
- [ ] Phase 1: Wrap routes with GlossaryProvider
- [ ] Phase 1: Add test mock for useGlossary
- [ ] Phase 2: Migrate components incrementally (1-3 per PR)
- [ ] Phase 2: Update each component's tests (usually no changes needed)
- [ ] Phase 2: Test with default glossary (no overrides)
- [ ] Phase 2: Test with custom glossary (modify tenant settings in dev tools)
- [ ] Phase 3: Build Settings UI (use /available endpoint)

**Estimated effort**:
- Infrastructure (Phase 1): **3-4 hours** (1 PR) - Simpler than original plan
- Component migration (Phase 2): **1-2 hours per component** (~10 components = 1-2 days)
- Settings UI (Phase 3): **4-6 hours** (1 PR)
- **Total: 2 days** for complete implementation
