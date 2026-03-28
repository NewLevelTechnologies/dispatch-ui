# Customizable Entity Naming - Frontend Implementation Plan

**Date**: 2026-03-25
**Status**: Planning Phase
**Backend Reference**: See dispatch-api `/docs/planning/CUSTOMIZABLE_ENTITY_NAMING.md`

---

## Overview

This feature allows tenants to customize how entities are named throughout the application. What one company calls a "Customer" another calls "Client" or "Account". This is a **business terminology preference**, distinct from language localization (i18n).

**Key distinction**:
- **i18n** = Language localization (English vs Spanish)
- **Glossary** = Business terminology (Customer vs Client vs Account - all English)

**Architecture**: The glossary system wraps and extends i18n, rather than replacing it.

---

## Current State

**Existing i18n setup**:
- Located in `src/i18n/`
- Entity names defined in `locales/en_us.json` under `entities.*`
- Components use `t('entities.customer')` throughout
- Centralized, DRY translation structure

**What doesn't change**:
- All non-entity i18n stays the same (`common.*`, form labels, actions, etc.)
- i18n provides default fallback values
- Translation file structure remains intact

---

## Integration Architecture

### Layered Approach

```
┌─────────────────────────────────────────────────┐
│ Component                                        │
│  useGlossary() → getName('customer', plural)   │
└────────────────────┬────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│ GlossaryContext                                  │
│  1. Check tenant glossary (from API)           │
│  2. Fall back to i18n (language default)       │
└────────────────────┬────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│ Backend API                                      │
│  GET /api/v1/tenant/terminology                 │
│  (returns sparse JSON - only overrides)         │
└─────────────────────────────────────────────────┘
```

### Data Flow

**Default tenant (no customization)**:
```
getName('customer', true)
  → glossary[customer] = undefined
  → falls back to t('entities.customers')
  → returns "Customers"
```

**HVAC tenant with glossary override**:
```
getName('customer', true)
  → glossary[customer] = { singular: "Client", plural: "Clients" }
  → returns "Clients"
```

**Future multi-language**:
```
getName('customer', true, 'es')
  → glossary[customer]['es'] = { singular: "Cliente", plural: "Clientes" }
  → returns "Clientes"
```

---

## Implementation Phases

### Phase 1: Infrastructure (1-2 days)

**Goal**: Set up GlossaryContext and API integration.

**Files to create**:
1. `src/contexts/GlossaryContext.tsx` - Context provider and hook
2. `src/api/terminologyApi.ts` - API service for terminology endpoints

**Files to modify**:
1. `src/main.tsx` or `src/App.tsx` - Wrap app with `GlossaryProvider`
2. `src/api/index.ts` - Export terminology API

**Tasks**:
- [ ] Create `terminologyApi.ts` with API methods
- [ ] Create `GlossaryContext.tsx` with provider and hook
- [ ] Implement ETag caching with localStorage
- [ ] Add default glossary fallback (matches i18n entities)
- [ ] Wrap app with `GlossaryProvider`
- [ ] Test with mock API responses

### Phase 2: Component Migration (3-5 days, incremental)

**Goal**: Replace i18n entity references with glossary lookups.

**Migration pattern**:
```typescript
// BEFORE
import { useTranslation } from 'react-i18next';
const { t } = useTranslation();
<Heading>{t('entities.customers')}</Heading>

// AFTER
import { useGlossary } from '@/contexts/GlossaryContext';
import { useTranslation } from 'react-i18next';
const { getName } = useGlossary();
const { t } = useTranslation();
<Heading>{getName('customer', true)}</Heading>
```

