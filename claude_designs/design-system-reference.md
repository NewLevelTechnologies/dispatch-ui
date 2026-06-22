# Design-system reference

> Living doc. If you add a design-system primitive, update this file. If you find it out of date, fix it.

This document inventories the primitives, tokens, and page conventions in `dispatch-ui` as of the canonical migrated surfaces:

| Surface | File |
| --- | --- |
| List page | `src/pages/UsersPage.tsx` |
| Detail page | `src/pages/UserDetailPage.tsx` |
| Form page | `src/pages/UserFormPage.tsx` |
| Self-serve settings | `src/pages/AccountSettingsPage.tsx` |
| Multi-step wizard dialog | `src/components/account/TwoFactorSetupDialog.tsx` |

When in doubt, copy the way those files use a primitive.

---

## 1 · Catalyst components

All Catalyst components live in `src/components/catalyst/`. They wrap Headless UI with our token-driven Tailwind. **Do not edit them in a feature branch** — extend or compose.

Two recurring conventions:
- Color tokens prefixed `fg-*` / `bg-*` / `border-*` / `accent-*` are project tokens (see §3). Tailwind color tokens like `red-500` are stock Tailwind.
- Many components have a `size="xs"` variant added on top of stock Catalyst sizing for our denser admin look.

### Button — `catalyst/button.tsx`

| Prop | Type | Notes |
| --- | --- | --- |
| `color` | see colors below | mutually exclusive with `outline`/`plain` |
| `outline` | `true \| 'red'` | quieter destructive variant for in-row triggers |
| `plain` | `true` | text-only, used for Cancel buttons |
| `size` | `'md' \| 'xs' \| 'xxs'` | default `md` |
| `href` | `string` | renders as a router `<Link>` |
| `disabled`, `type`, `onClick`, … | passthrough | |

**Sizes**

| Size | Height | Text | Padding | Use |
| --- | --- | --- | --- | --- |
| `md` | responsive (44px → ~32px) | `text-base` → `sm` | `px-3.5 py-2.5` → `px-3 py-1.5` | default Catalyst, mostly unused on redesigned pages |
| `xs` | 30 px | 12.5 px | `px-2.5` | page-header CTAs, form submits |
| `xxs` | 26 px | 11.5 px | `px-2.5` | inside cards / rows — section-level actions |

**Colors** (all map to either Tailwind tokens or our accent tokens)

`dark/zinc` (default), `light`, `dark/white`, `dark`, `white`, `zinc`, `indigo`, `cyan`, `red`, `orange`, `amber`, `yellow`, `lime`, `green`, `emerald`, `teal`, `sky`, `blue`, `violet`, `purple`, `fuchsia`, `pink`, `rose`, **`accent`**, **`accent-soft`**.

- `accent` — primary brand button: warm-orange/cool-teal 500→600 gradient. Use for the main page CTA.
- `accent-soft` — "selected/pressed chip" surface. Pair with `outline` for unselected state.
- `outline`/`outline="red"` — discovery action (e.g. "Reset 2FA", "Deactivate"). `outline="red"` is the *quiet* destructive — the *loud* one is `color="red"` and only lives inside the confirmation Alert.
- `plain` — Cancel and other low-emphasis actions.

```tsx
<Button color="accent" size="xs" onClick={handleSave}>Save changes</Button>
<Button outline size="xs" onClick={handleEdit}>Edit user</Button>
<Button outline="red" size="xxs" onClick={confirmDeactivate}>Deactivate</Button>
<Button plain size="xs" href="/users">Cancel</Button>
<Button color="red" onClick={confirmDelete} disabled={pending}>Delete</Button>
```

### Input + InputGroup — `catalyst/input.tsx`

| Prop | Type | Notes |
| --- | --- | --- |
| `size` | `'md' \| 'xs'` | `xs` = 32 px tall, 12.5 px text, no responsive shift |
| `type` | `'email' \| 'number' \| 'password' \| 'search' \| 'tel' \| 'text' \| 'url' \| 'date' \| 'datetime-local' \| 'month' \| 'time' \| 'week'` | |
| (all standard) | | |

`InputGroup` wraps an Input + a leading or trailing icon (icons need `data-slot="icon"`).

```tsx
<Field size="xs">
  <Label size="xs" required>First name</Label>
  <Input size="xs" value={name} onChange={(e) => setName(e.target.value)} />
</Field>

<InputGroup>
  <MagnifyingGlassIcon data-slot="icon" />
  <Input type="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
</InputGroup>
```

