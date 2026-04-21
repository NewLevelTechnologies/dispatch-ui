import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import { userApi, type User } from '../api';
import { useHasCapability } from '../hooks/useCurrentUser';
import AppLayout from '../components/AppLayout';
import UserFormDialog from '../components/UserFormDialog';
import { PageHeader, StatusBadge, Toolbar, DataTable, type DataTableColumn } from '../components/shell';
import { Button } from '../components/catalyst/button';
import { Badge } from '../components/catalyst/badge';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import { Alert, AlertActions, AlertDescription, AlertTitle } from '../components/catalyst/alert';

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  const canInviteUsers = useHasCapability('INVITE_USERS');
  const canEditUsers = useHasCapability('EDIT_USERS');
  const canDeleteUsers = useHasCapability('DELETE_USERS');

  const { data: users, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: () => userApi.getAll(),
  });

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => userApi.getRoles(),
  });

  const disableMutation = useMutation({
    mutationFn: (id: string) => userApi.disable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const enableMutation = useMutation({
    mutationFn: (id: string) => userApi.enable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => userApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsDeleteAlertOpen(false);
      setUserToDelete(null);
    },
  });

  const handleAdd = () => {
    setSelectedUser(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setIsDialogOpen(true);
  };

  const handleDisable = (user: User) => {
    const message = t('users.actions.disableConfirm', { name: `${user.firstName} ${user.lastName}` });
    if (window.confirm(message)) {
      disableMutation.mutate(user.id);
    }
  };

  const handleEnable = (user: User) => {
    const message = t('users.actions.enableConfirm', { name: `${user.firstName} ${user.lastName}` });
    if (window.confirm(message)) {
      enableMutation.mutate(user.id);
    }
  };

  const handleDelete = (user: User) => {
    setUserToDelete(user);
    setIsDeleteAlertOpen(true);
  };

  const confirmDelete = () => {
    if (userToDelete) {
      deleteMutation.mutate(userToDelete.id);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedUser(null);
  };

  const safeUsers = useMemo(() => users ?? [], [users]);

  const filteredUsers = useMemo(() => {
    return safeUsers.filter((user) => {
      const query = searchQuery.toLowerCase();
      const roleNames = user.roles?.map(r => r.name.toLowerCase()).join(' ') || '';
      const matchesSearch = !query || (
        user.firstName.toLowerCase().includes(query) ||
        user.lastName.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        roleNames.includes(query)
      );

      const matchesRole = !roleFilter || user.roles?.some(r => r.id === roleFilter);

      const matchesStatus = !statusFilter || (
        (statusFilter === 'enabled' && user.enabled) ||
        (statusFilter === 'disabled' && !user.enabled)
      );

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [safeUsers, searchQuery, roleFilter, statusFilter]);

  const clearFilters = () => {
    setRoleFilter('');
    setStatusFilter('');
  };

  const hasActiveFilters = roleFilter || statusFilter;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const columns: DataTableColumn<User>[] = [
    {
      key: 'name',
      header: t('common.form.name'),
      cellClassName: 'font-medium',
      cell: (user) => `${user.firstName} ${user.lastName}`,
    },
    {
      key: 'email',
      header: t('common.form.email'),
      cellClassName: 'text-zinc-500',
      cell: (user) => user.email,
    },
    {
      key: 'role',
      header: t('common.form.role'),
      cellClassName: 'text-zinc-500',
      cell: (user) =>
        user.roles && user.roles.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {user.roles.map(role => (
              <Badge key={role.id} color="sky">{role.name}</Badge>
            ))}
          </div>
        ) : (
          <span className="text-zinc-500">-</span>
        ),
    },
    {
      key: 'status',
      header: t('common.form.status'),
      cell: (user) => (
        <StatusBadge
          status={user.enabled ? 'enabled' : 'disabled'}
          label={user.enabled ? t('common.enabled') : t('common.disabled')}
        />
      ),
    },
    {
      key: 'lastUpdated',
      header: t('users.table.lastUpdated'),
      cellClassName: 'text-zinc-500',
      cell: (user) => formatDate(user.updatedAt),
    },
    {
      key: 'actions',
      header: '',
      cell: (user) =>
        (canEditUsers || canDeleteUsers) && (
          <div className="-mx-3 -my-1.5 sm:-mx-2.5">
            <Dropdown>
              <DropdownButton plain aria-label={t('common.moreOptions')}>
                <EllipsisVerticalIcon className="size-5" />
              </DropdownButton>
              <DropdownMenu anchor="bottom end">
                {canEditUsers && (
                  <>
                    <DropdownItem onClick={() => handleEdit(user)}>
                      <DropdownLabel>{t('common.edit')}</DropdownLabel>
                    </DropdownItem>
                    {user.enabled ? (
                      <DropdownItem onClick={() => handleDisable(user)}>
                        <DropdownLabel>{t('users.table.disable')}</DropdownLabel>
                      </DropdownItem>
                    ) : (
                      <DropdownItem onClick={() => handleEnable(user)}>
                        <DropdownLabel>{t('users.table.enable')}</DropdownLabel>
                      </DropdownItem>
                    )}
                  </>
                )}
                {canDeleteUsers && (
                  <DropdownItem onClick={() => handleDelete(user)}>
                    <DropdownLabel>{t('common.delete')}</DropdownLabel>
                  </DropdownItem>
                )}
              </DropdownMenu>
            </Dropdown>
          </div>
        ),
    },
  ];

  return (
    <AppLayout>
      <PageHeader
        title={t('entities.users')}
        subtitle={t('users.description')}
        actions={canInviteUsers && (
          <Button color="accent" onClick={handleAdd}>
            {t('common.actions.add', { entity: t('entities.user') })}
          </Button>
        )}
      />

      <Toolbar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={t('users.search.placeholder')}
        filters={
          <>
            <Dropdown>
              <DropdownButton outline>
                {t('users.filter.role')}: {roleFilter ? roles?.find(r => r.id === roleFilter)?.name : t('users.filter.allRoles')}
              </DropdownButton>
              <DropdownMenu>
                <DropdownItem onClick={() => setRoleFilter('')}>
                  <DropdownLabel>{t('users.filter.allRoles')}</DropdownLabel>
                </DropdownItem>
                {roles?.map(role => (
                  <DropdownItem key={role.id} onClick={() => setRoleFilter(role.id)}>
                    <DropdownLabel>{role.name}</DropdownLabel>
                  </DropdownItem>
                ))}
              </DropdownMenu>
            </Dropdown>

            <Dropdown>
              <DropdownButton outline>
                {t('users.filter.status')}: {statusFilter ? t(`users.filter.${statusFilter}`) : t('users.filter.all')}
              </DropdownButton>
              <DropdownMenu>
                <DropdownItem onClick={() => setStatusFilter('')}>
                  <DropdownLabel>{t('users.filter.all')}</DropdownLabel>
                </DropdownItem>
                <DropdownItem onClick={() => setStatusFilter('enabled')}>
                  <DropdownLabel>{t('users.filter.enabled')}</DropdownLabel>
                </DropdownItem>
                <DropdownItem onClick={() => setStatusFilter('disabled')}>
                  <DropdownLabel>{t('users.filter.disabled')}</DropdownLabel>
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>

            {hasActiveFilters && (
              <Button plain onClick={clearFilters}>
                {t('users.filter.clearFilters')}
              </Button>
            )}
          </>
        }
        rowCount={
          safeUsers.length > 0
            ? filteredUsers.length === safeUsers.length
              ? `${safeUsers.length} ${safeUsers.length === 1 ? t('entities.user').toLowerCase() : t('entities.users').toLowerCase()}`
              : `${filteredUsers.length} of ${safeUsers.length}`
            : undefined
        }
      />

      {error && (
        <div className="rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-400">
            {t('common.actions.errorLoading', { entities: t('entities.users') })}: {(error as Error).message}
          </p>
        </div>
      )}

      {safeUsers.length === 0 && !isLoading ? (
        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t('common.actions.notFound', { entities: t('entities.users') })}
          </p>
          {canInviteUsers && (
            <Button className="mt-4" onClick={handleAdd}>
              {t('common.actions.addFirst', { entity: t('entities.user') })}
            </Button>
          )}
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filteredUsers}
          isLoading={isLoading}
          getRowKey={(user) => user.id}
          getRowHref={(user) => `/users/${user.id}`}
          getRowClassName={() => 'cursor-pointer'}
          emptyState={
            searchQuery
              ? t('users.search.noMatch', { query: searchQuery })
              : t('common.actions.noMatchSearch', { entities: t('entities.users') })
          }
        />
      )}

      <UserFormDialog
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
        user={selectedUser}
        roles={roles || []}
      />

      <Alert open={isDeleteAlertOpen} onClose={() => setIsDeleteAlertOpen(false)}>
        <AlertTitle>{t('common.actions.deleteConfirm', { name: userToDelete ? `${userToDelete.firstName} ${userToDelete.lastName}` : '' })}</AlertTitle>
        <AlertDescription>
          {t('users.actions.deleteWarning')}
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
    </AppLayout>
  );
}
