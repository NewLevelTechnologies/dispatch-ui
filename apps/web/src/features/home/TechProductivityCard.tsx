import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from '@dispatch/i18n';
import { formatCurrency } from '@dispatch/utils';
import { ChevronRightIcon, ReceiptPercentIcon } from '@heroicons/react/16/solid';
import {
  technicianProductivityApi,
  userApi,
  type FinancialDashboardRevenue,
  type TechnicianProductivityRow,
} from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { Button } from '../../components/catalyst/button';
import { Card, CardBody, CardHead, CardTitle } from '../../components/ui/Card';
import { CellStack, CellSub, CellTop, DenseRow, DenseTable, DenseTHead } from '../../components/ui/DenseTable';
import { Avatar } from '../../components/ui/Avatar';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';
import { hours, matchesRevenueMtd, money, unattributedAmount } from './revenueSelectors';
import { TechCreditDrawer, TECH_PAGE_PARAM, TECH_PARAM } from './TechCreditDrawer';

const DASH = '—';
const LOW_FIRST_VISIT = 0.8;
const MANY_CALLBACKS = 3;

/** The display name for a row, falling back to the users list when the server had none. */
function useTechName(rows: TechnicianProductivityRow[] | undefined) {
  const { t } = useTranslation();
  const needsLookup = !!rows?.some((r) => !r.name);
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => userApi.getAll(),
    enabled: needsLookup,
  });
  return (userId: string, name: string | null) => {
    if (name) return name;
    const user = users.data?.find((u) => u.id === userId);
    return user ? `${user.firstName} ${user.lastName}`.trim() : t('dashboard.revenue.techs.unknown');
  };
}

/**
 * Month to date, whole company (invoices carry no region). Every number is
 * the backend's; the card only lays it out. The total row says whether it
 * agrees with Revenue MTD, because the two come from different services.
 */
