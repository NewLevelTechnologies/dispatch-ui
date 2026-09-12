// ─────────────────────────────────────────────────────────────────────
// The JOB behind the visit — the half a dispatch-only drawer cannot answer.
//
// A dispatch is one visit; the work order is the job. "What is actually
// happening with this job" is what a dispatcher is asked while a customer is
// on the phone, and the visit record alone cannot say: it doesn't know the
// job is blocked, or that there are two more visits booked, or that the last
// tech left a gate code.
//
// Rendered ONLY when the caller passes a way back to the work order — i.e.
// when the drawer was reached from somewhere other than the job itself. On
// the work order's own page this whole section would be a mirror.
//
// The mock assumed one read (`GET /work-orders/{id}/summary`); that endpoint
// does not exist, so this composes the reads that do, each on the same query
// key its other consumers use so the caches are shared rather than doubled.
// ─────────────────────────────────────────────────────────────────────
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { formatCurrency, formatPhone, formatTimestamp } from '@dispatch/utils';
import {
  dispatchesApi,
  divisionsApi,
  financialSummaryApi,
  notesApi,
  userApi,
  workOrderApi,
  type ProgressCategory,
} from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { Pill } from '../ui/Pill';

/** Progress → tone. BLOCKED is the one that has to read as a warning: it is
 *  the state a dispatcher has to do something about. */
const PROGRESS_TONE: Record<ProgressCategory, 'neutral' | 'info' | 'warning' | 'success'> = {
  NOT_STARTED: 'neutral',
  AWAITING_SCHEDULE: 'info',
  IN_PROGRESS: 'info',
  BLOCKED: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
};

const PROGRESS_KEY: Record<ProgressCategory, string> = {
  NOT_STARTED: 'notStarted',
  AWAITING_SCHEDULE: 'awaitingSchedule',
  IN_PROGRESS: 'inProgress',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

const VISIT_DOT: Record<string, string> = {
  COMPLETED: 'var(--success-500)',
  SCHEDULED: 'var(--info-500)',
  EN_ROUTE: 'var(--violet-500)',
  IN_PROGRESS: 'var(--violet-500)',
  NO_SHOW: 'var(--warning-500)',
  CANCELLED: 'var(--border-strong)',
};

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10.5px] text-fg-muted">{label}</span>
      <span className="text-[12px] text-fg-strong">{children}</span>
    </div>
  );
}