**Pages to migrate** (in order):
- [ ] `AppLayout.tsx` - Navigation labels
- [ ] `CustomersPage.tsx` and `CustomerFormDialog.tsx`
- [ ] `CustomerDetailPage.tsx`
- [ ] `ServiceLocationsPage.tsx` and `ServiceLocationFormDialog.tsx`
- [ ] `ServiceLocationDetailPage.tsx`
- [ ] `WorkOrdersPage.tsx` and `WorkOrderFormDialog.tsx`
- [ ] `UsersPage.tsx` and `UserFormDialog.tsx`
- [ ] `UserDetailPage.tsx`
- [ ] `RolesPage.tsx` and `RoleFormDialog.tsx`
- [ ] `RoleDetailPage.tsx`
- [ ] `EquipmentPage.tsx` - All tabs
- [ ] `InvoicesPage.tsx` and `InvoiceFormDialog.tsx`
- [ ] `QuotesPage.tsx` and `QuoteFormDialog.tsx`
- [ ] `PaymentsPage.tsx` and `PaymentFormDialog.tsx`
- [ ] `DispatchesPage.tsx`
- [ ] `AvailabilityPage.tsx`
- [ ] `RecurringOrdersPage.tsx`

**What to migrate**:
- Page headings
- Table column headers
- Form dialog titles
- Button labels with entity names
- Toast/alert messages with entity names
- Navigation links

**What NOT to migrate**:
- Generic labels (`t('common.cancel')`, `t('common.save')`)
- Form field labels (`t('common.form.name')`)
- Action verbs (`t('common.edit')`, `t('common.delete')`)

### Phase 3: Settings UI (2-3 days, optional)

**Goal**: Allow tenant admins to customize entity names.

**Files to create**:
1. `src/pages/TerminologySettingsPage.tsx` - Settings UI
2. `src/components/TerminologySettingsForm.tsx` - Form component (if complex)

**Files to modify**:
1. `src/App.tsx` - Add route
2. `src/components/AppLayout.tsx` - Add navigation link (under Settings?)

**Features**:
- [ ] List all customizable entities with defaults
- [ ] Show current customizations (if any)
- [ ] Edit singular and plural forms
- [ ] Reset individual entity to default
- [ ] Reset all entities to defaults
- [ ] Save and trigger hot reload (call `refresh()`)

---

## Code Implementation

### 1. Terminology API Service

**File**: `src/api/terminologyApi.ts`

```typescript
import apiClient from './client';

export interface Translation {
  singular: string;
  plural: string;
  description?: string;
}

export interface Glossary {
  [entityCode: string]: Translation;
}

export interface GlossaryResponse {
  glossary: Glossary;
  version: string;
  language: string;
}

export interface EntityInfo {
  code: string;
  defaultSingular: string;
  defaultPlural: string;
  description: string;
}

export interface UpdateTerminologyRequest {
  [entityCode: string]: {
    [language: string]: Translation;
  };
}

export const terminologyApi = {
  /**
   * Get glossary for current tenant.
   * Supports ETag for client-side caching.
   */
  getGlossary: async (
    language: string = 'en',
    ifNoneMatch?: string
  ): Promise<GlossaryResponse | null> => {
    const headers: Record<string, string> = {};
    if (ifNoneMatch) {
      headers['If-None-Match'] = ifNoneMatch;
    }

    const response = await apiClient.get<GlossaryResponse>(
      '/tenant/terminology',
      {
        params: { language },
        headers,
        validateStatus: (status) => status === 200 || status === 304,
      }
    );

    // 304 Not Modified - glossary unchanged
    if (response.status === 304) {
      return null;
    }

    return response.data;
  },

  /**
   * Update terminology for one or more entities.
   */
  updateTerminology: async (
    updates: UpdateTerminologyRequest
  ): Promise<GlossaryResponse> => {
    const response = await apiClient.put<GlossaryResponse>(
      '/tenant/terminology',
      updates
    );
    return response.data;
  },

  /**
   * Reset specific entity to default terminology.
   */
  resetToDefault: async (entityCode: string): Promise<void> => {
    await apiClient.delete(`/tenant/terminology/${entityCode}`);
  },

  /**
   * Reset all entities to default terminology.
   */
  resetAllToDefaults: async (): Promise<void> => {
    await apiClient.delete('/tenant/terminology');
  },

  /**
   * Get all available entity codes with their default names.
   * Used by settings UI to show what can be customized.
   */
  getAvailableEntities: async (): Promise<EntityInfo[]> => {
    const response = await apiClient.get<EntityInfo[]>(
      '/tenant/terminology/available'
    );
    return response.data;
  },
};

export default terminologyApi;
```

### 2. Glossary Context

**File**: `src/contexts/GlossaryContext.tsx`

