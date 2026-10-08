// Per-tech drill-in for the Tech productivity card: the invoices credited to
// one tech this month, newest first. A right-side slide-over so the card
// stays visible behind it. Open state and the page live in the URL (`?tech=`,
// `?techPage=`) so the pager can use ListFooter's hrefs and Back closes it.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from '@dispatch/i18n';
import { formatCurrency } from '@dispatch/utils';
import { technicianProductivityApi, type TechnicianProductivityRow } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { useUrlPage } from '../../hooks/useUrlPage';
import { Button } from '../../components/catalyst/button';
import { SlideOver, SlideOverBody, SlideOverHeader, SlideOverTitle } from '../../components/catalyst/slideover';
import { Avatar } from '../../components/ui/Avatar';
import { DenseRow, DenseTable, DenseTHead } from '../../components/ui/DenseTable';
import { ListFooter } from '../../components/ui/ListFooter';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';
import { hours, money, shortDate } from './revenueSelectors';

export const TECH_PARAM = 'tech';
export const TECH_PAGE_PARAM = 'techPage';
const PAGE_SIZE = 25;
// The drill-in lists the most recent callbacks; the count is on the card.
const CALLBACKS_SIZE = 50;
const DASH = '—';

export function TechCreditDrawer({
  row,
  name,
  period,
  regionIds,
  periodLabel,
  onClose,
}: {
  /** The open tech's card row; undefined closes the drawer. */
  row: TechnicianProductivityRow | undefined;
  name: string;
  /** The card's period as sent to the backend; undefined = this month. */
  period: string | undefined;
  /** The card's regions, so the drill-in adds up to its row. */
  regionIds: string[] | undefined;
  periodLabel: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const { page, pageHref } = useUrlPage(TECH_PAGE_PARAM);
  const words = {
    agreement: getName('agreement'),
    invoice: getName('invoice'),
    tech: getName('technician'),
    techs: getName('technician', true),
    workOrder: getName('work_order'),
    workOrders: getName('work_order', true),
  };
  const invoices = useQuery({
    queryKey: ['technician-productivity', 'invoices', row?.userId, period ?? 'current', regionIds, page],
    queryFn: () =>
      technicianProductivityApi.getCreditedInvoices(row?.userId ?? '', {
        period,
        regionIds,
        page: page - 1,
        size: PAGE_SIZE,
      }),
    enabled: !!row,
  });

  const excluded = row
    ? (['billedLater', 'billedEarlier', 'notBilled', 'agreement'] as const)
        .filter((k) => row.excludedHours[k] > 0)
        .map((k) => t(`dashboard.revenue.techs.excludedLong.${k}`, { ...words, hours: hours(row.excludedHours[k]) }))
    : [];

  let table;
  if (invoices.isLoading) table = <LoadingState />;
  else if (invoices.isError || !invoices.data)
    table = (
      <ErrorState
        title={t('dashboard.revenue.error')}
        action={
          <Button outline size="xs" onClick={() => void invoices.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  else if (invoices.data.content.length === 0)
    table = (
      <EmptyState compact title={t('common.actions.notFound', { entities: getName('invoice', true) })} />
    );
  else {
    const data = invoices.data;
    const start = data.number * data.size + 1;
    table = (
      <div className="home-drawer-table">
        <DenseTable>
          <DenseTHead>
            <tr>
              <th>{getName('invoice')}</th>
              <th>{t('dashboard.revenue.techs.drawer.issued')}</th>
              <th className="right">{t('dashboard.revenue.techs.drawer.invoiceTotal', words)}</th>
              <th>{t('dashboard.revenue.techs.drawer.split')}</th>
              <th className="right">{t('dashboard.revenue.techs.drawer.credited')}</th>
              <th>{t('dashboard.revenue.techs.drawer.writtenBy')}</th>
            </tr>
          </DenseTHead>
          <tbody>
            {data.content.map((inv) => (
              <DenseRow key={inv.invoiceId} data-testid="credited-invoice">
                <td className="font-mono">
                  <Link className="text-fg-accent hover:underline" to={`/work-orders/${inv.workOrderId}?tab=estimate`}>
                    {inv.invoiceNumber ?? DASH}
                  </Link>
                </td>
                <td className="num" data-label={t('dashboard.revenue.techs.drawer.issued')}>
                  {shortDate(inv.invoiceDate)}
                </td>
                <td className="right num" data-label={t('dashboard.revenue.techs.drawer.invoiceTotal', words)}>
                  {formatCurrency(inv.invoiceTotal)}
                </td>
                <td data-label={t('dashboard.revenue.techs.drawer.split')}>
                  {inv.technicianCount <= 1
                    ? t('dashboard.revenue.techs.drawer.solo')
                    : t('dashboard.revenue.techs.drawer.share', {
                        count: inv.technicianCount,
                        pct: Math.round(100 / inv.technicianCount),
                      })}
                </td>
                <td className="right num strong" data-label={t('dashboard.revenue.techs.drawer.credited')}>
                  {formatCurrency(inv.creditedAmount)}
                </td>
                <td data-label={t('dashboard.revenue.techs.drawer.writtenBy')}>
                  {inv.writtenByName ?? (
                    <span className="text-fg-muted">{t('dashboard.revenue.techs.drawer.notRecorded')}</span>
                  )}
                </td>
              </DenseRow>
            ))}
          </tbody>
        </DenseTable>
        <ListFooter
          page={page}
          totalPages={data.totalPages}
          pageHref={pageHref}
          left={t('common.pagination.showing', {
            start,
            end: start + data.content.length - 1,
            total: data.totalElements,
          })}
        />
      </div>
    );
  }

  return (
    <SlideOver open={!!row} onClose={onClose}>
      <SlideOverHeader onClose={onClose}>
        <div className="flex items-center gap-3">
          <Avatar name={name || ' '} size="md" />
          <div>
            <SlideOverTitle>{name}</SlideOverTitle>
            <div className="home-att-meta">{t('dashboard.revenue.techs.drawer.period', { period: periodLabel })}</div>
          </div>
        </div>
      </SlideOverHeader>
      <SlideOverBody>
        {row && (
          <div className="flex flex-col gap-4">
            <div className="home-stat-grid four">
              <div>
                <div className="label-tiny">{t('dashboard.revenue.techs.drawer.creditedRevenue')}</div>
                <div className="home-stat">{formatCurrency(row.revenue)}</div>
              </div>
              <div>
                <div className="label-tiny">{getName('invoice', true)}</div>
                <div className="home-stat">{invoices.data?.totalElements ?? DASH}</div>
              </div>
              <div>
                <div className="label-tiny">{t('dashboard.revenue.techs.drawer.invoicedHours')}</div>
                <div className="home-stat">{hours(row.invoicedHours)}</div>
              </div>
              <div>
                <div className="label-tiny">{t('dashboard.revenue.techs.drawer.perHour')}</div>
                <div className="home-stat">
                  {row.revenuePerInvoicedHour != null ? money(row.revenuePerInvoicedHour) : DASH}
                </div>
              </div>
            </div>
            <p className="home-att-meta">
              {t('dashboard.revenue.techs.drawer.note', words)}
              {excluded.length > 0 && ` ${t('dashboard.revenue.techs.drawer.excluded', { parts: excluded.join(', ') })}`}
            </p>
            {table}
            {row.callbacks > 0 && <ChargedCallbacks userId={row.userId} period={period} regionIds={regionIds} />}
          </div>
        )}
      </SlideOverBody>
    </SlideOver>
  );
}

/**
 * The callbacks charged to this tech in the period: each callback job and the
 * original it points back to. A callback charges every tech who arrived on
 * the original, once each.
 */
function ChargedCallbacks({
  userId,
  period,
  regionIds,
}: {
  userId: string;
  period: string | undefined;
  regionIds: string[] | undefined;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const callbacks = useQuery({
    queryKey: ['technician-productivity', 'callbacks', userId, period ?? 'current', regionIds],
    queryFn: () => technicianProductivityApi.getChargedCallbacks(userId, { period, regionIds, size: CALLBACKS_SIZE }),
  });
  if (callbacks.isLoading) return <LoadingState />;
  if (callbacks.isError || !callbacks.data) return null;
  const data = callbacks.data;
  return (
    <div className="flex flex-col gap-2" data-testid="charged-callbacks">
      <div className="label-tiny">{t('dashboard.revenue.techs.callbacks')}</div>
      <div className="home-drawer-table">
        <DenseTable>
          <DenseTHead>
            <tr>
              <th>{t('dashboard.revenue.techs.drawer.callback')}</th>
              <th>{t('dashboard.revenue.techs.drawer.opened')}</th>
              <th>{t('dashboard.revenue.techs.drawer.original', { entity: getName('work_order') })}</th>
            </tr>
          </DenseTHead>
          <tbody>
            {data.content.map((c) => (
              <DenseRow key={c.workOrderId} data-testid="charged-callback">
                <td className="font-mono">
                  <Link className="text-fg-accent hover:underline" to={`/work-orders/${c.workOrderId}`}>
                    {c.workOrderNumber}
                  </Link>
                </td>
                <td className="num">{shortDate(c.createdAt.slice(0, 10))}</td>
                <td className="font-mono">
                  {c.original.workOrderNumber ? (
                    <Link className="text-fg-accent hover:underline" to={`/work-orders/${c.original.id}`}>
                      {c.original.workOrderNumber}
                    </Link>
                  ) : (
                    DASH
                  )}
                </td>
              </DenseRow>
            ))}
          </tbody>
        </DenseTable>
        {data.totalElements > data.content.length && (
          <ListFooter
            left={t('common.pagination.showing', { start: 1, end: data.content.length, total: data.totalElements })}
          />
        )}
      </div>
    </div>
  );
}
