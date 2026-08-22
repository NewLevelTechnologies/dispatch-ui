# Glossary Integration Guide

This guide explains how to integrate the glossary system into pages, components, and translations for tenant-customizable entity names.

## Overview

The **glossary system** allows tenants to customize entity names throughout the application (e.g., "Work Orders" → "Jobs", "Service Locations" → "Properties").

**Key concepts:**
- Entity names flow through `getName(entityCode, plural?)` function
- All pages and forms should use glossary for entity references
- i18n translations use parameterized keys to accept entity names as variables
- Three-level fallback: Glossary → i18n defaults → formatted entity code

---

## Core Pattern

### When to Use Glossary

**✅ DO use `getName()` for:**
- Page titles/headings that show entity names
- Buttons: "Add Customer", "Create Work Order"
- Empty states: "No customers found"
- Form labels that reference entities
- Navigation links
- Dialog titles: "Create Customer", "Edit Service Location"
- Table headers when the entity type is contextual

**❌ DON'T use `getName()` for:**
- Generic form field labels: "Name", "Email", "Phone" (use `common.form.*`)
- Non-entity text: "Save", "Cancel", "Search", "Loading..."
- Technical terms that aren't tenant-facing entities
- Hard-coded business logic (use entity codes directly)

---

## Implementation Patterns

### 1. Import and Setup

Every page or component that displays entity names should:

```typescript
import { useGlossary } from '../contexts/GlossaryContext';

export default function MyPage() {
  const { t } = useTranslation();
  const { getName } = useGlossary(); // Add this

  // ... rest of component
}
```

### 2. Page Titles

```typescript
// ✅ CORRECT - Entity pages
<Heading>{getName('customer', true)}</Heading>
// Output: "Customers" or "Clients" (based on glossary)

// ✅ CORRECT - Non-entity pages
<Heading>{t('entities.dashboard')}</Heading>
// Output: "Dashboard" (not customizable)
```

### 3. Action Buttons

Use parameterized i18n keys that accept entity names:

```typescript
// ✅ CORRECT
<Button onClick={handleAdd}>
  {t('common.actions.add', { entity: getName('customer') })}
</Button>
// Output: "Add Customer" or "Add Client"

// ✅ CORRECT
<Button onClick={handleCreate}>
  {t('common.actions.create', { entity: getName('work_order') })}
</Button>
// Output: "Create Work Order" or "Create Job"

// ❌ WRONG - Hardcoded
<Button>Add Customer</Button>
```

### 4. Empty States

```typescript
// ✅ CORRECT
<Text>{t('common.actions.notFound', { entities: getName('customer', true) })}</Text>
// Output: "No customers found" or "No clients found"

// ✅ CORRECT
<Text>{t('common.actions.noEntitiesYet', { entities: getName('work_order', true) })}</Text>
// Output: "No work orders yet" or "No jobs yet"
```

### 5. Loading and Error States

```typescript
// ✅ CORRECT - Loading
<Text>{t('common.actions.loadingEntity', { entity: getName('customer') })}</Text>
// Output: "Loading customer..." or "Loading client..."

// ✅ CORRECT - Error
<Text>{t('common.actions.errorLoadingEntity', { entity: getName('service_location') })}</Text>
// Output: "Error loading service location" or "Error loading property"
```

### 6. Navigation and Back Links

```typescript
// ✅ CORRECT
<Button onClick={() => navigate('/customers')}>
  <ArrowLeftIcon />
  {t('common.actions.backTo', { entities: getName('customer', true) })}
</Button>
// Output: "Back to Customers" or "Back to Clients"
```

### 7. Dialog Titles

```typescript
// ✅ CORRECT
<DialogTitle>
  {t('common.form.titleCreate', {
    action: isEdit ? t('common.edit') : t('common.create'),
    entity: getName('service_location')
  })}
</DialogTitle>
// Output: "Create Service Location" or "Create Property" (create mode)
// Output: "Edit Service Location" or "Edit Property" (edit mode)
```

### 8. Counts and Lists

```typescript
// ✅ CORRECT - Entity counts
<Subheading>
  {t('common.entitiesCount', {
    entities: getName('service_location', true),
    count: locations.length
  })}
</Subheading>
// Output: "Service Locations (5)" or "Properties (5)"

// ✅ CORRECT - Recent items
<Subheading>
  {t('common.recentEntities', { entities: getName('work_order', true) })}
</Subheading>
// Output: "Recent Work Orders" or "Recent Jobs"
```

### 9. Search Placeholders

```typescript
// ✅ CORRECT - Use common.search (generic)
<Input
  placeholder={t('common.search')}
  value={searchQuery}
  onChange={handleSearch}
/>
// Output: "Search..."

// ✅ ALSO CORRECT - Entity-specific search if needed
<Input
  placeholder={t('common.actions.search', { entities: getName('customer', true) })}
  value={searchQuery}
  onChange={handleSearch}
/>
// Output: "Search customers..." or "Search clients..."
```