```typescript
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { terminologyApi, type Glossary } from '../api/terminologyApi';

interface GlossaryContextType {
  getName: (entityCode: string, plural?: boolean) => string;
  isLoaded: boolean;
  refresh: () => Promise<void>;
}

const GlossaryContext = createContext<GlossaryContextType | undefined>(undefined);

// Entity code mapping: backend snake_case → i18n camelCase
const ENTITY_CODE_MAP: Record<string, string> = {
  customer: 'customer',
  service_location: 'serviceLocation',
  work_order: 'workOrder',
  technician: 'technician',
  equipment: 'equipment',
  invoice: 'invoice',
  quote: 'quote',
  work_item: 'workItem',
  payment: 'payment',
  schedule: 'schedule',
  route: 'route',
};

export const GlossaryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const [glossary, setGlossary] = useState<Glossary>({});
  const [isLoaded, setIsLoaded] = useState(false);

  const loadGlossary = async () => {
    try {
      const cachedETag = localStorage.getItem('glossary-etag');

      const data = await terminologyApi.getGlossary('en', cachedETag || undefined);

      // 304 Not Modified - glossary unchanged, use cached data
      if (data === null) {
        console.log('Glossary unchanged (304)');
        setIsLoaded(true);
        return;
      }

      // Store new ETag
      if (data.version) {
        localStorage.setItem('glossary-etag', data.version);
      }

      // Store glossary overrides
      setGlossary(data.glossary);
      setIsLoaded(true);

      console.log('Loaded glossary overrides:', Object.keys(data.glossary).length);
    } catch (err) {
      console.error('Failed to load glossary, using i18n defaults:', err);
      setGlossary({});
      setIsLoaded(true);
    }
  };

  useEffect(() => {
    loadGlossary();
  }, []);

  /**
   * Get display name for an entity.
   *
   * 1. Check glossary first (tenant-specific override)
   * 2. Fall back to i18n (language-specific default)
   *
   * @param entityCode - Backend entity code (snake_case)
   * @param plural - Whether to return plural form
   * @returns Display name for the entity
   */
  const getName = (entityCode: string, plural: boolean = false): string => {
    // 1. Check glossary for tenant override
    const override = glossary[entityCode];
    if (override) {
      return plural ? override.plural : override.singular;
    }

    // 2. Fall back to i18n
    const i18nCode = ENTITY_CODE_MAP[entityCode] || entityCode;
    const i18nKey = plural
      ? `entities.${i18nCode}s`
      : `entities.${i18nCode}`;

    const translation = t(i18nKey);

    // If i18n key not found, return formatted entity code
    if (translation === i18nKey) {
      console.warn(`Unknown entity code: ${entityCode}`);
      return plural ? `${entityCode}s` : entityCode;
    }

    return translation;
  };

  return (
    <GlossaryContext.Provider value={{ getName, isLoaded, refresh: loadGlossary }}>
      {children}
    </GlossaryContext.Provider>
  );
};

export const useGlossary = (): GlossaryContextType => {
  const context = useContext(GlossaryContext);
  if (!context) {
    throw new Error('useGlossary must be used within GlossaryProvider');
  }
  return context;
};
```

### 3. Wrap App with Provider

**File**: `src/main.tsx` or `src/App.tsx`

```typescript
import { GlossaryProvider } from './contexts/GlossaryContext';

// In your app setup:
<QueryClientProvider client={queryClient}>
  <GlossaryProvider>
    <Router>
      {/* Your routes */}
    </Router>
  </GlossaryProvider>
</QueryClientProvider>
```

### 4. Component Usage Example

**File**: `src/pages/CustomersPage.tsx`