export function TechProductivityCard({ revenue }: { revenue: UseQueryResult<FinancialDashboardRevenue> }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useQuery({
    queryKey: ['technician-productivity'],
    queryFn: () => technicianProductivityApi.get(),
  });
  const nameOf = useTechName(query.data?.technicians);

  const openId = searchParams.get(TECH_PARAM);
  const open = (userId: string) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(TECH_PARAM, userId);
      next.delete(TECH_PAGE_PARAM);
      return next;
    });
  const close = () =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete(TECH_PARAM);
      next.delete(TECH_PAGE_PARAM);
      return next;
    });

  // Glossary names for the card's sentences.
  const words = {
    agreement: getName('agreement'),
    invoice: getName('invoice'),
    invoices: getName('invoice', true),
    tech: getName('technician'),
    techs: getName('technician', true),
    workOrder: getName('work_order'),
    workOrders: getName('work_order', true),
  };
  let body;
  if (query.isLoading) body = <LoadingState />;
  else if (query.isError || !query.data)
    body = (
      <ErrorState
        title={t('dashboard.revenue.error')}
        action={
          <Button outline size="xs" onClick={() => void query.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  else if (query.data.totalRevenue === 0 && query.data.technicians.length === 0)
    body = <EmptyState compact title={t('dashboard.revenue.techs.empty', words)} />;
  else {
    const p = query.data;
    const unattributed = unattributedAmount(p);
    const maxPerHour = Math.max(0, ...p.technicians.map((r) => r.revenuePerInvoicedHour ?? 0));
    const billed = revenue.data?.billed;
    const openRow = openId ? p.technicians.find((r) => r.userId === openId) : undefined;
    body = (
      <>
        <DenseTable className="home-techs">
          <DenseTHead>
            <tr>
              <th>{getName('technician')}</th>
              <th className="right">{t('dashboard.revenue.techs.jobs')}</th>
              <th className="right">{t('dashboard.revenue.techs.revenue')}</th>
              <th className="right home-col-opt">{t('dashboard.revenue.techs.avgTicket')}</th>
              <th className="right">{t('dashboard.revenue.techs.onSite')}</th>
              <th>{t('dashboard.revenue.techs.perHour')}</th>
              <th className="right">{t('dashboard.revenue.techs.firstVisit')}</th>
              <th className="right">{t('dashboard.revenue.techs.callbacks')}</th>
              <th aria-hidden />
            </tr>
          </DenseTHead>
          <tbody>
            {p.technicians.map((r) => {
              const name = nameOf(r.userId, r.name);
              const { agreement, notBilled } = r.excludedHours;
              const rate = r.firstVisit.rate;
              return (
                <DenseRow key={r.userId} onClick={() => open(r.userId)} data-testid="tech-row">
                  <td>
                    <div className="flex items-center gap-2">
                      <Avatar name={name} size="sm" />
                      <span className="strong">{name}</span>
                    </div>
                  </td>
                  <td className="right num" data-label={t('dashboard.revenue.techs.jobs')}>{r.jobs}</td>
                  <td className="right num strong" data-label={t('dashboard.revenue.techs.revenue')}>
                    {formatCurrency(r.revenue)}
                  </td>
                  <td className="right num home-col-opt" data-label={t('dashboard.revenue.techs.avgTicket')}>
                    {r.averageTicket != null ? money(r.averageTicket) : DASH}
                  </td>
                  <td className="right num" data-label={t('dashboard.revenue.techs.onSite')}>
                    <CellStack>
                      <span>{hours(r.onSiteHours)}</span>
                      {agreement + notBilled > 0 && (
                        <span
                          className="muted home-col-opt whitespace-nowrap"
                          title={t('dashboard.revenue.techs.excludedHint', {
                            ...words,
                            agreementHours: hours(agreement),
                            notBilledHours: hours(notBilled),
                          })}
                        >
                          {[
                            agreement > 0 && t('dashboard.revenue.techs.excludedAgreement', { ...words, hours: hours(agreement) }),
                            notBilled > 0 && t('dashboard.revenue.techs.excludedNotBilled', { hours: hours(notBilled) }),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
                    </CellStack>
                  </td>
                  <td data-label={t('dashboard.revenue.techs.perHour')}>
                    {r.revenuePerInvoicedHour != null ? (
                      <div className="flex items-center gap-2">
                        <span className="home-prog home-col-opt w-[90px] shrink-0">
                          <span
                            style={{
                              width: `${maxPerHour > 0 ? Math.round((r.revenuePerInvoicedHour / maxPerHour) * 100) : 0}%`,
                              background: 'var(--accent-500)',
                            }}
                          />
                        </span>
                        <span className="num strong">{money(r.revenuePerInvoicedHour)}</span>
                      </div>
                    ) : (
                      DASH
                    )}
                  </td>
                  <td
                    className={`right num${rate != null && rate < LOW_FIRST_VISIT ? ' home-warn' : ''}`}
                    data-label={t('dashboard.revenue.techs.firstVisit')}
                  >
                    {rate != null ? `${Math.round(rate * 100)}%` : DASH}
                  </td>
                  <td
                    className={`right num${r.callbacks >= MANY_CALLBACKS ? ' home-danger' : ''}`}
                    data-label={t('dashboard.revenue.techs.callbacks')}
                  >
                    {r.callbacks}
                  </td>
                  <td className="home-chev">
                    <ChevronRightIcon className="size-3" />
                  </td>
                </DenseRow>
              );
            })}
            {unattributed > 0 && (
              <DenseRow className="home-unattr" data-testid="unattributed-row">
                <td>
                  <div className="flex items-center gap-2">
                    <span className="home-unattr-ico">
                      <ReceiptPercentIcon className="size-3" />
                    </span>
                    <CellStack>
                      <CellTop>{t('dashboard.revenue.techs.unattributed')}</CellTop>
                      <CellSub>
                        {t('dashboard.revenue.techs.unattributedSub', {
                          noWorkOrder: formatCurrency(p.unattributed.noWorkOrder.amount),
                          noTechArrived: formatCurrency(p.unattributed.noTechArrived.amount),
                          ...words,
                        })}
                      </CellSub>
                    </CellStack>
                  </div>
                </td>
                <td className="right num muted">
                  {p.unattributed.noWorkOrder.count + p.unattributed.noTechArrived.count}
                </td>
                <td className="right num strong">{formatCurrency(unattributed)}</td>
                <td colSpan={6} />
              </DenseRow>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td className="strong">{t('dashboard.revenue.techs.total')}</td>
              <td />
              <td className="right num strong">{formatCurrency(p.totalRevenue)}</td>
              <td colSpan={6} className="muted" data-testid="techs-check">
                {billed === undefined
                  ? null
                  : matchesRevenueMtd(p.totalRevenue, billed)
                    ? t('dashboard.revenue.techs.matches')
                    : t('dashboard.revenue.techs.differs', { amount: formatCurrency(billed) })}
              </td>
            </tr>
          </tfoot>
        </DenseTable>
        <div className="home-card-note">{t('dashboard.revenue.techs.foot', words)}</div>
        <TechCreditDrawer
          row={openRow}
          name={openRow ? nameOf(openRow.userId, openRow.name) : ''}
          onClose={close}
        />
      </>
    );
  }

  return (
    <Card>
      <CardHead>
        <CardTitle>{t('dashboard.revenue.techs.title', words)}</CardTitle>
      </CardHead>
      <CardBody flush>{body}</CardBody>
    </Card>
  );
}
