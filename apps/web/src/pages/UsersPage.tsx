import { useEffect, useState, useDeferredValue } from 'react';
import clsx from 'clsx';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { EllipsisVerticalIcon, UsersIcon } from '@heroicons/react/24/outline';
import IconButton from '../components/IconButton';
import { userApi, tenantSettingsApi, type User, type Role, type InvitationStatus } from '../api/setup';
import { Callout } from '../components/ui/Callout';
import { useHasCapability, useCurrentUser } from '../hooks/useCurrentUser';
import { PageHead } from '../components/ui/PageHead';
import { Button } from '../components/catalyst/button';
import { Dropdown, DropdownButton, DropdownDivider, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import ConfirmDialog from '../components/ConfirmDialog';
import RemovalGuardDialog, { type RemovalGuard } from '../components/users/RemovalGuardDialog';
import { showError, showSuccess, showUndo, extractApiError, errorCode, isConflict } from '../lib/toast';
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

// Membership status in THIS workspace, not account status. A removed member is
// a deactivated membership: the row is kept so the admin gets confirmation and
// an undo, the same way this app treats deactivated customers, locations and
// equipment. Defaults to `active` — removed people are history, and an admin
// opening this page is doing today's work.
type StatusValue = 'active' | 'removed' | 'all';
type InvitationValue = '' | InvitationStatus;

const STATUS_VALUES: StatusValue[] = ['active', 'removed', 'all'];
const DEFAULT_STATUS: StatusValue = 'active';
const INVITATION_VALUES: InvitationStatus[] = ['ACTIVE', 'INVITED', 'INVITATION_EXPIRED'];

function readStatus(raw: string | null): StatusValue {
  return STATUS_VALUES.includes(raw as StatusValue) ? (raw as StatusValue) : DEFAULT_STATUS;
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
  // Which removal the backend refused, if any. Set from the 409's `code`.
  const [guard, setGuard] = useState<RemovalGuard | null>(null);
  // The row the refusal came from, so "Change roles" lands on the right person.
  const [guardUser, setGuardUser] = useState<User | null>(null);

  // Permission checks
  const canInviteUsers = useHasCapability('INVITE_USERS');
  const canEditUsers = useHasCapability('EDIT_USERS');
  const canDeleteUsers = useHasCapability('DELETE_USERS');
  const { data: currentUser } = useCurrentUser();

  // Names the workspace in the remove-access dialog. Shared cache key with
  // App.tsx, so no extra request; generic fallback rather than a blank.
  const { data: tenantSettings } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.getSettings(),
  });
  const workspaceName = tenantSettings?.companyName || 'this workspace';

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
        // `?enabled=true` / `false`, omitted for `all` — no backend work needed
        // for the Active default (FE_HANDOFF_workspace_user_removal §4).
        enabled:
          statusFilter === 'active'
            ? true
            : statusFilter === 'removed'
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

  // "View administrators" target. A tenant can also grant user management via a
  // custom role, but finding those needs a per-role capability fetch — the
  // system ADMIN role is the one worth linking (FE_HANDOFF §4). Undefined when
  // there's no such role, and the dialog then drops the button rather than
  // navigating nowhere.
  const adminRoleId = roles?.find((r) => r.systemRoleCode === 'ADMIN')?.id;

  const users = data?.content ?? [];
  const totalUsers = data?.totalElements ?? 0;
  const totalPages = data?.totalPages ?? 0;
  // Aggregates over the q/role-filtered set only — the status and invitation
  // chips deliberately don't shrink them. So this still reports removed members
  // while the Active default is filtering them out of the rows, which is
  // exactly the hint that the All filter has something to show. Null on every
  // page after the first envelope load is fine.
  const removedCount = data?.counts?.disabled ?? 0;
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
      // `active` is the default view, so it stays out of the URL — a clean
      // /users link and the default state are the same thing.
      if (updates.status !== DEFAULT_STATUS) next.set('status', updates.status);
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

  // Both removal routes answer 409 for two different refusals, told apart by
  // `code`: SELF_REMOVAL and LAST_USER_MANAGER. Each gets its own dialog naming
  // the resolution — a refusal in a red error toast tells an admin they failed
  // without telling them what to do about it.
  const removalError = (title: string) => (err: unknown, user: User) => {
    const code = errorCode(err);
    if (isConflict(err) && (code === 'SELF_REMOVAL' || code === 'LAST_USER_MANAGER')) {
      setGuardUser(user);
      setGuard(code);
      return;
    }
    showError(title, extractApiError(err));
  };

  const enableMutation = useMutation({
    mutationFn: (user: User) => userApi.enable(user.id),
    onSuccess: (_, user) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      showSuccess(
        t('users.actions.restoredToast', {
          name: `${user.firstName} ${user.lastName}`,
          company: workspaceName,
        })
      );
    },
    onError: (err) => showError(t('users.actions.restoreFailed'), extractApiError(err)),
  });

  const disableMutation = useMutation({
    mutationFn: (user: User) => userApi.disable(user.id),
    onSuccess: (_, user) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      // Names the person AND the workspace: "removed" alone reads as deleted
      // from the platform. Undo is honest here — deactivate is reversible via
      // activate, and the row is still sitting in the list to prove it.
      showUndo(
        t('users.actions.removedToast', {
          name: `${user.firstName} ${user.lastName}`,
          company: workspaceName,
        }),
        t('common.undo'),
        () => enableMutation.mutate(user)
      );
    },
    onError: removalError(t('users.actions.removeFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (user: User) => userApi.delete(user.id),
    onSuccess: (_, user) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      // Deliberately no Undo — a deleted membership cannot be restored, and
      // offering one would be a lie the user only discovers after clicking.
      showSuccess(
        t('users.actions.deletedToast', {
          name: `${user.firstName} ${user.lastName}`,
          company: workspaceName,
        })
      );
    },
    onError: removalError(t('users.actions.deleteFailed')),
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
    deferredSearch || roleFilter || statusFilter !== DEFAULT_STATUS || invitationFilter
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
    if (removedCount > 0) {
      parts.push(t('users.breakdown.removed', { count: removedCount }));
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
          value={statusFilter}
          // Active is the neutral default, not an applied filter, so the chip
          // stays untinted and offers no × there — while `value` still marks
          // Active as the selected option inside the listbox. No reset row:
          // All is a real option in the list rather than "no filter".
          displayValue={
            statusFilter === DEFAULT_STATUS ? null : t(`users.filter.${statusFilter}`)
          }
          onChange={(id) => updateFilters({ status: readStatus(id) })}
          onClear={() => updateFilters({ status: DEFAULT_STATUS })}
        >
          <ChipListboxOption value="active">{t('users.filter.active')}</ChipListboxOption>
          <ChipListboxOption value="removed">{t('users.filter.removed')}</ChipListboxOption>
          <ChipListboxOption value="all">{t('users.filter.all')}</ChipListboxOption>
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
                    // Dim the IDENTITY of a removed member, never the whole row:
                    // the status pill and the ⋯ menu have to stay readable and
                    // actionable, since Restore access is reached from here.
                    const identityDim = !user.enabled ? 'opacity-55' : '';
                    return (
                      <DenseRow
                        key={user.id}
                        onClick={(e: React.MouseEvent) => {
                          const target = e.target as HTMLElement;
                          if (!target.closest('[role="menu"]') && !target.closest('button[aria-label]')) {
                            navigate(`/settings/access/users/${user.id}`);
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <td>
                          <div className={clsx('flex items-center gap-2.5', identityDim)}>
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
                          className={clsx(
                            !(user.roles && user.roles.length > 0) && 'dt-empty',
                            identityDim
                          )}
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
                            <Pill tone="neutral" dot>{t('users.status.removed')}</Pill>
                          )}
                        </td>
                        <td className="right">
                          {/* Own row keeps only Edit, so a delete-only admin
                              would otherwise get an empty menu on themselves. */}
                          {(canEditUsers || (!isMe && canDeleteUsers)) && (
                            <div onClick={(e) => e.stopPropagation()}>
                              <Dropdown>
                                <DropdownButton as={IconButton} aria-label={t('common.moreOptions')}>
                                  <EllipsisVerticalIcon className="size-4" />
                                </DropdownButton>
                                <DropdownMenu anchor="bottom end">
                                  {canEditUsers && (
                                    <DropdownItem onClick={() => handleEdit(user)}>
                                      <DropdownLabel>{t('common.edit')}</DropdownLabel>
                                    </DropdownItem>
                                  )}
                                  {/* Your own row offers no removal at all. The
                                      backend rejects self-removal with a 409
                                      (FE_HANDOFF §3), but a hidden menu item is
                                      not the enforcement and enforcement is not
                                      the affordance — the Users page administers
                                      other people, so the option shouldn't be
                                      here to reach for in the first place. */}
                                  {!isMe && (canEditUsers || canDeleteUsers) && (
                                    <>
                                      <DropdownDivider />
                                      {canEditUsers &&
                                        (user.enabled ? (
                                          <DropdownItem onClick={() => handleDisable(user)}>
                                            <DropdownLabel>
                                              {t('users.table.removeFromWorkspace')}
                                            </DropdownLabel>
                                          </DropdownItem>
                                        ) : (
                                          <DropdownItem onClick={() => handleEnable(user)}>
                                            <DropdownLabel>
                                              {t('users.table.restoreAccess')}
                                            </DropdownLabel>
                                          </DropdownItem>
                                        ))}
                                      {canDeleteUsers && (
                                        <DropdownItem onClick={() => handleDelete(user)}>
                                          <DropdownLabel>{t('users.table.deleteMembership')}</DropdownLabel>
                                        </DropdownItem>
                                      )}
                                    </>
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
            ? t('users.actions.deleteConfirm', { name: pendingName, company: workspaceName })
            : pendingAction?.kind === 'disable'
              ? t('users.actions.disableConfirm', { name: pendingName, company: workspaceName })
              : t('users.actions.enableConfirm', { name: pendingName, company: workspaceName })
        }
        message={
          pendingAction?.kind === 'delete'
            ? t('users.actions.deleteWarning', { company: workspaceName })
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
              ? t('users.actions.removeAccessLabel')
              : t('users.table.restoreAccess')
        }
        isDestructive={pendingAction?.kind !== 'enable'}
        isPending={confirmPending}
      >
        {/* Same scope note as the detail page: removal is per-workspace, and
            the person keeps their login and any other workspaces. Deliberately
            not shown for delete, which really is destructive. */}
        {pendingAction?.kind === 'disable' && (
          <Callout kind="neutral" title={t('users.actions.disableNotAffectedLabel')}>
            {t('users.actions.disableNotAffected')}
          </Callout>
        )}
      </ConfirmDialog>

      {/* Reachable from a stale list even though the own-row menu offers no
          removal — someone else can grant the last user-management role away
          while this page sits open. */}
      <RemovalGuardDialog
        guard={guard}
        onClose={() => {
          setGuard(null);
          setGuardUser(null);
        }}
        company={workspaceName}
        onViewAdministrators={adminRoleId ? () => navigate(`/settings/access/roles/${adminRoleId}`) : undefined}
        onChangeRoles={
          guardUser ? () => navigate(`/settings/access/users/${guardUser.id}/edit`) : undefined
        }
      />
    </>
  );
}
