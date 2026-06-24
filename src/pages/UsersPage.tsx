import { useEffect, useState, useDeferredValue } from 'react';
import clsx from 'clsx';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon, UsersIcon } from '@heroicons/react/24/outline';
import IconButton from '../components/IconButton';
import { userApi, type User, type Role, type InvitationStatus } from '../api';
import { useHasCapability, useCurrentUser } from '../hooks/useCurrentUser';
import { PageHead } from '../components/ui/PageHead';
import { Button } from '../components/catalyst/button';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import ConfirmDialog from '../components/ConfirmDialog';
import { showError, showSuccess, extractApiError } from '../lib/toast';
import { Avatar } from '../components/ui/Avatar';
import { Pill } from '../components/ui/Pill';
import { RoleChip } from '../components/RoleChip';
import { Card, CardBody } from '../components/ui/Card';
import { DenseTable, DenseTHead, DenseRow, CellStack, CellTop, CellSub } from '../components/ui/DenseTable';
import { SortHeader, type SortDir, type SortState } from '../components/ui/SortHeader';
import { ListToolbar, ListSearch } from '../components/ui/ListToolbar';
import { ListFooter } from '../components/ui/ListFooter';
import { FilterChipListbox, ChipListboxOption } from '../components/ui/FilterChipListbox';
import { LoadingState } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';

// Desktop-dense CSR layout — see CLAUDE.md. Backend cap is 100; 50 keeps two
// pages visible on a 1080p monitor without scroll.
const PAGE_SIZE = 50;

// Seniority order — when a user has multiple roles, the higher-rank role
// shows first. Anything not in this map sorts after, alphabetically. Match
// against the role name case-insensitively so this survives backend casing
// drift (e.g. "Field Supervisor" vs "FIELD_SUPERVISOR").
const ROLE_SENIORITY = [
  'admin',
  'dispatcher',
  'field supervisor',
  'csr',
  'technician',
  'installer',
];

function roleRank(name: string): number {
  const key = name.toLowerCase().replace(/[_-]+/g, ' ').trim();
  const idx = ROLE_SENIORITY.indexOf(key);
  return idx === -1 ? ROLE_SENIORITY.length : idx;
}

