import { Fragment, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  EllipsisHorizontalIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import {
  invoicesApi,
  InvoiceStatus,
  paymentsApi,
  getApiErrorCode,
  getApiErrorMessage,
  type Invoice,
  type InvoiceStatus as InvoiceStatusType,
  type NestedInvoicePayment,
  type PaymentMethod as PaymentMethodType,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { invalidateLocationInvoiceCaches } from '../lib/invalidateFinancialCaches';
import InvoiceDialog from './InvoiceDialog';
import PaymentDialog from './PaymentDialog';
import VoidFinancialDocDialog from './VoidFinancialDocDialog';
import { Badge } from './catalyst/badge';
import { Button } from './catalyst/button';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from './catalyst/dropdown';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './catalyst/table';
import { Text } from './catalyst/text';
import { LoadingState } from './ui/LoadingState';

interface Props {
  workOrderId: string;
  workOrderNumber: string;
  customerId: string;
  customerName: string;
  /**
   * Increments each time the parent chip-row's `[+ Invoice]` ghost is
   * clicked. Treated as a one-shot signal — the tab auto-opens the
   * create dialog whenever the value changes and is non-zero. Avoids
   * boolean prop drift (parent doesn't need a clear-after-consumed
   * callback); a counter is monotonic so each click is observable.
   */
  openInvoiceCreateSignal?: number;
}

// §3.3 status pill palette. OVERDUE is server-derived (date-based per §7
// open question); the UI never lets the CSR pick it.
const STATUS_COLORS: Record<
  InvoiceStatusType,
  'zinc' | 'sky' | 'lime' | 'amber'
> = {
  DRAFT: 'zinc',
  SENT: 'sky',
  PAID: 'lime',
  OVERDUE: 'amber',
  CANCELLED: 'zinc',
  VOID: 'zinc',
};

const STATUS_LABEL_KEYS: Record<InvoiceStatusType, string> = {
  DRAFT: 'draft',
  SENT: 'sent',
  PAID: 'paid',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled',
  VOID: 'void',
};

// Valid CSR-driven transitions per §7 (pragmatic v1; backend may reject
// invalid combos). OVERDUE is omitted from every target list — it's
// computed from due-date, not user-driven. PAID & VOID & CANCELLED are
// terminal-ish; you'd void-and-recreate rather than transition out.
const STATUS_TRANSITIONS: Record<InvoiceStatusType, InvoiceStatusType[]> = {
  DRAFT: ['SENT', 'CANCELLED', 'VOID'],
  SENT: ['PAID', 'CANCELLED', 'VOID'],
  PAID: ['VOID'],
  OVERDUE: ['PAID', 'VOID'],
  CANCELLED: [],
  VOID: [],
};

const TERMINAL_STATUSES: InvoiceStatusType[] = ['VOID', 'CANCELLED'];

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

// Invoice / due / payment dates are semantically dates, not timestamps —
// the backend ships them as ISO instants ("2026-05-10T00:00:00Z") but the
// meaningful part is the calendar date. Format in UTC so a CSR west of
// UTC doesn't see "May 9" for something that happened on May 10.
const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
};

// Compact variant used only in the per-row "Last sent <date> to <email>"
// metadata. The invoice date sitting in the next column already carries
// the year; repeating it in the sub-line just makes the cell wide enough
// to push the table past the 960px drawer width. Drop the year.
const formatDateCompact = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
};

// Backend serializes BigDecimal as strings (see ask #2 contract). The
// Invoice type still types money fields as `number` for now (pre-existing
// definition); runtime values are strings. `Number()` coerces either form
// safely for display decisions; Intl.NumberFormat tolerates both. Never use
// these for arithmetic — chip / table totals are server-computed.
const amt = (v: number | string | null | undefined): number => Number(v ?? 0) || 0;