```typescript
import { useGlossary } from '../contexts/GlossaryContext';
import { useTranslation } from 'react-i18next';

export default function CustomersPage() {
  const { getName } = useGlossary();
  const { t } = useTranslation();

  return (
    <div>
      {/* Entity names from glossary */}
      <Heading>{getName('customer', true)}</Heading>

      {/* Actions with entity interpolation */}
      <Button onClick={handleAdd}>
        {t('common.actions.add', { entity: getName('customer') })}
      </Button>

      {/* Table headers */}
      <Table>
        <TableHead>
          <TableRow>
            <TableHeader>{getName('customer')} Name</TableHeader>
            <TableHeader>{getName('service_location', true)}</TableHeader>
            <TableHeader>Actions</TableHeader>
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

---

## Entity Code Reference

Backend uses these entity codes (defined in `EntityCode` enum):

| Backend Code | i18n Key | Default Singular | Default Plural |
|--------------|----------|------------------|----------------|
| `customer` | `entities.customer` | Customer | Customers |
| `service_location` | `entities.serviceLocation` | Service Location | Service Locations |
| `work_order` | `entities.workOrder` | Work Order | Work Orders |
| `technician` | `entities.technician` | Technician | Technicians |
| `equipment` | `entities.equipment` | Equipment | Equipment |
| `invoice` | `entities.invoice` | Invoice | Invoices |
| `quote` | `entities.quote` | Quote | Quotes |
| `work_item` | `entities.workItem` | Work Item | Work Items |
| `payment` | `entities.payment` | Payment | Payments |
| `schedule` | `entities.schedule` | Schedule | Schedules |
| `route` | `entities.route` | Route | Routes |

**Note**: Backend may add more entities (dispatcher, part, warehouse, etc.). The system is extensible.

---

## Testing Strategy

### Unit Tests

**Test GlossaryContext**:
```typescript
// src/contexts/GlossaryContext.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { GlossaryProvider, useGlossary } from './GlossaryContext';
import { terminologyApi } from '../api/terminologyApi';

vi.mock('../api/terminologyApi');

describe('GlossaryContext', () => {
  it('falls back to i18n when no glossary override', async () => {
    vi.mocked(terminologyApi.getGlossary).mockResolvedValue({
      glossary: {},
      version: 'v1',
      language: 'en'
    });

    const wrapper = ({ children }) => <GlossaryProvider>{children}</GlossaryProvider>;
    const { result } = renderHook(() => useGlossary(), { wrapper });

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(result.current.getName('customer', false)).toBe('Customer');
    expect(result.current.getName('customer', true)).toBe('Customers');
  });

  it('uses glossary override when available', async () => {
    vi.mocked(terminologyApi.getGlossary).mockResolvedValue({
      glossary: {
        customer: { singular: 'Client', plural: 'Clients' }
      },
      version: 'v1',
      language: 'en'
    });

    const wrapper = ({ children }) => <GlossaryProvider>{children}</GlossaryProvider>;
    const { result } = renderHook(() => useGlossary(), { wrapper });

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(result.current.getName('customer', false)).toBe('Client');
    expect(result.current.getName('customer', true)).toBe('Clients');
  });

  it('handles API failure gracefully', async () => {
    vi.mocked(terminologyApi.getGlossary).mockRejectedValue(new Error('Network error'));

    const wrapper = ({ children }) => <GlossaryProvider>{children}</GlossaryProvider>;
    const { result } = renderHook(() => useGlossary(), { wrapper });

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    // Should fall back to i18n
    expect(result.current.getName('customer', false)).toBe('Customer');
  });

  it('caches ETag in localStorage', async () => {
    const mockETag = 'abc123';
    vi.mocked(terminologyApi.getGlossary).mockResolvedValue({
      glossary: {},
      version: mockETag,
      language: 'en'
    });

    const wrapper = ({ children }) => <GlossaryProvider>{children}</GlossaryProvider>;
    renderHook(() => useGlossary(), { wrapper });

    await waitFor(() => {
      expect(localStorage.getItem('glossary-etag')).toBe(mockETag);
    });
  });
});
```

### Integration Tests

**Test component migration**:
```typescript
// src/pages/CustomersPage.test.tsx
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import CustomersPage from './CustomersPage';
import { terminologyApi } from '../api/terminologyApi';

vi.mock('../api/terminologyApi');

