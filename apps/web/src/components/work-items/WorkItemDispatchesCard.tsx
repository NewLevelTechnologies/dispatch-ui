import { useTranslation } from '@dispatch/i18n';
import type { DispatchBoardRow } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { Pill } from '../ui/Pill';
import { dispatchDate, onSiteDuration, timeLabel, windowLabel } from './format';

interface Props {
  /** Visits that cover this item (`dispatchCoversWorkItem`), in visit order. */
  dispatches: DispatchBoardRow[];
  /** Positional visit number per dispatch id (1-based by arrival). */
  seqById: Map<string, number>;
  /** The item is waiting on parts — upcoming visits show the blocker. */
  partsBlocked: boolean;
  onSelect: (d: DispatchBoardRow) => void;
  onSchedule?: () => void;
}

/** Right-column Dispatches card: the visits that include this item. */
export default function WorkItemDispatchesCard({ dispatches, seqById, partsBlocked, onSelect, onSchedule }: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();

  const detail = (d: DispatchBoardRow): { text: string; warn?: boolean } => {
    switch (d.status) {
      case 'COMPLETED':
        return {
          text:
            onSiteDuration(d.arrivedAt, d.departedAt) != null
              ? t('workOrders.workItems.onSite', { duration: onSiteDuration(d.arrivedAt, d.departedAt) })
              : t('workOrders.workItems.dispatchStatus.completed'),
        };
      case 'IN_PROGRESS':
        return {
          text: d.arrivedAt
            ? t('workOrders.workItems.onSiteSince', { time: timeLabel(d.arrivedAt) })
            : t('workOrders.workItems.dispatchStatus.inProgress'),
        };
      case 'EN_ROUTE':
        return { text: t('workOrders.workItems.dispatchStatus.enRoute') };
      default:
        return partsBlocked
          ? { text: `⌛ ${t('workOrders.workItems.waitingOnParts')}`, warn: true }
          : { text: t('workOrders.workItems.dispatchStatus.scheduled') };
    }
  };

  return (
    <section className="card" aria-label={getName('dispatch', true)}>
      <div className="card-head">
        <div className="card-title">{getName('dispatch', true)}</div>
        <span className="flex-1" />
        {onSchedule && (
          <button type="button" className="card-action" onClick={onSchedule}>
            {`+ ${t('workOrders.workItems.schedule')}`}
          </button>
        )}
      </div>
      <div className="card-body flush">
        {dispatches.length === 0 && (
          <div className="px-3.5 py-3 text-[12px] text-fg-muted">{t('workOrders.workItems.notScheduledYet')}</div>
        )}
        {dispatches.map((d) => {
          const done = d.status === 'COMPLETED';
          const live = d.status === 'EN_ROUTE' || d.status === 'IN_PROGRESS';
          const seq = seqById.get(d.id);
          const info = detail(d);
          return (
            <button key={d.id} type="button" className="wit-trip" onClick={() => onSelect(d)}>
              <span
                className={'wit-seq' + (done ? ' t-success' : live ? ' t-violet' : '')}
                aria-label={done ? t('workOrders.workItems.dispatchStatus.completed') : undefined}
              >
                {done ? '✓' : seq}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-[12px] font-semibold text-fg-strong">
                    {dispatchDate(d.arrivalWindowStart)}
                  </span>
                  <span className="text-[11px] text-fg-muted">
                    {windowLabel(d.arrivalWindowStart, d.arrivalWindowEnd)}
                  </span>
                </span>
                <span className={`mt-px block text-[11px] ${info.warn ? 'text-warning-fg' : 'text-fg-muted'}`}>
                  {[d.assignedUserName, info.text].filter(Boolean).join(' · ')}
                </span>
              </span>
              {d.status === 'EN_ROUTE' && (
                <Pill tone="violet" dot live>
                  {t('workOrders.workItems.dispatchStatus.enRoute')}
                </Pill>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
