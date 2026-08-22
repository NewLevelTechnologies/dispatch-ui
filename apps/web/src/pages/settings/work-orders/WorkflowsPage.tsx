import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  AdjustmentsHorizontalIcon,
  EllipsisVerticalIcon,
  LockClosedIcon,
  ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline';
import {
  workflowsApi,
  workflowConfigApi,
  type EnforcementMode,
  type WorkflowSummary,
} from '../../../api/setup';
import { useHasCapability } from '../../../hooks/useCurrentUser';
import { PageHead } from '../../../components/ui/PageHead';
import { Card, CardBody } from '../../../components/ui/Card';
import { Pill } from '../../../components/ui/Pill';
import { Button } from '../../../components/catalyst/button';
import { Text } from '../../../components/catalyst/text';
import { ToggleGroup, ToggleGroupOption } from '../../../components/ui/ToggleGroup';
import {
  Dropdown,
  DropdownButton,
  DropdownDescription,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '../../../components/catalyst/dropdown';
import IconButton from '../../../components/IconButton';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { LoadingState } from '../../../components/ui/LoadingState';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { showError, showSuccess, extractApiError } from '../../../lib/toast';
import { roleAccent } from '../../../utils/roleColor';

const WORKFLOWS_KEY = ['workflows'] as const;
const CONFIG_KEY = ['workflow-config'] as const;

interface WorkflowRowProps {
  workflow: WorkflowSummary;
  canEdit: boolean;
  onOpen: () => void;
  onReset: () => void;
}

function WorkflowRow({ workflow, canEdit, onOpen, onReset }: WorkflowRowProps) {
  const { t } = useTranslation();
  const accent = roleAccent(workflow.workOrderType.accentId, workflow.workOrderType.name);
  return (
    <div
      onClick={onOpen}
      className="grid grid-cols-[12px_1fr_auto_auto_26px] items-center gap-4 px-4 py-3.5 border-b border-border-soft last:border-b-0 cursor-pointer hover:bg-bg-hover max-sm:grid-cols-[12px_1fr_26px] max-sm:gap-x-2 max-sm:gap-y-1"
    >
      <span
        className="size-2.5 rounded-full max-sm:col-start-1 max-sm:row-start-1"
        style={{ background: accent }}
      />
      <div className="min-w-0 max-sm:col-start-2 max-sm:row-start-1">
        <div className="flex items-center gap-2">
          <Text size="sm" tone="strong" as="span" className="font-semibold text-[14px]">
            {workflow.workOrderType.name}
          </Text>
          {workflow.isSeeded && (
            <Pill tone="neutral" inline>{t('common.builtIn')}</Pill>
          )}
        </div>
      </div>
      {/* Metadata: `contents` keeps the count + gate as direct grid items on
          desktop (pixel-stable); below sm they stack onto their own row. */}
      <div className="sm:contents max-sm:col-start-2 max-sm:row-start-2 max-sm:flex max-sm:items-center max-sm:gap-2">
        <Text size="xs" tone="muted" as="span" className="tabular-nums">
          {t('settings.workflows.row.transitionCount', { count: workflow.transitionCount })}
        </Text>
        {workflow.approvalGateCount > 0 ? (
          <Pill tone="warning" className="text-[10.5px]">
            <LockClosedIcon className="size-3 mr-0.5" />
            {t('settings.workflows.row.approvalCount', { count: workflow.approvalGateCount })}
          </Pill>
        ) : (
          <span />
        )}
      </div>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-sm:col-start-3 max-sm:row-start-1"
      >
        <Dropdown>
          <DropdownButton as={IconButton} aria-label={t('common.moreOptions')}>
            <EllipsisVerticalIcon className="size-4" />
          </DropdownButton>
          <DropdownMenu anchor="bottom end">
            <DropdownItem onClick={onOpen}>
              <DropdownLabel>{t('common.edit')}</DropdownLabel>
            </DropdownItem>
            <DropdownItem
              onClick={onReset}
              disabled={!workflow.isSeeded || !canEdit}
            >
              <DropdownLabel>{t('settings.workflows.resetToDefault')}</DropdownLabel>
              {!workflow.isSeeded && (
                <DropdownDescription>
                  {t('settings.workflows.onlyBuiltInResettable')}
                </DropdownDescription>
              )}
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </div>
    </div>
  );
}

export default function WorkflowsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canEdit = useHasCapability('EDIT_SETTINGS');

  const [pendingReset, setPendingReset] = useState<WorkflowSummary | null>(null);

  const {
    data: workflows,
    isLoading: workflowsLoading,
    error: workflowsError,
    refetch: refetchWorkflows,
  } = useQuery({
    queryKey: WORKFLOWS_KEY,
    queryFn: () => workflowsApi.getAll(),
  });

  const { data: config } = useQuery({
    queryKey: CONFIG_KEY,
    queryFn: () => workflowConfigApi.get(),
  });

  const updateConfigMutation = useMutation({
    mutationFn: (mode: EnforcementMode) =>
      workflowConfigApi.update({ enforcementMode: mode }),
    onMutate: async (mode) => {
      await queryClient.cancelQueries({ queryKey: CONFIG_KEY });
      const previous = queryClient.getQueryData<typeof config>(CONFIG_KEY);
      if (previous) {
        queryClient.setQueryData(CONFIG_KEY, { ...previous, enforcementMode: mode });
      }
      return { previous };
    },
    onError: (err, _mode, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(CONFIG_KEY, ctx.previous);
      showError(t('settings.workflows.enforcement.saveError'), extractApiError(err));
    },
    onSuccess: () => {
      showSuccess(t('settings.workflows.enforcement.saved'));
      queryClient.invalidateQueries({ queryKey: CONFIG_KEY });
    },
  });

  const resetMutation = useMutation({
    mutationFn: (id: string) => workflowsApi.resetToDefault(id),
    onSuccess: (_, _id, ctx) => {
      queryClient.invalidateQueries({ queryKey: WORKFLOWS_KEY });
      const name = (ctx as { name?: string } | undefined)?.name;
      showSuccess(
        name
          ? t('settings.workflows.resetSuccess', { name })
          : t('settings.workflows.resetSuccessGeneric'),
      );
    },
    onError: (err) => {
      showError(t('settings.workflows.resetError'), extractApiError(err));
    },
  });

  const enforcementMode: EnforcementMode = config?.enforcementMode ?? 'OPEN';

  const handleResetConfirm = () => {
    if (!pendingReset) return;
    resetMutation.mutate(pendingReset.id, {
      onSettled: () => setPendingReset(null),
    });
  };

  return (
    <>
      <PageHead
        title={t('settings.workflows.title')}
        sub={t('settings.workflows.subtitle')}
      />

      {/* Enforcement card — replaces the old Workflow Config panel */}
      <Card className="mb-4 max-w-[900px]">
        <CardBody>
          <div className="flex items-start gap-4">
            <div className="grid size-9 place-items-center rounded-lg bg-info-500/14 text-info-500 shrink-0">
              <AdjustmentsHorizontalIcon className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3 mb-1">
                <Text size="sm" tone="strong" as="span" className="font-semibold">
                  {t('settings.workflows.enforcement.title')}
                </Text>
                <ToggleGroup
                  value={enforcementMode}
                  onChange={(mode: EnforcementMode) =>
                    canEdit && updateConfigMutation.mutate(mode)
                  }
                  aria-label={t('settings.workflows.enforcement.title')}
                >
                  <ToggleGroupOption value="OPEN">
                    {t('settings.workflows.enforcement.open')}
                  </ToggleGroupOption>
                  <ToggleGroupOption value="STRICT">
                    {t('settings.workflows.enforcement.strict')}
                  </ToggleGroupOption>
                </ToggleGroup>
              </div>
              <Text size="xs" tone="muted">
                {enforcementMode === 'OPEN'
                  ? t('settings.workflows.enforcement.openDescription')
                  : t('settings.workflows.enforcement.strictDescription')}
              </Text>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card className="max-w-[900px]">
        <CardBody flush>
          {workflowsLoading ? (
            <LoadingState />
          ) : workflowsError ? (
            <ErrorState
              title={t('settings.workflows.couldNotLoad')}
              description={extractApiError(workflowsError) ?? (workflowsError as Error).message}
              action={
                <Button outline onClick={() => refetchWorkflows()}>
                  {t('common.actions.tryAgain')}
                </Button>
              }
            />
          ) : !workflows || workflows.length === 0 ? (
            <EmptyState
              icon={<ArrowsRightLeftIcon className="size-10 text-fg-dim" />}
              title={t('settings.workflows.emptyTitle')}
              description={t('settings.workflows.emptyDescription')}
            />
          ) : (
            workflows.map((w) => (
              <WorkflowRow
                key={w.id}
                workflow={w}
                canEdit={canEdit}
                onOpen={() => navigate(`/settings/work-orders/workflows/${w.id}`)}
                onReset={() => setPendingReset(w)}
              />
            ))
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        isOpen={pendingReset !== null}
        onClose={() => setPendingReset(null)}
        onConfirm={handleResetConfirm}
        title={t('settings.workflows.resetConfirm.title', {
          name: pendingReset?.workOrderType.name ?? '',
        })}
        message={t('settings.workflows.resetConfirm.body')}
        confirmLabel={
          resetMutation.isPending
            ? t('common.saving')
            : t('settings.workflows.resetToDefault')
        }
        isPending={resetMutation.isPending}
      />
    </>
  );
}