describe('CustomersPage with glossary', () => {
  it('displays custom entity names when glossary is overridden', async () => {
    vi.mocked(terminologyApi.getGlossary).mockResolvedValue({
      glossary: {
        customer: { singular: 'Client', plural: 'Clients' }
      },
      version: 'v1',
      language: 'en'
    });

    render(<CustomersPage />);

    // Should see "Clients" instead of "Customers"
    await screen.findByText('Clients');
    expect(screen.getByRole('button', { name: /add client/i })).toBeInTheDocument();
  });
});
```

### Manual Testing Checklist

After implementation:
- [ ] Load app with no glossary overrides (should see i18n defaults)
- [ ] Use backend API to set custom terminology for test tenant
- [ ] Reload app (should see custom labels throughout)
- [ ] Check navigation labels
- [ ] Check page headings
- [ ] Check table headers
- [ ] Check form dialog titles
- [ ] Check toast messages
- [ ] Test ETag caching (check Network tab for 304 responses)
- [ ] Test hot reload (settings page → save → verify labels update without page refresh)
- [ ] Reset terminology via API (should revert to i18n defaults)

---

## Migration Search Patterns

To find all entity references that need migration:

**Search for i18n entity keys**:
```bash
# Find all t('entities.*') calls
grep -r "t('entities\." src/

# Find all t(\"entities.*\") calls
grep -r 't("entities\.' src/
```

**Common patterns to replace**:
```typescript
// Singular
t('entities.customer') → getName('customer')
t('entities.serviceLocation') → getName('service_location')
t('entities.workOrder') → getName('work_order')

// Plural
t('entities.customers') → getName('customer', true)
t('entities.serviceLocations') → getName('service_location', true)
t('entities.workOrders') → getName('work_order', true)
```

**In interpolations**:
```typescript
// Before
t('common.actions.add', { entity: t('entities.customer') })

// After
t('common.actions.add', { entity: getName('customer') })
```

---

## Settings UI (Optional Phase 3)

**File**: `src/pages/TerminologySettingsPage.tsx`

```typescript
import { useState, useEffect } from 'react';
import { useGlossary } from '../contexts/GlossaryContext';
import { terminologyApi, type EntityInfo } from '../api/terminologyApi';
import { Heading, Button, Table, Input } from '../components/catalyst/*';

