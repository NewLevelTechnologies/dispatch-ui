/* eslint-disable i18next/no-literal-string */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  statusWorkflowsApi,
  workItemStatusesApi,
  getApiErrorMessage,
  type StatusWorkflowRule,
  type CreateStatusWorkflowRequest,
  type WorkItemStatus,
} from '../../../api';
import { useHasCapability } from '../../../hooks/useCurrentUser';
import { Heading } from '../../../components/catalyst/heading';
import { Text } from '../../../components/catalyst/text';
import { Button } from '../../../components/catalyst/button';
import IconButton from '../../../components/IconButton';
import { Badge } from '../../../components/catalyst/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/catalyst/table';
import { Dialog, DialogActions, DialogBody, DialogTitle } from '../../../components/catalyst/dialog';
import { Field, FieldGroup, Label, Description } from '../../../components/catalyst/fieldset';
import { Select } from '../../../components/catalyst/select';
import { Input } from '../../../components/catalyst/input';
import { CheckboxField, Checkbox } from '../../../components/catalyst/checkbox';
import { ArrowRightIcon, TrashIcon } from '@heroicons/react/16/solid';

const QUERY_KEY = ['status-workflows'];

interface AddDialogProps {
  isOpen: boolean;
  onClose: () => void;
  statuses: WorkItemStatus[];
}

function AddTransitionDialog({ isOpen, onClose, statuses }: AddDialogProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [fromStatusId, setFromStatusId] = useState('');
  const [toStatusId, setToStatusId] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [approvalRole, setApprovalRole] = useState('');

  const createMutation = useMutation({
    mutationFn: (req: CreateStatusWorkflowRequest) => statusWorkflowsApi.create(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setFromStatusId('');
      setToStatusId('');
      setRequiresApproval(false);
      setApprovalRole('');
      onClose();
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || 'Failed to create transition rule');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      fromStatusId,
      toStatusId,
      isAllowed: true,
      requiresApproval,
      approvalRole: requiresApproval && approvalRole.trim() ? approvalRole.trim() : null,
    });
  };

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{t('settings.statusWorkflows.addRule')}</DialogTitle>
        <DialogBody>
          <FieldGroup>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <Label>{t('settings.statusWorkflows.from')} *</Label>
                <Select
                  value={fromStatusId}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFromStatusId(e.target.value)}
                  required
                >
                  <option value="">{t('common.form.select')}</option>
                  {statuses.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label>{t('settings.statusWorkflows.to')} *</Label>
                <Select
                  value={toStatusId}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setToStatusId(e.target.value)}
                  required
                >
                  <option value="">{t('common.form.select')}</option>
                  {statuses.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <CheckboxField>
              <Checkbox checked={requiresApproval} onChange={setRequiresApproval} />
              <Label>Requires Approval</Label>
              <Description>If enabled, this transition needs approval before completing.</Description>
            </CheckboxField>
            {requiresApproval && (
              <Field>
                <Label>Approval Role</Label>
                <Input
                  value={approvalRole}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApprovalRole(e.target.value)}
                  placeholder="e.g. SUPERVISOR"
                />
                <Description>Optional. The role required to approve this transition.</Description>
              </Field>
            )}
          </FieldGroup>
        </DialogBody>
        <DialogActions>
          <Button plain type="button" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={createMutation.isPending || !fromStatusId || !toStatusId}>
            {createMutation.isPending ? t('common.saving') : t('common.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default function StatusWorkflowsPanel() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const canEdit = useHasCapability('EDIT_SETTINGS');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: rules, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => statusWorkflowsApi.getAll(),
  });

  const { data: statuses } = useQuery({
    queryKey: ['work-item-statuses'],
    queryFn: () => workItemStatusesApi.getAll(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => statusWorkflowsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || 'Failed to delete transition');
    },
  });

  const lookupStatusName = (id: string) =>
    statuses?.find((s) => s.id === id)?.name || id;

  const handleDelete = (rule: StatusWorkflowRule) => {
    const fromName = lookupStatusName(rule.fromStatusId);
    const toName = lookupStatusName(rule.toStatusId);
    if (window.confirm(`Delete transition: ${fromName} → ${toName}?`)) {
      deleteMutation.mutate(rule.id);
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <Heading>{t('settings.nav.statusWorkflows')}</Heading>
          <Text className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            {t('settings.statusWorkflows.description')}
          </Text>
        </div>
        {canEdit && (
          <Button onClick={() => setIsDialogOpen(true)} disabled={!statuses || statuses.length < 2}>
            {t('settings.statusWorkflows.addRule')}
          </Button>
        )}
      </div>

      {isLoading && <Text>Loading...</Text>}
      {error && <Text className="text-red-600">{getApiErrorMessage(error) || 'Failed to load transition rules.'}</Text>}
      {rules && rules.length === 0 && (
        <Text className="text-sm text-zinc-500 dark:text-zinc-400">
          {t('settings.statusWorkflows.empty')}
        </Text>
      )}

      {rules && rules.length > 0 && (
        <Table dense className="[--gutter:theme(spacing.1)] text-sm">
          <TableHead>
            <TableRow>
              <TableHeader>{t('settings.statusWorkflows.from')}</TableHeader>
              <TableHeader></TableHeader>
              <TableHeader>{t('settings.statusWorkflows.to')}</TableHeader>
              <TableHeader>Approval</TableHeader>
              <TableHeader></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell className="font-medium">{lookupStatusName(rule.fromStatusId)}</TableCell>
                <TableCell className="text-zinc-400 w-8 text-center">
                  <ArrowRightIcon className="h-4 w-4 inline" />
                </TableCell>
                <TableCell className="font-medium">{lookupStatusName(rule.toStatusId)}</TableCell>
                <TableCell>
                  {rule.requiresApproval ? (
                    <Badge color="amber">
                      {rule.approvalRole ? `Requires ${rule.approvalRole}` : 'Requires approval'}
                    </Badge>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="-mx-3 -my-1.5 sm:-mx-2.5 flex items-center justify-end">
                    {canEdit && (
                      <IconButton
                        onClick={() => handleDelete(rule)}
                        title={t('common.delete')}
                        aria-label={t('common.delete')}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </IconButton>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {statuses && (
        <AddTransitionDialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          statuses={statuses}
        />
      )}
    </div>
  );
}
