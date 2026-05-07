# Inspinia Density Research

Research notes on the Inspinia Tailwind admin demo (https://webapplayers.com/inspinia/tailwind/), captured to inform a density/look-and-feel pass on dispatch-ui.

**Premise:** Catalyst UI looks and feels marketing-focused — generous whitespace, large type, breathable cards. Dispatch-ui is an internal tool for trained CSRs working on big monitors all day. Inspinia is the opposite end: dense, info-rich, scannable. We want to keep Catalyst's component contracts but shift the visual system toward Inspinia's density.

## The vibe in one line

Bloomberg-meets-corporate-SaaS. Light sidebar, white cards on a faint gray page, sparing color, and **everything sized around 14px** — so a typical Inspinia dashboard fits 5 KPI cards + a chart + 2 tables above the fold on 1440×900.

## Where the density actually comes from

| Lever | Inspinia | Catalyst default |
|---|---|---|
| Body font | **14px** | 15–16px |
| Card padding | **p-4 (16px)** | p-6 (24px) |
| Card gaps | **gap-4** | gap-6 / gap-8 |
| Table cell | **px-4 py-3** | px-6 py-4 |
| Card style | shadow-sm **+** 1px border, rounded-lg (8px) | one or the other, larger radius |
| Page bg | **gray-50** behind white cards | white-on-white |
| Sidebar items | tight, with **uppercase tiny "MAIN / APPS" group labels** | roomier, no group labels |
| Status pills | rounded-full, **soft `bg-{color}-100 text-{color}-700`**, used liberally | larger, used sparingly |
| Stacked cells | avatar + name + muted email **in one cell** | usually separate columns |

## Visual treatments worth lifting

- **Soft status pills** — `rounded-full` with `bg-{color}-100 text-{color}-700` in sky / amber / lime / rose / zinc. Replace Catalyst's heavier solid-fill badges. Used liberally; never alarming.
- **Section labels** — `text-[11px] font-semibold uppercase tracking-wider text-zinc-500`. Chunks long forms/detail pages without needing horizontal `<Divider/>`s.
- **Light sidebar with grouped sections** — uppercase tiny "MAIN / APPS / CUSTOM PAGES" labels above their item groups instead of one flat list.
- **Avatar + dual-line table cell** — 32–40px avatar + bold name + muted secondary line, all in one cell. Catalyst tends to spread these across separate columns and rows.
- **Card treatment** — `shadow-sm` **and** a 1px border (`border-zinc-200`) at `rounded-lg` (8px). Subtle but it's why Inspinia cards read as "panels" rather than "marketing tiles."

> Inspinia also has KPI strips, activity timelines, two-column detail rails, etc. — feature-level patterns, deliberately out of scope here. This doc is about the visual language only.

## Concrete tweaks to try (low-risk, system-wide)

A small set of CSS variable / Tailwind config changes shifts the whole app at once without rewriting components:

- `html { font-size: 14px }` (or override Catalyst's `text-base` to `0.875rem`) — single biggest perceptual shift.
- Page background → `bg-zinc-50` light / `bg-zinc-950` dark.
- `--card-padding` token defaulting to `1rem` (16px), used by a tightened Catalyst card wrapper.
- New badge variant: `<Badge soft color="sky">` → `bg-sky-100 text-sky-700`.
- A `<SectionLabel>` component → `text-[11px] font-semibold uppercase tracking-wider text-zinc-500`.
- Tighten Table defaults — `px-4 py-3` for cells (`dense` already gets us closer; this would be the new default).
- Add an "AvatarCell" pattern: `<AvatarCell name="…" subtitle="…" />`.
- Sidebar items: tighter vertical padding + uppercase group labels.

That's roughly 80% of the Inspinia feel without abandoning Catalyst's component API.

## Inspinia Apps section — what maps to dispatch-ui

| Inspinia page | Dispatch analog | Worth studying for |
|---|---|---|
| `apps-ecommerce-orders.html` | Work Orders list | KPI strip + filter chips + status pills |
| `apps-ecommerce-order-details.html` | Work Order detail | 2-column layout + right rail + timeline |
| `apps-ecommerce-customers.html` | Customers list | Avatar+email cell, dense table |
| `apps-ecommerce-product-details.html` | Equipment detail | Image gallery + spec table layout |
| `apps-invoice-list.html` | Invoices list | Soft status pills, compact toolbar |
| `apps-invoice-details.html` | Invoice detail | Right-rail totals card |
| `apps-calendar.html` | Dispatch board | Event chip density, mini-calendar sidebar |
| `apps-issue-tracker.html` | Dispatcher queue | Issue row info-density, assignee avatar stacks |
| `apps-projects-kanban.html` | Dispatch by-tech view | Compact card-per-job kanban |
| `apps-companies.html` | Customers (commercial) | Company card grid alternative |

## Experiment plan (next)

Throwaway branch off `dev`. Pick one page (likely Customers or Work Orders list — high visibility, simple structure) and apply:

1. Page bg `zinc-50`
2. 14px base font (scoped to that page first, not global)
3. Soft pills replacing the current solid badges
4. Tightened table padding
5. Card treatment: `shadow-sm` + 1px border + `rounded-lg`
6. Sidebar: tighter padding + uppercase group labels

Eyeball the shift, decide which knobs are keepers, then plan a system-wide token refactor as a separate PR.

## Open questions

- Do we want the `text-base = 14px` shift to be **global** (cleaner, riskier) or **scoped to the app shell** (safer, leaks Catalyst defaults at boundaries)?
- Is the right move to fork Catalyst's primitives into `src/components/dense/` or to override via Tailwind `@layer`/CSS vars?
- Theming: this overlaps with the failed prior theming work (per memory) — we should decide upfront whether we're shipping density as one fixed look or as a "Compact" mode toggle.
