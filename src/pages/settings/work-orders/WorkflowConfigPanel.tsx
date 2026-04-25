/* eslint-disable i18next/no-literal-string */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  workflowConfigApi,
  workOrderTypesApi,
  workItemStatusesApi,
  getApiErrorMessage,
  type UpdateWorkflowConfigRequest,
  type DispatchBoardType,
} from '../../../api';
import { useGlossary } from '../../../contexts/GlossaryContext';
import { useHasCapability } from '../../../hooks/useCurrentUser';
import { Heading, Subheading } from '../../../components/catalyst/heading';
import { Text } from '../../../components/catalyst/text';
import { Button } from '../../../components/catalyst/button';
import { Field, FieldGroup, Label, Description } from '../../../components/catalyst/fieldset';
import { Select } from '../../../components/catalyst/select';
import { CheckboxField, Checkbox } from '../../../components/catalyst/checkbox';
import { Divider } from '../../../components/catalyst/divider';

export default function WorkflowConfigPanel() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const canEdit = useHasCapability('EDIT_SETTINGS');
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<UpdateWorkflowConfigRequest>({});

  const { data: config, isLoading, error } = useQuery({
    queryKey: ['workflow-config'],
    queryFn: () => workflowConfigApi.get(),
  });

  const { data: types } = useQuery({
    queryKey: ['work-order-types'],
    queryFn: () => workOrderTypesApi.getAll(),
  });

  const { data: statuses } = useQuery({
    queryKey: ['work-item-statuses'],
    queryFn: () => workItemStatusesApi.getAll(),
  });

  useEffect(() => {
    if (config) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData({
        enforceStatusWorkflow: config.enforceStatusWorkflow,
        defaultWorkOrderTypeId: config.defaultWorkOrderTypeId ?? null,
        defaultWorkItemStatusId: config.defaultWorkItemStatusId ?? null,
        dispatchBoardType: config.dispatchBoardType,
      });
    }
  }, [config]);

  const updateMutation = useMutation({
    mutationFn: (req: UpdateWorkflowConfigRequest) => workflowConfigApi.update(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-config'] });
      setIsEditing(false);
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || 'Failed to update workflow config');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const lookupTypeName = (id?: string | null) => types?.find((t) => t.id === id)?.name;
  const lookupStatusName = (id?: string | null) => statuses?.find((s) => s.id === id)?.name;

  if (isLoading) {
    return <Text className="text-zinc-500">{t('common.loading')}</Text>;
  }

  if (error || !config) {
    return <Text className="text-red-600">{getApiErrorMessage(error) || 'Failed to load workflow config.'}</Text>;
  }

  if (!isEditing) {
    return (
      <div>
        <div className="flex items-start justify-between mb-6">
          <div>
            <Heading>{t('settings.nav.workflowConfig')}</Heading>
            <Text className="mt-1">{t('settings.workflowConfig.description')}</Text>
          </div>
          {canEdit && <Button onClick={() => setIsEditing(true)}>{t('common.edit')}</Button>}
        </div>

        <div className="grid grid-cols-2 gap-x-12 gap-y-6 max-w-4xl">
          <div>
            <Subheading className="mb-3">Defaults</Subheading>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Default {getName('work_order')} Type</dt>
                <dd className="mt-0.5 text-sm text-zinc-900 dark:text-white">
                  {lookupTypeName(config.defaultWorkOrderTypeId) || <span className="text-zinc-400">{t('settings.workflowConfig.noneOption')}</span>}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Default Item Status</dt>
                <dd className="mt-0.5 text-sm text-zinc-900 dark:text-white">
                  {lookupStatusName(config.defaultWorkItemStatusId) || <span className="text-zinc-400">{t('settings.workflowConfig.noneOption')}</span>}
                </dd>
              </div>
            </dl>
          </div>

          <div>
            <Subheading className="mb-3">Behavior</Subheading>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Enforce Status Workflow</dt>
                <dd className="mt-0.5 text-sm text-zinc-900 dark:text-white">
                  {config.enforceStatusWorkflow ? t('common.enabled') : t('common.disabled')}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{getName('dispatch')} Board Type</dt>
                <dd className="mt-0.5 text-sm text-zinc-900 dark:text-white">
                  {config.dispatchBoardType === 'STATUS_BASED' ? 'Status-based' : 'Schedule-based'}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Heading>{t('settings.nav.workflowConfig')}</Heading>
        <Text className="mt-1">{t('settings.workflowConfig.description')}</Text>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-x-12 gap-y-6 max-w-4xl">
          <div>
            <Subheading className="mb-3">Defaults</Subheading>
            <FieldGroup className="space-y-3">
              <Field>
                <Label>Default {getName('work_order')} Type</Label>
                <Select
                  name="defaultWorkOrderTypeId"
                  value={formData.defaultWorkOrderTypeId ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setFormData((prev) => ({ ...prev, defaultWorkOrderTypeId: e.target.value || null }))
                  }
                >
                  <option value="">{t('settings.workflowConfig.noneOption')}</option>
                  {types?.map((type) => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </Select>
                <Description>{t('settings.workflowConfig.defaultTypeHelper')}</Description>
              </Field>
              <Field>
                <Label>Default Item Status</Label>
                <Select
                  name="defaultWorkItemStatusId"
                  value={formData.defaultWorkItemStatusId ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setFormData((prev) => ({ ...prev, defaultWorkItemStatusId: e.target.value || null }))
                  }
                >
                  <option value="">{t('settings.workflowConfig.noneOption')}</option>
                  {statuses?.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
                <Description>{t('settings.workflowConfig.defaultStatusHelper')}</Description>
              </Field>
            </FieldGroup>
          </div>

          <div>
            <Subheading className="mb-3">Behavior</Subheading>
            <FieldGroup className="space-y-3">
              <Field>
                <Label>{getName('dispatch')} Board Type</Label>
                <Select
                  name="dispatchBoardType"
                  value={formData.dispatchBoardType ?? 'STATUS_BASED'}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setFormData((prev) => ({ ...prev, dispatchBoardType: e.target.value as DispatchBoardType }))
                  }
                >
                  <option value="STATUS_BASED">Status-based</option>
                  <option value="SCHEDULE_BASED">Schedule-based</option>
                </Select>
                <Description>{t('settings.workflowConfig.boardTypeHelper')}</Description>
              </Field>
              <CheckboxField>
                <Checkbox
                  name="enforceStatusWorkflow"
                  checked={formData.enforceStatusWorkflow ?? false}
                  onChange={(checked) => setFormData((prev) => ({ ...prev, enforceStatusWorkflow: checked }))}
                />
                <Label>Enforce Status Workflow</Label>
                <Description>{t('settings.workflowConfig.enforceHelper')}</Description>
              </CheckboxField>
            </FieldGroup>
          </div>
        </div>

        <Divider className="my-6" />

        <div className="flex justify-end gap-3">
          <Button plain type="button" onClick={() => {
            setIsEditing(false);
            if (config) {
              setFormData({
                enforceStatusWorkflow: config.enforceStatusWorkflow,
                defaultWorkOrderTypeId: config.defaultWorkOrderTypeId ?? null,
                defaultWorkItemStatusId: config.defaultWorkItemStatusId ?? null,
                dispatchBoardType: config.dispatchBoardType,
              });
            }
          }}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? t('common.saving') : t('common.update')}
          </Button>
        </div>
      </form>
    </div>
  );
}
