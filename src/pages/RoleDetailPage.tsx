import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { userApi } from '../api';
import AppLayout from '../components/AppLayout';
import RoleFormDialog from '../components/RoleFormDialog';
import CloneRoleDialog from '../components/CloneRoleDialog';
import CapabilitiesSection from '../components/CapabilitiesSection';
import { Heading, Subheading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { DescriptionList, DescriptionTerm, DescriptionDetails } from '../components/catalyst/description-list';
import { Divider } from '../components/catalyst/divider';
import { Alert, AlertActions, AlertDescription, AlertTitle } from '../components/catalyst/alert';

export default function RoleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCloneDialogOpen, setIsCloneDialogOpen] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [isRestoreAlertOpen, setIsRestoreAlertOpen] = useState(false);

  const { data: role, isLoading, error } = useQuery({
    queryKey: ['roles', id],
    queryFn: () => userApi.getRoleById(id!),
  });

  const deleteMutation = useMutation({
    mutationFn: () => userApi.deleteRole(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      navigate('/roles');
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || 'Failed to delete role');
    },
  });

  const restoreDefaultsMutation = useMutation({
    mutationFn: () => userApi.restoreRoleDefaults(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['roles', id] });
      setIsRestoreAlertOpen(false);
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || 'Failed to restore role defaults');
    },
  });

  const handleEdit = () => {
    setIsEditDialogOpen(true);
  };

  const handleClone = () => {
    setIsCloneDialogOpen(true);
  };

  const handleRestoreDefaults = () => {
    setIsRestoreAlertOpen(true);
  };

  const handleDelete = () => {
    setIsDeleteAlertOpen(true);
  };

  const confirmDelete = () => {
    deleteMutation.mutate();
  };

  const confirmRestoreDefaults = () => {
    restoreDefaultsMutation.mutate();
  };

  const handleCloseDialog = () => {
    setIsEditDialogOpen(false);
  };

  const handleCloseCloneDialog = () => {
    setIsCloneDialogOpen(false);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-8 text-center">
          <p className="text-zinc-600 dark:text-zinc-400">
            {t('common.actions.loading', { entities: t('entities.role') })}
          </p>
        </div>
      </AppLayout>
    );
  }

  if (error || !role) {
    return (
      <AppLayout>
        <div className="p-8">
          <div className="rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
            <p className="text-sm text-red-800 dark:text-red-400">
              {t('common.actions.errorLoading', { entities: t('entities.role') })}
              {error && `: ${(error as Error).message}`}
            </p>
          </div>
          <Button className="mt-4" onClick={() => navigate('/roles')}>
            <ArrowLeftIcon className="size-4" />
            {t('common.actions.back')}
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-5xl">
        {/* Header */}
        <div className="mb-4">
          <Button plain onClick={() => navigate('/roles')}>
            <ArrowLeftIcon className="size-4" />
            {t('common.actions.back')}
          </Button>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <Heading>{role.name}</Heading>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {role.description || 'No description provided'}
            </p>
          </div>
          <div className="flex gap-2">
            {!role.isProtected && (
              <Button color="zinc" onClick={handleEdit}>
                {t('common.edit')}
              </Button>
            )}
            <Button color="zinc" onClick={handleClone}>
              {t('roles.actions.clone')}
            </Button>
            {role.isSystemRole && (
              <Button color="zinc" onClick={handleRestoreDefaults}>
                {t('roles.actions.restoreDefaults')}
              </Button>
            )}
            {!role.isProtected && (
              <Button color="red" onClick={handleDelete}>
                {t('common.delete')}
              </Button>
            )}
          </div>
        </div>

        <Divider className="my-8" />

        {/* Content Grid */}
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Basic Information */}
          <div>
            <Subheading>{t('roles.detail.roleInfo')}</Subheading>
            <DescriptionList className="mt-4">
              <DescriptionTerm>{t('common.form.name')}</DescriptionTerm>
              <DescriptionDetails>{role.name}</DescriptionDetails>

              <DescriptionTerm>{t('common.form.description')}</DescriptionTerm>
              <DescriptionDetails>
                {role.description || <span className="text-zinc-500">-</span>}
              </DescriptionDetails>

              <DescriptionTerm>{t('roles.detail.totalCapabilities')}</DescriptionTerm>
              <DescriptionDetails>
                {role.capabilities?.length || 0} {t('capabilities.totalCount')}
              </DescriptionDetails>
            </DescriptionList>
          </div>

          {/* System Information */}
          <div>
            <Subheading>{t('roles.detail.systemInfo')}</Subheading>
            <DescriptionList className="mt-4">
              <DescriptionTerm>{t('roles.detail.roleId')}</DescriptionTerm>
              <DescriptionDetails>
                <code className="text-xs text-zinc-600 dark:text-zinc-400">
                  {role.id}
                </code>
              </DescriptionDetails>

              <DescriptionTerm>{t('roles.detail.created')}</DescriptionTerm>
              <DescriptionDetails>{formatDate(role.createdAt)}</DescriptionDetails>

              <DescriptionTerm>{t('roles.detail.lastUpdated')}</DescriptionTerm>
              <DescriptionDetails>{formatDate(role.updatedAt)}</DescriptionDetails>
            </DescriptionList>
          </div>
        </div>

        {/* Capabilities Section - Full Width */}
        <div className="mt-8">
          <CapabilitiesSection capabilities={role.capabilities || []} />
        </div>
      </div>

      <RoleFormDialog
        isOpen={isEditDialogOpen}
        onClose={handleCloseDialog}
        role={role}
      />

      <CloneRoleDialog
        isOpen={isCloneDialogOpen}
        onClose={handleCloseCloneDialog}
        role={role}
      />

      <Alert open={isDeleteAlertOpen} onClose={() => setIsDeleteAlertOpen(false)}>
        <AlertTitle>
          {t('common.actions.deleteConfirm', { name: role.name })}
        </AlertTitle>
        <AlertDescription>
          {t('roles.actions.deleteWarning')}
        </AlertDescription>
        <AlertActions>
          <Button plain onClick={() => setIsDeleteAlertOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button color="red" onClick={confirmDelete} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? t('common.deleting') : t('common.delete')}
          </Button>
        </AlertActions>
      </Alert>

      <Alert open={isRestoreAlertOpen} onClose={() => setIsRestoreAlertOpen(false)}>
        <AlertTitle>
          {t('roles.actions.restoreDefaultsConfirm', { name: role.name })}
        </AlertTitle>
        <AlertDescription>
          {t('roles.actions.restoreDefaultsWarning')}
        </AlertDescription>
        <AlertActions>
          <Button plain onClick={() => setIsRestoreAlertOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={confirmRestoreDefaults} disabled={restoreDefaultsMutation.isPending}>
            {restoreDefaultsMutation.isPending ? t('common.restoring') : t('roles.actions.restore')}
          </Button>
        </AlertActions>
      </Alert>
    </AppLayout>
  );
}
