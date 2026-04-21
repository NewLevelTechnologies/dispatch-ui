import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { userApi, dispatchRegionApi } from '../api';
import { useHasCapability } from '../hooks/useCurrentUser';
import AppLayout from '../components/AppLayout';
import UserFormDialog from '../components/UserFormDialog';
import CapabilitiesSection from '../components/CapabilitiesSection';
import AuditHistory from '../components/AuditHistory';
import { Heading, Subheading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Badge } from '../components/catalyst/badge';
import { DescriptionList, DescriptionTerm, DescriptionDetails } from '../components/catalyst/description-list';
import { Divider } from '../components/catalyst/divider';
import { Text } from '../components/catalyst/text';

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Permission checks
  const canEditUsers = useHasCapability('EDIT_USERS');
  const canViewAuditLogs = useHasCapability('VIEW_AUDIT_LOGS');

  const { data: user, isLoading, error } = useQuery({
    queryKey: ['users', id],
    queryFn: () => userApi.getById(id!),
  });

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => userApi.getRoles(),
  });

  const { data: allRegions } = useQuery({
    queryKey: ['dispatch-regions'],
    queryFn: () => dispatchRegionApi.getAll(true),
  });

  const disableMutation = useMutation({
    mutationFn: () => userApi.disable(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', id] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const enableMutation = useMutation({
    mutationFn: () => userApi.enable(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', id] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const handleEdit = () => {
    setIsEditDialogOpen(true);
  };

  const handleDisable = () => {
    if (user) {
      const message = t('users.actions.disableConfirm', { name: `${user.firstName} ${user.lastName}` });
      if (window.confirm(message)) {
        disableMutation.mutate();
      }
    }
  };

  const handleEnable = () => {
    if (user) {
      const message = t('users.actions.enableConfirm', { name: `${user.firstName} ${user.lastName}` });
      if (window.confirm(message)) {
        enableMutation.mutate();
      }
    }
  };

  const handleCloseDialog = () => {
    setIsEditDialogOpen(false);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-8 text-center">
          <p className="text-zinc-600 dark:text-zinc-400">
            {t('common.actions.loading', { entities: t('entities.user') })}
          </p>
        </div>
      </AppLayout>
    );
  }

  if (error || !user) {
    return (
      <AppLayout>
        <div className="p-8">
          <div className="rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
            <p className="text-sm text-red-800 dark:text-red-400">
              {t('common.actions.errorLoading', { entities: t('entities.user') })}
              {error && `: ${(error as Error).message}`}
            </p>
          </div>
          <Button className="mt-4" onClick={() => navigate('/users')}>
            <ArrowLeftIcon className="size-4" />
            {t('common.actions.back')}
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div>
        {/* Header */}
        <div className="mb-2">
          <Button plain onClick={() => navigate('/users')}>
            <ArrowLeftIcon className="size-4" />
            {t('common.actions.back')}
          </Button>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <Heading>
              {user.firstName} {user.lastName}
            </Heading>
            <Text className="mt-1">
              {user.email}
            </Text>
          </div>
          {canEditUsers && (
            <div className="flex gap-2">
              <Button color="zinc" onClick={handleEdit}>
                {t('common.edit')}
              </Button>
              {user.enabled ? (
                <Button color="zinc" onClick={handleDisable}>
                  {t('users.table.disable')}
                </Button>
              ) : (
                <Button onClick={handleEnable}>
                  {t('users.table.enable')}
                </Button>
              )}
            </div>
          )}
        </div>

        <Divider className="my-4" />

        {/* Dense Two-Column Layout */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left Column: Role & Permissions */}
          <div>
            <Subheading>{t('users.detail.rolePermissions')}</Subheading>
            <DescriptionList className="mt-2 text-sm">
              <DescriptionTerm className="!py-0.5">{t('common.form.status')}</DescriptionTerm>
              <DescriptionDetails className="!py-0.5">
                {user.enabled ? (
                  <Badge color="lime">{t('common.enabled')}</Badge>
                ) : (
                  <Badge color="zinc">{t('common.disabled')}</Badge>
                )}
              </DescriptionDetails>

              <DescriptionTerm className="!py-0.5">{t('common.form.role')}</DescriptionTerm>
              <DescriptionDetails className="!py-0.5">
                {user.roles && user.roles.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {user.roles.map(role => (
                      <Badge key={role.id} color="sky">{role.name}</Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-zinc-500">-</span>
                )}
              </DescriptionDetails>

              <DescriptionTerm className="!py-0.5">{t('users.form.assignedRegions')}</DescriptionTerm>
              <DescriptionDetails className="!py-0.5">
                {user.dispatchRegionIds && user.dispatchRegionIds.length > 0 && allRegions ? (
                  <div className="flex flex-wrap gap-1.5">
                    {user.dispatchRegionIds.map(regionId => {
                      const region = allRegions.find(r => r.id === regionId);
                      return region ? (
                        <Badge key={region.id} color="purple">{region.name}</Badge>
                      ) : null;
                    })}
                  </div>
                ) : (
                  <span className="text-zinc-500">{t('users.detail.noRegionsAssigned')}</span>
                )}
              </DescriptionDetails>
            </DescriptionList>
          </div>

          {/* Right Column: Capabilities Summary */}
          <div>
            <CapabilitiesSection capabilities={user.capabilities || []} />
          </div>
        </div>

        <Divider className="my-4" />

        {/* Audit Log Section */}
        {canViewAuditLogs && (
          <div>
            <AuditHistory entityType="TenantUser" entityId={user.id} />
          </div>
        )}
      </div>

      <UserFormDialog
        isOpen={isEditDialogOpen}
        onClose={handleCloseDialog}
        user={user}
        roles={roles || []}
      />
    </AppLayout>
  );
}
