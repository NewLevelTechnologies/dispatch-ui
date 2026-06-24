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
  quotesApi,
  QuoteStatus,
  getApiErrorCode,
  getApiErrorMessage,
  type Quote,
  type QuoteStatus as QuoteStatusType,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import QuoteDialog from './QuoteDialog';
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
   * Increments each time the parent chip-row's `[+ Quote]` ghost is
   * clicked. Same monotonic-counter signal pattern used by the
   * Invoices tab — auto-opens the create dialog whenever the value
   * changes and is non-zero.
   */
  openQuoteCreateSignal?: number;
}

// §3.3 status pill palette for Quotes. EXPIRED is server-derived
// (date-based); the UI never lets a CSR pick it directly.
const STATUS_COLORS: Record<
  QuoteStatusType,
  'zinc' | 'sky' | 'lime' | 'amber' | 'rose'
> = {
  DRAFT: 'zinc',
  SENT: 'sky',
  ACCEPTED: 'lime',
  DECLINED: 'rose',
  EXPIRED: 'amber',
};

const STATUS_LABEL_KEYS: Record<QuoteStatusType, string> = {
  DRAFT: 'draft',
  SENT: 'sent',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  EXPIRED: 'expired',
};

// Valid CSR-driven transitions. EXPIRED omitted (server-derived from
// expirationDate). Terminal-ish states (ACCEPTED / DECLINED / EXPIRED)
// stay terminal — recreate-and-resend rather than transition out.
const STATUS_TRANSITIONS: Record<QuoteStatusType, QuoteStatusType[]> = {
  DRAFT: ['SENT'],
  SENT: ['ACCEPTED', 'DECLINED'],
  ACCEPTED: [],
  DECLINED: [],
  EXPIRED: [],
};

const TERMINAL_STATUSES: QuoteStatusType[] = ['ACCEPTED', 'DECLINED', 'EXPIRED'];

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

// Same UTC-formatted display as the Invoices tab — quote / expiration
// dates are semantically dates, not timestamps, despite the backend
// shipping them as ISO instants.
const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
};

// Compact variant for the "Last sent <date>" row hint — see the matching
// helper in FinancialInvoicesTab.tsx for rationale.
const formatDateCompact = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
};

const amt = (v: number | string | null | undefined): number => Number(v ?? 0) || 0;

/**
 * WO-scoped quotes tab inside the financial drawer (Phase 7b). Mirrors
 * `FinancialInvoicesTab`'s structure — dense Catalyst table with status
 * pill inline-edit, `⋯` row menu, and read-only line-item row expansion.
 * Quotes don't carry payments, so the expansion is simpler than the
 * invoices one.
 */
