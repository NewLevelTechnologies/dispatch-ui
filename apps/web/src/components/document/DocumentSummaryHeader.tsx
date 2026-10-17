/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the PO detail page). Entity names route through getName(). */
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { formatCurrency } from '@dispatch/utils';
import { useGlossary } from '../../contexts/GlossaryContext';
import { Tag } from '../ui/Pill';

export interface DocumentParty {
  name: string;
  href?: string;
  /** e.g. "Payer" for a billing-only account. */
  kind?: string | null;
  sub?: string | null;
}

export interface DocumentStep {
  label: string;
  date?: string | null;
}

/**
 * Who pays and what's owed lead; where, PO, NTE and membership support.
 * Layout from the Line Editor v2 mock's "Summary" header.
 */
export function DocumentSummaryHeader({
  billTo,
  location,
  workOrder,
  linkBack = (path) => path,
  serviceDate,
  poNumber,
  nte,
  member,
  amountLabel,
  amount,
  amountSub,
  memberSaved,
  steps,
  current,
  ended,
}: {
  billTo: DocumentParty;
  location?: DocumentParty | null;
  /** The work order the document is for; its number links to it. */
  workOrder?: { id: string; number: string | null } | null;
  /** Adds the document as the back-context of its links, so the page they open can return here. */
  linkBack?: (path: string) => string;
  /** Invoices: when the work was done (already formatted). */
  serviceDate?: string | null;
  poNumber?: string | null;
  /** The work order's not-to-exceed; `over` from the server's NTE_EXCEEDED warning. */
  nte?: { amount: number; over: boolean } | null;
  /** Agreement label(s) member benefits came from. */
  member?: string | null;
  amountLabel: string;
  amount: number;
  amountSub?: ReactNode;
  memberSaved?: number;
  steps: DocumentStep[];
  /** Index of the step the document is at. */
  current: number;
  /** A terminal state off the happy path (Declined, Void…) — the steps read inert. */
  ended?: DocumentStep | null;
}) {
  const { getName } = useGlossary();
  const meta: ReactNode[] = [
    workOrder ? (
      <span key="wo" className="flex items-baseline gap-1">
        <span className="text-fg-muted">{getName('work_order')}</span>
        <Link to={linkBack(`/work-orders/${workOrder.id}`)} className="font-mono font-medium text-fg-accent hover:underline">
          {workOrder.number ?? '…'}
        </Link>
      </span>
    ) : null,
    serviceDate ? (
      <span key="service">
        <span className="text-fg-muted">Service</span> <span className="font-medium text-fg-strong">{serviceDate}</span>
      </span>
    ) : null,
    poNumber ? (
      <span key="po" className="flex items-baseline gap-1">
        <span className="text-fg-muted">PO</span>
        <span className="font-mono font-medium text-fg-strong">{poNumber}</span>
      </span>
    ) : null,
    nte ? (
      <span key="nte" className={clsx('tabular-nums', nte.over && 'font-semibold text-warning-fg')}>
        <span className={nte.over ? undefined : 'text-fg-muted'}>NTE</span>{' '}
        <span className={nte.over ? undefined : 'font-medium text-fg-strong'}>{formatCurrency(nte.amount)}</span>
        {nte.over && ' · over'}
      </span>
    ) : null,
    member ? (
      <span key="member">
        <span className="text-fg-muted">Member</span> <span className="font-medium text-fg-strong">{member}</span>
      </span>
    ) : null,
  ].filter(Boolean);

  return (
    <div className="mb-3 grid grid-cols-1 overflow-hidden rounded-[10px] border border-border bg-bg-elev md:grid-cols-[minmax(0,1fr)_minmax(250px,320px)]">
      <div className="flex min-w-0 flex-col gap-3 px-4 py-3.5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Party label="Bill to" party={billTo} linkBack={linkBack} />
          <Party
            label={getName('service_location')}
            party={location ?? { name: '—', sub: `No ${getName('service_location').toLowerCase()} on this document` }}
            linkBack={linkBack}
          />
        </div>
        {meta.length > 0 && (
          <div className="flex min-h-6 flex-wrap items-center gap-2 text-[12px]">
            {meta.map((m, i) => (
              <Fragment key={i}>
                {i > 0 && <span className="text-border-strong">·</span>}
                {m}
              </Fragment>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5 border-t border-border-soft bg-bg-elev-2 px-4 py-3.5 md:border-l md:border-t-0">
        <div>
          <div className="label-tiny mb-0.5">{amountLabel}</div>
          <div className="text-[28px] font-bold leading-tight tracking-[-0.03em] tabular-nums text-fg-strong">
            {formatCurrency(amount)}
          </div>
          {amountSub && <div className="mt-0.5 text-[12px] tabular-nums text-fg-muted">{amountSub}</div>}
          {memberSaved != null && memberSaved > 0 && (
            <div className="mt-0.5 text-[12px] font-semibold tabular-nums text-success-500">
              Includes {formatCurrency(memberSaved)} member savings
            </div>
          )}
        </div>
        <ol className="mt-auto flex gap-1" aria-label="Status history">
          {steps.map((s, i) => {
            const done = !ended && i <= current;
            return (
              <li key={s.label} className={clsx('min-w-0 flex-1', ended && 'opacity-50')}>
                <div
                  className={clsx(
                    'h-[3px] rounded-sm',
                    done ? (i === current ? 'bg-accent-500' : 'bg-fg-muted') : 'bg-border',
                  )}
                />
                <div className={clsx('mt-1 text-[11px]', done ? 'text-fg-strong' : 'text-fg-muted', i === current && !ended ? 'font-semibold' : 'font-medium')}>
                  {s.label}
                </div>
                <div className="text-[10.5px] tabular-nums text-fg-muted">{done && s.date ? s.date : '—'}</div>
              </li>
            );
          })}
          {ended && (
            <li className="min-w-0 flex-1">
              <div className="h-[3px] rounded-sm bg-fg-muted" />
              <div className="mt-1 text-[11px] font-semibold text-fg-strong">{ended.label}</div>
              <div className="text-[10.5px] tabular-nums text-fg-muted">{ended.date ?? '—'}</div>
            </li>
          )}
        </ol>
      </div>
    </div>
  );
}

function Party({ label, party, linkBack }: { label: string; party: DocumentParty; linkBack: (path: string) => string }) {
  return (
    <div className="min-w-0">
      <div className="label-tiny mb-0.5">{label}</div>
      <div className="flex min-h-[22px] flex-wrap items-center gap-1.5">
        {party.href ? (
          <Link to={linkBack(party.href)} className="text-[15px] font-semibold tracking-[-0.01em] text-fg-accent hover:underline">
            {party.name}
          </Link>
        ) : (
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-fg-strong">{party.name}</span>
        )}
        {party.kind && <Tag word>{party.kind}</Tag>}
      </div>
      {party.sub && <div className="mt-0.5 text-[12px] text-fg-muted">{party.sub}</div>}
    </div>
  );
}
