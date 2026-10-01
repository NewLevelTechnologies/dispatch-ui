// Technician productivity API Client
//
// The home dashboard's Tech productivity card (month to date, tenant zone) and
// its per-tech drill-in. Lives on work-order-service; whole-company, since
// invoices carry no dispatch region. See
// dispatch-api/handoff/FE_HANDOFF_home_dashboard.md for the credit rules.

import apiClient from './client';
import type { Page } from './workOrderApi';

export interface TechnicianProductivityRow {
  userId: string;
  /** null when the user isn't cached server-side; resolve by `userId`. */
  name: string | null;
  /** Distinct work orders the tech is credited on. */
  jobs: number;
  /** The tech's share of invoices billed this month. */
  revenue: number;
  /** revenue ÷ jobs; null with no jobs. */
  averageTicket: number | null;
  /** Every on-site hour this month (arrival → departure). */
  onSiteHours: number;
  /** All hours, whenever worked, on the jobs that produced revenue. */
  invoicedHours: number;
  /** revenue ÷ invoicedHours; null with none. */
  revenuePerInvoicedHour: number | null;
  /** This month's on-site hours on jobs with no invoice this month. */
  excludedHours: { agreement: number; notBilled: number };
  /** rate is 0–1; null when eligible is 0. Excludes agreement work orders. */
  firstVisit: { eligible: number; completed: number; rate: number | null };
  /** Confirmed callbacks raised this month on jobs this tech worked. */
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
  /** Tech rows + both unattributed amounts; matches Revenue MTD. */
  totalRevenue: number;
  currency: string;
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

export const technicianProductivityApi = {
  get: async (): Promise<TechnicianProductivityResponse> => {
    const response = await apiClient.get<TechnicianProductivityResponse>('/work-orders/technician-productivity');
    return response.data;
  },

  /** The invoices credited to one tech this month, newest first. `size` max 200. */
  getCreditedInvoices: async (
    userId: string,
    params: { page?: number; size?: number } = {},
  ): Promise<Page<CreditedInvoice>> => {
    const response = await apiClient.get<Page<CreditedInvoice>>(
      `/work-orders/technician-productivity/${userId}/invoices`,
      { params: { page: params.page ?? 0, size: params.size ?? 25 } },
    );
    return response.data;
  },
};
