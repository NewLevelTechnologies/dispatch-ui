import { useTranslation } from '@dispatch/i18n';
import {
  type ProgressCategory,
  type WorkItemSummaryProjection,
} from '../api/setup';
import { Pill } from './ui/Pill';

type PillTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const PROGRESS_TONES: Record<ProgressCategory, PillTone> = {
  NOT_STARTED: 'neutral',
  AWAITING_SCHEDULE: 'info',
  IN_PROGRESS: 'info',
  BLOCKED: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
};

const PROGRESS_TRANSLATION_KEYS: Record<ProgressCategory, string> = {
  NOT_STARTED: 'notStarted',
  AWAITING_SCHEDULE: 'awaitingSchedule',
  IN_PROGRESS: 'inProgress',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

// Cap on how many work items render inline before collapsing the rest
// into a "+N more" indicator. Backend caps at 5; UI cap of 3 keeps row
// height in check on dense lists. The "+N more" count uses the
// unbounded `totalCount` so it's correct even when the server projection
// itself was truncated.
const WORK_ITEMS_INLINE_CAP = 3;

interface Props {
  items: WorkItemSummaryProjection[];
  /** Unbounded total — drives the "+N more" indicator regardless of
   *  whether the server truncated the projection (server caps at 5). */
  totalCount: number;
}

/**
 * Stack of work item descriptions with a status badge per line. Used on
 * the WO list page (main + scoped variants) to answer "what is this WO
 * about" — the highest-signal scan target on the list.
 *
 * Layout choices:
 * - **Status badge LEFT of description**, matching the order CSRs see on
 *   the WO detail page (design §3.3). Same content in both surfaces
 *   should read in the same order — switching it forces re-parsing.
 * - **No truncation in the normal case.** Variable row height is
 *   functional, not a flaw — uniform-height rows are a dashboard
 *   aesthetic, not a worklist one. Real CSR ops tools (ServiceTitan,
 *   Housecall Pro, etc.) all let descriptions wrap. Other columns on
 *   the row are single-line, so the eye still tracks down the table.
 * - **`line-clamp-5` as a safety net** for pathological cases (e.g. a
 *   400-word call note pasted into a description). Bounds one bad row
 *   from blowing out the table; the row remains clickable to detail
 *   for the full text. 5 lines is generous enough that 99% of real
 *   descriptions render in full — no hover/click pattern needed for
 *   the normal case.
 *
 * Renders an em-dash placeholder when the WO has no items so the column
 * stays visually present (avoids ragged-right rows).
 */
export default function WorkItemsCell({ items, totalCount }: Props) {
  const { t } = useTranslation();
  if (totalCount === 0 || items.length === 0) {
    return <span className="text-fg-dim">—</span>;
  }
  const visible = items.slice(0, WORK_ITEMS_INLINE_CAP);
  const overflow = totalCount - visible.length;
  return (
    <div className="flex max-w-[32rem] flex-col gap-1">
      {visible.map((wi, i) => (
        <div key={i} className="flex items-start gap-2">
          <Pill tone={PROGRESS_TONES[wi.statusCategory]} className="shrink-0">
            {t(`workOrders.progress.${PROGRESS_TRANSLATION_KEYS[wi.statusCategory]}`)}
          </Pill>
          <span className="line-clamp-5 min-w-0 flex-1 whitespace-pre-wrap font-[450] text-fg">
            {wi.description}
          </span>
        </div>
      ))}
      {overflow > 0 && (
        <span className="text-xs text-fg-muted">
          {t('workOrders.table.workItemsMore', { count: overflow })}
        </span>
      )}
    </div>
  );
}