export default function FinancialQuotesTab({
  workOrderId,
  workOrderNumber,
  customerId,
  customerName,
  openQuoteCreateSignal,
}: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const quoteLabel = getName('quote');
  const quotesLabel = getName('quote', true);
  const customerLabel = getName('customer');
  const workOrderLabel = getName('work_order');
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Same pattern as FinancialInvoicesTab — soft inline banner for send /
  // reissue / extend feedback. See that file for rationale.
  const [actionBanner, setActionBanner] = useState<
    { kind: 'success' | 'error'; message: string } | null
  >(null);

  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);

  // Auto-open the create dialog when the parent chip-row ghost signals.
  // Same monotonic counter pattern as the Invoices tab.
  useEffect(() => {
    if (openQuoteCreateSignal && openQuoteCreateSignal > 0) {
      /* eslint-disable react-hooks/set-state-in-effect -- parent signal pattern */
      setQuoteDialogOpen(true);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [openQuoteCreateSignal]);

  const {
    data: quotes = [],
    isLoading,
    isError,
  } = useQuery<Quote[]>({
    queryKey: ['workOrderQuotes', workOrderId],
    queryFn: () => quotesApi.getByWorkOrder(workOrderId),
    enabled: !!workOrderId,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: QuoteStatusType }) =>
      quotesApi.updateStatus(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workOrderQuotes', workOrderId] });
      // Status changes affect DECLINED/EXPIRED exclusion in the summary
      // rollup's `quoted` field — invalidate so the header chips refetch.
      queryClient.invalidateQueries({ queryKey: ['financialSummary', workOrderId] });
    },
  });

  const sendQuote = useMutation({
    mutationFn: (quote: Quote) => quotesApi.send(quote.id),
    onSuccess: (_data, quote) => {
      queryClient.invalidateQueries({ queryKey: ['workOrderQuotes', workOrderId] });
      // Send auto-flips DRAFT → SENT (mirrors the invoice contract), which
      // affects the summary rollup bucket.
      queryClient.invalidateQueries({ queryKey: ['financialSummary', workOrderId] });
      setActionBanner({
        kind: 'success',
        message: t('workOrders.financialDrawer.quotesTab.sendSuccess', {
          entity: `${quoteLabel} ${quote.quoteNumber}`,
        }),
      });
    },
    onError: (error: unknown) => {
      const code = getApiErrorCode(error);
      if (code === 'NO_RECIPIENT') {
        setActionBanner({
          kind: 'error',
          message: t(
            'workOrders.financialDrawer.quotesTab.sendErrorNoRecipient',
            { customer: customerLabel },
          ),
        });
        return;
      }
      setActionBanner({
        kind: 'error',
        message:
          getApiErrorMessage(error) ??
          t('workOrders.financialDrawer.quotesTab.sendError', {
            entity: quoteLabel,
          }),
      });
    },
  });

  const reissueShareLink = useMutation({
    mutationFn: (quote: Quote) => quotesApi.reissueShareLink(quote.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workOrderQuotes', workOrderId] });
      setActionBanner({
        kind: 'success',
        message: t('workOrders.financialDrawer.quotesTab.reissueSuccess'),
      });
    },
    onError: (error: unknown) => {
      setActionBanner({
        kind: 'error',
        message:
          getApiErrorMessage(error) ??
          t('workOrders.financialDrawer.quotesTab.sendError', {
            entity: quoteLabel,
          }),
      });
    },
  });

  const extendShareLink = useMutation({
    mutationFn: (quote: Quote) => quotesApi.extendShareLink(quote.id),
    onSuccess: () => {
      setActionBanner({
        kind: 'success',
        message: t('workOrders.financialDrawer.quotesTab.extendSuccess'),
      });
    },
    onError: (error: unknown) => {
      setActionBanner({
        kind: 'error',
        message:
          getApiErrorMessage(error) ??
          t('workOrders.financialDrawer.quotesTab.sendError', {
            entity: quoteLabel,
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

  const handleStatusChange = (quote: Quote, next: QuoteStatusType) => {
    if (next === quote.status) return;
    updateStatus.mutate({ id: quote.id, status: next });
  };

  const handleSend = (quote: Quote) => {
    setActionBanner(null);
    sendQuote.mutate(quote);
  };

  const handleReissue = (quote: Quote) => {
    if (
      window.confirm(
        t('workOrders.financialDrawer.quotesTab.reissueConfirm', {
          entity: quoteLabel,
          number: quote.quoteNumber,
        }),
      )
    ) {
      setActionBanner(null);
      reissueShareLink.mutate(quote);
    }
  };

  const handleExtend = (quote: Quote) => {
    if (
      window.confirm(
        t('workOrders.financialDrawer.quotesTab.extendConfirm', {
          entity: quoteLabel,
          number: quote.quoteNumber,
        }),
      )
    ) {
      setActionBanner(null);
      extendShareLink.mutate(quote);
    }
  };

  if (isLoading) {
    return (
      <LoadingState
        label={t('workOrders.financialDrawer.quotesTab.loading', {
          entities: quotesLabel,
        })}
      />
    );
  }

  if (isError) {
    return (
      <div className="py-8 text-center">
        <Text className="!text-sm !text-rose-600 dark:!text-rose-400">
          {t('workOrders.financialDrawer.quotesTab.errorLoading', {
            entities: quotesLabel,
          })}
        </Text>
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <>
        <div className="py-12 text-center">
          <Text className="!text-sm !text-zinc-500">
            {t('workOrders.financialDrawer.quotesTab.empty', {
              entities: quotesLabel,
              workOrder: workOrderLabel,
            })}
          </Text>
          <div className="mt-4 flex justify-center">
            <Button color="dark/zinc" onClick={() => setQuoteDialogOpen(true)}>
              <PlusIcon className="size-4" />
              {t('workOrders.financialDrawer.quotesTab.newQuote', {
                entity: quoteLabel,
              })}
            </Button>
          </div>
        </div>
        <QuoteDialog
          open={quoteDialogOpen}
          onClose={() => setQuoteDialogOpen(false)}
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
      <div className="mb-3 flex justify-end gap-2">
        <Button color="dark/zinc" onClick={() => setQuoteDialogOpen(true)}>
          <PlusIcon className="size-4" />
          {t('workOrders.financialDrawer.quotesTab.newQuote', {
            entity: quoteLabel,
          })}
        </Button>
      </div>

      <Table dense className="[--gutter:theme(spacing.1)] text-sm">
        <TableHead>
          <TableRow>
            <TableHeader className="w-8" />
            <TableHeader>
              {t('workOrders.financialDrawer.quotesTab.columns.quoteNumber', {
                entity: quoteLabel,
              })}
            </TableHeader>
            <TableHeader>
              {t('workOrders.financialDrawer.quotesTab.columns.date')}
            </TableHeader>
            <TableHeader>
              {t('workOrders.financialDrawer.quotesTab.columns.expires')}
            </TableHeader>
            <TableHeader>
              {t('workOrders.financialDrawer.quotesTab.columns.status')}
            </TableHeader>
            <TableHeader className="text-right">
              {t('workOrders.financialDrawer.quotesTab.columns.total')}
            </TableHeader>
            <TableHeader className="w-8" />
          </TableRow>
        </TableHead>
        <TableBody>
          {quotes.map((quote) => {
            const isExpanded = expanded.has(quote.id);
            const isTerminal = TERMINAL_STATUSES.includes(quote.status);
            const transitions = STATUS_TRANSITIONS[quote.status];
            // Terminal rows (declined / expired) render muted; accepted
            // stays at normal opacity since it's the success state.
            const rowMuted =
              quote.status === 'DECLINED' || quote.status === 'EXPIRED'
                ? 'opacity-60'
                : '';

            return (
              <Fragment key={quote.id}>
                <TableRow className={rowMuted}>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => toggleExpand(quote.id)}
                      className="cursor-pointer rounded p-0.5 hover:bg-zinc-100 dark:hover:bg-white/5"
                      aria-label={
                        isExpanded
                          ? t('workOrders.financialDrawer.quotesTab.collapseRow')
                          : t('workOrders.financialDrawer.quotesTab.expandRow')
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
                    <div>{quote.quoteNumber}</div>
                    {quote.lastSentAt && (() => {
                      const fullEmail =
                        quote.lastSentToEmails?.split(',')[0]?.trim() ?? '—';
                      const lastSentText = t(
                        'workOrders.financialDrawer.quotesTab.lastSentTo',
                        {
                          date: formatDateCompact(quote.lastSentAt),
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
                  <TableCell>{formatDate(quote.quoteDate)}</TableCell>
                  <TableCell>{formatDate(quote.expirationDate)}</TableCell>
                  <TableCell>
                    {transitions.length === 0 ? (
                      <Badge color={STATUS_COLORS[quote.status]}>
                        {t(
                          `workOrders.financialDrawer.quotesTab.statuses.${
                            STATUS_LABEL_KEYS[quote.status]
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
                            'workOrders.financialDrawer.quotesTab.changeStatus',
                            {
                              current: t(
                                `workOrders.financialDrawer.quotesTab.statuses.${
                                  STATUS_LABEL_KEYS[quote.status]
                                }`,
                              ),
                            },
                          )}
                        >
                          <Badge color={STATUS_COLORS[quote.status]}>
                            {t(
                              `workOrders.financialDrawer.quotesTab.statuses.${
                                STATUS_LABEL_KEYS[quote.status]
                              }`,
                            )}
                          </Badge>
                        </DropdownButton>
                        <DropdownMenu anchor="bottom start">
                          {transitions.map((next) => (
                            <DropdownItem
                              key={next}
                              onClick={() => handleStatusChange(quote, next)}
                            >
                              <DropdownLabel>
                                {t(
                                  `workOrders.financialDrawer.quotesTab.statuses.${STATUS_LABEL_KEYS[next]}`,
                                )}
                              </DropdownLabel>
                            </DropdownItem>
                          ))}
                        </DropdownMenu>
                      </Dropdown>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {currencyFormatter.format(amt(quote.totalAmount))}
                  </TableCell>
                  <TableCell>
                    {!isTerminal && (
                      <Dropdown>
                        <DropdownButton plain aria-label={t('common.moreOptions')}>
                          <EllipsisHorizontalIcon className="size-5" />
                        </DropdownButton>
                        <DropdownMenu anchor="bottom end">
                          <DropdownItem onClick={() => handleSend(quote)}>
                            <DropdownLabel>
                              {quote.lastSentAt
                                ? t('workOrders.financialDrawer.quotesTab.actions.resend')
                                : t('workOrders.financialDrawer.quotesTab.actions.send')}
                            </DropdownLabel>
                          </DropdownItem>
                          {quote.lastSentAt && (
                            <>
                              <DropdownItem onClick={() => handleReissue(quote)}>
                                <DropdownLabel>
                                  {t('workOrders.financialDrawer.quotesTab.actions.reissue')}
                                </DropdownLabel>
                              </DropdownItem>
                              <DropdownItem onClick={() => handleExtend(quote)}>
                                <DropdownLabel>
                                  {t('workOrders.financialDrawer.quotesTab.actions.extend')}
                                </DropdownLabel>
                              </DropdownItem>
                            </>
                          )}
                          {quote.status === QuoteStatus.SENT && (
                            <>
                              <DropdownItem
                                onClick={() =>
                                  handleStatusChange(quote, QuoteStatus.ACCEPTED)
                                }
                              >
                                <DropdownLabel>
                                  {t(
                                    'workOrders.financialDrawer.quotesTab.actions.markAccepted',
                                  )}
                                </DropdownLabel>
                              </DropdownItem>
                              <DropdownItem
                                onClick={() =>
                                  handleStatusChange(quote, QuoteStatus.DECLINED)
                                }
                              >
                                <DropdownLabel>
                                  {t(
                                    'workOrders.financialDrawer.quotesTab.actions.markDeclined',
                                  )}
                                </DropdownLabel>
                              </DropdownItem>
                            </>
                          )}
                        </DropdownMenu>
                      </Dropdown>
                    )}
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow className={rowMuted}>
                    <TableCell />
                    <TableCell
                      colSpan={6}
                      className="!py-3 bg-zinc-50 dark:bg-white/5"
                    >
                      <QuoteExpansion quote={quote} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>

      <QuoteDialog
        open={quoteDialogOpen}
        onClose={() => setQuoteDialogOpen(false)}
        workOrderId={workOrderId}
        workOrderNumber={workOrderNumber}
        defaultCustomer={{ id: customerId, name: customerName }}
      />
    </div>
  );
}

interface QuoteExpansionProps {
  quote: Quote;
}

/**
 * Read-only inline expansion (§3.4): line items + notes. Unlike invoice
 * expansion, quotes don't carry payments — they're pre-billing documents.
 */
function QuoteExpansion({ quote }: QuoteExpansionProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {t('workOrders.financialDrawer.quotesTab.lineItemsHeading')}
        </div>
        {quote.lineItems.length === 0 ? (
          <Text className="!text-sm !text-zinc-500">
            {t('workOrders.financialDrawer.quotesTab.noLineItems')}
          </Text>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-zinc-500 dark:text-zinc-400">
              <tr className="text-left">
                <th className="px-2 pb-1 font-medium">
                  {t('workOrders.financialDrawer.quotesTab.lineColumns.description')}
                </th>
                <th className="px-2 pb-1 text-right font-medium">
                  {t('workOrders.financialDrawer.quotesTab.lineColumns.quantity')}
                </th>
                <th className="px-2 pb-1 text-right font-medium">
                  {t('workOrders.financialDrawer.quotesTab.lineColumns.unitPrice')}
                </th>
                <th className="px-2 pb-1 text-right font-medium">
                  {t('workOrders.financialDrawer.quotesTab.lineColumns.lineTotal')}
                </th>
              </tr>
            </thead>
            <tbody>
              {quote.lineItems.map((li) => (
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

      {quote.notes && (
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {t('workOrders.financialDrawer.quotesTab.notesHeading')}
          </div>
          <Text className="!text-sm whitespace-pre-wrap">{quote.notes}</Text>
        </div>
      )}
    </div>
  );
}
