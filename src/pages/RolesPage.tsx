import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon, ShieldCheckIcon, ArrowPathIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { userApi, type Role, type RestoreAllDefaultsResponse } from '../api';
import { useHasCapability } from '../hooks/useCurrentUser';
import AppLayout from '../components/AppLayout';
import RoleFormDialog from '../components/RoleFormDialog';
import { Heading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Input, InputGroup } from '../components/catalyst/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/catalyst/table';
import { Badge } from '../components/catalyst/badge';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import { Alert, AlertActions, AlertDescription, AlertTitle } from '../components/catalyst/alert';

export default function RolesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  const [isRestoreAllAlertOpen, setIsRestoreAllAlertOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Permission checks
  const canCreateRoles = useHasCapability('CREATE_ROLES');
  const canEditRoles = useHasCapability('EDIT_ROLES');
  const canDeleteRoles = useHasCapability('DELETE_ROLES');

  const { data: roles, isLoading, error } = useQuery({
    queryKey: ['roles'],
    queryFn: () => userApi.getRoles(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => userApi.deleteRole(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setIsDeleteAlertOpen(false);
      setRoleToDelete(null);
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || 'Failed to delete role');
    },
  });

  const restoreAllMutation = useMutation({
    mutationFn: () => userApi.restoreAllDefaults(),
    onSuccess: (result: RestoreAllDefaultsResponse) => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setIsRestoreAllAlertOpen(false);

      const restoredCount = result.restoredRoles.length;
      const recreatedCount = result.recreatedRoles.length;
      const preservedCount = result.preservedCustomRoles.length;

      const messages: string[] = [];
      if (restoredCount > 0) {
        messages.push(t('roles.restoreAllSummary.rolesReset', { count: restoredCount }));
      }
      if (recreatedCount > 0) {
        messages.push(t('roles.restoreAllSummary.rolesRecreated', { count: recreatedCount }));
      }
      if (preservedCount > 0) {
        messages.push(t('roles.restoreAllSummary.customRolesPreserved', { count: preservedCount }));
      }

      const summary = [
        t('roles.actions.restoreAllDefaultsSuccess'),
        '',
        ...messages,
        '',
        t('roles.restoreAllSummary.userAssignmentsPreserved')
      ].join('\n');

      alert(summary);
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('roles.actions.errorRestoreAll'));
    },
  });

  const handleAdd = () => {
    setSelectedRole(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (role: Role) => {
    setSelectedRole(role);
    setIsDialogOpen(true);
  };

  const handleDelete = (role: Role) => {
    setRoleToDelete(role);
    setIsDeleteAlertOpen(true);
  };

  const confirmDelete = () => {
    if (roleToDelete) {
      deleteMutation.mutate(roleToDelete.id);
    }
  };

  const handleRestoreAllDefaults = () => {
    setIsRestoreAllAlertOpen(true);
  };

  const confirmRestoreAll = () => {
    restoreAllMutation.mutate();
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedRole(null);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Filter roles based on search query
  const filteredRoles = useMemo(() => {
    if (!roles) return [];
    if (!searchQuery.trim()) return roles;

    const query = searchQuery.toLowerCase();
    return roles.filter(
      (role) =>
        role.name.toLowerCase().includes(query) ||
        role.description?.toLowerCase().includes(query)
    );
  }, [roles, searchQuery]);

  return (
    <AppLayout>
      <div className="flex items-center justify-between">
        <div>
          <Heading>{t('entities.roles')}</Heading>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {t('roles.description')}
          </p>
        </div>
        {(canCreateRoles || canEditRoles) && (
          <div className="flex gap-2">
            {canEditRoles && (
              <Button plain onClick={handleRestoreAllDefaults}>
                <ArrowPathIcon className="size-4" />
                {t('roles.actions.restoreAllDefaults')}
              </Button>
            )}
            {canCreateRoles && (
              <Button onClick={handleAdd}>
                <ShieldCheckIcon className="size-4" />
                {t('common.actions.add', { entity: t('entities.role') })}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Quick Search Bar */}
      <div className="mt-2 flex items-center gap-4">
        <InputGroup className="flex-1 max-w-md">
          <MagnifyingGlassIcon data-slot="icon" />
          <Input
            type="text"
            placeholder={t('common.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </InputGroup>
        {roles && roles.length > 0 && (
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            {filteredRoles.length === roles.length
              ? `${roles.length} ${roles.length === 1 ? t('entities.role').toLowerCase() : t('entities.roles').toLowerCase()}`
              : `${filteredRoles.length} of ${roles.length}`}
          </div>
        )}
      </div>

      {isLoading && (
        <div className="mt-4 text-center">
          <p className="text-zinc-600 dark:text-zinc-400">
            {t('common.actions.loading', { entities: t('entities.roles') })}
          </p>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-400">
            {t('common.actions.errorLoading', { entities: t('entities.roles') })}: {(error as Error).message}
          </p>
        </div>
      )}

      {roles && roles.length === 0 && (
        <div className="mt-4 text-center">
          <p className="text-zinc-600 dark:text-zinc-400">
            {t('common.actions.notFound', { entities: t('entities.roles') })}
          </p>
          {canCreateRoles && (
            <Button className="mt-4" onClick={handleAdd}>
              {t('common.actions.addFirst', { entity: t('entities.role') })}
            </Button>
          )}
        </div>
      )}

      {roles && roles.length > 0 && filteredRoles.length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t('common.actions.noMatchSearch', { entities: t('entities.roles') })}
          </p>
        </div>
      )}

      {roles && roles.length > 0 && filteredRoles.length > 0 && (
        <div className="mt-4">
          <Table dense className="[--gutter:theme(spacing.1)] text-sm">
            <TableHead>
              <TableRow>
                <TableHeader>{t('common.form.name')}</TableHeader>
                <TableHeader>{t('common.form.description')}</TableHeader>
                <TableHeader>{t('roles.table.capabilities')}</TableHeader>
                <TableHeader>{t('roles.table.lastUpdated')}</TableHeader>
                <TableHeader></TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRoles.map((role) => (
                <TableRow
                  key={role.id}
                  href={`/roles/${role.id}`}
                  onClick={(e: React.MouseEvent) => {
                    const target = e.target as HTMLElement;
                    if (!target.closest('[role="menu"]') && !target.closest('button[aria-label]')) {
                      navigate(`/roles/${role.id}`);
                    }
                  }}
                  className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                >
                  <TableCell className="font-medium">{role.name}</TableCell>
                  <TableCell className="text-zinc-500">
                    {role.description || '-'}
                  </TableCell>
                  <TableCell>
                    {role.capabilities && role.capabilities.length > 0 ? (
                      <Badge color="purple">{role.capabilities.length} {t('capabilities.totalCount')}</Badge>
                    ) : (
                      <span className="text-zinc-500">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {formatDate(role.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <div className="-mx-3 -my-1.5 sm:-mx-2.5" onClick={(e) => e.stopPropagation()}>
                      <Dropdown>
                        <DropdownButton plain aria-label={t('common.moreOptions')}>
                          <EllipsisVerticalIcon className="size-5" />
                        </DropdownButton>
                        <DropdownMenu anchor="bottom end">
                          {canEditRoles && !role.isProtected && (
                            <DropdownItem onClick={() => handleEdit(role)}>
                              <DropdownLabel>{t('common.edit')}</DropdownLabel>
                            </DropdownItem>
                          )}
                          <DropdownItem onClick={() => navigate(`/roles/${role.id}`)}>
                            <DropdownLabel>{t('common.view')}</DropdownLabel>
                          </DropdownItem>
                          {canDeleteRoles && !role.isProtected && (
                            <DropdownItem onClick={() => handleDelete(role)}>
                              <DropdownLabel>{t('common.delete')}</DropdownLabel>
                            </DropdownItem>
                          )}
                        </DropdownMenu>
                      </Dropdown>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <RoleFormDialog
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
        role={selectedRole}
      />

      <Alert open={isDeleteAlertOpen} onClose={() => setIsDeleteAlertOpen(false)}>
        <AlertTitle>
          {t('common.actions.deleteConfirm', { name: roleToDelete?.name || '' })}
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

      <Alert open={isRestoreAllAlertOpen} onClose={() => setIsRestoreAllAlertOpen(false)}>
        <AlertTitle>
          {t('roles.actions.restoreAllDefaultsConfirm')}
        </AlertTitle>
        <AlertDescription>
          {t('roles.actions.restoreAllDefaultsDescription', {
            count: 6
          })}
          {' '}
          {t('roles.actions.restoreAllDefaultsDetails')}
          {' '}
          {t('roles.actions.restoreAllDefaultsWarning')}
        </AlertDescription>
        <AlertActions>
          <Button plain onClick={() => setIsRestoreAllAlertOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={confirmRestoreAll} disabled={restoreAllMutation.isPending}>
            {restoreAllMutation.isPending ? t('common.restoring') : t('roles.actions.restoreAllDefaults')}
          </Button>
        </AlertActions>
      </Alert>
    </AppLayout>
  );
}
