// Reports from work-order-service: Jobs completed and Callbacks. Ranges are
// tenant-local dates, at most 3 years; `to` is cut off at today. Groups carry
// only an id; resolve names from the catalogs.
import apiClient from './client';
import type { RevenueReportCompare } from './financialApi';
import type { Page } from './workOrderApi';

const withRegions = <T extends { regionIds?: string[] }>({ regionIds, ...rest }: T) => ({
  ...rest,
  ...(regionIds?.length ? { regionIds } : {}),
});

// ── Jobs completed ───────────────────────────────────────────────────────────

export type JobsReportGroupBy = 'workOrderType' | 'division' | 'region' | 'none';

export interface JobsReportParams {
  /** By completedDate. */
  from: string;
  to: string;
  compare?: RevenueReportCompare;
  groupBy?: JobsReportGroupBy;
  regionIds?: string[];
}

export interface JobsFigures {
  /** ACTIVE work orders with completedDate in the range. */
  jobs: number;
  /** Their billed invoices, whatever the invoice date (not Revenue's billed). */
  billed: number;
  /** billed ÷ jobs with a billed invoice; null when none. */
  averageTicket: number | null;
  /** Jobs with no billed invoice yet. */
  notBilled: number;
}

export interface JobsReportGroup extends JobsFigures {
  /** Type, division or region; null is unassigned, sorted last. */
  id: string | null;
  comparisonJobs: number | null;
  comparisonBilled: number | null;
  comparisonAverageTicket: number | null;
}

export interface JobsReport extends JobsFigures {
  from: string;
  to: string;
  /** Every day, zero-filled, by completedDate. */
  jobsByDay: { date: string; jobs: number; billed: number }[];
  comparison: (JobsFigures & { basis: Exclude<RevenueReportCompare, 'none'>; from: string; to: string }) | null;
  groupBy: JobsReportGroupBy;
  groups: JobsReportGroup[];
  currency: string;
  regionIds: string[] | null;
}

// ── Callbacks ────────────────────────────────────────────────────────────────

export type CallbacksReportGroupBy = 'technician' | 'workOrderType' | 'division' | 'none';

export interface CallbacksReportParams {
  /** By the callback's creation, tenant-local. */
  from: string;
  to: string;
  compare?: RevenueReportCompare;
  groupBy?: CallbacksReportGroupBy;
  regionIds?: string[];
}

export interface CallbacksReport {
  from: string;
  to: string;
  /** Callbacks raised in the range. */
  count: number;
  /** Callback date − the original's completedDate; null when none has one. */
  averageDaysBetween: number | null;
  /** When linking began: before it, zero means nothing was linked, not nothing came back. */
  callbacksTrackedSince: string | null;
  comparison: {
    basis: Exclude<RevenueReportCompare, 'none'>;
    from: string;
    to: string;
    count: number;
    averageDaysBetween: number | null;
  } | null;
  groupBy: CallbacksReportGroupBy;
  /**
   * technician: each charged tech (null = nobody arrived on the original); a
   * callback with two techs counts for both, so these can add up to more than
   * `count`. workOrderType / division: the ORIGINAL job's; these add up.
   */
  groups: { id: string | null; count: number; comparisonCount: number | null }[];
  regionIds: string[] | null;
}

export interface CallbackListParams {
  from: string;
  to: string;
  regionIds?: string[];
  technicianId?: string;
  /** The original job's type or division. */
  workOrderTypeId?: string;
  divisionId?: string;
  page?: number;
  size?: number; // ≤ 200
}

export interface CallbackRow {
  id: string;
  workOrderNumber: string;
  /** Tenant-local day it was raised. */
  createdOn: string;
  createdByName: string | null;
  linkedByName: string | null;
  linkedAt: string | null;
  /** The callback's own type. */
  workOrderTypeId: string | null;
  serviceLocation: { name: string | null; streetAddress: string | null; city: string | null };
  /** Null if the original is gone. */
  original: { id: string; workOrderNumber: string; completedDate: string | null; workOrderTypeId: string | null } | null;
  /** Empty when nobody arrived on the original. */
  chargedTechnicians: { userId: string; name: string | null }[];
  daysBetween: number | null;
}

export const workOrderReportsApi = {
  jobsCompleted: async (params: JobsReportParams): Promise<JobsReport> => {
    const response = await apiClient.get<JobsReport>('/work-orders/reports/jobs-completed', { params: withRegions(params) });
    return response.data;
  },

  callbacks: async (params: CallbacksReportParams): Promise<CallbacksReport> => {
    const response = await apiClient.get<CallbacksReport>('/work-orders/reports/callbacks', { params: withRegions(params) });
    return response.data;
  },

  /** The callbacks behind the report, newest first; also tech productivity's drill-in. */
  callbackList: async (params: CallbackListParams): Promise<Page<CallbackRow>> => {
    const response = await apiClient.get<Page<CallbackRow>>('/work-orders/reports/callbacks/list', {
      params: withRegions(params),
    });
    return response.data;
  },
};