export default function FinancialInvoicesTab({
  workOrderId,
  workOrderNumber,
  customerId,
  customerName,
  openInvoiceCreateSignal,
}: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const invoiceLabel = getName('invoice');
  const invoicesLabel = getName('invoice', true);
  const paymentLabel = getName('payment');
  const customerLabel = getName('customer');
  const workOrderLabel = getName('work_order');
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Banner-style transient feedback for send / reissue / extend actions.
  // `window.alert` for errors would be jarring; a soft inline strip lets the
  // CSR keep working in the drawer. Cleared by the next action or by the
  // dismiss button.
  const [actionBanner, setActionBanner] = useState<
    { kind: 'success' | 'error'; message: string } | null
  >(null);

  // PaymentDialog state — both entry points (tab-level + row-level) share
  // a single mounted dialog. `lockedInvoice` set ⇒ row-level entry; absent
  // ⇒ tab-level entry with the picker.
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [lockedInvoiceForPayment, setLockedInvoiceForPayment] =
    useState<Invoice | null>(null);

  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);

  // Invoice currently in the void dialog (replaces the prior window.confirm
  // flow per §6.4). `null` means dialog closed. Holding the full Invoice
  // not just the id so the dialog can render the number / amount without
  // re-fetching from the cached query.
  const [voidTarget, setVoidTarget] = useState<Invoice | null>(null);

  // Auto-open the create dialog when the parent chip-row ghost signals
  // a click. Monotonic counter avoids a boolean-clear race.
  useEffect(() => {
    if (openInvoiceCreateSignal && openInvoiceCreateSignal > 0) {
      /* eslint-disable react-hooks/set-state-in-effect -- parent signal pattern */
      setInvoiceDialogOpen(true);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [openInvoiceCreateSignal]);

  const {
    data: invoices = [],
    isLoading,
    isError,
  } = useQuery<Invoice[]>({
    queryKey: ['workOrderInvoices', workOrderId],
    queryFn: () => invoicesApi.getByWorkOrder(workOrderId),
    enabled: !!workOrderId,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: InvoiceStatusType }) =>
      invoicesApi.updateStatus(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workOrderInvoices', workOrderId] });
      // Status changes affect VOID/CANCELLED exclusion in the summary rollup
      // — invalidate so the header chips re-fetch.
      queryClient.invalidateQueries({ queryKey: ['financialSummary', workOrderId] });
      invalidateLocationInvoiceCaches(queryClient);
    },
  });

  const voidPayment = useMutation({
    mutationFn: (paymentId: string) => paymentsApi.void(paymentId),
    onSuccess: () => {
      // Backend cascade may demote PAID → SENT on the parent invoice and
      // adjust amountPaid/balanceDue across any invoices the payment was
      // applied to (split-payment case). Invalidate both queries.
      queryClient.invalidateQueries({ queryKey: ['workOrderInvoices', workOrderId] });
      queryClient.invalidateQueries({ queryKey: ['financialSummary', workOrderId] });
      invalidateLocationInvoiceCaches(queryClient);
    },
  });

  // Send (or resend) an invoice. Backend auto-flips DRAFT → SENT in the
  // same transaction (§4.3 step 7), so we don't chain a status PATCH.
  // The error branch surfaces NO_RECIPIENT specifically because it's the
  // only one a CSR can actually fix from the row (the rest are status /
  // rate-limit issues with no in-context remediation).
  const sendInvoice = useMutation({
    mutationFn: (invoice: Invoice) => invoicesApi.send(invoice.id),
    onSuccess: (_data, invoice) => {
      queryClient.invalidateQueries({ queryKey: ['workOrderInvoices', workOrderId] });
      // Send auto-flips DRAFT → SENT, which affects summary rollup buckets.
      queryClient.invalidateQueries({ queryKey: ['financialSummary', workOrderId] });
      invalidateLocationInvoiceCaches(queryClient);
      setActionBanner({
        kind: 'success',
        message: t('workOrders.financialDrawer.invoicesTab.sendSuccess', {
          entity: `${invoiceLabel} ${invoice.invoiceNumber}`,
        }),
      });
    },
    onError: (error: unknown) => {
      const code = getApiErrorCode(error);
      if (code === 'NO_RECIPIENT') {
        setActionBanner({
          kind: 'error',
          message: t(
            'workOrders.financialDrawer.invoicesTab.sendErrorNoRecipient',
            { customer: customerLabel },
          ),
        });
        return;
      }
      setActionBanner({
        kind: 'error',
        message:
          getApiErrorMessage(error) ??
          t('workOrders.financialDrawer.invoicesTab.sendError', {
            entity: invoiceLabel,
          }),
      });
    },
  });

  const reissueShareLink = useMutation({
    mutationFn: (invoice: Invoice) => invoicesApi.reissueShareLink(invoice.id),
    onSuccess: () => {
      // Reissue doesn't stamp lastSentAt (the new token isn't sent yet),
      // but the active token id has changed — invalidate so any cached
      // shareUrl in the list view picks up the new value once the field
      // is denormalized (not in v1; future-proofing).
      queryClient.invalidateQueries({ queryKey: ['workOrderInvoices', workOrderId] });
      setActionBanner({
        kind: 'success',
        message: t('workOrders.financialDrawer.invoicesTab.reissueSuccess'),
      });
    },
    onError: (error: unknown) => {
      setActionBanner({
        kind: 'error',
        message:
          getApiErrorMessage(error) ??
          t('workOrders.financialDrawer.invoicesTab.sendError', {
            entity: invoiceLabel,
          }),
      });
    },
  });

  const extendShareLink = useMutation({
    mutationFn: (invoice: Invoice) => invoicesApi.extendShareLink(invoice.id),
    onSuccess: () => {
      setActionBanner({
        kind: 'success',
        message: t('workOrders.financialDrawer.invoicesTab.extendSuccess'),
      });
    },
    onError: (error: unknown) => {
      setActionBanner({
        kind: 'error',
        message:
          getApiErrorMessage(error) ??
          t('workOrders.financialDrawer.invoicesTab.sendError', {
            entity: invoiceLabel,
          }),
      });
    },
  });

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStatusChange = (invoice: Invoice, next: InvoiceStatusType) => {
    if (next === invoice.status) return;
    updateStatus.mutate({ id: invoice.id, status: next });
  };

  const handleSend = (invoice: Invoice) => {
    setActionBanner(null);
    sendInvoice.mutate(invoice);
  };

  const handleReissue = (invoice: Invoice) => {
    if (
      window.confirm(
        t('workOrders.financialDrawer.invoicesTab.reissueConfirm', {
          entity: invoiceLabel,
          number: invoice.invoiceNumber,
        }),
      )
    ) {
      setActionBanner(null);
      reissueShareLink.mutate(invoice);
    }
  };

  const handleExtend = (invoice: Invoice) => {
    if (
      window.confirm(
        t('workOrders.financialDrawer.invoicesTab.extendConfirm', {
          entity: invoiceLabel,
          number: invoice.invoiceNumber,
        }),
      )
    ) {
      setActionBanner(null);
      extendShareLink.mutate(invoice);
    }
  };

  const handleVoid = (invoice: Invoice) => {
    setActionBanner(null);
    setVoidTarget(invoice);
  };

  // Sequential per backend's documented flow: PATCH status → VOID first,
  // then POST /share-link/revoke if the checkbox was checked. The revoke
  // endpoint is idempotent (204 either way), so we retry once on transient
  // failure before surfacing a non-blocking banner that nudges the CSR to
  // retry from the Reissue action.
  const handleVoidConfirm = async ({
    revokeShareLink,
  }: {
    revokeShareLink: boolean;
  }) => {
    if (!voidTarget) return;
    const invoice = voidTarget;
    try {
      await invoicesApi.updateStatus(invoice.id, { status: InvoiceStatus.VOID });
    } catch (error) {
      setActionBanner({
        kind: 'error',
        message:
          getApiErrorMessage(error) ??
          t('workOrders.financialDrawer.invoicesTab.sendError', {
            entity: invoiceLabel,
          }),
      });
      setVoidTarget(null);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['workOrderInvoices', workOrderId] });
    queryClient.invalidateQueries({ queryKey: ['financialSummary', workOrderId] });
    invalidateLocationInvoiceCaches(queryClient);

    if (revokeShareLink) {
      try {
        await invoicesApi.revokeShareLink(invoice.id);
      } catch {
        // One idempotent retry per backend guidance — the endpoint returns
        // 204 whether or not a link existed, so re-issuing is safe.
        try {
          await invoicesApi.revokeShareLink(invoice.id);
        } catch {
          setActionBanner({
            kind: 'error',
            message: t(
              'workOrders.financialDrawer.voidDialog.revokeRetryError',
            ),
          });
        }
      }
    }
    setVoidTarget(null);
  };

  const handleVoidPayment = (payment: NestedInvoicePayment) => {
    // Confirmation is honest about the cascade: voiding the payment row
    // here unwinds the FULL payment, not just its slice — backend reverses
    // amountPaid/balanceDue on every invoice it touched and demotes PAID
    // → SENT where applicable. The slice amount is shown as the "money
    // affecting this invoice" context.
    if (
      window.confirm(
        t('workOrders.financialDrawer.invoicesTab.voidPaymentConfirm', {
          entity: paymentLabel,
          parent: invoiceLabel,
          number: payment.paymentNumber,
          amount: currencyFormatter.format(amt(payment.amount)),
        }),
      )
    ) {
      voidPayment.mutate(payment.id);
    }
  };

  // Tab-level + Record Payment: open dialog without a lock so the picker
  // shows. Disabled when no invoices have outstanding balance.
  const openInvoicesWithBalance = invoices.filter(
    (i) => amt(i.balanceDue) > 0 && !TERMINAL_STATUSES.includes(i.status),
  );

  const openPaymentDialogForRow = (invoice: Invoice) => {
    setLockedInvoiceForPayment(invoice);
    setPaymentDialogOpen(true);
  };

  const openPaymentDialogFromTab = () => {
    setLockedInvoiceForPayment(null);
    setPaymentDialogOpen(true);
  };

  if (isLoading) {
    return (
      <LoadingState
        label={t('workOrders.financialDrawer.invoicesTab.loading', {
          entities: invoicesLabel,
        })}
      />
    );
  }

  if (isError) {
    return (
      <div className="py-8 text-center">
        <Text className="!text-sm !text-rose-600 dark:!text-rose-400">
          {t('workOrders.financialDrawer.invoicesTab.errorLoading', {
            entities: invoicesLabel,
          })}
        </Text>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <>
        <div className="py-12 text-center">
          <Text className="!text-sm !text-zinc-500">
            {t('workOrders.financialDrawer.invoicesTab.empty', {
              entities: invoicesLabel,
              workOrder: workOrderLabel,
            })}
          </Text>
          <div className="mt-4 flex justify-center">
            <Button color="dark/zinc" onClick={() => setInvoiceDialogOpen(true)}>
              <PlusIcon className="size-4" />
              {t('workOrders.financialDrawer.invoicesTab.newInvoice', {
                entity: invoiceLabel,
              })}
            </Button>
          </div>
        </div>
        <InvoiceDialog
          open={invoiceDialogOpen}
          onClose={() => setInvoiceDialogOpen(false)}
          workOrderId={workOrderId}
          workOrderNumber={workOrderNumber}
          defaultCustomer={{ id: customerId, name: customerName }}
        />
      </>
    );
  }

  return (
    <div>
      {actionBanner && (
        <div
          className={`mb-3 flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm ${
            actionBanner.kind === 'success'
              ? 'bg-lime-50 text-lime-800 dark:bg-lime-500/10 dark:text-lime-300'
              : 'bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300'
          }`}
          role={actionBanner.kind === 'error' ? 'alert' : 'status'}
        >
          <span>{actionBanner.message}</span>
          <button
            type="button"
            onClick={() => setActionBanner(null)}
            className="text-xs underline hover:no-underline"
            aria-label={t('common.dismiss')}
          >
            {t('common.dismiss')}
          </button>
        </div>
      )}
      {/* Tab header CTA row (§3.3): + New Invoice + Record Payment, both
          right-aligned. Each covers a distinct CSR scenario — create an
          invoice (parent-less, always) and record a payment with the
          picker (when the CSR has money but no specific invoice in mind). */}
      <div className="mb-3 flex justify-end gap-2">
        <Button
          outline
          onClick={openPaymentDialogFromTab}
          disabled={openInvoicesWithBalance.length === 0}
          title={
            openInvoicesWithBalance.length === 0
              ? t('workOrders.financialDrawer.paymentDialog.noOpenInvoices')
              : undefined
          }
        >
          <PlusIcon className="size-4" />
          {t('workOrders.financialDrawer.invoicesTab.recordPayment', {
            entity: paymentLabel,
          })}
        </Button>
        <Button color="dark/zinc" onClick={() => setInvoiceDialogOpen(true)}>
          <PlusIcon className="size-4" />
          {t('workOrders.financialDrawer.invoicesTab.newInvoice', {
            entity: invoiceLabel,
          })}
        </Button>
      </div>

      <Table dense className="[--gutter:theme(spacing.1)] text-sm">
        <TableHead>
          <TableRow>
            <TableHeader className="w-8" />
            <TableHeader>
              {t('workOrders.financialDrawer.invoicesTab.columns.invoiceNumber', {
                entity: invoiceLabel,
              })}
            </TableHeader>
            <TableHeader>
              {t('workOrders.financialDrawer.invoicesTab.columns.date')}
            </TableHeader>
            <TableHeader>
              {t('workOrders.financialDrawer.invoicesTab.columns.due')}
            </TableHeader>
            <TableHeader>
              {t('workOrders.financialDrawer.invoicesTab.columns.status')}
            </TableHeader>
            <TableHeader className="text-right">
              {t('workOrders.financialDrawer.invoicesTab.columns.total')}
            </TableHeader>
            <TableHeader className="text-right">
              {t('workOrders.financialDrawer.invoicesTab.columns.paid')}
            </TableHeader>
            <TableHeader className="text-right">
              {t('workOrders.financialDrawer.invoicesTab.columns.balance')}
            </TableHeader>
            <TableHeader className="w-8" />
          </TableRow>
        </TableHead>
        <TableBody>
          {invoices.map((invoice) => {
            const isExpanded = expanded.has(invoice.id);
            const isVoided = invoice.status === InvoiceStatus.VOID;
            const isTerminal = TERMINAL_STATUSES.includes(invoice.status);
            const transitions = STATUS_TRANSITIONS[invoice.status];
            // Voided rows render muted — they still appear in the table for
            // audit but visually deprioritized.
            const rowMuted = isVoided ? 'opacity-60' : '';

            return (
              <Fragment key={invoice.id}>
                <TableRow className={rowMuted}>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => toggleExpand(invoice.id)}
                      className="cursor-pointer rounded p-0.5 hover:bg-zinc-100 dark:hover:bg-white/5"
                      aria-label={
                        isExpanded
                          ? t('workOrders.financialDrawer.invoicesTab.collapseRow')
                          : t('workOrders.financialDrawer.invoicesTab.expandRow')
                      }
                    >
                      {isExpanded ? (
                        <ChevronDownIcon className="size-4" />
                      ) : (
                        <ChevronRightIcon className="size-4" />
                      )}
                    </button>
                  </TableCell>
                  <TableCell className="font-mono">
                    <div>{invoice.invoiceNumber}</div>
                    {invoice.lastSentAt && (() => {
                      // Truncate + max-width so the long email tail (e.g.
                      // pwilcox@newleveltech.net) doesn't widen the column
                      // past the 960px drawer. Full text on hover via `title`.
                      const fullEmail =
                        invoice.lastSentToEmails?.split(',')[0]?.trim() ?? '—';
                      const lastSentText = t(
                        'workOrders.financialDrawer.invoicesTab.lastSentTo',
                        {
                          date: formatDateCompact(invoice.lastSentAt),
                          email: fullEmail,
                        },
                      );
                      return (
                        <div
                          className="max-w-[14rem] truncate font-sans text-xs italic font-normal text-zinc-500 dark:text-zinc-400"
                          title={lastSentText}
                        >
                          {lastSentText}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>{formatDate(invoice.invoiceDate)}</TableCell>
                  <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                  <TableCell>
                    {transitions.length === 0 ? (
                      <Badge color={STATUS_COLORS[invoice.status]}>
                        {t(
                          `workOrders.financialDrawer.invoicesTab.statuses.${
                            STATUS_LABEL_KEYS[invoice.status]
                          }`,
                        )}
                      </Badge>
                    ) : (
                      <Dropdown>
                        <DropdownButton
                          as="button"
                          type="button"
                          className="cursor-pointer rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          aria-label={t(
                            'workOrders.financialDrawer.invoicesTab.changeStatus',
                            {
                              current: t(
                                `workOrders.financialDrawer.invoicesTab.statuses.${
                                  STATUS_LABEL_KEYS[invoice.status]
                                }`,
                              ),
                            },
                          )}
                        >
                          <Badge color={STATUS_COLORS[invoice.status]}>
                            {t(
                              `workOrders.financialDrawer.invoicesTab.statuses.${
                                STATUS_LABEL_KEYS[invoice.status]
                              }`,
                            )}
                          </Badge>
                        </DropdownButton>
                        <DropdownMenu anchor="bottom start">
                          {transitions.map((next) => (
                            <DropdownItem
                              key={next}
                              onClick={() => handleStatusChange(invoice, next)}
                            >
                              <DropdownLabel>
                                {t(
                                  `workOrders.financialDrawer.invoicesTab.statuses.${STATUS_LABEL_KEYS[next]}`,
                                )}
                              </DropdownLabel>
                            </DropdownItem>
                          ))}
                        </DropdownMenu>
                      </Dropdown>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {currencyFormatter.format(amt(invoice.totalAmount))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {currencyFormatter.format(amt(invoice.amountPaid))}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {currencyFormatter.format(amt(invoice.balanceDue))}
                  </TableCell>
                  <TableCell>
                    {!isTerminal && (
                      <Dropdown>
                        <DropdownButton
                          plain
                          aria-label={t('common.moreOptions')}
                        >
                          <EllipsisHorizontalIcon className="size-5" />
                        </DropdownButton>
                        <DropdownMenu anchor="bottom end">
                          {/* Send / Resend lives at the top of the menu —
                              it's the most common follow-on action after
                              creating an invoice. Label flips once the row
                              has been sent at least once. */}
                          <DropdownItem onClick={() => handleSend(invoice)}>
                            <DropdownLabel>
                              {invoice.lastSentAt
                                ? t('workOrders.financialDrawer.invoicesTab.actions.resend')
                                : t('workOrders.financialDrawer.invoicesTab.actions.send')}
                            </DropdownLabel>
                          </DropdownItem>
                          {invoice.lastSentAt && (
                            <>
                              <DropdownItem onClick={() => handleReissue(invoice)}>
                                <DropdownLabel>
                                  {t('workOrders.financialDrawer.invoicesTab.actions.reissue')}
                                </DropdownLabel>
                              </DropdownItem>
                              <DropdownItem onClick={() => handleExtend(invoice)}>
                                <DropdownLabel>
                                  {t('workOrders.financialDrawer.invoicesTab.actions.extend')}
                                </DropdownLabel>
                              </DropdownItem>
                            </>
                          )}
                          {invoice.status !== InvoiceStatus.PAID && (
                            <DropdownItem
                              onClick={() =>
                                handleStatusChange(invoice, InvoiceStatus.PAID)
                              }
                            >
                              <DropdownLabel>
                                {t(
                                  'workOrders.financialDrawer.invoicesTab.actions.markPaid',
                                )}
                              </DropdownLabel>
                            </DropdownItem>
                          )}
                          <DropdownItem onClick={() => handleVoid(invoice)}>
                            <DropdownLabel>
                              {t(
                                'workOrders.financialDrawer.invoicesTab.actions.void',
                              )}
                            </DropdownLabel>
                          </DropdownItem>
                        </DropdownMenu>
                      </Dropdown>
                    )}
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow className={rowMuted}>
                    <TableCell />
                    <TableCell
                      colSpan={8}
                      className="!py-3 bg-zinc-50 dark:bg-white/5"
                    >
                      <InvoiceExpansion
                        invoice={invoice}
                        onAddPayment={() => openPaymentDialogForRow(invoice)}
                        canAddPayment={
                          !isTerminal && amt(invoice.balanceDue) > 0
                        }
                        onVoidPayment={handleVoidPayment}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>

      <PaymentDialog
        open={paymentDialogOpen}
        onClose={() => setPaymentDialogOpen(false)}
        workOrderId={workOrderId}
        workOrderNumber={workOrderNumber}
        customerName={customerName}
        openInvoices={openInvoicesWithBalance}
        lockedInvoice={lockedInvoiceForPayment ?? undefined}
      />

      <InvoiceDialog
        open={invoiceDialogOpen}
        onClose={() => setInvoiceDialogOpen(false)}
        workOrderId={workOrderId}
        workOrderNumber={workOrderNumber}
        defaultCustomer={{ id: customerId, name: customerName }}
      />

      {voidTarget && (
        <VoidFinancialDocDialog
          open={!!voidTarget}
          kind="invoice"
          entityLabel={invoiceLabel}
          documentNumber={voidTarget.invoiceNumber}
          amountDisplay={currencyFormatter.format(amt(voidTarget.totalAmount))}
          hasActiveShareLink={!!voidTarget.lastSentAt}
          onConfirm={handleVoidConfirm}
          onClose={() => setVoidTarget(null)}
          busy={updateStatus.isPending}
        />
      )}
    </div>
  );
}

interface InvoiceExpansionProps {
  invoice: Invoice;
  onAddPayment: () => void;
  canAddPayment: boolean;
  onVoidPayment: (payment: NestedInvoicePayment) => void;
}

/**
 * Read-only inline expansion (§3.4). Three subsections in lifecycle order:
 * Line items → Payments → Notes. Payments are the new addition with the
 * ask #2 fold; they were a sibling Payments tab in the earlier design.
 *
 * Line-item editing is explicitly NOT here — that waits for inventory
 * (§8.1).
 */
function InvoiceExpansion({
  invoice,
  onAddPayment,
  canAddPayment,
  onVoidPayment,
}: InvoiceExpansionProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {t('workOrders.financialDrawer.invoicesTab.lineItemsHeading')}
        </div>
        {invoice.lineItems.length === 0 ? (
          <Text className="!text-sm !text-zinc-500">
            {t('workOrders.financialDrawer.invoicesTab.noLineItems')}
          </Text>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-zinc-500 dark:text-zinc-400">
              <tr className="text-left">
                <th className="px-2 pb-1 font-medium">
                  {t('workOrders.financialDrawer.invoicesTab.lineColumns.description')}
                </th>
                <th className="px-2 pb-1 text-right font-medium">
                  {t('workOrders.financialDrawer.invoicesTab.lineColumns.quantity')}
                </th>
                <th className="px-2 pb-1 text-right font-medium">
                  {t('workOrders.financialDrawer.invoicesTab.lineColumns.unitPrice')}
                </th>
                <th className="px-2 pb-1 text-right font-medium">
                  {t('workOrders.financialDrawer.invoicesTab.lineColumns.lineTotal')}
                </th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((li) => (
                <tr
                  key={li.id}
                  className="border-t border-zinc-200 dark:border-white/10"
                >
                  <td className="px-2 py-1">{li.description}</td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {amt(li.quantity)}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {currencyFormatter.format(amt(li.unitPrice))}
                  </td>
                  <td className="px-2 py-1 text-right font-medium tabular-nums">
                    {currencyFormatter.format(amt(li.lineTotal))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <PaymentsSubsection
        payments={invoice.payments ?? []}
        invoiceId={invoice.id}
        onAddPayment={onAddPayment}
        canAddPayment={canAddPayment}
        onVoidPayment={onVoidPayment}
      />

      {invoice.notes && (
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {t('workOrders.financialDrawer.invoicesTab.notesHeading')}
          </div>
          <Text className="!text-sm whitespace-pre-wrap">{invoice.notes}</Text>
        </div>
      )}
    </div>
  );
}

interface PaymentsSubsectionProps {
  payments: NestedInvoicePayment[];
  invoiceId: string;
  onAddPayment: () => void;
  canAddPayment: boolean;
  onVoidPayment: (payment: NestedInvoicePayment) => void;
}

const PAYMENT_METHOD_LABEL_KEYS: Record<PaymentMethodType, string> = {
  CASH: 'CASH',
  CHECK: 'CHECK',
  CREDIT_CARD: 'CREDIT_CARD',
  DEBIT_CARD: 'DEBIT_CARD',
  ACH: 'ACH',
  WIRE_TRANSFER: 'WIRE_TRANSFER',
  OTHER: 'OTHER',
};

/**
 * Payments under an invoice row. Each row shows the slice of the payment
 * applied to *this* invoice (server-side: split payments appear in each
 * invoice's payments[] with their respective slice). The `paymentNumber`
 * may repeat across invoices for split payments — that's fine.
 *
 * Void per-row action (⋯ menu) unwinds the FULL payment, not just its
 * slice — the backend cascade reverses every invoice the payment touched
 * and demotes PAID → SENT where applicable. The confirmation copy makes
 * this explicit. Voided rows render muted with the ⋯ menu omitted.
 */
function PaymentsSubsection({
  payments,
  invoiceId,
  onAddPayment,
  canAddPayment,
  onVoidPayment,
}: PaymentsSubsectionProps) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const paymentLabel = getName('payment');
  const paymentsLabel = getName('payment', true);
  const invoiceLabel = getName('invoice');

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {t('workOrders.financialDrawer.invoicesTab.paymentsHeading', {
            entities: paymentsLabel,
          })}
        </div>
        {canAddPayment && (
          <button
            type="button"
            onClick={onAddPayment}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-dashed border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 hover:border-zinc-400 hover:text-zinc-800 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-200"
          >
            <PlusIcon className="size-3" />
            {t('workOrders.financialDrawer.invoicesTab.addPayment', {
              entity: paymentLabel,
            })}
          </button>
        )}
      </div>
      {payments.length === 0 ? (
        <Text className="!text-sm !text-zinc-500">
          {t('workOrders.financialDrawer.invoicesTab.noPayments', {
            entities: paymentsLabel,
            parent: invoiceLabel,
          })}
        </Text>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-zinc-500 dark:text-zinc-400">
            <tr className="text-left">
              <th className="px-2 pb-1 font-medium">
                {t('workOrders.financialDrawer.invoicesTab.paymentColumns.paymentNumber', {
                  entity: paymentLabel,
                })}
              </th>
              <th className="px-2 pb-1 font-medium">
                {t('workOrders.financialDrawer.invoicesTab.paymentColumns.date')}
              </th>
              <th className="px-2 pb-1 font-medium">
                {t('workOrders.financialDrawer.invoicesTab.paymentColumns.method')}
              </th>
              <th className="px-2 pb-1 text-right font-medium">
                {t('workOrders.financialDrawer.invoicesTab.paymentColumns.amount')}
              </th>
              <th className="px-2 pb-1 font-medium">
                {t('workOrders.financialDrawer.invoicesTab.paymentColumns.reference')}
              </th>
              <th className="w-8 pb-1" />
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => {
              const isVoided = p.status === 'VOID';
              return (
                <tr
                  // Composite key: a payment id may repeat across invoices
                  // (split payment case per backend ask #2 update); scope
                  // the key to this invoice to keep React happy.
                  key={`${invoiceId}-${p.id}`}
                  className={`border-t border-zinc-200 dark:border-white/10 ${
                    isVoided ? 'opacity-50' : ''
                  }`}
                >
                  <td className="px-2 py-1 font-mono">{p.paymentNumber}</td>
                  <td className="px-2 py-1">{formatDate(p.paymentDate)}</td>
                  <td className="px-2 py-1">
                    {t(
                      `workOrders.financialDrawer.paymentDialog.methods.${PAYMENT_METHOD_LABEL_KEYS[p.paymentMethod]}`,
                    )}
                  </td>
                  <td className="px-2 py-1 text-right font-medium tabular-nums">
                    {currencyFormatter.format(amt(p.amount))}
                  </td>
                  <td className="px-2 py-1 text-zinc-500 dark:text-zinc-400">
                    {p.referenceNumber ?? '—'}
                  </td>
                  <td className="py-1">
                    {!isVoided && (
                      <Dropdown>
                        <DropdownButton
                          plain
                          aria-label={t('common.moreOptions')}
                        >
                          <EllipsisHorizontalIcon className="size-4" />
                        </DropdownButton>
                        <DropdownMenu anchor="bottom end">
                          <DropdownItem onClick={() => onVoidPayment(p)}>
                            <DropdownLabel>
                              {t(
                                'workOrders.financialDrawer.invoicesTab.actions.voidPayment',
                                { entity: paymentLabel },
                              )}
                            </DropdownLabel>
                          </DropdownItem>
                        </DropdownMenu>
                      </Dropdown>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
