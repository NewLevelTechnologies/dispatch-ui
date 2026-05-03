import { type ComponentType, lazy } from 'react';

/**
 * Single source of truth for the Reports section. The hub page iterates
 * this list to render its catalog; the /reports/:slug router looks up
 * a slug here to resolve the component to render.
 *
 * Each report is lazy-loaded so the bundle doesn't grow as we add more
 * reports — only the report a user actually visits is downloaded.
 *
 * To add a new report:
 *   1. Add a component file under `src/reports/`
 *   2. Add an entry below
 */
export interface ReportDefinition {
  /** URL slug — appears as /reports/:slug. */
  slug: string;
  /** Title shown on the hub card and in the report header. */
  title: string;
  /** One-line summary shown on the hub card. */
  description: string;
  /** Optional grouping ("Equipment", "Operational", "Financial", …). */
  category?: string;
  /** Lazy-loaded report component (no props — gets data from URL/state). */
  Component: ComponentType;
  /**
   * Optional capability the user must have to see this report. Hub filters
   * by this; the router enforces it on direct access. Omit for public.
   */
  requiresCapability?: string;
}

const FilterPullListReport = lazy(() => import('./FilterPullListReport'));

export const reports: ReportDefinition[] = [
  {
    slug: 'filter-pull-list',
    title: 'Filter Pull List',
    description:
      'Filter sizes and quantities needed for scheduled work orders. Print and tape to the truck before heading out.',
    category: 'Equipment',
    Component: FilterPullListReport,
  },
];

export function findReport(slug: string | undefined): ReportDefinition | undefined {
  if (!slug) return undefined;
  return reports.find((r) => r.slug === slug);
}
