import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { userApi, type User } from '../api';
import { useHasCapability } from '../hooks/useCurrentUser';
import AppLayout from '../components/AppLayout';
import UserFormDialog from '../components/UserFormDialog';
import { Heading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/catalyst/table';
import { Badge } from '../components/catalyst/badge';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import { Input } from '../components/catalyst/input';
import { Alert, AlertActions, AlertDescription, AlertTitle } from '../components/catalyst/alert';

export default function UsersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // Permission checks
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

  // Filter users based on search query, role, and status
  const filteredUsers = users?.filter((user) => {
    // Search filter
    const query = searchQuery.toLowerCase();
    const roleNames = user.roles?.map(r => r.name.toLowerCase()).join(' ') || '';
    const matchesSearch = !query || (
      user.firstName.toLowerCase().includes(query) ||
      user.lastName.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      roleNames.includes(query)
    );

    // Role filter
    const matchesRole = !roleFilter || user.roles?.some(r => r.id === roleFilter);

    // Status filter
    const matchesStatus = !statusFilter || (
      (statusFilter === 'enabled' && user.enabled) ||
      (statusFilter === 'disabled' && !user.enabled)
    );

    return matchesSearch && matchesRole && matchesStatus;
  });

  // Clear all filters
  const clearFilters = () => {
    setRoleFilter('');
    setStatusFilter('');
  };

  // Check if any filters are active
  const hasActiveFilters = roleFilter || statusFilter;

  // Format date helper
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-between">
        <div>
          <Heading>{t('entities.users')}</Heading>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {t('users.description')}
          </p>
        </div>
        {canInviteUsers && (
          <Button onClick={handleAdd}>{t('common.actions.add', { entity: t('entities.user') })}</Button>
        )}
      </div>

      {/* Search Bar and Filters */}
      {users && users.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[250px]">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-zinc-500" />
            <Input
              type="search"
              placeholder={t('users.search.placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Filters */}
          <div className="flex gap-2 items-center flex-shrink-0">
            {/* Role Filter */}
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

            {/* Status Filter */}
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

            {/* Clear Filters */}
            {hasActiveFilters && (
              <Button plain onClick={clearFilters}>
                {t('users.filter.clearFilters')}
              </Button>
            )}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="mt-4 text-center">
          <p className="text-zinc-600 dark:text-zinc-400">{t('common.actions.loading', { entities: t('entities.users') })}</p>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-400">
            {t('common.actions.errorLoading', { entities: t('entities.users') })}: {(error as Error).message}
          </p>
        </div>
      )}

      {users && users.length === 0 && (
        <div className="mt-4 text-center">
          <p className="text-zinc-600 dark:text-zinc-400">{t('common.actions.notFound', { entities: t('entities.users') })}</p>
          {canInviteUsers && (
            <Button className="mt-4" onClick={handleAdd}>
              {t('common.actions.addFirst', { entity: t('entities.user') })}
            </Button>
          )}
        </div>
      )}

      {filteredUsers && filteredUsers.length > 0 && (
        <div className="mt-4">
          <Table dense className="[--gutter:theme(spacing.1)] text-sm">
            <TableHead>
              <TableRow>
                <TableHeader>{t('common.form.name')}</TableHeader>
                <TableHeader>{t('common.form.email')}</TableHeader>
                <TableHeader>{t('common.form.role')}</TableHeader>
                <TableHeader>{t('common.form.status')}</TableHeader>
                <TableHeader>{t('users.table.lastUpdated')}</TableHeader>
                <TableHeader></TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow
                  key={user.id}
                  href={`/users/${user.id}`}
                  onClick={(e: React.MouseEvent) => {
                    // Only navigate if not clicking dropdown or its children
                    const target = e.target as HTMLElement;
                    if (!target.closest('[role="menu"]') && !target.closest('button[aria-label]')) {
                      navigate(`/users/${user.id}`);
                    }
                  }}
                  className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                >
                  <TableCell className="font-medium">
                    {user.firstName} {user.lastName}
                  </TableCell>
                  <TableCell className="text-zinc-500">{user.email}</TableCell>
                  <TableCell className="text-zinc-500">
                    {user.roles && user.roles.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map(role => (
                          <Badge key={role.id} color="sky">{role.name}</Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-zinc-500">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.enabled ? (
                      <Badge color="lime">{t('common.enabled')}</Badge>
                    ) : (
                      <Badge color="zinc">{t('common.disabled')}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-zinc-500">{formatDate(user.updatedAt)}</TableCell>
                  <TableCell>
                    {(canEditUsers || canDeleteUsers) && (
                      <div className="-mx-3 -my-1.5 sm:-mx-2.5" onClick={(e) => e.stopPropagation()}>
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
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredUsers.length === 0 && searchQuery && (
            <div className="mt-4 text-center">
              <p className="text-zinc-600 dark:text-zinc-400">
                {t('users.search.noMatch', { query: searchQuery })}
              </p>
            </div>
          )}
        </div>
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