export default function TerminologySettingsPage() {
  const { refresh } = useGlossary();
  const [entities, setEntities] = useState<EntityInfo[]>([]);
  const [customizations, setCustomizations] = useState<Record<string, { singular: string; plural: string }>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load available entities
    terminologyApi.getAvailableEntities().then(setEntities);

    // Load current customizations
    terminologyApi.getGlossary().then(data => {
      if (data) {
        setCustomizations(data.glossary);
      }
    });
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      // Convert to API format: { entityCode: { en: { singular, plural } } }
      const updates = Object.entries(customizations).reduce((acc, [code, translation]) => {
        acc[code] = { en: translation };
        return acc;
      }, {} as Record<string, any>);

      await terminologyApi.updateTerminology(updates);

      // Refresh glossary context (hot reload)
      await refresh();

      alert('Terminology updated successfully!');
    } catch (err) {
      alert('Failed to save terminology');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (entityCode: string) => {
    await terminologyApi.resetToDefault(entityCode);
    await refresh();

    // Remove from local state
    setCustomizations(prev => {
      const updated = { ...prev };
      delete updated[entityCode];
      return updated;
    });
  };

  return (
    <div className="p-8">
      <Heading>Terminology Settings</Heading>
      <p className="mt-2 text-sm text-gray-600">
        Customize how entities are named in your system.
      </p>

      <Table className="mt-8">
        <TableHead>
          <TableRow>
            <TableHeader>Entity</TableHeader>
            <TableHeader>Singular</TableHeader>
            <TableHeader>Plural</TableHeader>
            <TableHeader>Actions</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {entities.map(entity => (
            <TableRow key={entity.code}>
              <TableCell>
                <strong>{entity.code}</strong>
                <br />
                <small className="text-gray-500">{entity.description}</small>
              </TableCell>
              <TableCell>
                <Input
                  type="text"
                  placeholder={entity.defaultSingular}
                  value={customizations[entity.code]?.singular || ''}
                  onChange={(e) => setCustomizations(prev => ({
                    ...prev,
                    [entity.code]: {
                      ...prev[entity.code],
                      singular: e.target.value
                    }
                  }))}
                />
              </TableCell>
              <TableCell>
                <Input
                  type="text"
                  placeholder={entity.defaultPlural}
                  value={customizations[entity.code]?.plural || ''}
                  onChange={(e) => setCustomizations(prev => ({
                    ...prev,
                    [entity.code]: {
                      ...prev[entity.code],
                      plural: e.target.value
                    }
                  }))}
                />
              </TableCell>
              <TableCell>
                <Button plain onClick={() => handleReset(entity.code)}>
                  Reset
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="mt-6 flex gap-4">
        <Button onClick={handleSave} disabled={loading}>
          {loading ? 'Saving...' : 'Save Changes'}
        </Button>
        <Button plain onClick={() => terminologyApi.resetAllToDefaults().then(refresh)}>
          Reset All to Defaults
        </Button>
      </div>
    </div>
  );
}
```

---

## Performance Considerations

**Glossary API call**:
- Happens once at app startup
- Cached with ETag (304 responses if unchanged)
- Stored in localStorage for offline fallback
- Sparse response (only overrides, typically 0-5 entities)

**Runtime lookups**:
- In-memory context (instant)
- No API calls during component render
- Falls back to i18n if glossary unavailable

**Memory footprint**:
- Glossary object: ~100 bytes per override
- Typical tenant: 0-5 overrides = ~500 bytes
- Negligible compared to React Query cache

---

## Future Enhancements

**Phase 4: Multi-language support**:
- Backend JSONB already supports it: `{ "en": {...}, "es": {...} }`
- Frontend adds language parameter: `getName('customer', true, 'es')`
- User preference determines language selection

**Phase 5: Field-level customization**:
- Not just entity names, but field labels too
- Example: "Customer Name" → "Client Name", "Email" → "Contact Email"

**Phase 6: Abbreviations**:
- Store abbreviations in glossary: `{ singular: "Work Order", plural: "Work Orders", abbr: "WO" }`
- Use in tight spaces: mobile views, table headers

---

## Troubleshooting

**Issue: Glossary not loading**
- Check browser console for API errors
- Verify backend `/api/v1/tenant/terminology` endpoint works
- Check JWT token is included in request (handled by apiClient)
- Verify tenant context is set

**Issue: Changes not reflected**
- Call `refresh()` after saving settings
- Clear localStorage `glossary-etag` if cache is stale
- Check Network tab for 304 vs 200 responses

**Issue: Some labels still show i18n defaults**
- Check if entity code mapping is correct (`snake_case` → `camelCase`)
- Verify backend returned override for that entity code
- Check component is using `getName()` instead of `t('entities.*')`

**Issue: Performance degradation**
- Glossary should load once at startup, not on every render
- Use React DevTools Profiler to identify unnecessary re-renders
- Ensure `GlossaryProvider` wraps app at root level

---

## Summary

**What changes**:
- Entity display names become customizable per tenant
- Components use `useGlossary()` hook instead of `t('entities.*')`
- Settings UI allows admins to customize terminology

**What doesn't change**:
- i18n system remains for all non-entity translations
- Language localization (English vs Spanish) still handled by i18n
- All existing i18n keys for actions, labels, etc. unchanged

**Benefits**:
- Multi-vertical SaaS differentiator
- Improved UX for industry-specific terminology
- Future-proof for multi-language expansion
- Minimal performance impact
- Gradual migration path

**Estimated effort**:
- Phase 1 (Infrastructure): 1-2 days
- Phase 2 (Migration): 3-5 days
- Phase 3 (Settings UI): 2-3 days
- **Total**: 1-2 weeks

**Risk level**: Low
- Falls back to i18n on API failure
- Can migrate incrementally (page by page)
- No breaking changes to existing code
- Easy to test and rollback

---

## Next Steps

1. **Backend team**: Implement API endpoints in user-service
2. **Backend team**: Run RLS tests to verify tenant isolation
3. **Backend team**: Deploy to dev environment
4. **Frontend team**: Implement Phase 1 (GlossaryContext + API)
5. **Frontend team**: Test with mock data
6. **Frontend team**: Migrate one page as proof of concept
7. **Frontend team**: Complete Phase 2 migration
8. **Frontend team**: Build Settings UI (Phase 3)
9. **QA**: Manual testing with multiple tenants
10. **Deploy**: Roll out to dev → qa → production
