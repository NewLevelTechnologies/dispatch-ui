// The callback link on the work order itself: the header chip, the Overview
// Callback card (Change reuses the intake prompt; Unlink is instant with
// Undo), and — on the ORIGINAL job — the list of callbacks that point to it,
// so whoever opens it sees the work didn't hold.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { formatExactTimestamp } from '@dispatch/utils';
import { LinkIcon } from '@heroicons/react/16/solid';
import { workOrderApi, type CallbackBackRef, type CallbackOf, type WorkOrder } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { showError, showUndo, extractApiError } from '../../lib/toast';
import { Button } from '../../components/catalyst/button';
import { Card } from '../../components/catalyst/card';
import { CardTitle } from '../../components/customer-detail/shared';
import { Pill } from '../../components/ui/Pill';
import { CallbackPrompt, ChargeLine } from './CallbackPrompt';
import { daysBetween, fromCallbackOf, shortDate, useCallbackT, type CallbackValue } from './callbackModel';

export function CallbackChip({ callbackOf }: { callbackOf: Pick<CallbackOf, 'id' | 'workOrderNumber'> }) {
  const tc = useCallbackT();
  return (
    <Link to={`/work-orders/${callbackOf.id}`} className="cb-chip">
      <LinkIcon className="size-[11px]" />
      {tc('callbacks.chipLabel', { number: callbackOf.workOrderNumber })}
    </Link>
  );
}

/** One PATCH for link, change and unlink; activity records each on the backend. */
function useSetCallback(workOrderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (originalId: string | null) =>
      workOrderApi.update(workOrderId, { callbackOfWorkOrderId: originalId }),
    // Wait for the refetch, so a card that only exists while linked doesn't
    // blink out between the PATCH and the fresh work order.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['work-orders'] }),
        queryClient.invalidateQueries({ queryKey: ['work-order-activity', workOrderId] }),
      ]),
  });
}

/**
 * Shown only on a linked work order, or while linking one from the header
 * menu — not on every Overview. `editing` is owned by the page so the menu
 * can open it.
 */
