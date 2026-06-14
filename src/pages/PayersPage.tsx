import { useEffect, useState, useDeferredValue } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BanknotesIcon } from '@heroicons/react/24/outline';
import { customerApi } from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import AppLayout from '../components/AppLayout';
import { formatTimestamp } from '../lib/formatTimestamp';
import { extractApiError } from '../lib/toast';
import { Button } from '../components/catalyst/button';
import { PageHead } from '../components/ui/PageHead';
import { Card, CardBody } from '../components/ui/Card';
import { DenseTable, DenseTHead, DenseRow, CellStack, CellTop, CellSub } from '../components/ui/DenseTable';
import { ListToolbar, ListSearch } from '../components/ui/ListToolbar';
import { ListFooter } from '../components/ui/ListFooter';
import { LoadingState } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { PayerMark } from '../components/customer-detail/shared';

// Payers list — the bookkeeper triage surface for BILLING_ONLY customers
// ("find who owes"). Default sort is outstanding,desc (server-side; we just omit
// `sort`). Mirrors CustomersPage's shell/state pattern, with payer-specific
// financial columns from the PAYERS-LIST-1 denorm. Row → /customers/:id, which
// the shape router resolves to PayerDetail.
//
// v1 deferred (need BE params on /customers/payers — see BACKEND_ASKS): the
// Status picker + Has-open-balance / 91+-aged filter chips, and payer subtype
// (name subline + Type filter). Client-side filtering a paged list would be
// wrong, so those wait for the server params.
const PAGE_SIZE = 50;

// AR figures read as whole dollars on a scan line (no cents); lifetime is a big
// rough number → compact "$Nk".
const money0 = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const moneyK = (n: number) =>
  n >= 1000 ? '$' + Math.round(n / 1000).toLocaleString('en-US') + 'k' : '$' + Math.round(n);

