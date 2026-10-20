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
  /**
   * Jobs waiting to be invoiced, by the work order list's `unbilled=true`
   * rule: no agreement visits, and a draft invoice counts as started.
   */
  notBilled: number;
  /** Agreement-generated jobs: billed per period, never per job. */
  agreementVisits: number;
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

// ── Agreements ───────────────────────────────────────────────────────────────

export interface AgreementsReportParams {
  from: string;
  to: string;
  compare?: RevenueReportCompare;
  regionIds?: string[];
}

/** A bridge line: `monthly` is signed (losses negative), so lines add and never subtract. */
export interface AgreementBridgeLine {
  count: number;
  monthly: number;
}

export interface AgreementBridge {
  /** Null when `from` is before eventsTrackedSince. */
  recurringMonthlyAtStart: number | null;
  /** Home's recurringMonthly for a range ending today; null when `to` is before eventsTrackedSince. */
  recurringMonthlyAtEnd: number | null;
  /** Became active: from draft, or reactivated by an edit. */
  new: AgreementBridgeLine;
  /** monthly is non-zero only when the price changed or an expired agreement revived. */
  renewed: AgreementBridgeLine & { auto: number; manual: number };
  repriced: AgreementBridgeLine;
  suspended: AgreementBridgeLine;
  resumed: AgreementBridgeLine;
  cancelled: AgreementBridgeLine;
  expired: AgreementBridgeLine;
  returnedToDraft: AgreementBridgeLine;
  /** Home's visits rule over obligations whose window starts in the range. */
  visits: { planned: number; completed: number; missed: number };
}

export interface AgreementsReport extends AgreementBridge {
  from: string;
  to: string;
  /** The first full day of history; show it whenever a figure is null. */
  eventsTrackedSince: string;
  comparison: (AgreementBridge & { basis: Exclude<RevenueReportCompare, 'none'>; from: string; to: string }) | null;
  currency: string;
  regionIds: string[] | null;
}

export type AgreementEventKind =
  | 'ACTIVATED'
  | 'RENEWED'
  | 'RENEWAL_BOOKED'
  | 'RENEWAL_CANCELLED'
  | 'REPRICED'
  | 'SUSPENDED'
  | 'RESUMED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'RETURNED_TO_DRAFT';

export interface AgreementEventsParams {
  from: string;
  to: string;
  regionIds?: string[];
  kind?: AgreementEventKind[];
  page?: number;
  size?: number; // ≤ 200
}

export interface AgreementEventRow {
  id: string;
  agreementId: string;
  agreementNumber: string;
  customerName: string;
  kind: AgreementEventKind;
  /** RENEWED only: true for an auto-renewal. */
  autoRenewed: boolean | null;
  /** Tenant-local day it took effect (a term-end renewal or expiry is dated the term end). */
  occurredOn: string;
  userId: string | null;
  /** "System" for the nightly run. */
  userName: string | null;
  monthlyValueBefore: number;
  monthlyValueAfter: number;
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

  agreements: async (params: AgreementsReportParams): Promise<AgreementsReport> => {
    const response = await apiClient.get<AgreementsReport>('/work-orders/reports/agreements', { params: withRegions(params) });
    return response.data;
  },

  /** The events behind the bridge, newest first. */
  agreementEvents: async ({ kind, ...params }: AgreementEventsParams): Promise<Page<AgreementEventRow>> => {
    const response = await apiClient.get<Page<AgreementEventRow>>('/work-orders/reports/agreements/events', {
      params: { ...withRegions(params), ...(kind?.length ? { kind: kind.join(',') } : {}) },
    });
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