### 10. Table Headers

```typescript
// ✅ CORRECT - Context is clear, use generic label
<TableHeader>{t('common.form.name')}</TableHeader>
<TableHeader>{t('common.form.status')}</TableHeader>

// ✅ CORRECT - Use entity name when listing mixed types
<TableHeader>{getName('customer')}</TableHeader>
<TableHeader>{getName('service_location')}</TableHeader>

// ❌ WRONG - Redundant "Location Name" when page is already "Service Locations"
<TableHeader>{t('serviceLocations.table.locationName')}</TableHeader>
```

---

## Available Common Translation Keys

The following parameterized keys accept entity names:

### Actions (`common.actions.*`)
```typescript
// With singular entity
'common.actions.add': 'Add {{entity}}'
'common.actions.create': 'Create {{entity}}'
'common.actions.edit': 'Edit {{entity}}'
'common.actions.new': 'New {{entity}}'

// With plural entities
'common.actions.addFirst': 'Add your first {{entity, lowercase}}'
'common.actions.backTo': 'Back to {{entities}}'
'common.actions.errorLoading': 'Error loading {{entities, lowercase}}'
'common.actions.errorLoadingEntity': 'Error loading {{entity, lowercase}}'
'common.actions.loading': 'Loading {{entities, lowercase}}...'
'common.actions.loadingEntity': 'Loading {{entity, lowercase}}...'
'common.actions.noEntitiesYet': 'No {{entities, lowercase}} yet'
'common.actions.noMatchSearch': 'No {{entities, lowercase}} match your search.'
'common.actions.notFound': 'No {{entities, lowercase}} found'
'common.actions.open': 'Open {{entities}}'

// With name variable
'common.actions.deleteConfirm': 'Are you sure you want to delete {{name}}?'

// Status
'common.updateStatus': 'Update {{entity, lowercase}} status'
```

### Counts and Lists
```typescript
'common.entitiesCount': '{{entities}} ({{count}})'
'common.recentEntities': 'Recent {{entities}}'
```

### Form Messages
```typescript
'common.form.titleCreate': '{{action}} {{entity}}'
'common.form.descriptionCreate': 'Create a new {{entity, lowercase}} record.'
'common.form.descriptionEdit': 'Update {{entity, lowercase}} information.'
'common.form.errorCreate': 'Failed to create {{entity, lowercase}}'
'common.form.errorUpdate': 'Failed to update {{entity, lowercase}}'
```

---

## Entity Codes

Use these exact entity codes with `getName()`:

| Entity Code | Default Singular | Default Plural |
|-------------|------------------|----------------|
| `customer` | Customer | Customers |
| `work_order` | Work Order | Work Orders |
| `service_location` | Service Location | Service Locations |
| `equipment` | Equipment | Equipment |
| `invoice` | Invoice | Invoices |
| `quote` | Quote | Quotes |
| `payment` | Payment | Payments |
| `dispatch` | Dispatch | Dispatches |
| `user` | User | Users |
| `role` | Role | Roles |

**Important:** Entity codes are snake_case and match the backend `EntityType` enum.

---

## Complete Page Example

### CustomersPage.tsx (Excerpt)

```typescript
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useGlossary } from '../contexts/GlossaryContext'; // 1. Import glossary
import { customerApi } from '../api';
import AppLayout from '../components/AppLayout';
import CustomerFormDialog from '../components/CustomerFormDialog';
import { Heading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Input, InputGroup } from '../components/catalyst/input';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary(); // 2. Get getName function
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: customers = [], isLoading, error } = useQuery({
    queryKey: ['customers'],
    queryFn: () => customerApi.getAll(),
  });

  return (
    <AppLayout>
      {/* 3. Page title with glossary */}
      <div className="flex items-center justify-between gap-4">
        <Heading>{getName('customer', true)}</Heading>
        <Button onClick={() => setIsDialogOpen(true)}>
          {/* 4. Button with parameterized i18n */}
          {t('common.actions.add', { entity: getName('customer') })}
        </Button>
      </div>

      {/* 5. Search input - generic placeholder */}
      <div className="mt-2 flex items-center gap-4">
        <InputGroup className="flex-1 max-w-md">
          <MagnifyingGlassIcon data-slot="icon" />
          <Input
            type="text"
            placeholder={t('common.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </InputGroup>
      </div>

      {/* 6. Loading state */}
      {isLoading && (
        <div className="mt-4 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t('common.actions.loading', { entities: getName('customer', true) })}
          </p>
        </div>
      )}

      {/* 7. Error state */}
      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-3">
          <p className="text-sm text-red-800">
            {t('common.actions.errorLoading', { entities: getName('customer', true) })}: {(error as Error).message}
          </p>
        </div>
      )}

      {/* 8. Empty state */}
      {customers.length === 0 && !isLoading && (
        <div className="mt-4 rounded-lg border border-dashed p-4">
          <p className="text-sm text-zinc-600">
            {t('common.actions.notFound', { entities: getName('customer', true) })}
          </p>
        </div>
      )}

      {/* Table with data... */}

      <CustomerFormDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
      />
    </AppLayout>
  );
}
```