export default function DispatchJobSection({
  workOrderId,
  workOrderNumber,
  href,
  serviceLocationId,
  currentDispatchId,
  currentWindowStart,
}: {
  workOrderId: string;
  workOrderNumber: string | null;
  href: string;
  /** Lets the site-history count skip a round-trip through the work order. */
  serviceLocationId?: string | null;
  currentDispatchId: string;
  /** This visit's arrival window start. The site count runs strictly before
   *  it, so "prior" never quietly includes this visit or a later one. */
  currentWindowStart: string;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();

  // Same key the composer and the work order page use — opening the drawer
  // usually hits a warm cache.
  const { data: workOrder } = useQuery({
    queryKey: ['work-orders', workOrderId],
    queryFn: () => workOrderApi.getById(workOrderId),
  });

  // Zeroes come back for a work order with no invoices, so a balance chip is
  // strictly "there is money outstanding", never "we failed to load".
  const { data: financial } = useQuery({
    queryKey: ['financialSummary', workOrderId],
    queryFn: () => financialSummaryApi.getByWorkOrder(workOrderId),
  });

  const { data: visits = [] } = useQuery({
    queryKey: ['dispatches', { workOrderId }],
    queryFn: () => dispatchesApi.listForWorkOrder(workOrderId),
  });

  const { data: notes = [] } = useQuery({
    queryKey: ['work-order-notes', workOrderId],
    queryFn: () => notesApi.list(workOrderId),
  });

  // The drawer above already holds this list under the same key; naming the
  // tech on a sibling visit is what makes "a different tech is going back"
  // visible, which is the whole reason to list them.
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => userApi.getAll() });

  // Ids only on the wire; the board holds this same list under this key.
  const { data: divisions = [] } = useQuery({
    queryKey: ['work-order-config', 'divisions'],
    queryFn: () => divisionsApi.getAll(),
  });

  // "Have we been here before?" — the callback question. Server-ordered and
  // paged, so size:1 buys the count without the rows.
  const { data: siteHistory } = useQuery({
    queryKey: ['dispatch-site-history', serviceLocationId, currentWindowStart],
    queryFn: () =>
      dispatchesApi.listForServiceLocation(serviceLocationId!, {
        from: new Date(new Date(currentWindowStart).getTime() - YEAR_MS).toISOString(),
        to: currentWindowStart,
        size: 1,
      }),
    enabled: !!serviceLocationId,
  });

  const summary =
    workOrder?.summary || workOrder?.workItems?.[0]?.description || workOrderNumber || '';
  const customerName = workOrder?.customer?.name;
  const divisionName = divisions.find((d) => d.id === workOrder?.divisionId)?.name;
  const subtitle = [customerName, divisionName].filter(Boolean).join(' · ');

  // The site contact is who is actually there; the customer is who is billed.
  // Prefer the one a dispatcher would call about this visit.
  const phone =
    workOrder?.serviceLocation?.siteContactPhone || workOrder?.customer?.phone || null;

  const balance = financial ? parseFloat(financial.balance) : 0;
  const openVisits = visits.filter((v) => v.status !== 'CANCELLED');
  // Counted at the SITE, not on this job: "have we been here before" is the
  // callback question, and an earlier visit on this same job is still one.
  const priorVisits = siteHistory?.totalElements ?? 0;

  const note = notes[0];

  return (
    <>
      {/* A tinted band rather than another plain section heading: this is the
          seam where the drawer stops describing the visit and starts
          describing the job. */}
      <div className="db-jobhead">
        <span className="label-tiny text-fg">
          {t('dispatchBoard.job.heading', { entity: getName('work_order') })}
        </span>
        <span className="grow" />
        <a className="db-wolink" href={href}>
          {workOrderNumber
            ? `${t('dispatchBoard.job.open', { number: workOrderNumber })} →`
            : `${t('dispatchBoard.menu.openWorkOrder', { entity: getName('work_order') })} →`}
        </a>
      </div>

      <section className="border-b border-border-soft px-4 py-3">
        {summary && (
          <div className="mb-2">
            <div className="text-[13px] font-semibold leading-snug text-fg-strong">{summary}</div>
            {subtitle && <div className="mt-0.5 text-[11.5px] text-fg-muted">{subtitle}</div>}
          </div>
        )}

        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {workOrder && (
            <Pill tone={PROGRESS_TONE[workOrder.progressCategory]} dot>
              {t(`workOrders.progress.${PROGRESS_KEY[workOrder.progressCategory]}`)}
            </Pill>
          )}
          {/* Balance is a real outstanding amount, not an aging bucket — the
              summary read carries no aging, so this doesn't claim "past due". */}
          {balance > 0 && (
            <Pill tone="danger">
              {t('dispatchBoard.job.balance', { amount: formatCurrency(balance) })}
            </Pill>
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {workOrder?.createdAt && (
            <Field label={t('dispatchBoard.job.opened')}>{formatTimestamp(workOrder.createdAt)}</Field>
          )}
          {phone && (
            <Field label={t('dispatchBoard.job.contact')}>
              <a className="font-mono text-fg-accent no-underline hover:underline" href={`tel:${phone}`}>
                {formatPhone(phone)}
              </a>
            </Field>
          )}
          {priorVisits > 0 && (
            <Field label={t('dispatchBoard.job.priorVisits')}>
              {t('dispatchBoard.job.priorVisitsValue', { count: priorVisits })}
            </Field>
          )}
        </div>
      </section>

      {/* Only worth a list when there is more than this visit — otherwise it
          is a one-row list of the thing already on screen. */}
      {openVisits.length > 1 && (
        <section className="border-b border-border-soft px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5">
            <span className="label-tiny text-fg">
              {t('dispatchBoard.job.allVisits', { entity: getName('dispatch', true) })}
            </span>
            <span className="label-tiny text-fg-muted">{openVisits.length}</span>
          </div>
          {openVisits.map((visit, i) => {
            const current = visit.id === currentDispatchId;
            const user = users.find((u) => u.id === visit.assignedUserId);
            const techName = user ? `${user.firstName} ${user.lastName}`.trim() : null;
            return (
              // Read-only: the sibling visit is usually on another day, so
              // "go there" means the work order, which the band above links.
              <div key={visit.id} className={`db-visit${current ? ' current' : ''}`}>
                <span
                  className="db-visit-dot"
                  style={{ background: VISIT_DOT[visit.status] ?? 'var(--border-strong)' }}
                />
                <span className="flex min-w-0 grow flex-col">
                  <span className="truncate text-[11.5px] text-fg-strong">
                    {visit.label || `${getName('dispatch')} ${i + 1}`}
                  </span>
                  <span className="truncate text-[10.5px] text-fg-muted">
                    {[techName, current ? t('dispatchBoard.job.thisVisit') : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[10.5px] text-fg-muted">
                  {formatTimestamp(visit.arrivalWindowStart)}
                </span>
              </div>
            );
          })}
        </section>
      )}

      {/* One note, not the log: the drawer already has the visit's own notes,
          and this is the "what does everyone need to know about this job"
          line — pinned first, which is the order the server returns. */}
      {note && (
        <section className="px-4 py-3">
          <div className="mb-1.5">
            <span className="label-tiny text-fg">
              {t('dispatchBoard.job.note', { entity: getName('work_order') })}
            </span>
          </div>
          <p className="text-[12px] leading-relaxed text-fg">{note.body}</p>
          {notes.length > 1 && (
            <a className="db-wolink mt-1.5 inline-block" href={href}>
              {`${t('dispatchBoard.job.moreNotes', { count: notes.length - 1 })} →`}
            </a>
          )}
        </section>
      )}
    </>
  );
}
