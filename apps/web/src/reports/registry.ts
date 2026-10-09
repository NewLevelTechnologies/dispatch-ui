import { type ComponentType, lazy } from 'react';

/**
 * Single source of truth for the Reports section. The catalog lists these by
 * group; the /reports/:slug route resolves a slug here. Only live reports go
 * in: nothing "coming soon".
 *
 * Each report is lazy-loaded so the bundle doesn't grow as we add more
 * reports — only the report a user actually visits is downloaded.
 *
 * To add a report: a component under `src/reports/`, an entry below, and its
 * `reports.catalog.<slug>.*` strings.
 */
export type ReportGroup = 'money' | 'work' | 'people' | 'sales';

/** Catalog order. A group with no report the user can open isn't shown. */
export const REPORT_GROUPS: ReportGroup[] = ['money', 'work', 'people', 'sales'];

export interface ReportDefinition {
  /** URL slug — appears as /reports/:slug; also keys `reports.catalog.<slug>.{name,description,fromHome}`. */
  slug: string;
  group: ReportGroup;
  /** `list` = print-first (tagged "Print list" in the catalog); default analysis. */
  kind?: 'analysis' | 'list';
  /** It also opens from a Home card (the catalog says which). */
  fromHome?: boolean;
  /** Lazy-loaded report component (no props — gets data from URL/state). */
  Component: ComponentType;
  /**
   * The capability needed to see the report. The catalog hides it without
   * one and the route answers as if it didn't exist. Omit for everyone.
   */
  requiresCapability?: string;
}

const ArrivalsReport = lazy(() => import('./ArrivalsReport'));
const FilterPullListReport = lazy(() => import('./FilterPullListReport'));
const ReceivablesReport = lazy(() => import('./ReceivablesReport'));
const QuotesReport = lazy(() => import('./QuotesReport'));
const RevenueReport = lazy(() => import('./RevenueReport'));
const TechProductivityReport = lazy(() => import('./TechProductivityReport'));

export const reports: ReportDefinition[] = [
  {
    slug: 'revenue',
    group: 'money',
    fromHome: true,
    Component: RevenueReport,
    requiresCapability: 'VIEW_ALL_INVOICES',
  },
  {
    slug: 'receivables',
    group: 'money',
    fromHome: true,
    Component: ReceivablesReport,
    requiresCapability: 'VIEW_ALL_INVOICES',
  },
  {
    slug: 'tech-productivity',
    group: 'people',
    fromHome: true,
    Component: TechProductivityReport,
    // Home's Revenue tab and this card follow the invoice capability.
    requiresCapability: 'VIEW_ALL_INVOICES',
  },
  {
    slug: 'arrivals',
    group: 'work',
    Component: ArrivalsReport,
    // Every tech's visits, so the company-wide dispatch view.
    requiresCapability: 'VIEW_ALL_DISPATCHES',
  },
  {
    slug: 'quotes',
    group: 'sales',
    fromHome: true,
    Component: QuotesReport,
    requiresCapability: 'VIEW_ALL_QUOTES',
  },
  {
    slug: 'filter-pull-list',
    group: 'work',
    kind: 'list',
    Component: FilterPullListReport,
  },
];

export function findReport(slug: string | undefined): ReportDefinition | undefined {
  if (!slug) return undefined;
  return reports.find((r) => r.slug === slug);
}
