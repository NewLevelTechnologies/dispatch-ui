/* eslint-disable i18next/no-literal-string -- dense operational labels + glyphs stay literal, same convention as ServiceLocationDetailPage. */
// Schedule tab — the surface the recurring-WO generator exists to produce.
// Two honest tiers around the materialization seam:
//   1. Scheduled visits — materialized work orders (workOrderId set), enriched
//      with the real booked date + tech from scheduling-service dispatches.
//   2. Upcoming — obligations not yet generated (workOrderId null), shown as
//      windows grouped by period so the cadence is visible without pretending a
//      job exists that doesn't.
import { useNavigate } from 'react-router-dom';
import { CalendarDaysIcon, ClockIcon } from '@heroicons/react/24/outline';
import { Card } from '../../components/catalyst/card';
import { Pill } from '../../components/ui/Pill';
import {
  DenseTable,
  DenseTHead,
  DenseRow,
  CellStack,
  CellTop,
  CellSub,
} from '../../components/ui/DenseTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatWindow, type LocationMap } from './agreementShared';
import { CardTitle } from './agreementCards';
import { useAgreementSchedule, type ScheduledVisit } from './useAgreementSchedule';

function statusPill(v: ScheduledVisit) {
  if (v.live) return <Pill tone="info" dot live>In progress</Pill>;
  if (v.status === 'COMPLETED') return <Pill tone="success" dot>Completed</Pill>;
  if (v.status === 'MISSED') return <Pill tone="danger" dot>Missed</Pill>;
  if (v.status === 'OVERDUE') return <Pill tone="warning" dot>Behind</Pill>;
  if (v.hasDispatch) return <Pill tone="success" dot>Scheduled</Pill>;
  return <Pill tone="neutral" dot>Needs scheduling</Pill>;
}

export default function AgreementScheduleTab({
  agreementId,
  locationMap,
}: {
  agreementId: string;
  locationMap: LocationMap | undefined;
}) {
  const navigate = useNavigate();
  const { scheduled, upcomingPeriods } = useAgreementSchedule(agreementId, locationMap);

  return (
    <div className="flex flex-col gap-3.5">
      {/* Tier 1 — materialized work orders */}
      <Card
        padding="none"
        title={<CardTitle icon={<CalendarDaysIcon className="size-3.5" />}>Scheduled visits</CardTitle>}
        subtitle={`${scheduled.length} work orders on the board`}
      >
        {scheduled.length === 0 ? (
          <EmptyState compact title="No visits on the board yet" description="Obligations materialize into work orders ~45 days before their window." />
        ) : (
          <DenseTable>
            <DenseTHead>
              <tr>
                <th>Work order</th>
                <th>Location</th>
                <th>Date</th>
                <th>Tech</th>
                <th>Status</th>
              </tr>
            </DenseTHead>
            <tbody>
              {scheduled.map((v) => (
                <DenseRow
                  key={v.obligationId}
                  urgent={v.status === 'OVERDUE'}
                  onClick={() => navigate(`/work-orders/${v.workOrderId}?from=agreement&agreementId=${agreementId}`)}
                >
                  <td>
                    {v.workOrderNumber ? (
                      <span className="id-mono font-semibold text-fg-accent">{v.workOrderNumber}</span>
                    ) : (
                      <span className="text-fg-muted">…</span>
                    )}
                  </td>
                  <td>
                    <CellStack>
                      <CellTop>{v.locName}</CellTop>
                      {v.locSub && <CellSub>{v.locSub}</CellSub>}
                    </CellStack>
                  </td>
                  <td>
                    {v.date ? (
                      <span className="text-fg">
                        {new Date(v.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        <span className="ml-1 text-fg-muted">
                          {new Date(v.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </span>
                    ) : (
                      <span className="text-fg-muted">Not booked</span>
                    )}
                  </td>
                  <td>
                    {v.tech ? (
                      <span className="text-fg">{v.tech}</span>
                    ) : (
                      <span className="text-warning-fg">Unassigned</span>
                    )}
                  </td>
                  <td>{statusPill(v)}</td>
                </DenseRow>
              ))}
            </tbody>
          </DenseTable>
        )}
      </Card>

      {/* Tier 2 — obligations not yet materialized */}
      <Card
        padding="none"
        title={<CardTitle icon={<ClockIcon className="size-3.5" />}>Upcoming — not yet generated</CardTitle>}
        subtitle="Obligations materialize ~45 days before each window"
      >
        <div className="border-b border-border-soft bg-bg-elev-2 px-3.5 py-2 text-[11.5px] text-fg-muted">
          These visits are committed by the agreement but become work orders only as their window
          approaches — so the board isn&rsquo;t flooded with a year of future jobs.
        </div>
        {upcomingPeriods.length === 0 ? (
          <EmptyState compact title="No upcoming obligations" />
        ) : (
          <div>
            {upcomingPeriods.map((p, i) => (
              <div
                key={p.periodKey}
                className={`grid grid-cols-[96px_1fr_auto] items-center gap-3 px-3.5 py-2.5 ${i < upcomingPeriods.length - 1 ? 'border-b border-border-soft' : ''}`}
              >
                <div className="text-[12.5px] font-semibold text-fg-strong">{p.periodKey}</div>
                <div className="text-[12px] text-fg">
                  {p.count} {p.count === 1 ? 'visit' : 'visits'} · {formatWindow(p.windowStart, p.windowEnd)}
                </div>
                <span className="rounded bg-bg-active px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                  Scheduled later
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
