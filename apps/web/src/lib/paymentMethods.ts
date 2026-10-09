import type { PaymentMethod } from '../api/setup';

/** Each payment method's label key under `payments.methods.`. */
export const PAYMENT_METHOD_KEY: Record<PaymentMethod, string> = {
  CASH: 'cash',
  CHECK: 'check',
  CREDIT_CARD: 'creditCard',
  DEBIT_CARD: 'debitCard',
  ACH: 'ach',
  WIRE_TRANSFER: 'wireTransfer',
  OTHER: 'other',
};

export const isPaymentMethod = (v: string | null): v is PaymentMethod => v != null && v in PAYMENT_METHOD_KEY;
