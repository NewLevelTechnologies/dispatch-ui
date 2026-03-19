import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { userApi } from '../api';
import { useHasCapability } from '../hooks/useCurrentUser';
import AppLayout from '../components/AppLayout';
import UserFormDialog from '../components/UserFormDialog';
import CapabilitiesSection from '../components/CapabilitiesSection';
import { Heading, Subheading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Badge } from '../components/catalyst/badge';
import { DescriptionList, DescriptionTerm, DescriptionDetails } from '../components/catalyst/description-list';
import { Divider } from '../components/catalyst/divider';

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Permission checks
  const canEditUsers = useHasCapability('EDIT_USERS');

  const { data: user, isLoading, error } = useQuery({
    queryKey: ['users', id],
    queryFn: () => userApi.getById(id!),
  });

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => userApi.getRoles(),
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

  const formatDate = (dateString: string) => {
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
      <div className="max-w-5xl">
        {/* Header */}
        <div className="mb-4">
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
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {user.email}
            </p>
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

        <Divider className="my-8" />

        {/* Content Grid */}
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Basic Information */}
          <div>
            <Subheading>{t('users.detail.basicInfo')}</Subheading>
            <DescriptionList className="mt-4">
              <DescriptionTerm>{t('common.form.firstName')}</DescriptionTerm>
              <DescriptionDetails>{user.firstName}</DescriptionDetails>

              <DescriptionTerm>{t('common.form.lastName')}</DescriptionTerm>
              <DescriptionDetails>{user.lastName}</DescriptionDetails>

              <DescriptionTerm>{t('common.form.email')}</DescriptionTerm>
              <DescriptionDetails>{user.email}</DescriptionDetails>

              <DescriptionTerm>{t('common.form.status')}</DescriptionTerm>
              <DescriptionDetails>
                {user.enabled ? (
                  <Badge color="lime">{t('common.enabled')}</Badge>
                ) : (
                  <Badge color="zinc">{t('common.disabled')}</Badge>
                )}
              </DescriptionDetails>
            </DescriptionList>
          </div>

          {/* Role & Permissions */}
          <div>
            <Subheading>{t('users.detail.rolePermissions')}</Subheading>
            <DescriptionList className="mt-4">
              <DescriptionTerm>{t('common.form.role')}</DescriptionTerm>
              <DescriptionDetails>
                {user.roles && user.roles.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {user.roles.map(role => (
                      <Badge key={role.id} color="sky">{role.name}</Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-zinc-500">-</span>
                )}
              </DescriptionDetails>

            </DescriptionList>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* System Information */}
          <div>
            <Subheading>{t('users.detail.systemInfo')}</Subheading>
            <DescriptionList className="mt-4">
              <DescriptionTerm>{t('users.detail.userId')}</DescriptionTerm>
              <DescriptionDetails>
                <code className="text-xs text-zinc-600 dark:text-zinc-400">
                  {user.id}
                </code>
              </DescriptionDetails>

              <DescriptionTerm>{t('users.detail.cognitoSub')}</DescriptionTerm>
              <DescriptionDetails>
                <code className="text-xs text-zinc-600 dark:text-zinc-400">
                  {user.cognitoSub}
                </code>
              </DescriptionDetails>

              <DescriptionTerm>{t('users.detail.created')}</DescriptionTerm>
              <DescriptionDetails>{formatDate(user.createdAt)}</DescriptionDetails>

              <DescriptionTerm>{t('users.detail.lastUpdated')}</DescriptionTerm>
              <DescriptionDetails>{formatDate(user.updatedAt)}</DescriptionDetails>
            </DescriptionList>
          </div>

          {/* Activity Section - Placeholder for future */}
          <div>
            <Subheading>{t('users.detail.recentActivity')}</Subheading>
            <div className="mt-4 rounded-lg bg-zinc-50 p-6 text-center dark:bg-zinc-900">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {t('users.detail.activityComingSoon')}
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                {t('users.detail.activityHelper')}
              </p>
            </div>
          </div>
        </div>

        {/* Capabilities Section - Collapsible, below main content */}
        <Divider className="my-8" />
        <div>
          <CapabilitiesSection capabilities={user.capabilities || []} />
        </div>

        {/* Future sections placeholder */}
        <Divider className="my-8" />

        <div className="grid gap-8">
          <div>
            <Subheading>{t('users.table.auditLog')}</Subheading>
            <div className="mt-4 rounded-lg bg-zinc-50 p-6 text-center dark:bg-zinc-900">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {t('users.detail.auditComingSoon')}
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                {t('users.detail.auditHelper')}
              </p>
            </div>
          </div>
        </div>
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
