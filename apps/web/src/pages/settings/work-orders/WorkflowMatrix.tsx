import { Fragment, useEffect, useMemo } from 'react';
import { useTranslation } from '@dispatch/i18n';
import { CheckIcon } from '@heroicons/react/20/solid';
import type { Workflow, WorkflowTransition, WorkItemStatus } from '../../../api/setup';
import { roleAccent } from '../../../utils/roleColor';

const CELL_PX = 36;
const COL_HEAD_PX = 110;
const ROW_HEAD_PX = 156;

interface WorkflowMatrixProps {
  workflow: Workflow;
  statuses: WorkItemStatus[];
  onCellClick: (
    from: WorkItemStatus,
    to: WorkItemStatus,
    existing: WorkflowTransition | null,
  ) => void;
}

export function WorkflowMatrix({ workflow, statuses, onCellClick }: WorkflowMatrixProps) {
  const { t } = useTranslation();

  const txByKey = useMemo(() => {
    const map = new Map<string, WorkflowTransition>();
    for (const tx of workflow.transitions) {
      map.set(`${tx.fromStatusId}:${tx.toStatusId}`, tx);
    }
    return map;
  }, [workflow.transitions]);

  // Loud signal at 20+ statuses that the matrix is straining; the v1 spec
  // accepts this as future work, so leave the UI alone.
  useEffect(() => {
    if (statuses.length > 20 && import.meta.env.DEV) {
      console.warn(
        `[WorkflowMatrix] ${statuses.length} statuses — matrix becomes dense beyond ~20. Consider an alternate editor.`,
      );
    }
  }, [statuses.length]);

  const approvalCount = workflow.transitions.filter((tx) => tx.requiresApproval).length;

  return (
    <div className="rounded-lg border border-border bg-bg-elev p-3.5 overflow-auto">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `${ROW_HEAD_PX}px repeat(${statuses.length}, ${CELL_PX}px)`,
          gridTemplateRows: `${COL_HEAD_PX}px repeat(${statuses.length}, ${CELL_PX}px)`,
        }}
      >
        {/* Corner — sticky-left below lg so it anchors with the row labels */}
        <div className="border-r border-b border-border bg-bg-elev-2 max-lg:sticky max-lg:left-0 max-lg:z-20" />

        {/* Column headers (rotated vertical) */}
        {statuses.map((s) => (
          <div
            key={`ch-${s.id}`}
            className="border-r border-b border-border bg-bg-elev-2 px-1 py-2 flex items-center gap-1.5 text-[10px] font-semibold text-fg-muted whitespace-nowrap"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            title={s.name}
          >
            <span
              aria-hidden
              className="size-1.5 rounded-full shrink-0"
              style={{ background: roleAccent(s.accentId, s.name) }}
            />
            {s.name}
          </div>
        ))}

        {/* Body rows */}
        {statuses.map((from) => (
          <Fragment key={`row-${from.id}`}>
            <div className="border-r border-border border-b border-border-soft bg-bg-elev-2 px-2.5 flex items-center gap-2 text-[11.5px] font-semibold text-fg-strong min-h-9 max-lg:sticky max-lg:left-0 max-lg:z-10">
              <span
                aria-hidden
                className="size-2 rounded-full shrink-0"
                style={{ background: roleAccent(from.accentId, from.name) }}
              />
              <span className="truncate">{from.name}</span>
            </div>

            {statuses.map((to) => {
              const cellKey = `c-${from.id}-${to.id}`;
              if (from.id === to.id) {
                return (
                  <div
                    key={cellKey}
                    aria-hidden
                    className="border-r border-b border-border-soft"
                    style={{
                      background:
                        'repeating-linear-gradient(-45deg, var(--color-bg-sunken) 0 4px, transparent 4px 8px)',
                      cursor: 'default',
                    }}
                  />
                );
              }
              const tx = txByKey.get(`${from.id}:${to.id}`) ?? null;
              const allowed = Boolean(tx);
              const needsApproval = Boolean(tx?.requiresApproval);
              const stateKey = allowed
                ? needsApproval
                  ? 'allowedWithApproval'
                  : 'allowed'
                : 'notAllowed';
              return (
                <button
                  type="button"
                  key={cellKey}
                  onClick={() => onCellClick(from, to, tx)}
                  className="relative border-r border-b border-border-soft bg-bg-elev hover:bg-bg-hover grid place-items-center cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 focus-visible:ring-inset"
                  aria-label={t('settings.workflows.cellAria', {
                    from: from.name,
                    to: to.name,
                    state: t(`settings.workflows.cellState.${stateKey}`),
                  })}
                >
                  {allowed && (
                    <span
                      className="size-4 rounded grid place-items-center text-white"
                      style={{
                        background: needsApproval
                          ? 'var(--color-warning-500)'
                          : 'var(--color-accent-500)',
                      }}
                    >
                      <CheckIcon className="size-3" />
                    </span>
                  )}
                  {needsApproval && (
                    <span
                      aria-hidden
                      className="absolute top-[3px] right-[3px] size-2.5 rounded-full ring-[1.5px] ring-bg-elev"
                      style={{ background: 'var(--color-warning-500)' }}
                    />
                  )}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 text-[11px] text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-3.5 rounded-sm"
            style={{ background: 'var(--color-accent-500)' }}
          />
          {t('settings.workflows.legend.allowed')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-3.5 rounded-sm"
            style={{ background: 'var(--color-warning-500)' }}
          />
          {t('settings.workflows.legend.allowedWithApproval')}
        </span>
        <span className="ml-auto text-fg-dim tabular-nums">
          {t('settings.workflows.transitionSummary', {
            count: workflow.transitions.length,
            approvals: approvalCount,
          })}
        </span>
      </div>
    </div>
  );
}
