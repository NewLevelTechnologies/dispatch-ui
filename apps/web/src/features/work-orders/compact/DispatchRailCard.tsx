// Compact overview — Dispatch rail card. Who's on the job, when, and how long
// they were actually there. One hero visit (live → next scheduled → most
// recent), its lifecycle stamps, then the other visits one line each.
// Deliberately no schedule button: scheduling lives on the dispatch board, and
// the Work items tab keeps its state-driven "Schedule dispatch".
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { TruckIcon } from '@heroicons/react/16/solid';
import { dispatchesApi, type DispatchBoardRow, type DispatchLifecycle } from '../../../api/setup';
import { useGlossary } from '../../../contexts/GlossaryContext';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '../../../components/ui/Card';
import { Avatar } from '../../../components/ui/Avatar';
import { Pill } from '../../../components/ui/Pill';
import { dispatchDate, onSiteDuration, timeLabel, windowLabel } from '../../../components/work-items/format';
import { DISPATCH_PRESENTATION, isLiveDispatch, pickHeroVisit } from '../overviewModel';

interface Props {
  /** Non-cancelled visits in arrival order (positional numbers are index + 1). */
  visits: DispatchBoardRow[];
  /** Why the next visit can't happen yet: an open PO's ETA, or just "waiting". */
  partsBlocker: string | null;
  onSelect: (d: DispatchBoardRow) => void;
  onViewAll: () => void;
}

export default function DispatchRailCard({ visits, partsBlocker, onSelect, onViewAll }: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const hero = pickHeroVisit(visits);
  const others = visits.filter((d) => d !== hero);
  const seqOf = (d: DispatchBoardRow) => visits.indexOf(d) + 1;

  // The list rows carry no lifecycle/label — the by-id read does (same key as
  // the trip drawer, so opening it is instant).
  const { data: heroDetail } = useQuery({
    queryKey: ['dispatch', hero?.id],
    queryFn: () => dispatchesApi.getById(hero!.id),
    enabled: !!hero,
  });

  const lc: Partial<DispatchLifecycle> = heroDetail?.lifecycle ?? {
    arrived: hero?.arrivedAt ?? null,
    departed: hero?.departedAt ?? null,
  };
  const stamps: [string, string | null | undefined][] = [
    [t('workOrders.detail.compact.stampNotified'), lc.notified],
    [t('workOrders.detail.compact.stampEnRoute'), lc.enroute],
    [t('workOrders.detail.compact.stampArrived'), lc.arrived],
    [t('workOrders.detail.compact.stampLeft'), lc.departed],
  ];
  const onSite = hero ? onSiteDuration(lc.arrived ?? null, lc.departed ?? null) : null;
  const heroPresentation = hero ? DISPATCH_PRESENTATION[hero.status] : null;

  const otherDetail = (d: DispatchBoardRow): { text: string; warn?: boolean } => {
    const duration = onSiteDuration(d.arrivedAt, d.departedAt);
    if (d.status === 'COMPLETED' && duration) return { text: t('workOrders.workItems.onSite', { duration }) };
    if (d.status === 'SCHEDULED' && partsBlocker) return { text: `⌛ ${partsBlocker}`, warn: true };
    return { text: DISPATCH_PRESENTATION[d.status].label };
  };

  return (
    <Card>
      <CardHead>
        <CardTitle icon={<TruckIcon className="size-3.5" />}>{getName('dispatch')}</CardTitle>
        <CardSub>
          {t('workOrders.detail.compact.onThisJob', { count: visits.length })}
        </CardSub>
        <span className="flex-1" />
        <button type="button" className="card-action" onClick={onViewAll}>
          {t('workOrders.detail.compact.all')}
        </button>
      </CardHead>

      {!hero || !heroPresentation ? (
        <CardBody className="text-[12px] text-fg-muted">{t('workOrders.detail.compact.notScheduledYet')}</CardBody>
      ) : (
        <CardBody>
          <button type="button" className="ovc-hero" onClick={() => onSelect(hero)}>
            <Avatar name={hero.assignedUserName ?? '?'} size="lg" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold tracking-[-0.01em] text-fg-strong">
                {hero.assignedUserName ?? t('workOrders.detail.compact.unassigned')}
              </span>
              <span className="block truncate text-[11.5px] text-fg-muted">
                {[
                  t('workOrders.detail.compact.visitOf', {
                    dispatch: getName('dispatch'),
                    n: seqOf(hero),
                    total: visits.length,
                  }),
                  heroDetail?.label,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <Pill tone={heroPresentation.tone} dot live={heroPresentation.live}>
              {heroPresentation.label}
            </Pill>
          </button>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="label-tiny">{t('workOrders.detail.compact.window')}</span>
            <span className="text-[12.5px] font-semibold text-fg-strong">
              {dispatchDate(hero.arrivalWindowStart)} · {windowLabel(hero.arrivalWindowStart, hero.arrivalWindowEnd)}
            </span>
            {hero.status === 'SCHEDULED' && partsBlocker && (
              <span className="ml-auto text-[11px] font-semibold text-warning-fg">⌛ {partsBlocker}</span>
            )}
          </div>

          <div className="ovc-stamps">
            {stamps.map(([label, at]) => (
              <span key={label} className={'ovc-stamp' + (at ? ' set' : '')}>
                <span className="truncate">{label}</span>
                <span className="tabular-nums">{at ? timeLabel(at) : '—'}</span>
              </span>
            ))}
          </div>

          {onSite && (
            <div className="mt-2 text-[12px] font-semibold text-fg-strong">
              {t('workOrders.workItems.onSite', { duration: onSite })}
            </div>
          )}
        </CardBody>
      )}

      {others.length > 0 && (
        <CardBody flush className="border-t border-border-soft">
          {others.map((d) => {
            const done = d.status === 'COMPLETED';
            const live = isLiveDispatch(d.status);
            const info = otherDetail(d);
            return (
              <button key={d.id} type="button" className="wit-trip" onClick={() => onSelect(d)}>
                <span
                  className={'wit-seq' + (done ? ' t-success' : live ? ' t-violet' : '')}
                  aria-label={done ? DISPATCH_PRESENTATION.COMPLETED.label : undefined}
                >
                  {done ? '✓' : seqOf(d)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[12px] font-semibold text-fg-strong">{dispatchDate(d.arrivalWindowStart)}</span>
                    <span className="text-[11px] text-fg-muted">{windowLabel(d.arrivalWindowStart, d.arrivalWindowEnd)}</span>
                  </span>
                  <span className={`mt-px block text-[11px] ${info.warn ? 'text-warning-fg' : 'text-fg-muted'}`}>
                    {[d.assignedUserName, info.text].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            );
          })}
        </CardBody>
      )}
    </Card>
  );
}
