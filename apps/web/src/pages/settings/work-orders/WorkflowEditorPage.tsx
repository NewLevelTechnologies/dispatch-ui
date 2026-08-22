import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { ChevronLeftIcon } from '@heroicons/react/16/solid';
import {
  workflowsApi,
  workItemStatusesApi,
  workflowConfigApi,
  type WorkflowTransition,
  type WorkItemStatus,
} from '../../../api/setup';
import { useHasCapability } from '../../../hooks/useCurrentUser';
import { Card, CardBody } from '../../../components/ui/Card';
import { Heading } from '../../../components/catalyst/heading';
import { Text } from '../../../components/catalyst/text';
import { Pill } from '../../../components/ui/Pill';
import { Button } from '../../../components/catalyst/button';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { roleAccent } from '../../../utils/roleColor';
import { extractApiError, showError, showSuccess } from '../../../lib/toast';
import { WorkflowMatrix } from './WorkflowMatrix';
import TransitionEditPanel from './TransitionEditPanel';

interface CellTarget {
  from: WorkItemStatus;
  to: WorkItemStatus;
  existing: WorkflowTransition | null;
}

export default function WorkflowEditorPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const canEdit = useHasCapability('EDIT_SETTINGS');

  const [cellTarget, setCellTarget] = useState<CellTarget | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const workflowQuery = useQuery({
    queryKey: ['workflow', id],
    queryFn: () => workflowsApi.getById(id!),
    enabled: Boolean(id),
  });

  const statusesQuery = useQuery({
    queryKey: ['work-item-statuses'],
    queryFn: () => workItemStatusesApi.getAll(),
  });

  const configQuery = useQuery({
    queryKey: ['workflow-config'],
    queryFn: () => workflowConfigApi.get(),
  });

  const resetMutation = useMutation({
    mutationFn: () => workflowsApi.resetToDefault(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', id] });
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      showSuccess(t('settings.workflows.resetSuccessGeneric'));
      setResetConfirmOpen(false);
    },
    onError: (err) => {
      showError(t('settings.workflows.resetError'), extractApiError(err));
    },
  });

  const workflow = workflowQuery.data;
  // Show statuses that are active OR referenced by an existing transition.
  // Inactive statuses still appear if a tenant deactivated one mid-workflow
  // so the cell is visible (and editable) instead of orphaning rows.
  const statuses: WorkItemStatus[] = useMemo(() => {
    const all = statusesQuery.data ?? [];
    const referenced = new Set<string>();
    for (const tx of workflow?.transitions ?? []) {
      referenced.add(tx.fromStatusId);
      referenced.add(tx.toStatusId);
    }
    const filtered = all.filter((s) => s.isActive || referenced.has(s.id));
    return [...filtered].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
  }, [statusesQuery.data, workflow?.transitions]);

  if (!id) return null;

  const isLoading = workflowQuery.isLoading || statusesQuery.isLoading;
  const error = workflowQuery.error || statusesQuery.error;

  const accent = workflow
    ? roleAccent(workflow.workOrderType.accentId, workflow.workOrderType.name)
    : 'var(--color-fg-dim)';

  const handleCellClick = (
    from: WorkItemStatus,
    to: WorkItemStatus,
    existing: WorkflowTransition | null,
  ) => {
    if (!canEdit && !existing) return;
    setCellTarget({ from, to, existing });
  };

  const closePanel = () => setCellTarget(null);

  return (
    <>
      <Link
        to="/settings/work-orders/workflows"
        className="mb-2.5 inline-flex items-center gap-1 text-[11.5px] text-fg-muted hover:text-fg-strong"
      >
        <ChevronLeftIcon className="size-3" />
        {t('settings.workflows.backToList')}
      </Link>

      {workflow && (
        <div className="mb-4 flex items-start justify-between gap-4 max-sm:flex-col max-sm:gap-3">
          <div className="min-w-0">
            <Heading level={1} size="page-sm" className="m-0 flex items-center gap-2.5">
              <span
                aria-hidden
                className="size-3.5 rounded-full"
                style={{ background: accent }}
              />
              {workflow.workOrderType.name}
              {workflow.isSeeded && (
                <Pill tone="neutral" inline>
                  {t('common.builtIn')}
                </Pill>
              )}
            </Heading>
            <Text size="sm" tone="muted" className="mt-1 max-w-[640px]">
              {t('settings.workflows.editor.subtitle')}
            </Text>
          </div>
          {canEdit && workflow.isSeeded && (
            <Button outline size="xs" onClick={() => setResetConfirmOpen(true)}>
              {t('settings.workflows.resetToDefault')}
            </Button>
          )}
        </div>
      )}

      {isLoading ? (
        <Card>
          <CardBody>
            <LoadingState />
          </CardBody>
        </Card>
      ) : error || !workflow ? (
        <Card>
          <CardBody>
            <ErrorState
              title={t('settings.workflows.couldNotLoad')}
              description={extractApiError(error) ?? (error as Error | null)?.message}
              action={
                <Button outline onClick={() => workflowQuery.refetch()}>
                  {t('common.actions.tryAgain')}
                </Button>
              }
            />
          </CardBody>
        </Card>
      ) : statuses.length === 0 ? (
        <Card>
          <CardBody>
            <Text tone="muted">{t('settings.workflows.editor.noStatuses')}</Text>
          </CardBody>
        </Card>
      ) : (
        <WorkflowMatrix
          workflow={workflow}
          statuses={statuses}
          onCellClick={handleCellClick}
        />
      )}

      {/* Slide-over for editing the focused cell */}
      <TransitionEditPanel
        open={cellTarget !== null}
        workflowId={id}
        from={cellTarget?.from ?? null}
        to={cellTarget?.to ?? null}
        existing={cellTarget?.existing ?? null}
        tenantDefaultExpiryHours={configQuery.data?.defaultApprovalExpiryHours ?? 72}
        onClose={closePanel}
        canEdit={canEdit}
      />

      {workflow && (
        <ConfirmDialog
          isOpen={resetConfirmOpen}
          onClose={() => setResetConfirmOpen(false)}
          onConfirm={() => resetMutation.mutate()}
          title={t('settings.workflows.resetConfirm.title', {
            name: workflow.workOrderType.name,
          })}
          message={t('settings.workflows.resetConfirm.body')}
          confirmLabel={
            resetMutation.isPending
              ? t('common.saving')
              : t('settings.workflows.resetToDefault')
          }
          isPending={resetMutation.isPending}
        />
      )}
    </>
  );
}