function sortRolesBySeniority(roles: Role[]): Role[] {
  return [...roles].sort((a, b) => {
    const ra = roleRank(a.name);
    const rb = roleRank(b.name);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
}

type StatusValue = '' | 'enabled' | 'disabled';
type InvitationValue = '' | InvitationStatus;

const STATUS_VALUES: StatusValue[] = ['enabled', 'disabled'];
const INVITATION_VALUES: InvitationStatus[] = ['ACTIVE', 'INVITED', 'INVITATION_EXPIRED'];

function readStatus(raw: string | null): StatusValue {
  return STATUS_VALUES.includes(raw as StatusValue) ? (raw as StatusValue) : '';
}

function readInvitation(raw: string | null): InvitationValue {
  return INVITATION_VALUES.includes(raw as InvitationStatus) ? (raw as InvitationStatus) : '';
}

// Server-sortable columns (ALLOWED_USER_SORT_FIELDS: lastName, firstName,
// email, createdAt, status, enabled). Default lastName,asc — represented as
// "no sort param" so the BE applies its own default. Role is multi-valued and
// not server-sortable, so its column stays a plain header.
const DEFAULT_SORT: SortState = { key: 'lastName', dir: 'asc' };
const DESC_FIRST = new Set<string>(['createdAt']);

function parseSort(raw: string | null): SortState {
  if (raw) {
    const [key, dir] = raw.split(',');
    if (key) return { key, dir: dir === 'asc' ? 'asc' : 'desc' };
  }
  return DEFAULT_SORT;
}

export default function UsersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL-driven filter state (matches CustomersPage pattern). Page is 1-based
  // on the wire to humans; we translate to Spring's 0-based on the request.
  const urlSearch = searchParams.get('search') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const statusFilter = readStatus(searchParams.get('status'));
  const roleFilter = searchParams.get('role') ?? '';
  const invitationFilter = readInvitation(searchParams.get('invitation'));
  const sortParam = searchParams.get('sort');
  const currentSort = parseSort(sortParam);

  // Local input mirrors the URL but lets typing feel instant.
  const [searchQuery, setSearchQuery] = useState(urlSearch);
  useEffect(() => {
    setSearchQuery(urlSearch);
  }, [urlSearch]);
  const deferredSearch = useDeferredValue(searchQuery);

  const [pendingAction, setPendingAction] = useState<
    { kind: 'delete' | 'disable' | 'enable'; user: User } | null
  >(null);

  // Permission checks
  const canInviteUsers = useHasCapability('INVITE_USERS');
  const canEditUsers = useHasCapability('EDIT_USERS');
  const canDeleteUsers = useHasCapability('DELETE_USERS');
  const { data: currentUser } = useCurrentUser();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      'users',
      page,
      deferredSearch,
      statusFilter,
      roleFilter,
      invitationFilter,
      sortParam,
    ],
    queryFn: () =>
      userApi.searchUsers({
        page: page - 1,
        size: PAGE_SIZE,
        q: deferredSearch || undefined,
        enabled:
          statusFilter === 'enabled'
            ? true
            : statusFilter === 'disabled'
              ? false
              : undefined,
        roleId: roleFilter ? [roleFilter] : undefined,
        invitationStatus: invitationFilter ? [invitationFilter] : undefined,
        sort: sortParam || undefined,
      }),
  });

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => userApi.getRoles(),
  });

  const users = data?.content ?? [];
  const totalUsers = data?.totalElements ?? 0;
  const totalPages = data?.totalPages ?? 0;
  // Aggregates over the q/role-filtered set, ignoring status/invitation chips
  // so the subtitle breakdown stays meaningful when those filters aren't
  // active. Null on every page after the first envelope load is fine.
  const disabledCount = data?.counts?.disabled ?? 0;
  const invitedCount = data?.counts?.invited ?? 0;
  const showingStart = totalUsers === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingEnd = Math.min(page * PAGE_SIZE, totalUsers);

  // Update URL filters. `replace: true` for search keystrokes so the back
  // button doesn't step through every character.
  const updateFilters = (
    updates: {
      search?: string;
      status?: StatusValue;
      role?: string;
      invitation?: InvitationValue;
      page?: number;
    },
    options: { replace?: boolean } = {}
  ) => {
    const next = new URLSearchParams(searchParams);
    if (updates.search !== undefined) {
      if (updates.search) next.set('search', updates.search);
      else next.delete('search');
      next.delete('page');
    }
    if (updates.status !== undefined) {
      if (updates.status) next.set('status', updates.status);
      else next.delete('status');
      next.delete('page');
    }
    if (updates.role !== undefined) {
      if (updates.role) next.set('role', updates.role);
      else next.delete('role');
      next.delete('page');
    }
    if (updates.invitation !== undefined) {
      if (updates.invitation) next.set('invitation', updates.invitation);
      else next.delete('invitation');
      next.delete('page');
    }
    if (updates.page !== undefined) {
      if (updates.page <= 1) next.delete('page');
      else next.set('page', String(updates.page));
    }
    setSearchParams(next, { replace: options.replace ?? false });
  };

  const pageHref = (target: number): string => {
    const next = new URLSearchParams(searchParams);
    if (target <= 1) next.delete('page');
    else next.set('page', String(target));
    const qs = next.toString();
    return qs ? `?${qs}` : '?';
  };

  // Toggle dir when re-clicking the active column, else the column's default
  // dir. Resets to page 1. Writing the default (lastName,asc) back is harmless —
  // it equals the implicit default the BE applies when the param is absent.
  const onSort = (key: string) => {
    const dir: SortDir =
      key === currentSort.key
        ? currentSort.dir === 'asc'
          ? 'desc'
          : 'asc'
        : DESC_FIRST.has(key)
          ? 'desc'
          : 'asc';
    const next = new URLSearchParams(searchParams);
    next.set('sort', `${key},${dir}`);
    next.delete('page');
    setSearchParams(next, { replace: false });
  };

  const disableMutation = useMutation({
    mutationFn: (user: User) => userApi.disable(user.id),
    onSuccess: (_, user) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      showSuccess(`${user.firstName} ${user.lastName} disabled`);
    },
    onError: (err) => showError("Couldn't disable user", extractApiError(err)),
  });

  const enableMutation = useMutation({
    mutationFn: (user: User) => userApi.enable(user.id),
    onSuccess: (_, user) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      showSuccess(`${user.firstName} ${user.lastName} enabled`);
    },
    onError: (err) => showError("Couldn't enable user", extractApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (user: User) => userApi.delete(user.id),
    onSuccess: (_, user) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      showSuccess(`${user.firstName} ${user.lastName} deleted`);
    },
    onError: (err) => showError("Couldn't delete user", extractApiError(err)),
  });

  const handleAdd = () => {
    navigate('/settings/access/users/new');
  };

  const handleEdit = (user: User) => {
    navigate(`/settings/access/users/${user.id}/edit`);
  };

  const handleDisable = (user: User) => setPendingAction({ kind: 'disable', user });
  const handleEnable = (user: User) => setPendingAction({ kind: 'enable', user });
  const handleDelete = (user: User) => setPendingAction({ kind: 'delete', user });

  const hasFilters = Boolean(
    deferredSearch || roleFilter || statusFilter || invitationFilter
  );
  const clearFilters = () => {
    setSearchQuery('');
    setSearchParams(new URLSearchParams(), { replace: false });
  };

  const confirmPendingAction = () => {
    if (!pendingAction) return;
    if (pendingAction.kind === 'delete') deleteMutation.mutate(pendingAction.user);
    else if (pendingAction.kind === 'disable') disableMutation.mutate(pendingAction.user);
    else enableMutation.mutate(pendingAction.user);
  };

  const pendingName = pendingAction
    ? `${pendingAction.user.firstName} ${pendingAction.user.lastName}`
    : '';
  const confirmPending =
    deleteMutation.isPending ||
    disableMutation.isPending ||
    enableMutation.isPending;

  // Subtitle pieces. Use the server-provided totalElements (matches the full
  // filter set, not just the current page) and the q/role-scoped counts for
  // the breakdown pills.
  const userSubtitle = (() => {
    if (totalUsers === 0) return null;
    const parts: string[] = [];
    const noun =
      totalUsers === 1
        ? t('entities.user').toLowerCase()
        : t('entities.users').toLowerCase();
    parts.push(`${totalUsers.toLocaleString()} ${noun}`);
    if (disabledCount > 0) {
      parts.push(t('users.breakdown.disabled', { count: disabledCount }));
    }
    if (invitedCount > 0) {
      parts.push(t('users.breakdown.invited', { count: invitedCount }));
    }
    return parts.join(' · ');
  })();

  const invitationLabel = (status: InvitationStatus): string => {
    switch (status) {
      case 'ACTIVE':
        return t('users.filter.invitationActive');
      case 'INVITED':
        return t('users.filter.invitationInvited');
      case 'INVITATION_EXPIRED':
        return t('users.filter.invitationExpired');
    }
  };

  // We can only confidently say "no users" when there are *no* filters
  // applied. With filters, render the no-matches empty state instead.
  const showEmpty = !isLoading && !error && users.length === 0;

  return (
    <>
      <PageHead
        title={t('entities.users')}
        sub={userSubtitle}
        actions={
          canInviteUsers ? (
            <Button color="accent" size="xs" onClick={handleAdd}>{t('common.actions.add', { entity: t('entities.user') })}</Button>
          ) : null
        }
      />

      <ListToolbar
        search={
          <ListSearch
            placeholder={t('users.search.placeholder')}
            value={searchQuery}
            onChange={(value) => {
              setSearchQuery(value);
              updateFilters({ search: value }, { replace: true });
            }}
          />
        }
      >
        {roles && roles.length > 0 && (
          <FilterChipListbox
            label={t('users.filter.role')}
            ariaLabel={t('users.filter.role')}
            value={roleFilter || null}
            displayValue={roleFilter ? roles.find((r) => r.id === roleFilter)?.name ?? null : null}
            resetLabel={t('users.filter.allRoles')}
            onChange={(id) => updateFilters({ role: id ?? '' })}
            onClear={() => updateFilters({ role: '' })}
          >
            {roles.map((role) => (
              <ChipListboxOption key={role.id} value={role.id}>{role.name}</ChipListboxOption>
            ))}
          </FilterChipListbox>
        )}

        <FilterChipListbox
          label={t('users.filter.status')}
          ariaLabel={t('users.filter.status')}
          value={statusFilter || null}
          displayValue={statusFilter ? t(`users.filter.${statusFilter}`) : null}
          resetLabel={t('users.filter.all')}
          onChange={(id) => updateFilters({ status: readStatus(id) })}
          onClear={() => updateFilters({ status: '' })}
        >
          <ChipListboxOption value="enabled">{t('users.filter.enabled')}</ChipListboxOption>
          <ChipListboxOption value="disabled">{t('users.filter.disabled')}</ChipListboxOption>
        </FilterChipListbox>

        <FilterChipListbox
          label={t('users.filter.invitationStatus')}
          ariaLabel={t('users.filter.invitationStatus')}
          value={invitationFilter || null}
          displayValue={invitationFilter ? invitationLabel(invitationFilter) : null}
          resetLabel={t('users.filter.allInvitationStatuses')}
          onChange={(id) => updateFilters({ invitation: readInvitation(id) })}
          onClear={() => updateFilters({ invitation: '' })}
        >
          {INVITATION_VALUES.map((value) => (
            <ChipListboxOption key={value} value={value}>
              {invitationLabel(value)}
            </ChipListboxOption>
          ))}
        </FilterChipListbox>
      </ListToolbar>

      <div className="mt-4">
        <Card>
          <CardBody flush>
            {isLoading ? (
              <LoadingState
                label={t('common.actions.loading', { entities: t('entities.users') })}
              />
            ) : error ? (
              <ErrorState
                title={t('common.actions.couldNotLoad', { entities: t('entities.users') })}
                description={extractApiError(error) ?? (error as Error).message}
                action={
                  <Button outline onClick={() => refetch()}>
                    {t('common.actions.tryAgain')}
                  </Button>
                }
              />
            ) : showEmpty ? (
              hasFilters ? (
                <EmptyState
                  icon={<UsersIcon className="size-10 text-fg-dim" />}
                  title={t('common.actions.noMatchFilters', { entities: t('entities.users') })}
                  description={t('common.actions.tryAdjustingFilters')}
                  action={
                    <Button outline onClick={clearFilters}>
                      {t('users.filter.clearFilters')}
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={<UsersIcon className="size-10 text-fg-dim" />}
                  title={t('common.actions.noEntitiesYet', { entities: t('entities.users') })}
                  description={t('users.empty.noUsersDescription')}
                  action={
                    canInviteUsers ? (
                      <Button color="accent" onClick={handleAdd}>
                        {t('common.actions.add', { entity: t('entities.user') })}
                      </Button>
                    ) : undefined
                  }
                />
              )
            ) : (
              <>
                <DenseTable>
                <DenseTHead>
                  <tr>
                    <SortHeader sortKey="lastName" label={t('common.form.name')} current={currentSort} onSort={onSort} />
                    <th>{t('common.form.role')}</th>
                    <SortHeader sortKey="enabled" label={t('common.form.status')} current={currentSort} onSort={onSort} />
                    <th style={{ width: 40 }}></th>
                  </tr>
                </DenseTHead>
                <tbody>
                  {users.map((user) => {
                    const fullName = `${user.firstName} ${user.lastName}`;
                    const isMe = currentUser?.id === user.id;
                    const rowOpacity = !user.enabled ? 'opacity-55' : '';
                    return (
                      <DenseRow
                        key={user.id}
                        onClick={(e: React.MouseEvent) => {
                          const target = e.target as HTMLElement;
                          if (!target.closest('[role="menu"]') && !target.closest('button[aria-label]')) {
                            navigate(`/settings/access/users/${user.id}`);
                          }
                        }}
                        className={`cursor-pointer ${rowOpacity}`}
                      >
                        <td>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={fullName} src={user.photoUrl ?? undefined} size="sm" />
                            <CellStack>
                              <CellTop>
                                {fullName}
                                {isMe && (
                                  <span className="ml-1.5 inline-flex items-center rounded bg-bg-active px-1 py-[1px] align-middle text-[9px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                                    {t('users.table.you')}
                                  </span>
                                )}
                              </CellTop>
                              <CellSub>{user.email}</CellSub>
                            </CellStack>
                          </div>
                        </td>
                        <td
                          className={clsx(!(user.roles && user.roles.length > 0) && 'dt-empty')}
                          data-label={t('common.form.role')}
                        >
                          {user.roles && user.roles.length > 0 ? (
                            (() => {
                              const ordered = sortRolesBySeniority(user.roles);
                              const visible = ordered.slice(0, 2);
                              const overflow = ordered.slice(2);
                              return (
                                <div className="flex flex-wrap gap-1">
                                  {visible.map((role) => (
                                    <RoleChip
                                      key={role.id}
                                      name={role.name}
                                      accentId={role.accentId}
                                    />
                                  ))}
                                  {overflow.length > 0 && (
                                    <span title={overflow.map((r) => r.name).join(', ')}>
                                      <Pill tone="neutral">+{overflow.length}</Pill>
                                    </span>
                                  )}
                                </div>
                              );
                            })()
                          ) : (
                            <span className="text-fg-dim">—</span>
                          )}
                        </td>
                        <td>
                          {user.enabled ? (
                            <Pill tone="success" dot live>{t('common.active')}</Pill>
                          ) : (
                            <Pill tone="neutral" dot>{t('common.disabled')}</Pill>
                          )}
                        </td>
                        <td className="right">
                          {(canEditUsers || canDeleteUsers) && (
                            <div onClick={(e) => e.stopPropagation()}>
                              <Dropdown>
                                <DropdownButton as={IconButton} aria-label={t('common.moreOptions')}>
                                  <EllipsisVerticalIcon className="size-4" />
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
                        </td>
                      </DenseRow>
                    );
                  })}
                </tbody>
              </DenseTable>
                <ListFooter
                  page={page}
                  totalPages={totalPages}
                  pageHref={pageHref}
                  left={t('common.pagination.showing', {
                    start: showingStart,
                    end: showingEnd,
                    total: totalUsers.toLocaleString(),
                  })}
                />
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <ConfirmDialog
        isOpen={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        onConfirm={confirmPendingAction}
        title={
          pendingAction?.kind === 'delete'
            ? t('common.actions.deleteConfirm', { name: pendingName })
            : pendingAction?.kind === 'disable'
              ? t('users.actions.disableConfirm', { name: pendingName })
              : t('users.actions.enableConfirm', { name: pendingName })
        }
        message={
          pendingAction?.kind === 'delete'
            ? t('users.actions.deleteWarning')
            : pendingAction?.kind === 'disable'
              ? t('users.actions.disableWarning')
              : t('users.actions.enableWarning')
        }
        confirmLabel={
          pendingAction?.kind === 'delete'
            ? confirmPending
              ? t('common.deleting')
              : t('common.delete')
            : pendingAction?.kind === 'disable'
              ? t('users.table.disable')
              : t('users.table.enable')
        }
        isDestructive={pendingAction?.kind !== 'enable'}
        isPending={confirmPending}
      />
    </>
  );
}