export function WorkOrderCallbackCard({
  workOrder,
  typeName,
  isCallbackType,
  frozen,
  editing,
  onEditingChange,
}: {
  workOrder: WorkOrder;
  typeName: string | null;
  isCallbackType: boolean;
  frozen: boolean;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
}) {
  const { t } = useTranslation();
  const tc = useCallbackT();
  const { getName } = useGlossary();
  const setCallback = useSetCallback(workOrder.id);
  const linked = workOrder.callbackOf ?? null;
  const locationId = workOrder.serviceLocation?.id ?? workOrder.serviceLocationId;
  const customerId = workOrder.customer?.id ?? workOrder.customerId;
  const equipmentIds = [...new Set(workOrder.workItems.map((w) => w.equipmentId).filter((id): id is string => !!id))];

  const fail = (err: unknown) => showError(tc('callbacks.linkFailed'), extractApiError(err) ?? undefined);

  const unlink = () => {
    if (!linked) return;
    const previous = linked.id;
    setCallback.mutate(null, {
      onSuccess: () =>
        showUndo(tc('callbacks.unlinked', { number: linked.workOrderNumber }), t('common.undo'), () =>
          setCallback.mutate(previous, { onError: fail }),
        ),
      onError: fail,
    });
  };

  const onPromptChange = (value: CallbackValue) => {
    if (value.state === 'linked') {
      if (value.job.id === linked?.id) onEditingChange(false);
      else setCallback.mutate(value.job.id, { onSuccess: () => onEditingChange(false), onError: fail });
    } else if (value.state === 'dismissed') {
      if (linked) unlink();
      onEditingChange(false);
    }
    // 'unset' (Change / Unlink inside the prompt) keeps the prompt open.
  };

  return (
    <Card
      title={<CardTitle icon={<LinkIcon className="size-3.5" />}>{tc('callbacks.label')}</CardTitle>}
      action={
        !editing &&
        !frozen && (
          <Button plain size="xxs" onClick={() => onEditingChange(true)}>
            {linked ? tc('callbacks.change') : tc('callbacks.link')}
          </Button>
        )
      }
    >
      {editing && locationId && customerId ? (
        <CallbackPrompt
          hideLabel
          serviceLocationId={locationId}
          customerId={customerId}
          equipmentIds={equipmentIds}
          isCallbackType={isCallbackType}
          excludeWorkOrderId={workOrder.id}
          createdBefore={workOrder.createdAt}
          value={{ state: 'unset' }}
          onChange={onPromptChange}
          initialMode="open"
        />
      ) : linked ? (
        <div className="flex flex-col gap-2" data-testid="callback-card-linked">
          <div>
            <div className="cb-row-top">
              <Link to={`/work-orders/${linked.id}`} className="cb-wo">
                {linked.workOrderNumber}
              </Link>
              {linked.summary && <span className="cb-row-title">{linked.summary}</span>}
            </div>
            {linked.completedDate && (
              <div className="cb-meta">{tc('callbacks.completed', { date: shortDate(linked.completedDate) })}</div>
            )}
          </div>
          <ChargeLine
            short
            techs={fromCallbackOf(linked).chargedTechnicians.map((x) => x.name ?? tc('callbacks.formerUser'))}
          />
          {linked.linkedAt && (
            <div className="cb-meta" title={formatExactTimestamp(linked.linkedAt)}>
              {tc('callbacks.linkedBy', {
                name: linked.linkedByName ?? tc('callbacks.formerUser'),
                time: shortDate(linked.linkedAt),
              })}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-border-soft pt-2">
            <span className="cb-meta mt-0">
              {typeName
                ? tc('callbacks.typeStays', { type: typeName })
                : tc('callbacks.typeIndependent', { entity: getName('work_order') })}
            </span>
            {!frozen && (
              <Button plain size="xxs" onClick={unlink} disabled={setCallback.isPending}>
                {tc('callbacks.unlink')}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="cb-quiet">{tc('callbacks.notACallback')}</div>
      )}
    </Card>
  );
}

export function WorkOrderCallbacksBackCard({
  workOrderId,
  callbacks,
  completedDate,
  statusPill,
}: {
  /** The original job these callbacks point to. */
  workOrderId: string;
  callbacks: CallbackBackRef[];
  /** This job's completion, for "N days after completion". */
  completedDate: string | null | undefined;
  statusPill: (c: CallbackBackRef) => ReactNode;
}) {
  const tc = useCallbackT();
  // Every callback of this job charges the same techs: the ones who arrived here.
  const charge = useQuery({
    queryKey: ['callback-charge', workOrderId],
    queryFn: () => workOrderApi.getCallbackCharge(workOrderId),
    enabled: callbacks.length > 0,
  });
  const chargedTo = (charge.data?.chargedTechnicians ?? []).map((x) => x.name ?? tc('callbacks.formerUser'));
  if (callbacks.length === 0) return null;
  return (
    <Card
      title={
        <CardTitle icon={<LinkIcon className="size-3.5" />}>
          {tc('callbacks.backTitle')}
          <Pill tone="neutral">{callbacks.length}</Pill>
        </CardTitle>
      }
      padding="none"
    >
      {callbacks.map((c) => (
        <div key={c.id} className="cb-row" data-testid="callback-backref">
          <div className="min-w-0">
            <div className="cb-row-top">
              <Link to={`/work-orders/${c.id}`} className="cb-wo">
                {c.workOrderNumber}
              </Link>
              {c.summary && <span className="cb-row-title">{c.summary}</span>}
              {statusPill(c)}
            </div>
            <div className="cb-meta">
              {[
                tc('callbacks.openedBy', {
                  date: shortDate(c.createdAt),
                  name: c.createdByName ?? tc('callbacks.formerUser'),
                }),
                completedDate && tc('callbacks.daysAfter', { count: daysBetween(completedDate, c.createdAt) }),
                chargedTo.length > 0 && tc('callbacks.countedFor', { names: chargedTo.join(', ') }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
        </div>
      ))}
    </Card>
  );
}
