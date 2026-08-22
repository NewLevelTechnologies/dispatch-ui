import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { ArrowRightIcon } from '@heroicons/react/16/solid';
import {
  workflowsApi,
  userApi,
  type Capability,
  type CreateWorkflowTransitionRequest,
  type UpdateWorkflowTransitionRequest,
  type WorkflowTransition,
  type WorkItemStatus,
} from '../../../api/setup';
import {
  SlideOver,
  SlideOverBody,
  SlideOverFooter,
  SlideOverHeader,
  SlideOverTitle,
} from '../../../components/catalyst/slideover';
import {
  Description,
  ErrorMessage,
  Field,
  FieldGroup,
  Label,
} from '../../../components/catalyst/fieldset';
import { SwitchField, Switch } from '../../../components/catalyst/switch';
import { Input } from '../../../components/catalyst/input';
import { CheckboxField, Checkbox } from '../../../components/catalyst/checkbox';
import { Button } from '../../../components/catalyst/button';
import { Text } from '../../../components/catalyst/text';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { extractApiError, showError, showSuccess } from '../../../lib/toast';
import { roleAccent } from '../../../utils/roleColor';

// v1 ships with a single approver capability; the picker stays multi-select
// because per-cap granularity (HIGH_VALUE_TRANSITIONS, etc.) is on the
// backend's near-term roadmap. Hardcoded filter avoids depending on a
// dedicated "approver capabilities" endpoint.
const APPROVER_CAPABILITY_CODES = ['APPROVE_WORK_ITEM_TRANSITIONS'];

interface TransitionEditPanelProps {
  open: boolean;
  workflowId: string;
  from: WorkItemStatus | null;
  to: WorkItemStatus | null;
  existing: WorkflowTransition | null;
  tenantDefaultExpiryHours: number;
  onClose: () => void;
  canEdit: boolean;
}

function StatusChip({ status }: { status: WorkItemStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elev px-2 py-1 text-[12px] font-semibold text-fg-strong">
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ background: roleAccent(status.accentId, status.name) }}
      />
      {status.name}
    </span>
  );
}

// Outer shell — always mounted (the SlideOver controls open animation).
// Inner form remounts per cell via key, so initial state derives from props
// without needing an effect-based reset.
export default function TransitionEditPanel(props: TransitionEditPanelProps) {
  const { open, onClose, from, to, existing } = props;
  const { t } = useTranslation();
  return (
    <SlideOver open={open} onClose={onClose} className="!max-w-md">
      <SlideOverHeader onClose={onClose}>
        <SlideOverTitle>{t('settings.workflows.panel.editTransition')}</SlideOverTitle>
        {from && to && (
          <div className="mt-2 flex items-center gap-2">
            <StatusChip status={from} />
            <ArrowRightIcon className="size-4 text-fg-dim" />
            <StatusChip status={to} />
          </div>
        )}
      </SlideOverHeader>
      {from && to ? (
        <TransitionEditForm
          key={`${from.id}:${to.id}:${existing?.id ?? 'new'}`}
          {...props}
          from={from}
          to={to}
        />
      ) : (
        <SlideOverBody />
      )}
    </SlideOver>
  );
}

interface FormProps extends Omit<TransitionEditPanelProps, 'from' | 'to' | 'open'> {
  from: WorkItemStatus;
  to: WorkItemStatus;
}