---

## Complete Form Dialog Example

### CustomerFormDialog.tsx (Excerpt)

```typescript
import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useGlossary } from '../contexts/GlossaryContext'; // 1. Import glossary
import { customerApi, type Customer } from '../api';
import { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';

interface CustomerFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  customer?: Customer | null;
}

export default function CustomerFormDialog({ isOpen, onClose, customer }: CustomerFormDialogProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary(); // 2. Get getName function
  const isEdit = !!customer;

  const [formData, setFormData] = useState({ name: '', email: '', phone: '' });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => customerApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
    onError: (error: unknown) => {
      // 3. Error message with glossary
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('common.form.errorCreate', { entity: getName('customer') }));
    },
  });

  return (
    <Dialog open={isOpen} onClose={onClose}>
      {/* 4. Dialog title with parameterized i18n */}
      <DialogTitle>
        {t('common.form.titleCreate', {
          action: isEdit ? t('common.edit') : t('common.create'),
          entity: getName('customer')
        })}
      </DialogTitle>

      {/* 5. Dialog description with glossary */}
      <DialogDescription>
        {isEdit
          ? t('common.form.descriptionEdit', { entity: getName('customer') })
          : t('common.form.descriptionCreate', { entity: getName('customer') })}
      </DialogDescription>

      <DialogBody>
        <form onSubmit={handleSubmit} id="customer-form">
          {/* 6. Generic form fields - NO glossary needed */}
          <Field>
            <Label>{t('common.form.name')} *</Label>
            <Input
              name="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </Field>
          {/* More fields... */}
        </form>
      </DialogBody>

      <DialogActions>
        <Button plain onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" form="customer-form" disabled={createMutation.isPending}>
          {createMutation.isPending ? t('common.saving') : isEdit ? t('common.update') : t('common.create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

---

## Detail Page Patterns

Detail pages have additional considerations for entity references:

```typescript
// Simple view section headings
<Subheading>{getName('equipment')}</Subheading>
<Subheading>{t('common.recentEntities', { entities: getName('work_order', true) })}</Subheading>

// Add buttons in sections
<Button plain>
  <PlusIcon />
  {t('common.actions.add', { entity: getName('equipment') })}
</Button>

// Empty states within sections
<Text>{t('common.actions.noEntitiesYet', { entities: getName('work_order', true) })}</Text>

// Stats and counts
<Text className="text-xs">{t('common.actions.open', { entities: getName('work_order', true) })}</Text>
<Strong>5</Strong>
```

---

## Testing with Glossary

### Update Test Mocks

When using glossary in components, update test mocks in `src/test/setup.ts`:

```typescript
const translations = {
  // Add parameterized keys used in your component
  'common.actions.add': 'Add {{entity}}',
  'common.actions.loading': 'Loading {{entities, lowercase}}...',
  'common.form.titleCreate': '{{action}} {{entity}}',
  // ... other keys
};
```

### Update Test Expectations

Tests need flexible matchers since entity names come from glossary:

```typescript
// ❌ WRONG - Too specific
expect(screen.getByText('Add Customer')).toBeInTheDocument();
expect(screen.getByText('No customers found')).toBeInTheDocument();

// ✅ CORRECT - Flexible patterns
expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
expect(screen.getByText(/loading/i)).toBeInTheDocument();
expect(screen.getByText(/no .* found/i)).toBeInTheDocument();
```

### GlossaryContext Mock

The test utils automatically provide a mock `GlossaryContext` that returns formatted entity codes. You don't need to mock it explicitly in most cases.

---

## Common Pitfalls

### 1. ❌ Hardcoding Entity Names

```typescript
// ❌ WRONG
<Heading>Customers</Heading>
<Button>Add Customer</Button>
<Text>No customers found</Text>

// ✅ CORRECT
<Heading>{getName('customer', true)}</Heading>
<Button>{t('common.actions.add', { entity: getName('customer') })}</Button>
<Text>{t('common.actions.notFound', { entities: getName('customer', true) })}</Text>
```

### 2. ❌ Using Glossary for Non-Entity Text

```typescript
// ❌ WRONG - These aren't customizable entities
{getName('name')}
{getName('email')}
{getName('save')}

