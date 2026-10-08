// Technician productivity API Client
//
// The home dashboard's Tech productivity card (a reporting period, default
// month to date in the tenant zone) and its per-tech drill-in. Lives on
// work-order-service; whole-company, since invoices carry no dispatch region. See
// dispatch-api/handoff/FE_HANDOFF_home_dashboard.md for the credit rules.

import apiClient from './client';
import type { Page } from './workOrderApi';
import type { ReportingPeriodParam } from './financialApi';

export interface TechnicianProductivityRow {
  userId: string;
  /** Deactivated users keep their name; null only for a user deleted from the tenant. */
  name: string | null;
  /** Distinct work orders the tech is credited on. */
  jobs: number;
  /** The tech's share of invoices billed in the period. */
  revenue: number;
  /** revenue ÷ jobs; null with no jobs. */
  averageTicket: number | null;
  /** Every on-site hour in the period (arrival → departure). */
  onSiteHours: number;
  /** All hours, whenever worked, on the jobs that produced revenue. */
  invoicedHours: number;
  /** revenue ÷ invoicedHours; null with none. */
  revenuePerInvoicedHour: number | null;
  /**
   * On-site hours worked in the period on jobs with no invoice in it:
   * agreement work; invoiced after the period (normally 0 when current);
   * invoiced before it (a return visit); no invoice yet, as of now.
   */
  excludedHours: { agreement: number; billedLater: number; billedEarlier: number; notBilled: number };
  /** rate is 0–1; null when eligible is 0. Excludes agreement work orders. */
  firstVisit: { eligible: number; completed: number; rate: number | null };
  /** Confirmed callbacks raised in the period on jobs this tech worked. */
  callbacks: number;
}

export interface RevenueBucket {
  count: number;
  amount: number;
}

export interface TechnicianProductivityResponse {
  periodStart: string;
  asOf: string;
  /** Sorted by revenue desc, then on-site hours. */
  technicians: TechnicianProductivityRow[];
  unattributed: {
    /** Agreement and customer-level billing. */
    noWorkOrder: RevenueBucket;
    /** Invoices on work orders no tech arrived on. */
    noTechArrived: RevenueBucket;
  };
  /** Tech rows + both unattributed amounts; matches revenue's `billed` for the same period. */
  totalRevenue: number;
  /**
   * Tenant-local date callback linking started (the later of its go-live and
   * the tenant joining); the same for every period. No backfill before it.
   */
  callbacksTrackedSince?: string;
  currency: string;
  /** The regions these figures cover; null = the whole company. */
  regionIds: string[] | null;
}

/** A callback charged to a tech in the period, and the job it calls back to. */
export interface ChargedCallback {
  workOrderId: string;
  workOrderNumber: string;
  createdAt: string;
  original: { id: string; workOrderNumber: string | null };
}

export interface CreditedInvoice {
  invoiceId: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  workOrderId: string;
  invoiceTotal: number;
  /** Share = 1 ÷ technicianCount. */
  technicianCount: number;
  /** This tech's portion, after the cent rule. */
  creditedAmount: number;
  /** null for older invoices written before the column existed. */
  writtenByUserId: string | null;
  writtenByName: string | null;
}

/** The card's period (omit for this month) and regions (omit for the whole company). */
type ScopeParams = { period?: ReportingPeriodParam; regionIds?: string[] };

const scopeQuery = ({ period, regionIds }: ScopeParams) => ({
  ...(period ? { period } : {}),
  ...(regionIds?.length ? { regionIds } : {}),
});

export const technicianProductivityApi = {
  /** Omit `period` for the current month to date. */
  get: async (params: ScopeParams = {}): Promise<TechnicianProductivityResponse> => {
    // No param at all for the default, so today's request is unchanged.
    const query = scopeQuery(params);
    const response = Object.keys(query).length
      ? await apiClient.get<TechnicianProductivityResponse>('/work-orders/technician-productivity', { params: query })
      : await apiClient.get<TechnicianProductivityResponse>('/work-orders/technician-productivity');
    return response.data;
  },

  /** The invoices credited to one tech in the period, newest first. `size` max 200. */
  getCreditedInvoices: async (
    userId: string,
    params: ScopeParams & { page?: number; size?: number } = {},
  ): Promise<Page<CreditedInvoice>> => {
    const response = await apiClient.get<Page<CreditedInvoice>>(
      `/work-orders/technician-productivity/${userId}/invoices`,
      {
        params: {
          ...scopeQuery(params),
          page: params.page ?? 0,
          size: params.size ?? 25,
        },
      },
    );
    return response.data;
  },

  /** The callbacks charged to one tech in the period, newest first. */
  getChargedCallbacks: async (
    userId: string,
    params: ScopeParams & { page?: number; size?: number } = {},
  ): Promise<Page<ChargedCallback>> => {
    const response = await apiClient.get<Page<ChargedCallback>>(
      `/work-orders/technician-productivity/${userId}/callbacks`,
      {
        params: {
          ...scopeQuery(params),
          page: params.page ?? 0,
          size: params.size ?? 25,
        },
      },
    );
    return response.data;
  },
};