Focus ring uses `--accent-500` (not Catalyst's hardcoded blue).

### Field / Label / Description / ErrorMessage / Fieldset / FieldGroup / Legend — `catalyst/fieldset.tsx`

`Field` is the wrapper that establishes label/control/description vertical rhythm. Always use it around an Input/Select/Textarea/Switch/Checkbox.

| Component | Notable props |
| --- | --- |
| `Field` | `size?: 'xs'` — tightens label↔control gap from 12 px to 4 px |
| `Label` | `size?: 'xs'`, `required?: boolean` (renders `*`), `hint?: ReactNode` (renders inline `· hint`) |
| `Description` | `size?: 'xs'` |
| `ErrorMessage` | `size?: 'xs'` |
| `FieldGroup` | adds 32 px gap between fields |
| `Fieldset`, `Legend` | for grouping |

`size="xs"`:
- `Label` → 11 px semibold, `fg-strong`
- `Description` → 10.5 px, `fg-dim`
- `ErrorMessage` → 11 px, `danger-500`

```tsx
<Field size="xs">
  <Label size="xs" required hint="sign-in · cannot change">Email</Label>
  <Input size="xs" type="email" disabled={!isInvite} value={email} onChange={…} />
  {error && <ErrorMessage size="xs">{error}</ErrorMessage>}
</Field>
```

### Checkbox + CheckboxField + CheckboxGroup — `catalyst/checkbox.tsx`

| Prop | Type | Notes |
| --- | --- | --- |
| `color` | full Catalyst palette + `accent` | default `dark/zinc`, use `accent` in feature surfaces |
| `checked`, `onChange(boolean)`, `indeterminate`, `disabled` | passthrough | |

`CheckboxField` is the layout shell that pairs a `Checkbox` + `Label` + `Description`. **Children must be direct.**

```tsx
<CheckboxField>
  <Checkbox color="accent" checked={on} onChange={setOn} />
  <Label>Send invitation email</Label>
  <Description>Link is valid 7 days.</Description>
</CheckboxField>
```

Use `<label>` wrapping a bare `Checkbox` for chip-style multiselect rows (see `RoleMultiSelect` in `UserFormPage`).

### Switch + SwitchField + SwitchGroup — `catalyst/switch.tsx`

Same shape as Checkbox. `color` accepts the full palette (no `accent` variant). For preference toggles where the choice is binary; use `ToggleGroup` instead when there are 2–4 options.

### Select — `catalyst/select.tsx`

Native `<select>` styled to match Input. Pass `multiple` for a multi-select native control. For listbox/combobox UIs prefer `Listbox` or `FilterChipListbox`.

### Textarea — `catalyst/textarea.tsx`

| Prop | Default | Notes |
| --- | --- | --- |
| `resizable` | `true` | set `false` to lock height |

Note: focus ring is still Catalyst-blue here — if you need the accent ring, file an issue. Don't override in a page.

### Dialog — `catalyst/dialog.tsx`

| Prop | Type | Notes |
| --- | --- | --- |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl' \| '2xl' \| '3xl' \| '4xl' \| '5xl'` | default `lg` |
| `padding` | `'default' \| 'none'` | `none` lets `WizardHeader`-style headers span edge-to-edge |
| `open`, `onClose` | required | |

Sub-components: `DialogTitle`, `DialogDescription`, `DialogBody`, `DialogActions`. Use `padding="none"` and provide your own padded body when you need a `WizardHeader` or full-bleed step UI.

```tsx
<Dialog open={open} onClose={onClose} size="md" padding="none">
  <WizardHeader title="Set up two-factor" step={1} totalSteps={2} icon={<ShieldCheckIcon className="size-3" />} />
  <div className="px-6 pt-5 pb-4">…</div>
</Dialog>
```

### Alert — `catalyst/alert.tsx`

Confirmation dialog. Smaller and less ceremonial than `Dialog`. Sub-components: `AlertTitle`, `AlertDescription`, `AlertBody`, `AlertActions`. Use for "Are you sure you want to delete X?" — the destructive confirmation lives here as `<Button color="red">`.

```tsx
<Alert open={open} onClose={onClose}>
  <AlertTitle>Delete {name}?</AlertTitle>
  <AlertDescription>This cannot be undone.</AlertDescription>
  <AlertActions>
    <Button plain onClick={onClose}>Cancel</Button>
    <Button color="red" onClick={confirm} disabled={pending}>Delete</Button>
  </AlertActions>
</Alert>
```

### Badge — `catalyst/badge.tsx`

| Prop | Default | Type |
| --- | --- | --- |
| `color` | `'zinc'` | full Tailwind palette + `accent` |
| `size` | `'sm'` | `'sm' \| 'xs'` |

- `sm` — Catalyst default. Rounded-md, padding `px-1.5 py-0.5`, 12 px text.
- `xs` — tighter (`rounded-[4px]`, `px-[7px] py-[2px]`, 10.5 px, no `font-medium`). Use for high-density chip clusters (capability badges).

`color="accent"` follows the tenant accent (mapped to `.badge-accent` in `components.css`).

```tsx
<Badge>Awaiting approval</Badge>
<Badge color="accent" size="xs" title={capability.description}>{capability.displayName}</Badge>
```

`BadgeButton` is the linkable/clickable variant. Use for routable badges.

### Heading + Subheading — `catalyst/heading.tsx`

| Prop | Type | Notes |
| --- | --- | --- |
| `level` | `1 \| 2 \| 3 \| 4 \| 5 \| 6` | renders `h<level>`; default `1`/`2` |
| `size` | `'page-lg' \| 'page-md' \| 'page-sm' \| undefined` | undefined falls back to Catalyst's default sizing |

Both use `text-fg-strong`. With no `size`, `Heading` renders Catalyst's default (`text-2xl/8 sm:text-xl/8 font-semibold`) — fine for conventional settings panels. For the redesigned page surfaces use the page sizes below so we stop hand-rolling `<h1 className="text-[18px]…">`.

**Sizes**

| `size` | font-size | line-height | weight | tracking | Use |
| --- | --- | --- | --- | --- | --- |
| `page-lg` | 22 px | 1.2 | 700 | `-0.022em` | list pages, `PageHead` |
| `page-md` | 20 px | 1.2 | 700 | `-0.022em` | form pages |
| `page-sm` | 18 px | 1.25 | 700 | `-0.02em` | detail-page header cards |
| undefined | (Catalyst default) | | semibold | | non-page contexts |

Why `'page-lg'` not `'lg'`: the names commit to "this is the page-title slot" so callers don't try to repurpose them for sectional headings.

The component sizes type only — margins, leading-trim, and surrounding layout are the caller's job.

```tsx
<Heading level={1} size="page-lg">Users</Heading>          {/* list page / PageHead */}
<Heading level={1} size="page-md">Invite user</Heading>    {/* form page */}
<Heading level={1} size="page-sm">Maria Chen</Heading>     {/* detail header */}
<Heading level={2}>Section heading</Heading>               {/* Catalyst default */}
```

### Text / TextLink / Strong / Code — `catalyst/text.tsx`

`Text` is the canonical body-copy primitive — paragraph by default, optional `span` / `div`. Replaces hand-rolled `<p className="text-[12.5px] text-fg-muted">` patterns.

| Prop | Type | Default |
| --- | --- | --- |
| `size` | `'md' \| 'sm' \| 'xs'` | `'md'` |
| `tone` | `'default' \| 'strong' \| 'muted' \| 'dim'` | `'default'` |
| `as` | `'p' \| 'span' \| 'div'` | `'p'` |
| `className`, children | passthrough | |

**Sizes**

| `size` | font-size | line-height |
| --- | --- | --- |
| `md` (default) | 13 px | 1.45 |
| `sm` | 12.5 px | 1.45 |
| `xs` | 11 px | 1.4 |

**Tones**

| `tone` | color |
| --- | --- |
| `default` | `text-fg` |
| `strong` | `text-fg-strong` |
| `muted` | `text-fg-muted` |
| `dim` | `text-fg-dim` |

```tsx
<Text>Body copy default</Text>                              {/* 13 px fg */}
<Text size="sm" tone="muted">Last seen 12m ago</Text>       {/* 12.5 px fg-muted */}
<Text as="span" size="xs" tone="dim">Set Aug 14, 2022</Text> {/* 11 px fg-dim */}
<Text tone="strong">Managed via reset link</Text>           {/* 13 px fg-strong */}
```

`TextLink`, `Strong`, and `Code` are co-located in the same file. They're independent of the `tone` system today — only `Text` participates in the `size`/`tone` scale.

**What to keep inline**. The primitive covers the common 80%; don't force-fit edge cases through it:

- Sizes not in the table (10.5 px micro labels, 11.5 px metadata lines, 14 px section titles).
- Unusual colors (`text-danger-500`, `text-success-500`).
- Inline styling already wrapped in helpers like `id-mono` or `tnum`.

### Dropdown — `catalyst/dropdown.tsx`

Wraps Headless `Menu`. Sub-components: `Dropdown`, `DropdownButton`, `DropdownMenu`, `DropdownItem`, `DropdownLabel`, `DropdownDescription`, `DropdownHeader`, `DropdownHeading`, `DropdownSection`, `DropdownDivider`, `DropdownShortcut`.

`DropdownButton` defaults to rendering as a `Button`. Override with `as={IconButton}` for kebab triggers in list rows. `DropdownMenu anchor="bottom end"` is the standard row-action position.

```tsx
<Dropdown>
  <DropdownButton as={IconButton} aria-label="More options">
    <EllipsisVerticalIcon className="size-4" />
  </DropdownButton>
  <DropdownMenu anchor="bottom end">
    <DropdownItem onClick={onEdit}><DropdownLabel>Edit</DropdownLabel></DropdownItem>
    <DropdownItem onClick={onDelete}><DropdownLabel>Delete</DropdownLabel></DropdownItem>
  </DropdownMenu>
</Dropdown>
```

### Listbox — `catalyst/listbox.tsx`

Single-select dropdown with selection persistence. `Listbox` + `ListboxOption` (+ `ListboxLabel`, `ListboxDescription`). For filter chips above tables, use `FilterChipListbox` (custom, see §2) instead — it's hue-agnostic and supports a reset row.

### Combobox — `catalyst/combobox.tsx`

Type-ahead picker built on Headless Combobox. Use for "pick a customer / location / equipment" interactions where there are many options. See `CustomerPicker.tsx`, `EquipmentPicker.tsx`.

### Avatar (Catalyst) — `catalyst/avatar.tsx`

| Prop | Type |
| --- | --- |
| `src` | `string \| null` |
| `initials` | `string` |
| `square` | `boolean` |
| `alt` | `string` |

Pure image/initials avatar. **Prefer the project `ui/Avatar` (§2)** — it auto-colors initials by name. Catalyst's `Avatar` is the right primitive only if you have a profile image URL.

### Tabs — `catalyst/tabs.tsx`

Headless Tabs wrapper. Sub-components: `TabGroup`, `TabList`, `Tab`, `TabPanels`, `TabPanel`. Underline-style. **For detail-page section tabs prefer `ui/Tabs` (§2)** — it's denser and supports counts/tones.

### Card (Catalyst) — `catalyst/card.tsx`

| Prop | Type | Default |
| --- | --- | --- |
| `title` | `ReactNode` | — |
| `subtitle` | `ReactNode` | — |
| `footer` | `ReactNode` (full-bleed below body) | — |
| `padding` | `'default' \| 'none'` | `'default'` |

This is the canonical card on **detail and form pages**. Title is 13 px semibold, subtitle 11 px muted, body padding 14 px. Use `padding="none"` when the body is a stack of `DataRow`s (they manage their own px so dividers reach the card edges).

```tsx
<Card title="Identity">
  <FormFields />
</Card>

<Card title="Security" padding="none">
  <DataRow label="Password" action={<Button outline size="xxs">Send reset</Button>}>
    <div className="text-[12.5px] text-fg-strong">Managed via reset link</div>
  </DataRow>
</Card>
```

### DataRow — `catalyst/data-row.tsx`

| Prop | Type | Default |
| --- | --- | --- |
| `label` | `ReactNode` | required |
| `action` | `ReactNode` | — |
| `last` | `boolean` | `false` — drops bottom border |
| `labelWidth` | `number` (px) | `140` |

Designed to live inside `<Card padding="none">`. Common label widths: 90 (Roles/Regions on `UserDetailPage`), 110 (Security card), 140 (default, `AccountSettings`).

```tsx
<DataRow label="Password" labelWidth={110} action={<Button outline size="xxs">…</Button>}>
  <div className="text-[12.5px] text-fg-strong">Managed via reset link</div>
  <div className="mt-0.5 text-[10.5px] text-fg-dim">Existing sessions end within 15 min.</div>
</DataRow>
```

### Pagination — `catalyst/pagination.tsx`

Used via `ListFooter` (§2). Sub-components: `Pagination`, `PaginationPrevious`, `PaginationNext`, `PaginationList`, `PaginationPage`, `PaginationGap`. Hrefs preserve URL params.

### Other Catalyst components

These exist but aren't widely used on redesigned surfaces; cross-reference before designing with them:

- `description-list.tsx` — DT/DD layout. Replaced by `Card` + `DataRow`.
- `divider.tsx` — `<Divider soft />` for soft horizontal rules. Mostly unused.
- `link.tsx` — Catalyst's react-router-integrated link. `<Button href="…">` already uses it.
- `navbar.tsx`, `sidebar.tsx`, `sidebar-layout.tsx`, `stacked-layout.tsx`, `auth-layout.tsx` — shell primitives consumed by `AppLayout.tsx`.
- `radio.tsx` — radio buttons. We almost always use `ToggleGroup` instead.
- `slideover.tsx` — side panel. Used by `FinancialDrawer`, `DispatchDetailDrawer`.

---

## 2 · Custom primitives in `src/components/ui/`

These exist when Catalyst defaults are too loose for operational density. **Default to these on redesigned surfaces.**

### Card / CardHead / CardTitle / CardSub / CardBody — `ui/Card.tsx`

CSS-class based card (renders `.card` from `components.css`). Used on **list pages** (`UsersPage`) where the card wraps a `DenseTable` + `ListFooter`. `CardBody` accepts `flush` to suppress inner padding so the table reaches the card edges.

```tsx
<Card>
  <CardBody flush>
    <DenseTable>…</DenseTable>
    <ListFooter … />
  </CardBody>
</Card>
```

**Diverges from Catalyst Card** because Catalyst Card needs a wrapping div with our title-area structure; the CSS card has a slightly different border-radius (`--r-lg`) and a built-in flush mode for tables. Both are correct in their contexts:

| Use this Card | When |
| --- | --- |
| `catalyst/card.tsx` (`<Card title="…">`) | Detail and form pages — anywhere the card has a labeled title-bar |
| `ui/Card.tsx` (`<Card><CardBody flush>…`) | List pages wrapping a `DenseTable` |

### Callout — `ui/Callout.tsx`

Tinted info block with optional icon, title, body, and action.

| Prop | Type | Default |
| --- | --- | --- |
| `kind` | `'info' \| 'warning' \| 'danger' \| 'success' \| 'accent' \| 'neutral'` | `'info'` |
| `icon` | `ReactNode \| null` | default heroicon per kind (info ↔ circle, warning ↔ triangle, danger ↔ exclamation, success ↔ check); `null` suppresses |
| `title` | `ReactNode` | — |
| `action` | `ReactNode` | — |

```tsx
<Callout kind="warning">No regions selected — assign at least one.</Callout>

<Callout
  kind="accent"
  icon={<div className="grid size-9 place-items-center rounded-lg bg-accent-500 text-white"><ShieldCheckIcon className="size-[18px]" /></div>}
  title="Protect your account with two-factor"
  action={<Button size="xs">Enable</Button>}
>
  Codes refresh every 30 seconds.
</Callout>
```

### Pill + Tag — `ui/Pill.tsx`

Status badge with optional dot + glow.

| Prop | Type | Default |
| --- | --- | --- |
| `tone` | `'neutral' \| 'info' \| 'success' \| 'warning' \| 'danger' \| 'accent' \| 'violet'` | `'neutral'` |
| `dot` | `boolean` | render leading status dot |
| `live` | `boolean` | adds 2.5 px glow ring around the dot — for "real-time / active" signals |
| `inline` | `boolean` | strips bg/padding so it's just dot + label inside a metadata line |

`Tag` is the rectangular monospace variant (codes like `WO-3892`, `T-04`).

```tsx
<Pill tone="success" dot live>Active</Pill>
<Pill tone="neutral" dot>Disabled</Pill>
<Pill tone="info" dot inline>Scheduled</Pill>     {/* inside meta line */}
<Tag>PRT-CAP-3550</Tag>
```

**Pill vs Catalyst Badge**:
- `Pill` — status / live state. Single tone enum drives both bg + fg tints. Dot + glow available.
- `Badge` — chip for an entity tag (capabilities, regions, roles). Full Tailwind palette + an `accent` variant. Two sizes (`sm`, `xs`).

### ToggleGroup + ToggleGroupOption — `ui/ToggleGroup.tsx`

Segmented single-choice control. Built on Headless `RadioGroup`.

```tsx
<ToggleGroup value={mode} onChange={setMode} aria-label="Theme">
  <ToggleGroupOption value="light">☀ Light</ToggleGroupOption>
  <ToggleGroupOption value="dark">☾ Dark</ToggleGroupOption>
</ToggleGroup>
```

Active option rises to `--bg-elev` with a 1 px shadow — explicitly **not** a saturated accent fill. Use for theme / accent / density / view-mode toggles.

### EmptyState / LoadingState / ErrorState — `ui/EmptyState.tsx`, `ui/LoadingState.tsx`, `ui/ErrorState.tsx`

Three small primitives that share visual rhythm (centered column, ~80 px tall, optional icon, title, optional description, optional action). Mount inside `<CardBody flush>` on list pages — they replace hand-rolled centered-text divs.

**`<EmptyState>`** — "no records" placeholder.

| Prop | Type | Notes |
| --- | --- | --- |
| `icon` | `ReactNode` | optional — typically a heroicon at `size-10 text-fg-dim` |
| `title` | `string` | required |
| `description` | `ReactNode` | optional |
| `action` | `ReactNode` | optional — typically a `Button` |
| `compact` | `boolean` | optional — smaller, icon-less variant for detail-page section emptiness |

Default: `py-12`, icon ~40 px, title 14 px semibold `fg-strong`, description 12 px `fg-muted`. Compact: `py-6`, no icon, title 12.5 px, description 11 px.

```tsx
<EmptyState
  icon={<UsersIcon className="size-10 text-fg-dim" />}
  title="No users yet"
  description="Invite your team to get started."
  action={<Button color="accent" onClick={handleAdd}>Add user</Button>}
/>

<EmptyState compact title="No regions assigned" />     {/* in-card section */}
```

When the list is empty *because filters are active*, branch the copy and the action — different from when there's nothing to show at all:

```tsx
{hasFilters ? (
  <EmptyState
    icon={<UsersIcon className="size-10 text-fg-dim" />}
    title="No users match your filters"
    description="Try clearing or adjusting filters."
    action={<Button outline onClick={clearFilters}>Clear filters</Button>}
  />
) : (
  <EmptyState
    icon={<UsersIcon className="size-10 text-fg-dim" />}
    title="No users yet"
    description="Invite your team to get started."
    action={<Button color="accent" onClick={handleAdd}>Add user</Button>}
  />
)}
```

**`<LoadingState>`** — quiet, delayed spinner.

| Prop | Type | Default |
| --- | --- | --- |
| `label` | `string` | `'Loading…'` |
| `delay` | `number` | `250` — ms before the spinner appears |

The 250 ms delay means fast queries never flash a spinner; slow ones reveal it once the wait is long enough to feel like waiting. Pass `delay={0}` to force-show immediately.

```tsx
<LoadingState />
<LoadingState label="Loading users…" />
```

**`<ErrorState>`** — in-list error placeholder for "couldn't fetch the data" failures.

| Prop | Type | Notes |
| --- | --- | --- |
| `title` | `string` | required |
| `description` | `ReactNode` | optional — typically `extractApiError(error)` |
| `action` | `ReactNode` | optional — typically a retry button |

Renders the `ExclamationTriangleIcon` in `text-danger-500`, with the description tinted `text-danger-500` as well.

```tsx
<ErrorState
  title="Couldn't load users"
  description={extractApiError(error)}
  action={<Button outline onClick={() => refetch()}>Try again</Button>}
/>
```

**`<ErrorState>` vs `<Callout kind="danger">`**:
- `ErrorState` is for **in-list errors** where the rest of the page is fine and the user can retry. Used inside `<CardBody flush>`.
- `Callout kind="danger"` is for **page-level errors** that block the whole screen (e.g. detail-page primary fetch failed). Used at the top of the page body.

### OtpInput — `ui/OtpInput.tsx`

N-box one-time-code input.

| Prop | Type | Default |
| --- | --- | --- |
| `length` | `number` | `6` |
| `value` | `string` | required |
| `onChange(value)` | required | |
| `onComplete(value)` | optional | fires when `value.length === length` |
| `autoFocus`, `disabled`, `ariaLabel`, `className` | optional | |

Forwarded ref exposes `{ focus }` for refocus on verify error.

```tsx
const otpRef = useRef<OtpInputHandle>(null);
<OtpInput length={6} value={code} onChange={setCode} onComplete={mutation.mutate} autoFocus ref={otpRef} />
```

### WizardHeader — `ui/WizardHeader.tsx`

Title bar with step pip indicator for dialogs/panels. Pair with `<Dialog padding="none">`.

```tsx
<WizardHeader title="Set up two-factor" icon={<ShieldCheckIcon className="size-3" />} step={1} totalSteps={2} />
```

### Avatar — `ui/Avatar.tsx`

Colored-initials circle. Hue is deterministic by name via `utils/roleColor.ts`, so the same person is the same color everywhere.

| Prop | Type | Default |
| --- | --- | --- |
| `name` | `string` | required |
| `src` | `string` | optional photo URL — falls back to initials |
| `size` | `'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` (22 / 26 / 36 / 52 px) |

```tsx
<Avatar name="Tanya Reyes" />
<Avatar name="Daniel Park" size="xl" />
```

**Use this instead of `catalyst/Avatar`** unless you specifically have a photo URL and no name.

### RoleChip — `src/components/RoleChip.tsx`

Small dot + role name pill, deterministic color by role name. One source of truth so the chip looks identical on the user-list, user-detail header, and Roles+Regions card.

```tsx
<RoleChip name="Dispatcher" />
```

### DenseTable + DenseTHead + DenseRow + CellStack + CellTop + CellSub — `ui/DenseTable.tsx`

Thin wrappers around `<table>` that apply the `.dense-table` CSS class. 12 px text, 9px×12px cell padding, sticky `<thead>` against `--bg-elev-2`, monospace number alignment, two-line `CellStack`, urgent-row tint, and a responsive "row-as-card" mode at `<640px`. Sticky-left first column appears at `<1024px` container width.

```tsx
<DenseTable>
  <DenseTHead>
    <tr><th>Job</th><th>Customer</th><th className="right">Value</th><th style={{ width: 40 }}></th></tr>
  </DenseTHead>
  <tbody>
    <DenseRow urgent={j.urgent} onClick={…}>
      <td>
        <CellStack>
          <CellTop>{j.id}</CellTop>
          <CellSub>{j.type}</CellSub>
        </CellStack>
      </td>
      <td className="muted">{j.customer}</td>
      <td className="right num strong">{formatCurrency(j.value)}</td>
      <td className="right">{/* Dropdown kebab */}</td>
    </DenseRow>
  </tbody>
</DenseTable>
```

Cell helpers via className: `right` (text-align), `num` (tabular-nums), `strong` (`fg-strong` semibold), `muted` (11 px `fg-muted`).

**Mobile labeled-stack (`<640px`).** The row-as-card reflow drops the `<thead>`, so a stacked value that lived under a column header can lose its meaning (a lone `2`, `Florida`, `$50.00`). Give it the header back as an inline label — but **only when it'd be ambiguous on its own**. The test is ambiguity, not "every cell":

- **Label it** when bare is unidentifiable: `Region: Florida`, `Balance: $50.00` (two bare `$50.00` lines are meaningless without `Amount` / `Balance`).
- **Leave it bare** when self-identifying by format: status `Pill`s, a formatted phone, an email (the `@` says email), a full address. The headline/identity cell (name, a location's address) is always bare.
- Multiple of the same kind **are** ambiguous → label each (`Mobile` / `Office` / `After hours` for three phone numbers).
- Short values inline (`Make / Model: Simons · Rager`); only break to a second line for genuinely long values (AI summaries, notes).

Mechanics — all CSS-only, mobile-gated, desktop unchanged:

| Hook | Use |
| --- | --- |
| `<td data-label="Balance">` | Renders the cell as `Balance: $250` on the mobile card. |
| `<span className="dt-inline-label">Contact: </span>` | Same idea inside a multi-line `CellStack` (a `::before` can't sit inline on a flex-column stack — prefix the first line). |
| `dt-inline-value` (on the `<td>`) | Keep a short value (and its `·`-joined parts) on the label's line instead of stacking them beneath it; omit for long values that should wrap. |
| `dt-empty` (on the `<td>`) | Drop a cell whose value is just `—` (kept on desktop for column alignment, omitted from the card). |
| `dt-mobile-hide` (on the `<td>`) | Drop a low-value column from the card entirely. |
| `<DenseTable className="dense-stack">` | Table has no kebab/actions column → the last cell is data; stack it full-width instead of floating it to the top-right corner. |

**Diverges from Catalyst `table.tsx`** because Catalyst's table padding is sized for marketing-style admin dashboards. CSRs see 25–30 rows at a glance here, not 8.

### PageHead — `ui/PageHead.tsx`

Page title + subtitle + actions row.

```tsx
<PageHead
  title={t('entities.users')}
  sub={`${count} users · ${disabled} disabled`}
  actions={<Button color="accent" onClick={handleAdd}>Add user</Button>}
/>
```

22 px bold title (`<Heading size="page-lg">` internally), 12.5 px muted sub (`<Text size="sm" tone="muted">`). `mb-4` baked in.

### ListToolbar + ListSearch — `ui/ListToolbar.tsx`

Search + filter chips on a single horizontal row above a list card. `ListSearch` is a dense-styled Input with a magnifier icon.

```tsx
<ListToolbar
  search={<ListSearch placeholder="Search by name…" value={q} onChange={setQ} />}
>
  <FilterChipListbox … />
  <FilterChipListbox … />
</ListToolbar>
```

### ListFooter — `ui/ListFooter.tsx`

Bottom band of a list card: left-aligned summary text + right-aligned Catalyst pagination.

| Prop | Type | Notes |
| --- | --- | --- |
| `page` | `number` | current page |
| `totalPages` | `number` | renders nothing if ≤ 1 and no `left` |
| `pageHref(page)` | `(n: number) => string` | hrefs preserve filter state |
| `left` | `ReactNode` | "Showing 1–25 of 142 customers" |

```tsx
<ListFooter
  page={page}
  totalPages={totalPages}
  pageHref={(p) => `/users?page=${p}`}
  left={<>Showing <strong>1–25</strong> of 142 users</>}
/>
```

### FilterChipListbox + ChipListboxOption — `ui/FilterChipListbox.tsx`

Single- or multi-select filter chip with popover.

**Single mode** (default):

| Prop | Type |
| --- | --- |
| `label` | `string` |
| `ariaLabel` | `string` |
| `value` | `string \| null` |
| `displayValue` | `string \| null` |
| `onChange(value \| null)` | required |
| `onClear()` | required |
| `resetLabel` | `string` (renders an "Any role" / "All" reset row at popover top) |

**Multi mode** (`multiple` prop):

| Prop | Type |
| --- | --- |
| `value` | `string[]` |
| `onChange(string[])` | required |
| (no `resetLabel` — × button clears) | |

Always use `ChipListboxOption`, not Catalyst's `ListboxOption` — Catalyst's hardcodes a saturated blue focus pill that fights the chip aesthetic.

```tsx
<FilterChipListbox
  label="Role"
  ariaLabel="Role"
  value={roleId || null}
  displayValue={roleId ? roles.find((r) => r.id === roleId)?.name ?? null : null}
  resetLabel="All roles"
  onChange={(id) => setRoleId(id ?? '')}
  onClear={() => setRoleId('')}
>
  {roles.map((r) => <ChipListboxOption key={r.id} value={r.id}>{r.name}</ChipListboxOption>)}
</FilterChipListbox>
```

### KPI — `ui/KPI.tsx`

Dashboard stat card with colored left rule.

| Prop | Type |
| --- | --- |
| `label` | `string` (uppercase 10.5 px) |
| `value` | `ReactNode` (24 px bold tabular) |
| `delta` | `string` |
| `deltaDir` | `'up' \| 'down'` |
| `meta` | `string` |
| `bar` | CSS color, e.g. `'var(--warning-500)'` |

Dashboard-only. Don't ship on list/detail pages.

### Tabs + ViewTabs — `ui/Tabs.tsx`

Two flavors of underlined tabs.

- `Tabs` — detail-page section tabs. Items: `{ id, label, count? }`.
- `ViewTabs` — list-page saved views. Items: `{ id, label, count?, tone? }` where `tone` adds a colored dot.

Both controlled — pass `value` + `onChange(id)`. Active tab gets `border-bottom: 2px solid accent-500`.

### Timeline — `ui/Timeline.tsx`

Vertical activity feed with a left rail.

| Prop | Type |
| --- | --- |
| `items` | `{ dot?: '' \| 'info' \| 'success' \| 'warning' \| 'danger' \| 'muted', time: ReactNode, text: ReactNode }[]` |
| `maxHeight` | optional — turns into a scrollable container |

`dot` empty string → accent ring (default).

### Sparkline — `ui/Sparkline.tsx`

Pure-SVG line chart for KPI cards. Props: `values: number[]`, `width`, `height`, `color`, `filled`.

### AppShell — `ui/AppShell.tsx`

Sidebar + topbar + content reference shell. Sidebar uses `--sidebar-*` tokens that stay dark in both themes (Linear / Vercel / ServiceTitan signature). **Today this is a pattern reference only** — the live shell is `components/AppLayout.tsx`. When `AppLayout` migrates to this shell, nav data will flow through props.

### dense.* presets — `ui/dense.ts`

Tailwind v4 `!`-modifier className strings that retrofit Catalyst form primitives to the dense scale **without overriding the components themselves**. Useful when Catalyst's stock sizing leaks through (e.g., inside a third-party wrapper like `PatternFormat`).

```ts
import { dense } from '@/components/ui/dense';
<Input className={dense.input} />
<Field className={dense.field}><Label className={dense.label}>…</Label></Field>
```

Available presets: `field`, `label`, `input`, `select`, `textarea`, `switch`, `checkbox`, `hint`, `error`, `row`. Plus `withDensity(parentClass)` to densify an entire form subtree.

**Prefer `Field size="xs"` + `Input size="xs"`** for new forms. Reach for `dense.*` only when the size prop doesn't reach (third-party-wrapped inputs).

### IconButton — `src/components/IconButton.tsx` (not `ui/`, but design-system-adjacent)

Tight icon-only button for inline row controls. Catalyst's `Button` enforces a 44 px touch-target floor that is too tall for dense tables.

Always requires `aria-label`. Defaults: `p-0.5`, neutral fg, hover bg, focus ring. Used as `as={IconButton}` on `DropdownButton` for kebab triggers.

---

## 3 · Design tokens

All tokens live in `src/styles/tokens.css`. They are CSS custom properties, theme-switched by classes on `<html>`. Tailwind utilities map to these tokens via `@theme inline` in `src/index.css`.

**Activation**

| Class on `<html>` | Effect |
| --- | --- |
| `.theme-light` / `.theme-dark` | swaps surface, fg, border, shadow tokens |
| `.accent-cool` | swaps `--accent-*` to a steel-teal palette (warm orange is the default) |

### Surfaces (theme-driven)

| Token | Role |
| --- | --- |
| `--bg` | page background under the canvas |
| `--bg-sunken` | canvas behind cards |
| `--bg-elev` | card surface |
| `--bg-elev-2` | nested / table-header surface |
| `--bg-hover` | row / button hover |
| `--bg-active` | pressed / selected |

### Foreground (theme-driven)

| Token | Role |
| --- | --- |
| `--fg-strong` | titles, primary values |
| `--fg` | body text |
| `--fg-muted` | secondary / labels |
| `--fg-dim` | tertiary / timestamps |
| `--fg-accent` | accent-styled text (links, toggles, highlighted values) — flips `accent-700`↔`accent-300` by theme |

### Borders (theme-driven)

| Token | Role |
| --- | --- |
| `--border` | default rule |
| `--border-strong` | hovered/active input borders |
| `--border-soft` | inner / table-row dividers |

### Accent — `--accent-50` … `--accent-700`

Toggleable warm (default) / cool via `.accent-cool` on `<html>`. The `Button color="accent"` gradient uses `accent-500 → accent-600`. Focus rings use `accent-500`. The chip-selected variant `Button color="accent-soft"` mixes `accent-500` at 20%.

### Semantic — `--info-*`, `--success-*`, `--warning-*`, `--danger-*`, `--violet-*`

Each has a `-500` (saturated) and `-100` (tint) token. The accent variant of `Callout` / `Pill` mixes the 500 at ~7–14% into `--bg-elev` for the bg tint; border at ~22–28%.

### Sidebar — `--sidebar-bg`, `--sidebar-bg-2`, `--sidebar-fg`, `--sidebar-fg-dim`, `--sidebar-border`

**Always dark.** They do not flip with the theme — by design (Linear/Vercel/ServiceTitan reference).

### Radii

| Token | Value |
| --- | --- |
| `--r-xs` | 4 px |
| `--r-sm` | 6 px |
| `--r-md` | 8 px |
| `--r-lg` | 12 px |
| `--r-xl` | 16 px |

Tailwind utilities: `rounded-xs`, `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl` resolve to these.

### Shadows

| Token | Use |
| --- | --- |
| `--shadow-sm` | card resting state |
| `--shadow-md` | dropdown / popover |
| `--shadow-lg` | dialog panel |

### Fonts

| Token | Value |
| --- | --- |
| `--font-sans` | `'Geist', ui-sans-serif, …` |
| `--font-mono` | `'Geist Mono', ui-monospace, …` |

Body defaults: 13 px / 1.45, antialiased, OpenType features `'cv11', 'ss01'`. Monospace also uses `'tnum'` for tabular numbers.

### Utility helper classes (`tokens.css` / `components.css`)

- `.font-mono`, `.id-mono`, `.tnum` — monospace + tabular numerics for IDs and counts.
- `.label-tiny` — 10 px uppercase tracked label, `fg-muted`.

There is no formal spacing scale beyond Tailwind's stock 4 px grid; the design system relies on Tailwind's spacing utilities. The dense forms call out specific values inline (`gap-2.5`, `mt-2.5`, `px-3.5`, etc.) — those are intentional micro-tuning, not magic numbers.

---

## 4 · Tailwind config — non-default tokens

This project uses **Tailwind v4** with the `@tailwindcss/vite` plugin. There is **no `tailwind.config.js`**. Custom tokens are declared inline via `@theme inline { … }` in `src/index.css`:

```css
@theme inline {
  --font-sans: 'Geist', …;
  --font-mono: 'Geist Mono', …;

  /* Surfaces */
  --color-bg, --color-bg-sunken, --color-bg-elev, --color-bg-elev-2,
  --color-bg-hover, --color-bg-active

  /* Text */
  --color-fg, --color-fg-strong, --color-fg-muted, --color-fg-dim, --color-fg-accent

  /* Borders */
  --color-border, --color-border-strong, --color-border-soft

  /* Sidebar */
  --color-sidebar-bg, --color-sidebar-bg-2, --color-sidebar-fg,
  --color-sidebar-fg-dim, --color-sidebar-border

  /* Accent */
  --color-accent-50 … --color-accent-700

  /* Semantic */
  --color-info-500, --color-info-100,
  --color-success-500, --color-success-100,
  --color-warning-500, --color-warning-100,
  --color-danger-500, --color-danger-100,
  --color-violet-500, --color-violet-100

  /* Radii */
  --radius-xs … --radius-xl

  /* Shadows */
  --shadow-sm, --shadow-md, --shadow-lg
}

@variant dark (&:where(.theme-dark, .theme-dark *));
```

What this means for designers:
- `bg-bg-elev`, `text-fg-strong`, `border-border-soft`, `text-accent-700`, `bg-success-500/14`, `rounded-lg`, `shadow-md` all just work — Tailwind resolves them to the CSS variables at runtime, so theme classes on `<html>` immediately re-tint everything.
- `dark:` variant is keyed to `.theme-dark` (and any descendant). Don't write `dark:` against `data-theme` or media queries.

Tailwind plugins: only `@tailwindcss/vite`. No `@tailwindcss/forms`, no `@tailwindcss/typography`.

The `handoff/tailwind.config.snippet.js` file in this directory is a **Tailwind v3-format** reference exported from the design system handoff and is **not used at build time**. Trust `src/index.css`.

---

## 5 · App-level patterns

### Routing — `src/App.tsx`

`react-router-dom` v7. Routes are declared inline in `App.tsx`. Each authenticated route is wrapped in `<ProtectedRoute isAuthenticated={…} element={…} />`.

Entity URL conventions:

| Pattern | Example |
| --- | --- |
| List | `/customers`, `/work-orders` |
| Detail | `/customers/:id`, `/work-orders/:id` |
| Settings list | `/settings/access/users` |
| Settings detail | `/settings/access/users/:id` |
| Settings new | `/settings/access/users/new` |
| Settings edit | `/settings/access/users/:id/edit` |

Settings panels are nested children of `<Route path="/settings" element={<SettingsLayout />}>`. New entity forms are **routed pages, not dialogs** on the User entity — see `UserFormPage.tsx` and the `UserInvitePage` / `UserEditPage` wrappers exported at the bottom. Most other entities still use a `<EntityFormDialog>` opened from a list-page Add button (legacy pattern, see `CustomersPage` / `CustomerFormDialog`).

### Data fetching — `@tanstack/react-query` v5

Client lives in `src/main.tsx`:

```ts
new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 5 * 60 * 1000 } } })
```

API services live in `src/api/` (`customerApi.ts`, `workOrderApi.ts`, etc.). Import either from the service module or the barrel:

```ts
import { userApi, type User } from '../api';

// Fetch
const { data, isLoading, error } = useQuery({ queryKey: ['users', id], queryFn: () => userApi.getById(id!) });

// Mutate
const queryClient = useQueryClient();
const mutation = useMutation({
  mutationFn: (data) => userApi.update(id, data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['users', id] });
    queryClient.invalidateQueries({ queryKey: ['users'] });
  },
  onError: (err: unknown) => {
    const msg = err instanceof Error && 'response' in err
      ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
      : undefined;
    window.alert(msg || 'Failed to update');
  },
});
```

`queryKey` convention: `[entity]` for the collection, `[entity, id]` for one record, `[entity, id, sub]` for a related list.

### Form handling

**No form library.** Forms are controlled React state + `useMutation`. Validation is a mix of HTML `required` attrs and inline checks in `handleSubmit`. Errors render via `<ErrorMessage size="xs">` inside the field, or `window.alert(msg)` for server-side failures (this is the current convention — there is no toast system; see Toast/Notification below).

Pattern (`UserFormPage`):
```ts
const [formData, setFormData] = useState({ /* … */ });
const mutation = useMutation({ /* … */ });
const handleSubmit = (e) => {
  e.preventDefault();
  if (formData.roleIds.length === 0) { alert('Pick a role'); return; }
  mutation.mutate();
};
```

Phone formatting uses `react-number-format`'s `<PatternFormat customInput={Input} format="(###) ###-####" />`.

### Save pattern

There is **no auto-save**. All forms are explicit Save.

- **Form page** (`UserFormPage`, `RoleDetailPage`): sticky footer at the bottom of the scroll area with `Cancel` (`plain`) and `Save` (`color="accent"` or `dark/zinc`). Buttons are 30 px (`size="xs"`). The save button is disabled while `mutation.isPending` is true.
- **Settings panel** (`AccountSettingsPage` → `ProfileCard`): inline right-aligned `Reset` + `Save` buttons under the card body. Save is disabled until the form is `dirty`.
- **Inline edit** (legacy `EditableField` component): pencil → input + check/x — used on a few older detail pages. New surfaces should prefer routing to a `<EntityFormPage mode="edit">` or opening a `<EntityFormDialog>`.

### Modal / Dialog pattern

Dialogs are **local state**, not URL-routed. The exception is the User entity, where invite/edit are dedicated routes (`/settings/access/users/new`, `/.../:id/edit`). Wizards / setup flows use `Dialog padding="none"` + `WizardHeader`. Drawers (slide-overs) use `slideover.tsx` — see `FinancialDrawer`, `DispatchDetailDrawer`. Focus trap and Esc-to-close come from Headless UI.

### Toast / notification pattern — `sonner` via `src/lib/toast.ts`

Four lanes. Use each one only for its slot — don't mix.

| Lane | Use | Examples |
| --- | --- | --- |
| **Success / inline info** | `showSuccess(title, description?)` / `showInfo(...)` | "Invitation sent to maria@…", "Changes saved", "Two-factor disabled" |
| **Recoverable error** | `showError(title, description?)` | "Couldn't save changes — try again", "Network error" |
| **Destructive confirmation** | `<ConfirmDialog>` (renders a Catalyst `<Alert>`) | "Delete this user?", "Deactivate Maya?", "Reset 2FA?" |
| **Page-level error** | `<Callout kind="danger">` | "Couldn't load user", "Failed to load activity" |

```tsx
import { showSuccess, showError, extractApiError } from '../lib/toast';

const mutation = useMutation({
  mutationFn: () => userApi.update(id, data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['users', id] });
    showSuccess('Changes saved');
  },
  onError: (err) => showError("Couldn't save changes", extractApiError(err)),
});
```

`extractApiError(err)` pulls a server `response.data.message` out of the axios-style error shape and falls back to `err.message`. Pass it as the toast description.

For long-running flows you can use the promise helper, which auto-renders loading → success/error in a single toast:

```tsx
import { showMutation } from '../lib/toast';

showMutation(userApi.regenerateRecoveryCodes(id), {
  loading: 'Regenerating recovery codes…',
  success: 'New recovery codes ready',
  error: "Couldn't regenerate codes",
});
```

**Toaster mount.** A single `<Toaster>` lives in `App.tsx`. It reads `mode` from `useTheme()` and passes `theme={mode === 'dark' ? 'dark' : 'light'}` explicitly — Sonner's `theme="system"` reads `prefers-color-scheme`, not our `.theme-dark` class. Classnames map to our tokens so toasts re-tint correctly across light/dark × warm/cool.

**`<ConfirmDialog>`.** Lives in `src/components/ConfirmDialog.tsx`. Renders a Catalyst `<Alert>` under the hood. Auto-closes on confirm — surface success via a toast in the mutation's `onSuccess`, not inside the dialog.

```tsx
<ConfirmDialog
  isOpen={pending !== null}
  onClose={() => setPending(null)}
  onConfirm={runMutation}
  title="Deactivate Maria Chen?"
  message="They will no longer be able to sign in. Audit history is preserved."
  confirmLabel="Deactivate"
  isDestructive
  isPending={mutation.isPending}
/>
```

### Loading / empty / error states

List pages mount three primitives inside `<CardBody flush>` — `<LoadingState>`, `<ErrorState>`, `<EmptyState>`. Canonical reference: `UsersPage.tsx`.

```tsx
<Card>
  <CardBody flush>
    {isLoading ? (
      <LoadingState label={t('common.actions.loading', { entities: t('entities.users') })} />
    ) : error ? (
      <ErrorState
        title={t('common.actions.couldNotLoad', { entities: t('entities.users') })}
        description={extractApiError(error) ?? (error as Error).message}
        action={<Button outline onClick={() => refetch()}>Try again</Button>}
      />
    ) : !filteredUsers || filteredUsers.length === 0 ? (
      hasFilters ? (
        <EmptyState
          icon={<UsersIcon className="size-10 text-fg-dim" />}
          title="No users match your filters"
          description="Try clearing or adjusting filters."
          action={<Button outline onClick={clearFilters}>Clear filters</Button>}
        />
      ) : (
        <EmptyState
          icon={<UsersIcon className="size-10 text-fg-dim" />}
          title="No users yet"
          description="Invite your team to get started."
          action={<Button color="accent" onClick={handleAdd}>Add user</Button>}
        />
      )
    ) : (
      <>
        <DenseTable>…</DenseTable>
        <ListFooter … />
      </>
    )}
  </CardBody>
</Card>
```

Key rules:
- `LoadingState` has a 250 ms delay before becoming visible. Fast queries don't flash; slow ones reveal once the wait is felt.
- Empty state branches on whether filters are active — different copy, different action.
- `ErrorState` is in-list (page still works, user retries). For page-level fatal errors that block the whole screen, use `<Callout kind="danger">` instead — see `UserDetailPage` when the primary user fetch fails.
- Inline empty cells in tables use an em-dash: `<span className="text-fg-dim">—</span>`. Section-level empties on detail pages can use `<EmptyState compact title="No regions assigned" />`.

### Authorization

Capability hook lives in `src/hooks/useCurrentUser.ts`:

```tsx
const canInvite = useHasCapability('INVITE_USERS');
const canAny = useHasAnyCapability('EDIT_USERS', 'DELETE_USERS');
const canAll = useHasAllCapabilities('VIEW_AUDIT_LOGS', 'EDIT_USERS');

{canInvite && <Button color="accent" onClick={handleAdd}>Add user</Button>}
```

Capabilities are SCREAMING_SNAKE strings (`INVITE_USERS`, `DEACTIVATE_USERS`, `VIEW_AUDIT_LOGS`, etc.). Hide affordances entirely when the user lacks the capability — don't render disabled buttons.

### i18n

`react-i18next`. Entity names route through `useGlossary().getName('customer', plural)`; standard actions through `t('common.actions.add', { entity: getName('customer') })`. See `CLAUDE.md` / `GLOSSARY_INTEGRATION.md` for the full pattern. **Designer note**: in handoff mocks, just write English copy — the translation wiring is a code concern, not a design concern.

---

## 6 · Icon set

Library: **Heroicons** (`@heroicons/react`).

Two styles used:
- `@heroicons/react/24/outline` — default. ~all icons in the redesigned surfaces use this.
- `@heroicons/react/24/solid` — used sparsely, for filled "on" affordances.

Sizing utility: `className="size-4"` (16 px, default in dense rows), `size-3.5` (14 px), `size-5` (20 px), `size-[18px]` (Callout default), `size-3` (badge inset).

Common imports:

```ts
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  EllipsisVerticalIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
  CheckIcon,
  InformationCircleIcon,
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
```

Catalyst components consume children with `data-slot="icon"` (e.g. inside `InputGroup`, `Button`); pass that attribute on the icon when it's a peer of the input/label.

---

## 7 · Common page-level patterns

> **Pages within the `/settings/*` tree left-anchor their content; do not use `mx-auto` on the content wrapper.** The 240 px inner-nav rail provides the left buffer, so the right edge varies by content shape (each page keeps its own `max-w-[…]`) while the left edge stays stable across navigation. Company Profile is the reference. The only `mx-auto` inside the tree is `SettingsLayout`'s shared `max-w-screen-xl` outer container — that one stays.
>
> **Exception — standalone personal-settings pages without an inner-nav (e.g. `AccountSettingsPage` at `/account/settings`) keep `mx-auto` centering.** With no inner-nav rail, left-anchoring slams content against the dark sidebar chrome; the symmetric margin gives it breathing room. These pages are "your account," not the tenant-settings tree, so a different layout regime is correct.

### List page shell — reference: `UsersPage.tsx`

```tsx
<>
  <PageHead title="Users" sub="142 users · 4 disabled" actions={<Button color="accent">Add user</Button>} />

  <ListToolbar
    search={<ListSearch placeholder="Search by name…" value={q} onChange={setQ} />}
  >
    <FilterChipListbox label="Role" … />
    <FilterChipListbox label="Status" … />
  </ListToolbar>

  {/* loading / error / empty states (see §5) */}

  <div className="mt-4">
    <Card>
      <CardBody flush>
        <DenseTable>
          <DenseTHead><tr><th>Name</th>…<th style={{ width: 40 }}></th></tr></DenseTHead>
          <tbody>{rows.map((r) => (
            <DenseRow key={r.id} onClick={() => navigate(`/.../${r.id}`)} className="cursor-pointer">
              <td><div className="flex items-center gap-2.5"><Avatar name={r.name} size="sm" /><CellStack>…</CellStack></div></td>
              …
              <td><Pill tone="success" dot live>Active</Pill></td>
              <td className="right">
                <div onClick={(e) => e.stopPropagation()}>
                  <Dropdown>
                    <DropdownButton as={IconButton} aria-label="More options"><EllipsisVerticalIcon className="size-4" /></DropdownButton>
                    <DropdownMenu anchor="bottom end">…</DropdownMenu>
                  </Dropdown>
                </div>
              </td>
            </DenseRow>
          ))}</tbody>
        </DenseTable>
        <ListFooter page={page} totalPages={totalPages} pageHref={pageHref} left={…} />
      </CardBody>
    </Card>
  </div>

  <Alert open={isDeleteAlertOpen} onClose={() => setIsDeleteAlertOpen(false)}>…</Alert>
</>
```

Cues: row hover → `--bg-hover` background; clicking the row navigates to the detail page; the kebab cell `stopPropagation()` keeps the menu separate from the row click.

### Detail page shell — reference: `UserDetailPage.tsx`

```tsx
<div className="max-w-[980px]">
  <Link to="/back" className="mb-2.5 inline-flex items-center gap-1 text-[11.5px] text-fg-muted hover:text-fg-strong">← All users</Link>

  {/* Header card — avatar + name + RoleStack + metadata line + action buttons */}
  <div className="flex items-center gap-3.5 rounded-[10px] border border-border bg-bg-elev px-4 py-3.5">
    <Avatar name={fullName} size="xl" />
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2.5">
        <Heading level={1} size="page-sm" className="m-0">{fullName}</Heading>
        <RoleChip … />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-muted">
        <Pill tone="success" dot live inline>Active</Pill>
        <span className="text-fg-dim">·</span>
        {/* … */}
      </div>
    </div>
    <div className="flex flex-shrink-0 gap-1.5">
      <Button outline size="xs">Resend invitation</Button>
      <Button color="accent" size="xs">Edit user</Button>
    </div>
  </div>

  <div className="mt-3"><Card>{/* Roles + Regions */}</Card></div>
  <div className="mt-3"><Card title="Security" padding="none"><DataRow … />…</Card></div>
  <div className="mt-3"><Card title="Account activity" padding="none">{/* feed rows */}</Card></div>
  <div className="mt-3"><Callout kind="neutral" title="Deactivate Maria" action={<Button outline="red" size="xxs">Deactivate</Button>}>Revokes sign-in immediately…</Callout></div>
</div>
```

Cues: `max-w-[980px]` is the detail-page width. Stack is header → primary card → secondary cards → destructive Callout footer. `mt-3` between cards (12 px). Section cards prefer `padding="none"` + `DataRow` for row-style layout, `padding="default"` for prose / grids.

### Form page shell — reference: `UserFormPage.tsx`

```tsx
<div className="-mx-6 -my-6 flex h-[calc(100svh-52px)] min-h-0 flex-col max-lg:-mx-4 max-lg:-my-4">
  <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
    <div className="flex-1 overflow-y-auto px-7 pb-6 pt-5">
      <div className="max-w-[720px]">
        <Link to="/back" className="mb-2.5 …">← Back</Link>
        <div className="mb-3.5">
          <Heading level={1} size="page-md" className="m-0">{headerName}</Heading>
          <Text size="sm" tone="muted" className="mt-0.5">{subline}</Text>
        </div>

        <Card title="Identity" className="mb-3">
          <div className="grid grid-cols-2 gap-2.5">
            <Field size="xs"><Label size="xs" required>First name</Label><Input size="xs" … /></Field>
            <Field size="xs"><Label size="xs" required>Last name</Label><Input size="xs" … /></Field>
          </div>
          {/* … */}
        </Card>

        <Card title="Roles" subtitle={…} className="mb-3">{/* selectors */}</Card>
        <Card title="Regions" subtitle={…} className="mb-3">{/* selectors */}</Card>
      </div>
    </div>

    {/* Sticky footer */}
    <div className="flex flex-shrink-0 items-center gap-2 border-t border-border bg-bg-elev px-7 py-3 max-lg:px-4">
      <div className="text-[11.5px] text-fg-muted">Creates 1 role · 2 regions · 12 capabilities</div>
      <span className="flex-1" />
      <Button href={cancelHref} plain size="xs">Cancel</Button>
      <Button type="submit" color="accent" size="xs" disabled={…}>Save</Button>
    </div>
  </form>
</div>
```

Cues: full-bleed (`-mx-6 -my-6`) inside the AppLayout content area, max-width 720 px inner column, sticky footer with a summary line on the left and Cancel + Save on the right. Title is 20 px (`size="page-md"`, bigger than the detail page's 18 px `page-sm`).

### Settings page shell — `AccountSettingsPage.tsx`

Wrapped in `<AppLayout>` (the live shell), centered in a 760 px column (`mx-auto` — this standalone page has no inner-nav rail, so it centers rather than left-anchors; see §7 callout), sections stacked with `mt-3.5` between cards. Each section is a `<Card title="…">` (or `padding="none"` for `DataRow`-based bodies). No sticky footer; saves are per-card.

```tsx
<AppLayout>
  <div className="mx-auto max-w-[760px] px-1 pb-16">
    <div className="mb-5"><Heading>Account settings</Heading></div>
    <ProfileCard … />
    <div className="mt-3.5"><SecurityCard … /></div>
    <div className="mt-3.5"><PreferencesCard … /></div>
  </div>
</AppLayout>
```

### Wizard dialog shell — `TwoFactorSetupDialog.tsx`

```tsx
<Dialog open={isOpen} onClose={onClose} size="md" padding="none">
  <div>
    <WizardHeader title="Set up two-factor" icon={<ShieldCheckIcon className="size-3" />} step={stepIndex} totalSteps={totalSteps} />

    {/* Step body */}
    <div className="px-6 pt-5 pb-4">
      <h2 className="text-[15px] font-bold tracking-tight text-fg-strong">{stepTitle}</h2>
      <p className="mt-1.5 text-[12px] leading-relaxed text-fg-muted">{description}</p>
      {/* … OtpInput, QR, manual secret Callout, etc. */}
    </div>

    {/* Step footer */}
    <div className="flex items-center gap-2 border-t border-border-soft bg-bg-elev-2 px-6 py-3">
      <Button plain size="xs" onClick={onClose}>Cancel</Button>
      <span className="flex-1" />
      <Button color="accent" size="xs" disabled={!codeReady}>Verify</Button>
    </div>
  </div>
</Dialog>
```

---

## 9 · Responsive policy

The admin web app is **desktop-first, responsive down**. Field techs use a separate native mobile app — this codebase doesn't need to serve them on a phone. But owners, dispatchers, and CSRs do occasionally pull up the admin on a phone (weekend metrics check, urgent record lookup), and the app should look decent when they do.

**Width tiers:**

| Width | Promise |
| --- | --- |
| `1280px+` | Full design fidelity. Default target. |
| `1024–1280px` | All pages work. Some density tightening. |
| `640–1024px` | Lists become row-as-card via DenseTable. Detail/form pages reflow to single column. No horizontal scroll. |
| `375–640px` | Read-mostly. List rows are cards. Detail pages stack. Forms still work, feel tight. |
| `< 375px` | Not promised. Doesn't break, doesn't optimize. |

**Per-page-type expectations:**

- **List pages** — `DenseTable` already handles row-as-card at `<640px`. `ListToolbar` chips wrap; `ListSearch` becomes full-width. Sticky-left first column at `<1024px`. The reflow itself is free, but it drops the `<thead>` — so any cell that would be ambiguous without its column header needs a `data-label` (see the labeled-stack rules under §2 DenseTable). Self-identifying cells (pills, phone, email, address) stay bare.
- **Detail pages** — header card stacks: avatar + title above, action buttons full-width below. Metadata line wraps. Section cards inherit single-column.
- **Form pages** — fields go single-column under `640px`. Sticky footer stays pinned. Card padding tightens to `p-3` (down from `p-3.5`).
- **Settings pages** — same as detail. Settings sidebar nav collapses to a top tab strip or hamburger on `<1024px`.
- **Dialogs / modals** — full-screen takeover on `<640px`, centered above.
- **Dashboard** — KPI cards stack 1-up. Sparklines/graphs may shrink. Some charts genuinely don't work on phone; design a summary card alternative or hide.
- **Dispatch board** — explicitly **best-effort on mobile, desktop-primary**. The multi-column timeline grid is fundamentally desktop. Field staff use the native app.

**Primitives with built-in reflow:**

A few primitives ship their own 640 px reflow so consumer pages don't add breakpoint logic when using them — drop them in and the mobile behavior is automatic.

- **`DataRow`** — three-column grid (label / value / action) at ≥640 px. Below, reflows vertically: label becomes an uppercase eyebrow above the value, action drops to its own full-width row underneath.
- **`Callout`** — single row (icon / body / action) at ≥640 px. Below, the action drops to its own full-width row below the body and the icon top-aligns with the title row (so it doesn't appear orphaned against the taller stacked content).
- **`DenseTable`** — rows collapse to one card per row at `<640px` (`<thead>` hidden, first cell = title, last cell = kebab corner). The reflow is automatic; relabeling stacked cells that would be ambiguous without their header is opt-in per `<td>` — see the labeled-stack rules under §2 DenseTable.

**Touch targets:**

Keep `size="xs"` (30 px) and `size="xxs"` (26 px) Button on desktop — they're sized for mouse precision, which keeps the dense admin feel. On touch contexts, Catalyst Button extends its tap area via padding without bumping visible height. Don't increase button heights for touch.

**Anti-patterns:**

- Don't horizontally scroll a list page. If a table is wider than the viewport, the `DenseTable` row-as-card mode is the answer (already built in).
- Don't show a "please use a desktop" interstitial at any width above 375 px. The pages should degrade gracefully.
- Don't design new pages for desktop and then add mobile breakpoints as an afterthought. Use the existing responsive primitives (`DenseTable`, single-column form reflow, Dialog full-screen takeover) and the responsive behavior is mostly automatic.

---

## 8 · Anti-patterns

Things we've explicitly walked back from. Do not reintroduce.

- **No local primitives shadowing Catalyst.** Don't define a `function Input(…)` inside a page file. If you need a denser scale, use `size="xs"` (or `dense.input` className when even that's not reachable). Extend the component in `src/components/catalyst/` if a new prop is justified.
- **No `!important` overrides on Catalyst defaults.** If a Catalyst component fights you, the answer is a `size` variant or a `data-slot` override inside the component file, not a `[&_input]:px-2!` plaster on the consumer. `dense.*` is the one sanctioned escape hatch, and it's scoped to densifying form scale.
- **No raw `<button>` for actions.** Use Catalyst `Button` (or `IconButton` for icon-only inline controls). Same for `<a>` — wrap with Catalyst `Link` or `Button href="…"`.
- **No hardcoded hex / Tailwind palette colors for theme-tracking surfaces.** Use `text-fg-strong`, `bg-bg-elev`, `border-border-soft`, `text-fg-accent` etc. Hardcoded hex is OK only for one-off illustrative SVG or `roleColor()` outputs.
- **`text-fg-accent` is the only correct color for accent-styled text.** Don't reach for `text-accent-700` directly — it stays the same shade in dark mode and disappears on accent-tinted surfaces. The semantic token `text-fg-accent` flips to `accent-300` in dark automatically. Reserve `text-accent-{500,600,700,300}` for non-text uses (borders, dot indicators, gradient stops).
- **`DenseTable` vs Catalyst `Table` (`catalyst/table.tsx`)**: prefer `DenseTable` for operational lists (8–10 columns, 25+ rows, sticky header). Catalyst `Table` is acceptable for low-density marketing-style admin views, but no redesigned page uses it today.
- **`Pill` vs `Badge`**: use `Pill` for status / live state ("Active", "Pending", "Disabled"). Use `Badge` for entity tags / chip clusters (capabilities, regions, count chips). `Pill` has a fixed tone enum; `Badge` has the full Tailwind palette plus `accent`.
- **`ui/Avatar` vs `catalyst/Avatar`**: prefer `ui/Avatar` — it auto-colors. Catalyst's `Avatar` is correct only when you have a profile image URL and no name.
- **`ui/Card` (CSS) vs `catalyst/Card`**: list pages use `ui/Card` (it's tuned to host a `DenseTable` with `<CardBody flush>`). Detail and form pages use `catalyst/Card` (it's tuned to host title/subtitle and `DataRow` rows).
- **No hand-rolled `<h1 className="text-[Xpx]…">` for page titles.** Use `<Heading size="page-lg" | "page-md" | "page-sm">` so the scale lives in the primitive, not in every page. The "use bespoke `<h1>` sizes" pattern was the previous convention and has been retired — the size prop covers the same 18 / 20 / 22 px scale.
- **No hand-rolled `<p className="text-[12.5px] text-fg-muted">` for the common body-copy sizes.** Use `<Text size tone>`. Genuine edge cases (10.5 px micro labels, 14 px section titles, danger-colored text) stay inline — don't force-fit them through `Text`.
- **No saturated accent fills on toggles.** `<Button color="accent-soft">` is for *selected chip* surfaces (e.g. a filter chip in active state). `ToggleGroup` deliberately does **not** use accent fill — it uses an elevated inner pill instead.
- **No `window.alert` / `window.confirm` / bare `alert()` / bare `confirm()`.** Use the toast helpers (`showSuccess` / `showError` / `showInfo`) or `<ConfirmDialog>` per the four-lane rule. Native dialogs block the page, can't be themed, and ignore the toast/error conventions other surfaces follow.
- **No hand-rolled centered-text loading/empty/error divs on list pages.** Use `<LoadingState>`, `<EmptyState>`, and `<ErrorState>` from `src/components/ui/`. The hand-rolled `<div className="mt-4 text-center"><p className="text-zinc-600 dark:text-zinc-400">Loading…</p></div>` pattern is what these primitives replace — they share visual rhythm, route through the delay-before-show rule for loading, and split the filtered-empty vs truly-empty case cleanly.
