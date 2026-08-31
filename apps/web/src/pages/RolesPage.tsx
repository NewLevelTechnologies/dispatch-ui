import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { EllipsisVerticalIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import IconButton from '../components/IconButton';
import { userApi, type Role, type RestoreAllDefaultsResponse } from '../api/setup';
import { useHasCapability } from '../hooks/useCurrentUser';
import { Button } from '../components/catalyst/button';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '../components/catalyst/dropdown';
import ConfirmDialog from '../components/ConfirmDialog';
import { Pill } from '../components/ui/Pill';
import { Card, CardBody } from '../components/ui/Card';
import { DenseTable, DenseTHead, DenseRow } from '../components/ui/DenseTable';
import { PageHead } from '../components/ui/PageHead';
import { ListToolbar, ListSearch } from '../components/ui/ListToolbar';
import { ListFooter } from '../components/ui/ListFooter';
import { FilterChipListbox, ChipListboxOption } from '../components/ui/FilterChipListbox';
import { LoadingState } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { roleAccentFromRole } from '@dispatch/utils';
import { invalidateRoleConsumers } from '../utils/invalidateRoleConsumers';
import { showError, showSuccess, extractApiError } from '../lib/toast';

type TypeFilter = 'builtin' | 'custom' | '';
type HasUsersFilter = 'yes' | 'no' | '';

function formatDate(value?: string): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function RolesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL-synced filters. Empty strings encode "no filter" so callers can compare
  // cleanly without optional chaining on null.
  const urlSearch = searchParams.get('search') ?? '';
  const typeFilter = (searchParams.get('type') ?? '') as TypeFilter;
  const hasUsersFilter = (searchParams.get('hasUsers') ?? '') as HasUsersFilter;

  const [searchQuery, setSearchQuery] = useState(urlSearch);
  useEffect(() => {
    setSearchQuery(urlSearch);
  }, [urlSearch]);

  const updateFilters = (updates: {
    search?: string;
    type?: TypeFilter;
    hasUsers?: HasUsersFilter;
  }) => {
    const next = new URLSearchParams(searchParams);
    if (updates.search !== undefined) {
      if (updates.search) next.set('search', updates.search);
      else next.delete('search');
    }
    if (updates.type !== undefined) {
      if (updates.type) next.set('type', updates.type);
      else next.delete('type');
    }
    if (updates.hasUsers !== undefined) {
      if (updates.hasUsers) next.set('hasUsers', updates.hasUsers);
      else next.delete('hasUsers');
    }
    setSearchParams(next, { replace: updates.search !== undefined });
  };

  // Local state — pending action targets.
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  const [isRestoreAllAlertOpen, setIsRestoreAllAlertOpen] = useState(false);

  // Permission gates. Spec calls for a single `MANAGE_ROLES`, but the backend
  // currently splits them — keep the existing fine-grained checks.
  const canCreateRoles = useHasCapability('CREATE_ROLES');
  const canEditRoles = useHasCapability('EDIT_ROLES');
  const canDeleteRoles = useHasCapability('DELETE_ROLES');
  const canManage = canCreateRoles || canEditRoles || canDeleteRoles;

  // The list endpoint ships everything we need: per-row userCount and
  // capabilityCount, plus an envelope with distinct usersAssigned and the
  // catalog's totalCapabilities. Earlier versions of this page derived
  // those client-side from a separate /users query (which double-counted
  // users with multiple roles) and from /capabilities/grouped.
  const {
    data: rolesData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['roles', 'envelope'],
    queryFn: () => userApi.listRoles(),
  });
  const roles = rolesData?.roles;
  const totalCapabilities = rolesData?.totals?.totalCapabilities ?? 0;

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: (id: string) => userApi.deleteRole(id),
    onSuccess: (_, id) => {
      invalidateRoleConsumers(queryClient, id);
      const deleted = roles?.find((r) => r.id === id);
      if (deleted) showSuccess(`${deleted.name} deleted`);
      setRoleToDelete(null);
    },
    onError: (err) =>
      showError("Couldn't delete role", extractApiError(err) ?? (err as Error).message),
  });

  const duplicateMutation = useMutation({
    mutationFn: (role: Role) =>
      userApi.cloneRole(role.id, { name: `${role.name} (copy)`, description: role.description }),
    onSuccess: (newRole) => {
      invalidateRoleConsumers(queryClient, newRole.id);
      showSuccess(`${newRole.name} created`);
      navigate(`/settings/access/roles/${newRole.id}/edit`);
    },
    onError: (err) =>
      showError("Couldn't duplicate role", extractApiError(err) ?? (err as Error).message),
  });

  const restoreAllMutation = useMutation({
    mutationFn: () => userApi.restoreAllDefaults(),
    onSuccess: (result: RestoreAllDefaultsResponse) => {
      invalidateRoleConsumers(queryClient);
      setIsRestoreAllAlertOpen(false);

      const restoredCount = result.restoredRoles.length;
      const recreatedCount = result.recreatedRoles.length;
      const preservedCount = result.preservedCustomRoles.length;

      const summary: string[] = [];
      if (restoredCount > 0)
        summary.push(t('roles.restoreAllSummary.rolesReset', { count: restoredCount }));
      if (recreatedCount > 0)
        summary.push(t('roles.restoreAllSummary.rolesRecreated', { count: recreatedCount }));
      if (preservedCount > 0)
        summary.push(t('roles.restoreAllSummary.customRolesPreserved', { count: preservedCount }));

      showSuccess(
        t('roles.actions.restoreAllDefaultsSuccess'),
        summary.length ? summary.join(' · ') : undefined
      );
    },
    onError: (err) =>
      showError(
        t('roles.actions.errorRestoreAll'),
        extractApiError(err) ?? (err as Error).message
      ),
  });

  // Filter + sort. Roles come back small, all client-side.
  const filteredRoles = useMemo(() => {
    if (!roles) return [];
    const q = searchQuery.trim().toLowerCase();
    return roles
      .filter((role) => {
        if (q) {
          const hay = `${role.name} ${role.description ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        // "Built-in" = sourced from the system role catalog (isSystemRole).
        // Not the same as isProtected, which only flags roles currently
        // locked from edit/delete — a recreated system role ships as
        // isSystemRole=true, isProtected=false.
        if (typeFilter === 'builtin' && !role.isSystemRole) return false;
        if (typeFilter === 'custom' && role.isSystemRole) return false;
        const userCount = role.userCount ?? 0;
        if (hasUsersFilter === 'yes' && userCount === 0) return false;
        if (hasUsersFilter === 'no' && userCount > 0) return false;
        return true;
      })
      .sort((a, b) => {
        const ua = a.userCount ?? 0;
        const ub = b.userCount ?? 0;
        if (ub !== ua) return ub - ua;
        return a.name.localeCompare(b.name);
      });
  }, [roles, searchQuery, typeFilter, hasUsersFilter]);

  // Summary totals (5-cell strip). usersAssigned comes from the envelope
  // — it's the distinct user count from the BE, not a sum of per-row
  // userCounts (which would double-count multi-role users).
  const totals = useMemo(() => {
    const all = roles ?? [];
    const builtin = all.filter((r) => r.isSystemRole).length;
    const custom = all.length - builtin;
    return {
      total: all.length,
      builtin,
      custom,
      usersAssigned: rolesData?.totals?.usersAssigned ?? 0,
      capabilities: totalCapabilities,
    };
  }, [roles, rolesData, totalCapabilities]);

  const hasFilters = Boolean(searchQuery || typeFilter || hasUsersFilter);
  const clearFilters = () => {
    setSearchQuery('');
    setSearchParams(new URLSearchParams(), { replace: false });
  };

  const builtinPresent = (roles ?? []).some((r) => r.isSystemRole);

  return (
    <div>
      <PageHead
        title={t('entities.roles')}
        sub={t('roles.description')}
        actions={
          canManage ? (
            <>
              {canCreateRoles && (
                <Button
                  color="accent"
                  size="xs"
                  href="/settings/access/roles/new"
                  className="whitespace-nowrap max-sm:flex-1"
                >
                  {t('common.actions.add', { entity: t('entities.role').toLowerCase() })}
                </Button>
              )}
              {canEditRoles && (
                <Dropdown>
                  <DropdownButton as={IconButton} aria-label={t('common.moreOptions')}>
                    <EllipsisVerticalIcon className="size-4" />
                  </DropdownButton>
                  <DropdownMenu anchor="bottom end">
                    <DropdownItem
                      disabled={!builtinPresent}
                      onClick={() => setIsRestoreAllAlertOpen(true)}
                    >
                      <DropdownLabel>{t('roles.actions.restoreAllDefaults')}</DropdownLabel>
                    </DropdownItem>
                  </DropdownMenu>
                </Dropdown>
              )}
            </>
          ) : null
        }
      />

      {/* Summary strip — 5 cells. Designer-approved exception (the
          design-system reference confines metric strips to dashboards,
          but the built-in/custom/users/capabilities breakdown earns its
          spot on this page). On mobile the row reflows to a 2-column
          grid; the trailing odd cell sits alone so the count of stats
          stays visible. */}
      <div className="mb-3 grid grid-cols-2 overflow-hidden rounded-[10px] border border-border bg-bg-elev sm:grid-cols-5">
        <SummaryCell label={t('roles.summary.roles')} value={totals.total} />
        <SummaryCell label={t('roles.summary.builtIn')} value={totals.builtin} />
        <SummaryCell label={t('roles.summary.custom')} value={totals.custom} />
        <SummaryCell label={t('roles.summary.usersAssigned')} value={totals.usersAssigned} />
        <SummaryCell
          label={t('roles.summary.totalCapabilities')}
          value={totals.capabilities}
          last
        />
      </div>

      {/* Toolbar */}
      <ListToolbar
        search={
          <ListSearch
            placeholder={t('roles.search.placeholder')}
            value={searchQuery}
            onChange={(value) => {
              setSearchQuery(value);
              updateFilters({ search: value });
            }}
          />
        }
      >
        <FilterChipListbox
          label={t('roles.filter.type')}
          ariaLabel={t('roles.filter.type')}
          value={typeFilter || null}
          displayValue={
            typeFilter === 'builtin'
              ? t('roles.filter.builtIn')
              : typeFilter === 'custom'
                ? t('roles.filter.custom')
                : null
          }
          resetLabel={t('roles.filter.all')}
          onChange={(id) => updateFilters({ type: (id ?? '') as TypeFilter })}
          onClear={() => updateFilters({ type: '' })}
        >
          <ChipListboxOption value="builtin">{t('roles.filter.builtIn')}</ChipListboxOption>
          <ChipListboxOption value="custom">{t('roles.filter.custom')}</ChipListboxOption>
        </FilterChipListbox>

        <FilterChipListbox
          label={t('roles.filter.hasUsers')}
          ariaLabel={t('roles.filter.hasUsers')}
          value={hasUsersFilter || null}
          displayValue={
            hasUsersFilter === 'yes'
              ? t('roles.filter.yes')
              : hasUsersFilter === 'no'
                ? t('roles.filter.no')
                : null
          }
          resetLabel={t('roles.filter.any')}
          onChange={(id) => updateFilters({ hasUsers: (id ?? '') as HasUsersFilter })}
          onClear={() => updateFilters({ hasUsers: '' })}
        >
          <ChipListboxOption value="yes">{t('roles.filter.yes')}</ChipListboxOption>
          <ChipListboxOption value="no">{t('roles.filter.no')}</ChipListboxOption>
        </FilterChipListbox>

        <div className="ml-auto flex items-center text-[11px] text-fg-muted">
          {t('roles.sort.label')}{' '}
          <span className="ml-1 font-medium text-fg-strong">{t('roles.sort.users')}</span>
        </div>
      </ListToolbar>

      <Card>
        <CardBody flush>
          {isLoading ? (
            <LoadingState
              label={t('common.actions.loading', { entities: t('entities.roles') })}
            />
          ) : error ? (
            <ErrorState
              title={t('common.actions.errorLoading', { entities: t('entities.roles') })}
              description={extractApiError(error) ?? (error as Error).message}
              action={
                <Button outline onClick={() => refetch()}>
                  {t('common.actions.tryAgain')}
                </Button>
              }
            />
          ) : filteredRoles.length === 0 ? (
            hasFilters ? (
              <EmptyState
                icon={<ShieldCheckIcon className="size-10 text-fg-dim" />}
                title={t('common.actions.noMatchFilters', { entities: t('entities.roles') })}
                description={t('common.actions.tryAdjustingFilters')}
                action={
                  <Button outline onClick={clearFilters}>
                    {t('roles.filter.clearFilters')}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={<ShieldCheckIcon className="size-10 text-fg-dim" />}
                title={t('common.actions.notFound', { entities: t('entities.roles') })}
                action={
                  canCreateRoles ? (
                    <Button color="accent" size="xs" href="/settings/access/roles/new">
                      {t('common.actions.add', { entity: t('entities.role').toLowerCase() })}
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
                    <th>{t('roles.table.role')}</th>
                    <th>{t('roles.table.description')}</th>
                    <th className="right" style={{ width: 90 }}>
                      {t('entities.users')}
                    </th>
                    <th className="right" style={{ width: 130 }}>
                      {t('roles.table.capabilities')}
                    </th>
                    <th style={{ width: 110 }}>{t('roles.table.type')}</th>
                    <th style={{ width: 110 }}>{t('roles.table.lastModified')}</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </DenseTHead>
                <tbody>
                  {filteredRoles.map((role) => {
                    const userCount = role.userCount ?? 0;
                    const capCount = role.capabilityCount ?? 0;
                    const pct =
                      totalCapabilities > 0
                        ? Math.round((capCount / totalCapabilities) * 100)
                        : 0;
                    const accent = roleAccentFromRole(role);
                    return (
                      <DenseRow
                        key={role.id}
                        onClick={(e: React.MouseEvent) => {
                          const target = e.target as HTMLElement;
                          if (
                            !target.closest('[role="menu"]') &&
                            !target.closest('button[aria-label]')
                          ) {
                            navigate(`/settings/access/roles/${role.id}`);
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <td>
                          <div className="flex items-center gap-2">
                            <span
                              className="size-[9px] shrink-0 rounded-full"
                              style={{
                                background: accent,
                                boxShadow: `0 0 0 2px color-mix(in oklch, ${accent} 20%, transparent)`,
                              }}
                            />
                            <span className="text-[13px] font-semibold text-fg-strong">
                              {role.name}
                            </span>
                            {role.performsFieldWork && (
                              <Pill tone="info" dot>
                                {t('roles.badge.field')}
                              </Pill>
                            )}
                          </div>
                        </td>
                        <td
                          className={clsx(!role.description && 'dt-empty')}
                          data-label={t('roles.table.description')}
                        >
                          <span className="line-clamp-1 text-[12px] text-fg-muted">
                            {role.description || '—'}
                          </span>
                        </td>
                        <td className="right" data-label={t('entities.users')}>
                          <span
                            className={
                              userCount > 0
                                ? 'text-[12.5px] font-semibold text-fg-strong tabular-nums'
                                : 'text-[12.5px] text-fg-dim tabular-nums'
                            }
                          >
                            {userCount}
                          </span>
                        </td>
                        <td className="right" data-label={t('roles.table.capabilities')}>
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="font-mono text-[11px] text-fg-dim tabular-nums">
                              {pct}%
                            </span>
                            <div className="h-1 w-[50px] overflow-hidden rounded-[2px] bg-bg-active">
                              <div
                                className="h-full"
                                style={{ width: `${pct}%`, background: accent }}
                              />
                            </div>
                            <span className="min-w-[30px] text-right text-[12px] font-semibold text-fg-strong tabular-nums">
                              {capCount}
                            </span>
                          </div>
                        </td>
                        <td>
                          {role.isSystemRole ? (
                            <Pill tone="neutral">{t('roles.table.builtIn')}</Pill>
                          ) : (
                            <Pill tone="accent" dot>
                              {t('roles.table.custom')}
                            </Pill>
                          )}
                        </td>
                        <td data-label={t('roles.table.lastModified')}>
                          <span className="text-[11.5px] text-fg-muted">
                            {formatDate(role.updatedAt)}
                          </span>
                        </td>
                        <td className="right">
                          {canManage && (
                            <div onClick={(e) => e.stopPropagation()}>
                              <Dropdown>
                                <DropdownButton
                                  as={IconButton}
                                  aria-label={t('common.moreOptions')}
                                >
                                  <EllipsisVerticalIcon className="size-4" />
                                </DropdownButton>
                                <DropdownMenu anchor="bottom end">
                                  {canEditRoles && (
                                    <DropdownItem
                                      href={`/settings/access/roles/${role.id}/edit`}
                                    >
                                      <DropdownLabel>{t('common.edit')}</DropdownLabel>
                                    </DropdownItem>
                                  )}
                                  {canCreateRoles && (
                                    <DropdownItem
                                      onClick={() => duplicateMutation.mutate(role)}
                                    >
                                      <DropdownLabel>
                                        {t('roles.actions.duplicate')}
                                      </DropdownLabel>
                                    </DropdownItem>
                                  )}
                                  {canDeleteRoles && !role.isProtected && userCount === 0 && (
                                    <DropdownItem onClick={() => setRoleToDelete(role)}>
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
                left={
                  <>
                    {t('settings.showingCount', {
                      count: filteredRoles.length,
                      noun: t('entities.roles').toLowerCase(),
                    })}{' '}
                    ·{' '}
                    {t('roles.breakdown.builtIn', {
                      count: filteredRoles.filter((r) => r.isSystemRole).length,
                    })}{' '}
                    ·{' '}
                    {t('roles.breakdown.custom', {
                      count: filteredRoles.filter((r) => !r.isSystemRole).length,
                    })}
                  </>
                }
              />
            </>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        isOpen={roleToDelete !== null}
        onClose={() => setRoleToDelete(null)}
        onConfirm={() => roleToDelete && deleteMutation.mutate(roleToDelete.id)}
        title={t('common.actions.deleteConfirm', { name: roleToDelete?.name ?? '' })}
        message={t('roles.actions.deleteWarning')}
        confirmLabel={
          deleteMutation.isPending ? t('common.deleting') : t('common.delete')
        }
        isDestructive
        isPending={deleteMutation.isPending}
      />

      <ConfirmDialog
        isOpen={isRestoreAllAlertOpen}
        onClose={() => setIsRestoreAllAlertOpen(false)}
        onConfirm={() => restoreAllMutation.mutate()}
        title={t('roles.actions.restoreAllDefaultsConfirm')}
        message={`${t('roles.actions.restoreAllDefaultsDescription', {
          count: (roles ?? []).filter((r) => r.isSystemRole).length || 6,
        })} ${t('roles.actions.restoreAllDefaultsDetails')} ${t('roles.actions.restoreAllDefaultsWarning')}`}
        confirmLabel={
          restoreAllMutation.isPending
            ? t('common.restoring')
            : t('roles.actions.restoreAllDefaults')
        }
        isDestructive
        isPending={restoreAllMutation.isPending}
      />
    </div>
  );
}

function SummaryCell({
  label,
  value,
  last,
}: {
  label: string;
  value: number;
  last?: boolean;
}) {
  // The vertical dividers only line up in the desktop 5-col layout. In
  // the 2-col mobile layout they'd land between odd/even cells where
  // they don't belong — hide below sm, restore at sm:.
  return (
    <div
      className={
        'px-4 py-[11px]' +
        (last ? '' : ' sm:border-r sm:border-border-soft')
      }
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-fg-muted">
        {label}
      </div>
      <div className="mt-0.5 text-[20px] font-bold leading-none tracking-[-0.02em] text-fg-strong tabular-nums">
        {value}
      </div>
    </div>
  );
}
