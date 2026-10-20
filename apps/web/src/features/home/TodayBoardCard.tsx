import { useTranslation } from '@dispatch/i18n';
import { titleCaseAddress } from '@dispatch/utils';
import type { DispatchBoard } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { Button } from '../../components/catalyst/button';
import { Link } from '../../components/catalyst/link';
import { Card, CardBody, CardHead, CardTitle } from '../../components/ui/Card';
import { Pill } from '../../components/ui/Pill';
import { Avatar } from '../../components/ui/Avatar';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { DISPATCH_PRESENTATION, presentationFor } from '../../lib/dispatchStatus';
import { formatHour, zonedHour } from '../../lib/boardTime';
import { BOARD_STATUSES, statusCounts, techRows, type TechRow } from './opsSelectors';

const MAX_ROWS = 8;

interface Props {
  board: DispatchBoard | undefined;
  isLoading: boolean;
  error: boolean;
  onRetry: () => void;
}

export function TodayBoardCard({ board, isLoading, error, onRetry }: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const techs = getName('technician', true);

  let body;
  if (isLoading) {
    body = <LoadingState />;
  } else if (error || !board) {
    body = (
      <ErrorState
        title={t('dashboard.board.error')}
        action={
          <Button outline size="xs" onClick={onRetry}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  } else {
    const counts = statusCounts(board.dispatches);
    const rows = techRows(board.techs, board.dispatches);
    const shown = rows.slice(0, MAX_ROWS);
    const totalBlocks = board.dispatches.length;
    body = (
      <>
        <div className="p-3.5">
          <div className={`home-statusbar${totalBlocks === 0 ? ' is-empty' : ''}`} aria-hidden>
            {BOARD_STATUSES.filter((s) => counts[s] > 0).map((s) => (
              <span key={s} style={{ flex: counts[s], background: DISPATCH_PRESENTATION[s].accent }} />
            ))}
          </div>
          <div className="home-legend">
            {BOARD_STATUSES.map((s) => (
              <span key={s} className="home-legend-item">
                <span className="swatch" style={{ background: DISPATCH_PRESENTATION[s].accent }} />
                {t(`workOrders.dispatches.status.${s}`)}
                <span className="n">{counts[s]}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="home-att-group label-tiny">{t('dashboard.board.whosWhere')}</div>
        {rows.length === 0 ? (
          <div className="px-3.5 py-3 home-att-meta">{t('dashboard.board.empty', { entities: techs })}</div>
        ) : (
          shown.map((row) => <TechLine key={row.tech.id} row={row} timeZone={board.timeZone} />)
        )}
        {rows.length > MAX_ROWS && (
          <div className="home-card-foot">
            <span className="home-att-meta">
              {t('dashboard.board.showing', { shown: shown.length, total: rows.length })}
            </span>
            <Link href="/dispatch" className="card-action">
              {t('dashboard.board.all', { entities: techs })} →
            </Link>
          </div>
        )}
      </>
    );
  }

  return (
    <Card>
      <CardHead>
        <CardTitle>{t('dashboard.board.title')}</CardTitle>
        <Button plain size="xxs" href="/dispatch">
          {t('dashboard.board.openBoard')}
        </Button>
      </CardHead>
      <CardBody flush>{body}</CardBody>
    </Card>
  );
}

function TechLine({ row, timeZone }: { row: TechRow; timeZone: string }) {
  const { t } = useTranslation();
  const time = (iso: string | null) => {
    const hour = iso ? zonedHour(iso, timeZone) : null;
    return hour != null ? formatHour(hour) : null;
  };

  const stop = row.stop;
  const place = stop ? stop.serviceLocationName || stop.customerName || stop.workOrderNumber : null;
  const city = stop?.serviceLocationCity ? titleCaseAddress(stop.serviceLocationCity) : null;
  const where = [place, city].filter(Boolean).join(' · ');

  const at = time(row.at);
  const when =
    at == null ? null : row.mode === 'onSite' ? t('dashboard.board.since', { time: at }) : t('dashboard.board.next', { time: at });

  const pct = row.total > 0 ? Math.min(100, Math.round((row.done / row.total) * 100)) : 0;

  return (
    <div className="home-tech-row" data-testid={`tech-${row.tech.id}`}>
      <Avatar name={row.tech.name} size="sm" />
      <div className="min-w-0">
        <div className="home-tech-name">{row.tech.name}</div>
        {where && <div className="home-tech-stop">{where}</div>}
      </div>
      <div className="flex min-w-0 flex-col items-start gap-1">
        {stop ? (
          <Pill
            tone={DISPATCH_PRESENTATION[stop.status].tone}
            dot
            live={presentationFor(stop.status, { isToday: true }).live}
          >
            {t(`workOrders.dispatches.status.${stop.status}`)}
          </Pill>
        ) : row.mode === 'done' ? (
          <Pill tone="success" dot>
            {t('dashboard.board.done')}
          </Pill>
        ) : null}
        {when && <span className="home-tech-when">{when}</span>}
      </div>
      <div className="home-tech-prog">
        <span>
          {row.done} / {row.total}
        </span>
        <div className="track">
          <div className="fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
