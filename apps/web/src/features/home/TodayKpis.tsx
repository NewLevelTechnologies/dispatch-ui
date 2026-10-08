import { useTranslation } from '@dispatch/i18n';
import type { BoardSummary, DispatchBoard } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { KPI } from '../../components/ui/KPI';
import { completedCount, jobCount, techCounts } from './opsSelectors';

interface Props {
  board: DispatchBoard | undefined;
  boardError: boolean;
  summary: BoardSummary | undefined;
}

const DASH = '—';

function weekdayOf(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

/** How is today going. Today's values come from the day board; only the
 *  history (sparklines, last week, 7-day arrivals) comes from the summary. */
export function TodayKpis({ board, boardError, summary }: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const errorMeta = boardError ? t('dashboard.kpis.error') : undefined;

  const jobs = board ? jobCount(board.dispatches) : null;
  const done = board ? completedCount(board.dispatches) : null;
  const techs = board ? techCounts(board.techs) : null;

  // `days` is 14 local days, oldest first: [13] is today, [6] the same weekday
  // last week.
  const days = summary?.days ?? [];
  const lastWeek = days.length === 14 ? days[6] : undefined;
  let jobsDelta: string | undefined;
  let jobsDir: 'up' | 'down' = 'up';
  let jobsMeta = errorMeta;
  if (jobs != null && lastWeek) {
    const diff = jobs - lastWeek.jobCount;
    const weekday = weekdayOf(lastWeek.date);
    if (diff === 0) {
      jobsMeta = t('dashboard.kpis.sameAsLastWeek', { weekday });
    } else {
      jobsDelta = String(Math.abs(diff));
      jobsDir = diff > 0 ? 'up' : 'down';
      jobsMeta = t('dashboard.kpis.vsLastWeek', { weekday });
    }
  }

  const rate = summary?.arrivalWindow.onTimeRate;
  const arrivalSpark = days
    .slice(7)
    .filter((d) => d.arrivedCount > 0)
    .map((d) => d.onTimeCount / d.arrivedCount);

  return (
    <div className="home-kpis">
      <KPI
        label={t('dashboard.kpis.jobsToday', { dispatches: getName('dispatch', true) })}
        value={jobs ?? DASH}
        delta={jobsDelta}
        deltaDir={jobsDir}
        meta={jobsMeta}
        bar="var(--accent-500)"
        spark={days.map((d) => d.jobCount)}
      />
      <KPI
        label={t('dashboard.kpis.techsOnRoad', { entities: getName('technician', true) })}
        value={techs?.working ?? DASH}
        sub={board ? t('dashboard.kpis.of', { count: board.techs.length }) : undefined}
        meta={techs ? t('dashboard.kpis.techsMeta', { off: techs.off, idle: techs.idle }) : errorMeta}
        bar="var(--info-500)"
      />
      {/* No pace estimator exists, so no "on pace for" meta. */}
      <KPI
        label={t('dashboard.kpis.completed')}
        value={done ?? DASH}
        sub={jobs != null ? t('dashboard.kpis.of', { count: jobs }) : undefined}
        meta={errorMeta}
        bar="var(--success-500)"
      />
      <KPI
        label={t('dashboard.kpis.arrivalHit')}
        value={rate != null ? `${Math.round(rate * 100)}%` : DASH}
        meta={
          summary
            ? rate != null
              ? t('dashboard.kpis.last7Days')
              : t('dashboard.kpis.noArrivals')
            : undefined
        }
        bar="var(--violet-500)"
        spark={arrivalSpark}
      />
    </div>
  );
}