// ✅ CORRECT - Use i18n directly
{t('common.form.name')}
{t('common.form.email')}
{t('common.save')}
```

### 3. ❌ Forgetting Plural Forms

```typescript
// ❌ WRONG - Singular form for page title
<Heading>{getName('customer')}</Heading>

// ✅ CORRECT - Plural form for page title
<Heading>{getName('customer', true)}</Heading>
```

### 4. ❌ Not Importing useGlossary

```typescript
// ❌ WRONG - Forgot to import and use glossary
export default function CustomersPage() {
  const { t } = useTranslation();
  // Missing: const { getName } = useGlossary();

  return <Heading>{t('entities.customers')}</Heading>; // Won't be customizable!
}

// ✅ CORRECT
export default function CustomersPage() {
  const { t } = useTranslation();
  const { getName } = useGlossary(); // Add this

  return <Heading>{getName('customer', true)}</Heading>; // Customizable!
}
```

### 5. ❌ Using Domain-Specific Keys Instead of Common

```typescript
// ❌ WRONG - Creating duplicate translations
t('customers.actions.addCustomer')
t('workOrders.actions.addWorkOrder')

// ✅ CORRECT - Use parameterized common keys
t('common.actions.add', { entity: getName('customer') })
t('common.actions.add', { entity: getName('work_order') })
```

---

## Checklist for New Pages

When creating a new entity page, ensure:

- [ ] Import `useGlossary` and call `getName = useGlossary()`
- [ ] Page title uses `getName('entity', true)` for plural
- [ ] "Add" button uses `t('common.actions.add', { entity: getName('entity') })`
- [ ] Loading state uses `t('common.actions.loading', { entities: getName('entity', true) })`
- [ ] Error state uses `t('common.actions.errorLoading', { entities: getName('entity', true) })`
- [ ] Empty state uses `t('common.actions.notFound', { entities: getName('entity', true) })`
- [ ] Search placeholder uses `t('common.search')` (generic)
- [ ] Table headers use `common.form.*` for generic fields (Name, Status, etc.)
- [ ] Form dialog imports `useGlossary` and uses `getName()` for titles/descriptions
- [ ] Tests use flexible text matchers (`/loading/i`, `/add/i`) instead of exact strings
- [ ] All entity references flow through glossary (no hardcoded "Customer", "Work Order", etc.)

---

## Checklist for Migrating Existing Pages

When migrating an existing page to use glossary:

- [ ] Add `import { useGlossary } from '../contexts/GlossaryContext'`
- [ ] Add `const { getName } = useGlossary()` in component
- [ ] Replace page title: `t('entities.customers')` → `getName('customer', true)`
- [ ] Replace buttons: `t('customers.actions.add')` → `t('common.actions.add', { entity: getName('customer') })`
- [ ] Replace loading: `t('customers.detail.loading')` → `t('common.actions.loadingEntity', { entity: getName('customer') })`
- [ ] Replace errors: `t('customers.detail.errorLoading')` → `t('common.actions.errorLoadingEntity', { entity: getName('customer') })`
- [ ] Replace empty states: `t('customers.detail.noCustomers')` → `t('common.actions.notFound', { entities: getName('customer', true) })`
- [ ] Replace section headings with entity names: `t('customers.detail.equipment')` → `getName('equipment')`
- [ ] Update tests to use flexible matchers
- [ ] Remove obsolete domain-specific translation keys from `en_us.json` (optional cleanup)
- [ ] Build and test locally
- [ ] Run `npm run lint` and `npm test` to ensure all checks pass

---

## Reference Files

**Examples of fully migrated pages:**
- `src/pages/CustomersPage.tsx` - List page
- `src/pages/CustomerDetailPage.tsx` - Detail page (SIMPLE and STANDARD views)
- `src/pages/ServiceLocationsPage.tsx` - List page with search and filters
- `src/pages/ServiceLocationDetailPage.tsx` - Detail page

**Examples of fully migrated forms:**
- `src/components/CustomerFormDialog.tsx` - Create and edit with display mode
- `src/components/ServiceLocationFormDialog.tsx` - Create and edit with address
- `src/components/WorkOrderFormDialog.tsx` - Create and edit with status

**Core files:**
- `src/contexts/GlossaryContext.tsx` - Glossary provider and getName() function
- `src/i18n/locales/en_us.json` - Common parameterized translation keys
- `src/test/setup.ts` - Test mocks for translations and glossary

---

## Summary

**Golden rules:**
1. **All entity names** flow through `getName()`
2. Use **parameterized `common.*` keys** instead of domain-specific translations
3. Import **`useGlossary`** in every page/form that displays entity names
4. Keep **generic form fields** (`Name`, `Email`) separate from entity-specific references
5. Write **flexible test matchers** that work with customized entity names

Following these patterns ensures the entire application supports tenant-customized entity names consistently.
