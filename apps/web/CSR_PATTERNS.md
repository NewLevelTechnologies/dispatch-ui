# CSR-Optimized UI Patterns

**Reference for building dense, efficient interfaces for Customer Service Representatives.**

This document contains the established patterns for creating CSR-optimized pages in Dispatch UI. All 15 entity pages follow these patterns for consistency and maximum data density.

---

## Dense List Page Pattern

All entity list pages follow this consistent pattern for maximum data density:

```typescript
// 1. Add search state and imports
import { useState, useMemo } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Input, InputGroup } from '../components/catalyst/input';

const [searchQuery, setSearchQuery] = useState('');

// 2. Filter with useMemo
const filteredItems = useMemo(() => {
  if (!items) return [];
  if (!searchQuery.trim()) return items;
  const query = searchQuery.toLowerCase();
  return items.filter(item => /* search logic */);
}, [items, searchQuery]);

// 3. Search bar with row count (mt-2, not mt-8)
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
  {items && items.length > 0 && (
    <div className="text-sm text-zinc-600 dark:text-zinc-400">
      {filteredItems.length === items.length
        ? `${items.length} ${items.length === 1 ? 'item' : 'items'}`
        : `${filteredItems.length} of ${items.length}`}
    </div>
  )}
</div>

// 4. Dense table (mt-4, not mt-8)
<div className="mt-4">
  <Table dense className="[--gutter:theme(spacing.1)] text-sm">
    {/* table content */}
  </Table>
</div>

// 5. Compact empty states
<div className="mt-4 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
  <p className="text-sm text-zinc-600 dark:text-zinc-400">
    {searchQuery ? t('common.actions.noMatchSearch') : t('common.actions.notFound')}
  </p>
</div>
```

---

## Spacing Conventions (CSR Density)

### List Pages
- Top spacing: `mt-4` (not mt-8)
- Search bar: `mt-2`
- Gap between elements: `gap-4` or `gap-2` for tight sections
- Table wrapper: `mt-4`

### Detail Pages
- Section spacing: `my-4` (not my-8)
- Content grids: `gap-4` (not gap-8)
- Top spacing: `mt-4` (not mt-8 or mt-6)

### Empty/Loading States
- Minimal padding: `p-4` (not p-8 or p-12)
- No large icons
- No vertical centering with `justify-center`
- Compact, inline text

**Result:** ~60% whitespace reduction, 25-30 rows visible per screen vs 10-15 previously.

---

## Form Controls

Pick the right primitive for each control. The choices have real UX and accessibility consequences — a filter chip and a form select are not interchangeable.

### List-page filters → `FilterChipListbox`

Filter rows above list tables use the chip pattern. Empty state shows `+ Label`; applied state shows `Label: Value ×` with an accent tint. Built on `Headless.Listbox` so screen readers announce the applied option as "selected" via `aria-selected` — a `Menu` (Catalyst `Dropdown`) cannot communicate this.

```tsx
import { ListboxOption } from '../components/catalyst/listbox';
import { FilterChipListbox, ChipDivider } from '../components/ui/FilterChipListbox';

<FilterChipListbox
  label={t('workOrders.form.type')}
  ariaLabel={t('workOrders.form.type')}
  value={typeId || null}
  displayValue={typeId ? lookupName(typeId, types) : null}
  onChange={(id) => updateParams({ type: id, page: null })}
  onClear={() => updateParams({ type: null, page: null })}
>
  <ListboxOption value={null}>Any type</ListboxOption>
  <ChipDivider />
  {types.map((t) => <ListboxOption key={t.id} value={t.id}>{t.name}</ListboxOption>)}
</FilterChipListbox>
```

Reference: `src/pages/WorkOrdersPage.tsx` (all five filters), `EquipmentPage.tsx`, `ServiceLocationsPage.tsx`, `NotificationLogsList.tsx`.

### Form selects → Catalyst `Select` (default)

For plain text-only options (state codes, timezones, simple enum picks, taxonomy IDs), use Catalyst `Select` — it wraps a native `<select>`. It renders instantly, gets free mobile OS pickers, handles 50-item lists effortlessly, and looks like a proper form input.

```tsx
import { Select } from '../components/catalyst/select';

<Field>
  <Label>State</Label>
  <Select name="state" value={state} onChange={(e) => setState(e.target.value)}>
    <option value="">Select…</option>
    {US_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
  </Select>
</Field>
```

### Form selects → Catalyst `Listbox` wrapper (rich options only)

Reach for Catalyst's `Listbox` wrapper *only* when option rows carry icons, secondary descriptions, avatars, or grouping. Native `<select>` can't render those.

If options are just text, `Select` is the right primitive — don't reach for `Listbox` for visual polish alone.

### High-cardinality pickers → typeahead picker

For customer, service-location, equipment, and other pickers with hundreds or thousands of options, use the existing typeahead picker components (`CustomerPicker`, `ServiceLocationPicker`, `EquipmentPicker`). They debounce a server-side search and render results in a popup.

These currently hand-roll the Input + popup pattern because Catalyst's `Combobox` wrapper assumes client-side filtering. A future rebuild on `Headless.Combobox` (skipping Catalyst's virtual wrapper) is queued with the dialog/detail-page redesign work — don't replace them ad-hoc.

### Row-action menus → Catalyst `Dropdown` (Menu)

For ellipsis-trigger menus of actions on a table row (Edit, Cancel, Delete, etc.), use Catalyst `Dropdown`. This is a Menu pattern (no selected state), so `Dropdown` is correct.

---

## CSR Quick Checklist

When adding/updating entity pages:
- [ ] Use `dense` prop on all Tables
- [ ] Add `className="[--gutter:theme(spacing.1)] text-sm"` to Tables
- [ ] Use InputGroup + MagnifyingGlassIcon for search
- [ ] Add row count indicator (X items / X of Y)
- [ ] Use `mt-4` for main content spacing (not mt-8)
- [ ] Use `mt-2` for search bars
- [ ] Compact empty/loading states (no centering, no large icons)
- [ ] Test with 50+ rows to verify density

---

## Reference Examples

**See these files for complete implementations:**
- `src/pages/CustomersPage.tsx` - List page with search and dense table
- `src/pages/WorkOrdersPage.tsx` - List page with filtering
- `src/pages/UsersPage.tsx` - Advanced search with dropdown filters
- `src/pages/UserDetailPage.tsx` - Detail page spacing
- `src/pages/RoleDetailPage.tsx` - Detail page spacing

---

## Common Mistakes to Avoid

❌ **Don't use mt-8 or mt-6** - Use mt-4 or mt-2 instead
❌ **Don't skip the `dense` prop** - Tables must have `dense` for proper row height
❌ **Don't use plain Input** - Use InputGroup with MagnifyingGlassIcon for search
❌ **Don't center empty states** - Keep them inline with compact padding
❌ **Don't add large icons to empty states** - Just text is sufficient

✅ **Do use established patterns** - All 15 pages follow the same structure
✅ **Do test with realistic data** - Verify 25-30 rows are visible
✅ **Do use row count indicators** - CSRs want to know how many items at a glance
✅ **Do keep search fast** - Real-time filtering with useMemo, no backend delays
