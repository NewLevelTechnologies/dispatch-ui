// Compact overview — every dispatch on the job without leaving the Overview.
// Same shell as the Notes drawer (right slide-over, 460px, scrim, Esc closes).
// Picking a row swaps this drawer for the trip drawer (one drawer at a time);
// the footer is the escape hatch to the full Dispatches tab.
import { useTranslation } from '@dispatch/i18n';
import { ChevronRightIcon, PlusIcon, TruckIcon } from '@heroicons/react/16/solid';
import type { DispatchBoardRow, WorkItemResponse, WorkOrderFile } from '../../../api/setup';
import { useGlossary } from '../../../contexts/GlossaryContext';
import { dispatchCoversWorkItem } from '@dispatch/utils';
import { SlideOver, SlideOverBody, SlideOverFooter, SlideOverHeader, SlideOverTitle } from '../../../components/catalyst/slideover';
import { Button } from '../../../components/catalyst/button';
import { Avatar } from '../../../components/ui/Avatar';
import { Pill } from '../../../components/ui/Pill';
import { dispatchDate, onSiteDuration, timeLabel, windowLabel } from '../../../components/work-items/format';
import { DISPATCH_PRESENTATION, isLiveDispatch } from '../overviewModel';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Non-cancelled visits in arrival order (positional numbers are index + 1). */
  visits: DispatchBoardRow[];
  workItems: WorkItemResponse[];
  /** The job's photos/videos — counted per visit by `dispatchId`. */
  media: WorkOrderFile[];
  /** Why an upcoming visit can't happen yet (open PO), or null. */
  partsBlocker: string | null;
  onSelect: (d: DispatchBoardRow) => void;
  /** Omitted when the user can't schedule. */
  onSchedule?: () => void;
  onOpenDispatchesTab: () => void;
}

export default function DispatchListDrawer({
  open,
  onClose,
  visits,
  workItems,
  media,
  partsBlocker,
  onSelect,
  onSchedule,
  onOpenDispatchesTab,
}: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();

  const past = (d: DispatchBoardRow) => d.status === 'COMPLETED' || d.status === 'NO_SHOW';
  const groups: { key: string; label: string; live?: boolean; list: DispatchBoardRow[] }[] = [
    { key: 'now', label: t('workOrders.detail.compact.drawer.now'), live: true, list: visits.filter((d) => isLiveDispatch(d.status)) },
    {
      key: 'upcoming',
      label: t('workOrders.detail.compact.drawer.upcoming'),
      list: visits.filter((d) => !isLiveDispatch(d.status) && !past(d)),
    },
    { key: 'completed', label: t('workOrders.detail.compact.drawer.completed'), list: visits.filter(past).reverse() },
  ].filter((g) => g.list.length > 0);

  // One drawer at a time: close this one, then open the trip drawer.
  const pick = (d: DispatchBoardRow) => {
    onClose();
    onSelect(d);
  };

  return (
    <SlideOver open={open} onClose={onClose} className="!max-w-[460px]">
      <SlideOverHeader onClose={onClose}>
        <div className="flex items-center gap-2">
          <SlideOverTitle className="flex items-center gap-2 text-base">
            <TruckIcon className="size-4 text-fg-muted" />
            {getName('dispatch', true)}
            <span className="text-sm font-normal text-fg-muted">· {visits.length}</span>
          </SlideOverTitle>
          {onSchedule && (
            <Button
              outline
              size="xs"
              className="ml-auto"
              onClick={() => {
                onClose();
                onSchedule();
              }}
            >
              <PlusIcon data-slot="icon" />
              {t('workOrders.workItems.schedule')}
            </Button>
          )}
        </div>
      </SlideOverHeader>

      <SlideOverBody className="!p-0">
        {visits.length === 0 && (
          <div className="px-6 py-6 text-[12.5px] text-fg-muted">{t('workOrders.detail.compact.notScheduledYet')}</div>
        )}
        {groups.map((g) => (
          <section key={g.key} aria-label={g.label}>
            <div className={'ovc-dlgroup' + (g.live ? ' live' : '')}>
              {g.label} · {g.list.length}
            </div>
            {g.list.map((d) => {
              const seq = visits.indexOf(d) + 1;
              const p = DISPATCH_PRESENTATION[d.status];
              const done = d.status === 'COMPLETED';
              const covered = workItems.filter((wi) => (d.addressedWorkItemIds?.length ?? 0) > 0 && dispatchCoversWorkItem(d, wi.id));
              const duration = onSiteDuration(d.arrivedAt, d.departedAt);
              const photos = media.filter((m) => m.dispatchId === d.id).length;
              const blocked = d.status === 'SCHEDULED' && partsBlocker;
              const meta = [
                blocked && `⌛ ${partsBlocker}`,
                duration
                  ? t('workOrders.workItems.onSite', { duration })
                  : d.arrivedAt && t('workOrders.detail.compact.drawer.arrivedAt', { time: timeLabel(d.arrivedAt) }),
                photos > 0 && t('workOrders.detail.compact.drawer.photos', { count: photos }),
              ].filter(Boolean);
              return (
                <button key={d.id} type="button" className="ovc-dlrow" onClick={() => pick(d)}>
                  <span className={'wit-seq' + (done ? ' t-success' : p.live ? ' t-violet' : '')}>{done ? '✓' : seq}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-fg-strong">{dispatchDate(d.arrivalWindowStart)}</span>
                      <span className="text-[11.5px] text-fg-muted">{windowLabel(d.arrivalWindowStart, d.arrivalWindowEnd)}</span>
                      <span className="flex-1" />
                      <Pill tone={p.tone} dot live={d.status === 'EN_ROUTE'}>
                        {p.label}
                      </Pill>
                    </span>
                    {d.assignedUserName && (
                      <span className="mt-1.5 flex items-center gap-1.5">
                        <Avatar name={d.assignedUserName} size="sm" />
                        <span className="text-[12px] text-fg">{d.assignedUserName}</span>
                      </span>
                    )}
                    <span className="mt-1 block text-[11.5px]/[1.5] text-fg-muted">
                      {/* An unscoped visit covers the whole job — every item. */}
                      {(d.addressedWorkItemIds?.length ?? 0) === 0
                        ? t('workOrders.detail.compact.drawer.wholeJob', { job: getName('work_order').toLowerCase() })
                        : covered.length > 0
                          ? covered.map((wi) => wi.description).join(' · ')
                          : t('workOrders.detail.compact.drawer.noItems', { entities: getName('work_item', true).toLowerCase() })}
                    </span>
                    {meta.length > 0 && (
                      <span className={`mt-1 flex flex-wrap gap-x-2.5 text-[11px] ${blocked ? 'font-semibold text-warning-fg' : 'text-fg-muted'}`}>
                        {meta.map((m) => (
                          <span key={m as string}>{m}</span>
                        ))}
                      </span>
                    )}
                  </span>
                  <ChevronRightIcon className="size-3.5 self-center text-fg-muted" aria-hidden />
                </button>
              );
            })}
          </section>
        ))}
      </SlideOverBody>

      <SlideOverFooter className="!px-6 !py-2.5 flex justify-end">
        <button
          type="button"
          className="card-action"
          onClick={() => {
            onClose();
            onOpenDispatchesTab();
          }}
        >
          {t('workOrders.detail.compact.drawer.openTab', { entities: getName('dispatch', true) })}
        </button>
      </SlideOverFooter>
    </SlideOver>
  );
}