function TransitionEditForm({
  workflowId,
  from,
  to,
  existing,
  tenantDefaultExpiryHours,
  onClose,
  canEdit,
}: FormProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [allowed, setAllowed] = useState(Boolean(existing));
  const [requiresApproval, setRequiresApproval] = useState(
    existing?.requiresApproval ?? false,
  );
  const [approverCaps, setApproverCaps] = useState<string[]>(
    existing?.approverCapabilities ?? [],
  );
  const [expiryHours, setExpiryHours] = useState<string>(
    existing?.approvalExpiryHours != null ? String(existing.approvalExpiryHours) : '',
  );
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const { data: capabilityResponse } = useQuery({
    queryKey: ['capabilities', 'grouped'],
    queryFn: () => userApi.getGroupedCapabilities(),
    enabled: requiresApproval,
    staleTime: 10 * 60 * 1000,
  });

  const approverCapabilities: Capability[] = useMemo(() => {
    if (!capabilityResponse) return [];
    const flat = capabilityResponse.groups.flatMap((g) => g.capabilities);
    return flat.filter((c) => APPROVER_CAPABILITY_CODES.includes(c.name));
  }, [capabilityResponse]);

  const handleRequiresApprovalChange = (next: boolean) => {
    setRequiresApproval(next);
    // Auto-select the only approver cap when turning approval on for the
    // first time — saves a click in the v1 single-cap world.
    if (next && approverCaps.length === 0 && approverCapabilities.length === 1) {
      setApproverCaps([approverCapabilities[0].name]);
    }
  };

  const createMutation = useMutation({
    mutationFn: (req: CreateWorkflowTransitionRequest) =>
      workflowsApi.createTransition(workflowId, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      showSuccess(t('settings.workflows.panel.savedCreate'));
      onClose();
    },
    onError: (err) => showError(t('settings.workflows.panel.saveError'), extractApiError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: (req: UpdateWorkflowTransitionRequest) => {
      if (!existing) throw new Error('No existing transition');
      return workflowsApi.updateTransition(workflowId, existing.id, req);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      showSuccess(t('settings.workflows.panel.savedUpdate'));
      onClose();
    },
    onError: (err) => showError(t('settings.workflows.panel.saveError'), extractApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!existing) throw new Error('No existing transition');
      return workflowsApi.deleteTransition(workflowId, existing.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      showSuccess(t('settings.workflows.panel.savedDelete'));
      onClose();
    },
    onError: (err) =>
      showError(t('settings.workflows.panel.deleteError'), extractApiError(err)),
  });

  const parsedExpiry =
    expiryHours.trim() === '' ? null : Math.max(1, Math.floor(Number(expiryHours)));
  const expiryInvalid =
    requiresApproval &&
    expiryHours.trim() !== '' &&
    (Number.isNaN(parsedExpiry) || (parsedExpiry ?? 0) < 1 || (parsedExpiry ?? 0) > 720);

  const saveDisabled =
    !canEdit ||
    (allowed && requiresApproval && approverCaps.length === 0) ||
    expiryInvalid ||
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  const handleSave = () => {
    if (!allowed) {
      // "Not allowed" + no existing = no-op; + existing = delete.
      if (existing) {
        deleteMutation.mutate();
      } else {
        onClose();
      }
      return;
    }
    const body = {
      fromStatusId: from.id,
      toStatusId: to.id,
      requiresApproval,
      approverCapabilities: requiresApproval ? approverCaps : [],
      approvalExpiryHours: requiresApproval ? parsedExpiry : null,
    };
    if (existing) {
      updateMutation.mutate(body);
    } else {
      createMutation.mutate(body);
    }
  };

  return (
    <>
      <SlideOverBody>
        <FieldGroup>
          <SwitchField>
            <Switch checked={allowed} onChange={setAllowed} disabled={!canEdit} />
            <Label>{t('settings.workflows.panel.allowed')}</Label>
            <Description>
              {t('settings.workflows.panel.allowedHint', {
                from: from.name,
                to: to.name,
              })}
            </Description>
          </SwitchField>

          {allowed && (
            <>
              <SwitchField>
                <Switch
                  checked={requiresApproval}
                  onChange={handleRequiresApprovalChange}
                  disabled={!canEdit}
                />
                <Label>{t('settings.workflows.panel.requiresApproval')}</Label>
                <Description>
                  {t('settings.workflows.panel.requiresApprovalHint')}
                </Description>
              </SwitchField>

              {requiresApproval && (
                <>
                  <Field size="xs">
                    <Label size="xs" required>
                      {t('settings.workflows.panel.approverCapabilities')}
                    </Label>
                    <Description size="xs">
                      {t('settings.workflows.panel.approverCapabilitiesHint')}
                    </Description>
                    <div className="mt-1 flex flex-col gap-2">
                      {approverCapabilities.length === 0 ? (
                        <Text size="xs" tone="muted">
                          {t('settings.workflows.panel.noApproverCapabilities')}
                        </Text>
                      ) : (
                        approverCapabilities.map((cap) => {
                          const checked = approverCaps.includes(cap.name);
                          return (
                            <CheckboxField key={cap.name}>
                              <Checkbox
                                checked={checked}
                                disabled={!canEdit}
                                onChange={(next) => {
                                  setApproverCaps((prev) =>
                                    next
                                      ? Array.from(new Set([...prev, cap.name]))
                                      : prev.filter((c) => c !== cap.name),
                                  );
                                }}
                              />
                              <Label>{cap.displayName}</Label>
                              {cap.description && (
                                <Description>{cap.description}</Description>
                              )}
                            </CheckboxField>
                          );
                        })
                      )}
                    </div>
                    {approverCaps.length === 0 && (
                      <ErrorMessage size="xs">
                        {t('settings.workflows.panel.atLeastOneCapability')}
                      </ErrorMessage>
                    )}
                  </Field>

                  <Field size="xs">
                    <Label
                      size="xs"
                      hint={t('settings.workflows.panel.expiryHoursHint', {
                        default: tenantDefaultExpiryHours,
                      })}
                    >
                      {t('settings.workflows.panel.expiryHours')}
                    </Label>
                    <Input
                      size="xs"
                      type="number"
                      min={1}
                      max={720}
                      value={expiryHours}
                      onChange={(e) => setExpiryHours(e.target.value)}
                      placeholder={String(tenantDefaultExpiryHours)}
                      disabled={!canEdit}
                      className="w-24"
                    />
                    {expiryInvalid && (
                      <ErrorMessage size="xs">
                        {t('settings.workflows.panel.expiryRange')}
                      </ErrorMessage>
                    )}
                  </Field>
                </>
              )}
            </>
          )}
        </FieldGroup>
      </SlideOverBody>
      <SlideOverFooter className="max-sm:flex-col max-sm:items-stretch">
        {existing && canEdit && (
          <Button
            outline="red"
            size="xs"
            onClick={() => setConfirmDeleteOpen(true)}
            className="mr-auto max-sm:order-3 max-sm:mr-0 max-sm:w-full"
            disabled={deleteMutation.isPending}
          >
            {t('settings.workflows.panel.deleteTransition')}
          </Button>
        )}
        <Button plain size="xs" onClick={onClose} className="max-sm:order-2 max-sm:w-full">
          {t('common.cancel')}
        </Button>
        <Button
          color="accent"
          size="xs"
          onClick={handleSave}
          disabled={saveDisabled}
          className="max-sm:order-1 max-sm:w-full"
        >
          {createMutation.isPending || updateMutation.isPending
            ? t('common.saving')
            : t('common.save')}
        </Button>
      </SlideOverFooter>
      <ConfirmDialog
        isOpen={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        title={t('settings.workflows.panel.deleteConfirmTitle', {
          from: from.name,
          to: to.name,
        })}
        message={t('settings.workflows.panel.deleteConfirmBody')}
        confirmLabel={
          deleteMutation.isPending
            ? t('common.deleting')
            : t('settings.workflows.panel.deleteTransition')
        }
        isDestructive
        isPending={deleteMutation.isPending}
      />
    </>
  );
}
