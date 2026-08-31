// Billing data for the agreement detail surfaces — joins the deterministic
// installment schedule (work-order-service) with the actually-minted invoices
// (financial-service) so the schedule can show real Paid/Billed/Overdue dots.
//
// Two sources, joined on periodKey ⇿ invoice.billingPeriodKey:
//   1. getInstallments → full-term plan (SCHEDULED | INVOICED), [] = no billing.
//   2. invoices?agreementId= → the minted invoices (status + balanceDue + overdue).
// "Paid" is a financial concept and lives only on the invoice, so it must come
// from the join — the installment's own status only knows SCHEDULED vs INVOICED.
//
// Component-free module so the tab/card files satisfy react-refresh's
// "only export components" rule (same split as useAgreementSchedule).
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { agreementApi, invoicesApi, InvoiceStatus, type InvoiceListItemRow } from '../../api/setup';

export type InstallmentDisplayStatus = 'PAID' | 'OVERDUE' | 'BILLED' | 'NEXT' | 'SCHEDULED';

export interface EnrichedInstallment {
  sequence: number;
  periodKey: string;
  dueDate: string;
  amount: number;
  displayStatus: InstallmentDisplayStatus;
  invoiceId: string | null;
  invoiceNumber: string | null;
}

export interface NextInvoice {
  amount: number;
  dueDate: string;
  n: number; // this installment's sequence
  of: number; // total installments
}

function isPaid(inv: InvoiceListItemRow): boolean {
  return inv.status === InvoiceStatus.PAID || inv.balanceDue <= 0;
}

export function useAgreementBilling(agreementId: string) {
  const installmentsQ = useQuery({
    queryKey: ['agreement', agreementId, 'installments'] as const,
    queryFn: () => agreementApi.getInstallments(agreementId),
    enabled: Boolean(agreementId),
    staleTime: 60 * 1000,
  });

  // All minted invoices for the agreement, for the periodKey join. One page is
  // plenty — even a multi-year monthly schedule is well under the cap.
  const invoicesQ = useQuery({
    queryKey: ['invoices', 'agreement', agreementId] as const,
    queryFn: () => invoicesApi.getAll({ agreementId, size: 200, sort: 'dueDate,asc' }),
    enabled: Boolean(agreementId),
    staleTime: 60 * 1000,
  });

  return useMemo(() => {
    const installments = installmentsQ.data ?? [];
    const total = installments.length;

    const invoiceByPeriod = new Map<string, InvoiceListItemRow>();
    for (const inv of invoicesQ.data?.content ?? []) {
      if (inv.billingPeriodKey) invoiceByPeriod.set(inv.billingPeriodKey, inv);
    }

    // Earliest still-SCHEDULED installment by dueDate = the next invoice to mint.
    const nextSeq = installments
      .filter((i) => i.status === 'SCHEDULED')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]?.sequence;

    const enriched: EnrichedInstallment[] = installments.map((i) => {
      const inv = invoiceByPeriod.get(i.periodKey) ?? null;
      let displayStatus: InstallmentDisplayStatus;
      if (inv) {
        displayStatus = isPaid(inv) ? 'PAID' : inv.overdue ? 'OVERDUE' : 'BILLED';
      } else if (i.status === 'INVOICED') {
        // Minted but the invoice row isn't in our page (edge) — it's been billed.
        displayStatus = 'BILLED';
      } else {
        displayStatus = i.sequence === nextSeq ? 'NEXT' : 'SCHEDULED';
      }
      return {
        sequence: i.sequence,
        periodKey: i.periodKey,
        dueDate: i.dueDate,
        amount: i.amount,
        displayStatus,
        invoiceId: inv?.id ?? null,
        invoiceNumber: inv?.invoiceNumber ?? null,
      };
    });

    const nextRow = nextSeq != null ? installments.find((i) => i.sequence === nextSeq) : undefined;
    const nextInvoice: NextInvoice | null = nextRow
      ? { amount: nextRow.amount, dueDate: nextRow.dueDate, n: nextRow.sequence, of: total }
      : null;

    return {
      installments: enriched,
      nextInvoice,
      total,
      hasBilling: total > 0,
      isLoading: installmentsQ.isLoading,
    };
  }, [installmentsQ.data, installmentsQ.isLoading, invoicesQ.data]);
}
