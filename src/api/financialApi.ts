// Financial API Client
import apiClient from './client';

// ========== INVOICES ==========

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'VOID';

export const InvoiceStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED',
  VOID: 'VOID',
} as const;

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Invoice {
  id: string;
  customerId: string;
  workOrderId?: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  invoiceDate: string;
  dueDate: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  notes?: string;
  lineItems: InvoiceLineItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvoiceLineItemRequest {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateInvoiceRequest {
  customerId: string;
  workOrderId?: string;
  invoiceDate: string;
  dueDate: string;
  taxRate: number;
  notes?: string;
  lineItems: CreateInvoiceLineItemRequest[];
}

export interface UpdateInvoiceStatusRequest {
  status: InvoiceStatus;
}

export const invoicesApi = {
  getAll: async (): Promise<Invoice[]> => {
    const response = await apiClient.get<Invoice[]>('/financial/invoices');
    return response.data;
  },

  getById: async (id: string): Promise<Invoice> => {
    const response = await apiClient.get<Invoice>(`/financial/invoices/${id}`);
    return response.data;
  },

  getByCustomer: async (customerId: string): Promise<Invoice[]> => {
    const response = await apiClient.get<Invoice[]>(`/financial/invoices/customer/${customerId}`);
    return response.data;
  },

  create: async (request: CreateInvoiceRequest): Promise<Invoice> => {
    const response = await apiClient.post<Invoice>('/financial/invoices', request);
    return response.data;
  },

  updateStatus: async (id: string, request: UpdateInvoiceStatusRequest): Promise<Invoice> => {
    const response = await apiClient.patch<Invoice>(`/financial/invoices/${id}/status`, request);
    return response.data;
  },
};

// ========== QUOTES ==========

export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

export const QuoteStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  EXPIRED: 'EXPIRED',
} as const;

export interface QuoteLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Quote {
  id: string;
  customerId: string;
  quoteNumber: string;
  status: QuoteStatus;
  quoteDate: string;
  expirationDate: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string;
  lineItems: QuoteLineItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateQuoteLineItemRequest {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateQuoteRequest {
  customerId: string;
  quoteDate: string;
  expirationDate: string;
  taxRate: number;
  notes?: string;
  lineItems: CreateQuoteLineItemRequest[];
}

export interface UpdateQuoteStatusRequest {
  status: QuoteStatus;
}

export const quotesApi = {
  getAll: async (): Promise<Quote[]> => {
    const response = await apiClient.get<Quote[]>('/financial/quotes');
    return response.data;
  },

  getById: async (id: string): Promise<Quote> => {
    const response = await apiClient.get<Quote>(`/financial/quotes/${id}`);
    return response.data;
  },

  getByCustomer: async (customerId: string): Promise<Quote[]> => {
    const response = await apiClient.get<Quote[]>(`/financial/quotes/customer/${customerId}`);
    return response.data;
  },

  create: async (request: CreateQuoteRequest): Promise<Quote> => {
    const response = await apiClient.post<Quote>('/financial/quotes', request);
    return response.data;
  },

  updateStatus: async (id: string, request: UpdateQuoteStatusRequest): Promise<Quote> => {
    const response = await apiClient.patch<Quote>(`/financial/quotes/${id}/status`, request);
    return response.data;
  },
};

// ========== PAYMENTS ==========

export type PaymentMethod = 'CASH' | 'CHECK' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'ACH' | 'WIRE_TRANSFER' | 'OTHER';

export const PaymentMethod = {
  CASH: 'CASH',
  CHECK: 'CHECK',
  CREDIT_CARD: 'CREDIT_CARD',
  DEBIT_CARD: 'DEBIT_CARD',
  ACH: 'ACH',
  WIRE_TRANSFER: 'WIRE_TRANSFER',
  OTHER: 'OTHER',
} as const;

export interface Payment {
  id: string;
  invoiceId: string;
  customerId: string;
  paymentNumber: string;
  paymentDate: string;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePaymentRequest {
  invoiceId: string;
  paymentDate: string;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  notes?: string;
}

export const paymentsApi = {
  getAll: async (): Promise<Payment[]> => {
    const response = await apiClient.get<Payment[]>('/financial/payments');
    return response.data;
  },

  getById: async (id: string): Promise<Payment> => {
    const response = await apiClient.get<Payment>(`/financial/payments/${id}`);
    return response.data;
  },

  getByInvoice: async (invoiceId: string): Promise<Payment[]> => {
    const response = await apiClient.get<Payment[]>(`/financial/payments/invoice/${invoiceId}`);
    return response.data;
  },

  create: async (request: CreatePaymentRequest): Promise<Payment> => {
    const response = await apiClient.post<Payment>('/financial/payments', request);
    return response.data;
  },
};

// Export combined API
export const financialApi = {
  invoices: invoicesApi,
  quotes: quotesApi,
  payments: paymentsApi,
};

export default financialApi;
