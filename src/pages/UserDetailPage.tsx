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
import { Heading, Subheading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Badge } from '../components/catalyst/badge';
import { DescriptionList, DescriptionTerm, DescriptionDetails } from '../components/catalyst/description-list';
import { Divider } from '../components/catalyst/divider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/catalyst/table';
import { Text } from '../components/catalyst/text';

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

  const { data: allRegions } = useQuery({
    queryKey: ['dispatch-regions'],
    queryFn: () => dispatchRegionApi.getAll(true),
  });

  const { data: auditLog, isLoading: isAuditLoading } = useQuery({
    queryKey: ['audit-log', id],
    queryFn: () => userApi.getAuditLog(id!),
    enabled: !!id,
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

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatChanges = (changes: Record<string, string>) => {
    if (!changes || Object.keys(changes).length === 0) return '-';

    return Object.entries(changes).map(([field, change]) => (
      <div key={field} className="text-xs">
        <span className="font-medium">{field}:</span> {change}
      </div>
    ));
  };

  const getEventBadgeColor = (eventType: string): 'sky' | 'amber' | 'rose' | 'lime' => {
    switch (eventType) {
      case 'CREATED': return 'lime';
      case 'UPDATED': return 'sky';
      case 'DELETED': return 'rose';
      default: return 'amber';
    }
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
        <div className="grid gap-6 lg:grid-cols-[1fr,1.5fr]">
          {/* Left Column: User Info */}
          <div>
            {/* Role & Permissions - Compact */}
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

          {/* Right Column: Recent Activity (Audit Log) */}
          <div>
            <div className="flex items-center justify-between">
              <Subheading>{t('users.detail.recentActivity')}</Subheading>
              {auditLog && auditLog.length > 0 && (
                <Text className="text-xs text-zinc-500">
                  {auditLog.length} {auditLog.length === 1 ? 'entry' : 'entries'}
                </Text>
              )}
            </div>
            <div className="mt-2">
              {isAuditLoading ? (
                <div className="rounded-lg bg-zinc-50 p-4 text-center dark:bg-zinc-900">
                  <Text className="text-sm text-zinc-600 dark:text-zinc-400">
                    {t('common.actions.loading', { entities: 'activity' })}
                  </Text>
                </div>
              ) : !auditLog || auditLog.length === 0 ? (
                <div className="rounded-lg bg-zinc-50 p-4 text-center dark:bg-zinc-900">
                  <Text className="text-sm text-zinc-600 dark:text-zinc-400">
                    {t('users.detail.noActivityYet')}
                  </Text>
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-zinc-950/10 dark:border-white/10">
                  <div className="max-h-[600px] overflow-y-auto">
                    <Table dense className="[--gutter:theme(spacing.2)] text-sm">
                      <TableHead className="sticky top-0 z-10 bg-zinc-950/[2.5%] dark:bg-white/[2.5%]">
                        <TableRow>
                          <TableHeader>{t('users.detail.auditEvent')}</TableHeader>
                          <TableHeader>{t('users.detail.auditEntity')}</TableHeader>
                          <TableHeader>{t('users.detail.auditChanges')}</TableHeader>
                          <TableHeader>{t('users.detail.auditWhen')}</TableHeader>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {auditLog.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell>
                              <Badge color={getEventBadgeColor(entry.eventType)}>
                                {entry.eventType}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {entry.entityType}
                            </TableCell>
                            <TableCell className="max-w-md">
                              <div className="space-y-0.5">
                                {formatChanges(entry.changes)}
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-zinc-500">
                              {formatTimestamp(entry.timestamp)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Capabilities Section - Below main content so it doesn't push activity off screen */}
        <Divider className="my-4" />
        <div>
          <CapabilitiesSection capabilities={user.capabilities || []} />
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