export default function PayersPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlSearch = searchParams.get('search') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const [searchQuery, setSearchQuery] = useState(urlSearch);
  useEffect(() => {
    setSearchQuery(urlSearch);
  }, [urlSearch]);
  const deferredSearch = useDeferredValue(searchQuery);

  const updateSearch = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('search', value);
    else next.delete('search');
    next.delete('page');
    setSearchParams(next, { replace: true });
  };
  const pageHref = (target: number): string => {
    const next = new URLSearchParams(searchParams);
    if (target <= 1) next.delete('page');
    else next.set('page', String(target));
    const qs = next.toString();
    return qs ? `?${qs}` : '?';
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['payers', page, deferredSearch],
    // Omit `sort` → BE default outstanding,desc (the bookkeeper triage order).
    queryFn: () => customerApi.getPayers({ page, limit: PAGE_SIZE, search: deferredSearch || undefined }),
  });

  const payers = data?.content ?? [];
  const total = data?.totalElements ?? 0;
  const totalPages = data?.totalPages ?? 0;
  const counts = data?.counts;
  const showingStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingEnd = Math.min(page * PAGE_SIZE, total);

  const headerTotal = counts?.total ?? total;
  const headerActive = counts?.active;
  const payerNoun = headerTotal === 1 ? getName('payer').toLowerCase() : getName('payer', true).toLowerCase();
  const subtitle = (() => {
    if (headerTotal === 0 && !isLoading) return null;
    const parts = [`${headerTotal.toLocaleString()} ${payerNoun}`];
    if (typeof headerActive === 'number') {
      parts.push(`${headerActive.toLocaleString()} ${t('common.active').toLowerCase()}`);
    }
    return (
      <>
        {parts.join(' · ')}
        {' · '}
        <Link to="/customers" className="text-fg-accent hover:underline">
          {t('payers.backToCustomers', { entities: getName('customer', true) })}
        </Link>
      </>
    );
  })();

  const hasFilters = Boolean(deferredSearch);
  const clearFilters = () => {
    setSearchQuery('');
    setSearchParams(new URLSearchParams(), { replace: false });
  };

  const termsLabel = (days: number) =>
    days > 0 ? t('payers.table.net', { days }) : t('payers.table.dueOnReceipt');

  return (
    <AppLayout>
      <div>
        <PageHead title={getName('payer', true)} sub={subtitle} />

        <ListToolbar
          search={
            <ListSearch
              placeholder={t('payers.search.placeholder')}
              value={searchQuery}
              onChange={(value) => {
                setSearchQuery(value);
                updateSearch(value);
              }}
            />
          }
        />

        <Card>
          <CardBody flush>
            {isLoading ? (
              <LoadingState label={t('common.actions.loading', { entities: getName('payer', true) })} />
            ) : error ? (
              <ErrorState
                title={t('common.actions.couldNotLoad', { entities: getName('payer', true) })}
                description={extractApiError(error) ?? (error as Error).message}
                action={
                  <Button outline onClick={() => refetch()}>
                    {t('common.actions.tryAgain')}
                  </Button>
                }
              />
            ) : payers.length === 0 ? (
              hasFilters ? (
                <EmptyState
                  icon={<BanknotesIcon className="size-10 text-fg-dim" />}
                  title={t('common.actions.noMatchFilters', { entities: getName('payer', true) })}
                  description={t('common.actions.tryAdjustingFilters')}
                  action={
                    <Button outline onClick={clearFilters}>
                      {t('users.filter.clearFilters')}
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={<BanknotesIcon className="size-10 text-fg-dim" />}
                  title={t('common.actions.noEntitiesYet', { entities: getName('payer', true) })}
                />
              )
            ) : (
              <>
                <div className="overflow-x-auto">
                  <DenseTable>
                    <DenseTHead>
                      <tr>
                        <th>{getName('payer')}</th>
                        <th>{t('payers.table.terms')}</th>
                        <th className="right">{t('payers.table.outstanding')}</th>
                        <th className="right">{t('payers.table.openInvoices')}</th>
                        <th className="right">{t('payers.table.lifetimePaid')}</th>
                        <th>{t('payers.table.lastPayment')}</th>
                      </tr>
                    </DenseTHead>
                    <tbody>
                      {payers.map((p) => {
                        const isInactive = p.status === 'INACTIVE';
                        const aged = (p.aged91Total ?? 0) > 0;
                        return (
                          <DenseRow
                            key={p.id}
                            className={`cursor-pointer ${isInactive ? 'opacity-55' : ''}`}
                            onClick={() => navigate(`/customers/${p.id}`)}
                          >
                            <td>
                              <div className="flex items-center gap-2.5">
                                <PayerMark size={26} />
                                <CellStack>
                                  <CellTop>
                                    <span className="font-semibold text-fg-strong">{p.name}</span>
                                  </CellTop>
                                  <CellSub>
                                    <span className="font-mono">{p.customerNumber || p.id}</span>
                                  </CellSub>
                                </CellStack>
                              </div>
                            </td>
                            <td className="muted">{termsLabel(p.paymentTermsDays)}</td>
                            <td className="right">
                              {p.openBalanceTotal && p.openBalanceTotal > 0 ? (
                                <div className="flex flex-col items-end">
                                  <span
                                    className="font-mono font-bold tabular-nums"
                                    style={{ color: aged ? 'var(--warning-fg)' : 'var(--fg-strong)' }}
                                  >
                                    {money0(p.openBalanceTotal)}
                                  </span>
                                  {aged && (
                                    <span className="text-[11px]" style={{ color: 'var(--warning-fg)' }}>
                                      {t('payers.table.in91', { amount: money0(p.aged91Total!) })}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-fg-dim">—</span>
                              )}
                            </td>
                            <td className="right num">
                              {p.openInvoiceCount && p.openInvoiceCount > 0 ? (
                                p.openInvoiceCount
                              ) : (
                                <span className="text-fg-dim">—</span>
                              )}
                            </td>
                            <td className="right num muted">
                              {p.lifetimePaid != null ? moneyK(p.lifetimePaid) : <span className="text-fg-dim">—</span>}
                            </td>
                            <td className="muted">
                              {p.lastPaymentAt ? (
                                <CellStack>
                                  <CellTop>{formatTimestamp(p.lastPaymentAt)}</CellTop>
                                  {p.lastPaymentAmount != null && (
                                    <CellSub>
                                      <span className="font-mono">{money0(p.lastPaymentAmount)}</span>
                                    </CellSub>
                                  )}
                                </CellStack>
                              ) : (
                                <span className="text-fg-dim">—</span>
                              )}
                            </td>
                          </DenseRow>
                        );
                      })}
                    </tbody>
                  </DenseTable>
                </div>

                <ListFooter
                  page={page}
                  totalPages={totalPages}
                  pageHref={pageHref}
                  left={t('common.pagination.showing', {
                    start: showingStart,
                    end: showingEnd,
                    total: total.toLocaleString(),
                  })}
                />
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </AppLayout>
  );
}
