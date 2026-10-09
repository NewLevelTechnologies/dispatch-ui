// Reports → Arrival windows (scheduling-service). Home's arrival rule over any
// range: a visit is on the local day its window starts, cancelled and no-show
// visits don't count, and on time is an arrival at or before the window's end
// (early included). `from` = 6 days ago, `to` = today is Home's card exactly.
import apiClient from './client';
import type { FinancialPage, RevenueReportCompare } from './financialApi';

export type ArrivalReportGroupBy = 'technician' | 'region' | 'none';

export interface ArrivalReportParams {
  /** Tenant-local YYYY-MM-DD, inclusive; at most 3 years apart. */
  from: string;
  /** Cut off at today by the server; read the response's `to`. */
  to: string;
  compare?: RevenueReportCompare;
  groupBy?: ArrivalReportGroupBy;
  regionIds?: string[];
}

export interface ArrivalFigures {
  /** Every visit counted, arrived or not. */
  visits: number;
  /** onTime + late = arrived. */
  arrived: number;
  onTime: number;
  late: number;
  /** onTime ÷ arrived, 0–1; null when nothing arrived. */
  onTimeRate: number | null;
  /** Over late arrivals only; null when none was late. */
  averageMinutesLate: number | null;
}

export interface ArrivalDay {
  date: string;
  visits: number;
  arrived: number;
  onTime: number;
}

export interface ArrivalReportComparison extends ArrivalFigures {
  basis: Exclude<RevenueReportCompare, 'none'>;
  from: string;
  to: string;
}

/** A technician or region. `id` null is the no-region group, sorted last. */
export interface ArrivalReportGroup {
  id: string | null;
  visits: number;
  arrived: number;
  onTime: number;
  late: number;
  onTimeRate: number | null;
  /** Null without a comparison; 0 (rate null) for a group with no visits then. */
  comparisonArrived: number | null;
  comparisonOnTime: number | null;
  comparisonOnTimeRate: number | null;
}

export interface ArrivalReport extends ArrivalFigures {
  from: string;
  to: string;
  timeZone: string;
  /** Every day in the range, zero-filled. */
  byDay: ArrivalDay[];
  /** Null when not asked for, or when the first visit in scope is after the comparison's start. */
  comparison: ArrivalReportComparison | null;
  groupBy: ArrivalReportGroupBy;
  groups: ArrivalReportGroup[];
  /** The scope applied; null = the whole company. */
  regionIds: string[] | null;
}

export interface LateArrivalsParams {
  from: string;
  to: string;
  regionIds?: string[];
  /** One tech's late visits (the drill-in from a technician group). */
  technicianId?: string;
  page?: number;
  size?: number; // ≤ 200
  /** `minutesLate` (default, desc) or `arrivalWindowStart`, e.g. 'arrivalWindowStart,asc'. */
  sort?: string;
}

export interface LateArrival {
  dispatchId: string;
  workOrderId: string;
  workOrderNumber: string;
  technicianId: string | null;
  technicianName: string | null;
  regionId: string | null;
  customerName: string;
  serviceLocation: { name: string | null; streetAddress: string | null; city: string | null };
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  arrivedAt: string;
  /** arrivedAt − arrivalWindowEnd, rounded up to the whole minute. */
  minutesLate: number;
}

const withRegions = <T extends { regionIds?: string[] }>({ regionIds, ...rest }: T) => ({
  ...rest,
  ...(regionIds?.length ? { regionIds } : {}),
});

export const arrivalReportApi = {
  get: async (params: ArrivalReportParams): Promise<ArrivalReport> => {
    const response = await apiClient.get<ArrivalReport>('/scheduling/reports/arrivals', { params: withRegions(params) });
    return response.data;
  },

  /** The late visits behind the report: totalElements equals its `late` for the same range and scope. */
  late: async (params: LateArrivalsParams): Promise<FinancialPage<LateArrival>> => {
    const response = await apiClient.get<FinancialPage<LateArrival>>('/scheduling/reports/arrivals/late', {
      params: withRegions(params),
    });
    return response.data;
  },
};
