import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  EllipsisVerticalIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline';
import {
  userApi,
  type Role,
  type RoleMember,
  type GroupedCapabilitiesResponse,
} from '../api/setup';
import { useHasCapability } from '../hooks/useCurrentUser';
import IconButton from '../components/IconButton';
import { Avatar } from '../components/ui/Avatar';
import { Callout } from '../components/ui/Callout';
import { Pill } from '../components/ui/Pill';
import { LoadingState } from '../components/ui/LoadingState';
import { ToggleGroup, ToggleGroupOption } from '../components/ui/ToggleGroup';
import { Badge } from '../components/catalyst/badge';
import { Button } from '../components/catalyst/button';
import { Card } from '../components/catalyst/card';
import { DataRow } from '../components/catalyst/data-row';
import { Heading } from '../components/catalyst/heading';
import { Text, TextLink } from '../components/catalyst/text';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '../components/catalyst/dropdown';
import ConfirmDialog from '../components/ConfirmDialog';
import { roleAccentFromRole } from '../utils/roleColor';
import { invalidateRoleConsumers } from '../utils/invalidateRoleConsumers';
import { showError, showSuccess, extractApiError } from '../lib/toast';

function formatDateShort(value?: string): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function memberFullName(m: RoleMember): string {
  return `${m.firstName} ${m.lastName}`.trim();
}

// Sub-line shown under the member's name on the Members card. We surface
// the member's OTHER role names so the row carries useful context ("this
// person is also a Field Supervisor") rather than just echoing the role
// being viewed. If they only have the current role, fall back to that
// name; if they have no roles at all (shouldn't happen — they're on this
// list because they hold the role), render empty.
function memberSubline(m: RoleMember, currentRoleId: string): string {
  const others = m.roles.filter((r) => r.id !== currentRoleId);
  if (others.length > 0) return others[0].name;
  return m.roles[0]?.name ?? '';
}

export default function RoleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);

  const canCreateRoles = useHasCapability('CREATE_ROLES');
  const canEditRoles = useHasCapability('EDIT_ROLES');
  const canDeleteRoles = useHasCapability('DELETE_ROLES');
  const canManage = canCreateRoles || canEditRoles || canDeleteRoles;

  const {
    data: role,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['roles', id],
    queryFn: () => userApi.getRoleById(id!),
    enabled: !!id,
  });

  const { data: groupedCaps } = useQuery({
    queryKey: ['capabilities', 'grouped'],
    queryFn: () => userApi.getGroupedCapabilities(),
  });

  const { data: membersResp } = useQuery({
    queryKey: ['roles', id, 'members'],
    queryFn: () => userApi.listRoleMembers(id!, { size: 100 }),
    enabled: !!id,
  });
  const members: RoleMember[] = membersResp?.content ?? [];

  const deleteMutation = useMutation({
    mutationFn: () => userApi.deleteRole(id!),
    onSuccess: () => {
      invalidateRoleConsumers(queryClient, id);
      if (role) showSuccess(`${role.name} deleted`);
      navigate('/settings/access/roles');
    },
    onError: (err) =>
      showError("Couldn't delete role", extractApiError(err) ?? (err as Error).message),
  });

  const cloneMutation = useMutation({
    mutationFn: () =>
      userApi.cloneRole(id!, {
        name: `${role?.name ?? 'Role'} (copy)`,
        description: role?.description,
      }),
    onSuccess: (newRole) => {
      invalidateRoleConsumers(queryClient, newRole.id);
      showSuccess(`${newRole.name} created`);
      navigate(`/settings/access/roles/${newRole.id}/edit`);
    },
    onError: (err) =>
      showError("Couldn't clone role", extractApiError(err) ?? (err as Error).message),
  });

  if (isLoading) {
    return (
      <div className="max-w-[980px]">
        <LoadingState
          label={t('common.actions.loading', { entities: t('entities.role') })}
        />
      </div>
    );
  }

  if (error || !role) {
    return (
      <div className="max-w-[980px] p-2">
        <Callout kind="danger">
          {t('common.actions.errorLoading', { entities: t('entities.role') })}
          {error && `: ${(error as Error).message}`}
        </Callout>
        <Button
          className="mt-4"
          onClick={() => navigate('/settings/access/roles')}
        >
          {t('common.actions.back')}
        </Button>
      </div>
    );
  }

  const accent = roleAccentFromRole(role);
  const userCount = members.length;
  const grantedCaps = new Set(role.capabilities ?? []);

  return (
    <div className="max-w-[980px]">
      <Link
        to="/settings/access/roles"
        className="mb-2.5 inline-flex items-center gap-1 text-[11.5px] text-fg-muted hover:text-fg-strong"
      >
        {t('roles.detail.backToRoles')}
      </Link>

      <RoleHeader
        role={role}
        accent={accent}
        userCount={userCount}
        groupedCaps={groupedCaps}
        canManage={canManage}
        canCreateRoles={canCreateRoles}
        canEditRoles={canEditRoles}
        canDeleteRoles={canDeleteRoles}
        onClone={() => cloneMutation.mutate()}
        clonePending={cloneMutation.isPending}
        onDelete={() => setIsDeleteAlertOpen(true)}
      />

      <div className="mt-3">
        <DescriptionCard
          role={role}
          canEdit={canEditRoles}
        />
      </div>

      <div className="mt-3">
        <CapabilitiesGrid
          role={role}
          accent={accent}
          granted={grantedCaps}
          groupedCaps={groupedCaps}
        />
      </div>

      <div className="mt-3">
        <MembersCard
          roleId={role.id}
          members={members}
          canManage={canManage}
        />
      </div>

      <div className="mt-3">
        <LifecycleFooter
          role={role}
          userCount={userCount}
          canDelete={canDeleteRoles}
          onClone={() => cloneMutation.mutate()}
          clonePending={cloneMutation.isPending}
          onDelete={() => setIsDeleteAlertOpen(true)}
        />
      </div>

      <ConfirmDialog
        isOpen={isDeleteAlertOpen}
        onClose={() => setIsDeleteAlertOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        title={t('common.actions.deleteConfirm', { name: role.name })}
        message={t('roles.actions.deleteWarning')}
        confirmLabel={deleteMutation.isPending ? t('common.deleting') : t('common.delete')}
        isDestructive
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Header — accent tile + name + pill + meta line + actions
// ──────────────────────────────────────────────────────────────────
function RoleHeader({
  role,
  accent,
  userCount,
  groupedCaps,
  canManage,
  canCreateRoles,
  canEditRoles,
  canDeleteRoles,
  onClone,
  clonePending,
  onDelete,
}: {
  role: Role;
  accent: string;
  userCount: number;
  groupedCaps: GroupedCapabilitiesResponse | undefined;
  canManage: boolean;
  canCreateRoles: boolean;
  canEditRoles: boolean;
  canDeleteRoles: boolean;
  onClone: () => void;
  clonePending: boolean;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const total = (groupedCaps?.groups ?? []).reduce(
    (sum, g) => sum + g.capabilities.length,
    0
  );
  const capCount = role.capabilities?.length ?? 0;
  const pct = total > 0 ? Math.round((capCount / total) * 100) : 0;
  const isCustom = !role.isProtected;
  const canDelete = canDeleteRoles && isCustom && userCount === 0;

  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-border bg-bg-elev px-4 py-3.5 sm:flex-row sm:items-center sm:gap-3.5">
      {/* Accent tile */}
      <div
        className="flex size-11 shrink-0 items-center justify-center rounded-[10px] border"
        style={{
          background: `color-mix(in oklch, ${accent} 16%, var(--bg-elev-2))`,
          borderColor: `color-mix(in oklch, ${accent} 28%, var(--border))`,
        }}
      >
        <span
          className="size-3.5 rounded-full"
          style={{
            background: accent,
            boxShadow: `0 0 0 3px color-mix(in oklch, ${accent} 20%, transparent)`,
          }}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <Heading level={1} size="page-sm" className="m-0">
            {role.name}
          </Heading>
          {role.isSystemRole ? (
            <Pill tone="neutral">{t('roles.table.builtIn')}</Pill>
          ) : (
            <Pill tone="accent" dot>
              {t('roles.table.custom')}
            </Pill>
          )}
          {role.performsFieldWork && (
            <Pill tone="info" dot>
              {t('roles.badge.field')}
            </Pill>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-muted">
          <span>
            <span className="font-semibold text-fg-strong tabular-nums">{userCount}</span>{' '}
            {userCount === 1 ? t('entities.user') : t('entities.users')}
          </span>
          <span className="text-fg-dim">·</span>
          <span>
            <span className="font-semibold text-fg-strong tabular-nums">{capCount}</span>
            {' / '}
            <span className="tabular-nums">{total}</span> {t('roles.table.capabilities').toLowerCase()}{' '}
            <span className="tabular-nums">({pct}%)</span>
          </span>
          <span className="text-fg-dim">·</span>
          <span>
            <span className="text-fg-strong">{formatDateShort(role.updatedAt)}</span>
          </span>
        </div>
      </div>

      {/* Action group reflow:
          · Desktop (sm+): inline trailing — [Clone] [Edit caps] [⋯]
          · Mobile (<sm): row 1 = primary "Edit caps" (flex-1) + kebab
            inline; row 2 = "Clone Role" full-width via flex-wrap + order.
            Primary first on mobile because that's the thumb target.
            whitespace-nowrap on labels so "Edit capabilities" doesn't
            break mid-word inside its flex-1 column. */}
      {canManage && (
        <div className="flex flex-wrap items-center gap-1.5 max-sm:w-full sm:flex-shrink-0">
          {canCreateRoles && (
            <Button
              outline
              size="xs"
              onClick={onClone}
              disabled={clonePending}
              className="whitespace-nowrap max-sm:order-3 max-sm:w-full"
            >
              {clonePending ? t('common.actions.loading', { entities: '' }).trim() : t('roles.actions.clone')}
            </Button>
          )}
          {canEditRoles && (
            <Button
              color="accent"
              size="xs"
              href={`/settings/access/roles/${role.id}/edit`}
              className="whitespace-nowrap max-sm:order-1 max-sm:flex-1"
            >
              {t('roles.detail.editCapabilities')}
            </Button>
          )}
          {(canEditRoles || canDelete) && (
            <Dropdown>
              <DropdownButton
                as={IconButton}
                aria-label={t('common.moreOptions')}
                className="max-sm:order-2"
              >
                <EllipsisVerticalIcon className="size-4" />
              </DropdownButton>
              <DropdownMenu anchor="bottom end">
                {canEditRoles && (
                  <DropdownItem href={`/settings/access/roles/${role.id}/edit`}>
                    <DropdownLabel>{t('common.edit')}</DropdownLabel>
                  </DropdownItem>
                )}
                {canDelete && (
                  <DropdownItem onClick={onDelete}>
                    <DropdownLabel>{t('common.delete')}</DropdownLabel>
                  </DropdownItem>
                )}
              </DropdownMenu>
            </Dropdown>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Description card — label / body / Edit row. Catalyst Card + DataRow
// handles mobile reflow (label becomes eyebrow, action drops below).
// ──────────────────────────────────────────────────────────────────
function DescriptionCard({
  role,
  canEdit,
}: {
  role: Role;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  // Admin is the system-defining role — its description is locked.
  const lockEdit = role.isProtected && role.systemRoleCode === 'ADMIN';
  return (
    <Card padding="none">
      <DataRow
        label={t('roles.detail.description')}
        labelWidth={110}
        last
        action={
          canEdit ? (
            <Button
              outline
              size="xxs"
              href={lockEdit ? undefined : `/settings/access/roles/${role.id}/edit`}
              disabled={lockEdit}
            >
              {t('common.edit')}
            </Button>
          ) : undefined
        }
      >
        <Text as="div" size="sm" tone="strong">
          {role.description || '—'}
        </Text>
      </DataRow>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────
// Capabilities — Catalyst Card with ToggleGroup. The subhead row
// (description + toggle) lives inside the body so the toggle never
// gets crushed by the title bar at narrow widths, and stacks beneath
// `sm:`. Area rows reflow to a vertical stack below `md:`.
// ──────────────────────────────────────────────────────────────────
function CapabilitiesGrid({
  role,
  accent,
  granted,
  groupedCaps,
}: {
  role: Role;
  accent: string;
  granted: Set<string>;
  groupedCaps: GroupedCapabilitiesResponse | undefined;
}) {
  const { t } = useTranslation();
  const [showOnly, setShowOnly] = useState<'granted' | 'all'>('granted');
  // role param kept for future per-role customization hooks; reference it
  // here so the linter knows it isn't dead.
  void role;

  const areas = useMemo(() => {
    if (!groupedCaps) return [];
    return groupedCaps.groups.map((g) => {
      const grantedInArea = g.capabilities.filter((c) => granted.has(c.name));
      return {
        area: g.displayName,
        all: g.capabilities,
        granted: grantedInArea,
        isFull: grantedInArea.length === g.capabilities.length,
      };
    });
  }, [groupedCaps, granted]);

  const visibleAreas =
    showOnly === 'granted' ? areas.filter((a) => a.granted.length > 0) : areas;

  return (
    <Card title={t('roles.table.capabilities')} padding="none">
      {/* Subhead row: description left, toggle right on desktop; stacks
          vertically below sm. The border-b acts as the visual divider
          between this row and the area list. */}
      <div className="flex flex-col gap-2 border-b border-border-soft px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <Text as="div" size="sm" tone="muted">
          {t('roles.detail.capabilitiesGrouped')}
        </Text>
        <ToggleGroup
          value={showOnly}
          onChange={setShowOnly}
          aria-label={t('roles.table.capabilities')}
        >
          <ToggleGroupOption value="granted" className="whitespace-nowrap">
            {t('roles.detail.showGrantedOnly')}
          </ToggleGroupOption>
          <ToggleGroupOption value="all" className="whitespace-nowrap">
            {t('roles.detail.showAll')}
          </ToggleGroupOption>
        </ToggleGroup>
      </div>

      <div>
        {visibleAreas.map((a, i) => {
          const visible = showOnly === 'granted' ? a.granted : a.all;
          const isLast = i === visibleAreas.length - 1;
          const isEmpty = a.granted.length === 0;
          const status = (() => {
            if (isEmpty) {
              return (
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-fg-dim">
                  {t('roles.detail.noneLabel')}
                </span>
              );
            }
            if (a.isFull) {
              return (
                <Pill tone="success" dot inline>
                  {t('roles.detail.fullLabel')}
                </Pill>
              );
            }
            return (
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-fg-dim">
                {t('roles.detail.partialLabel')}
              </span>
            );
          })();
          return (
            <div
              key={a.area}
              className={
                'flex flex-col gap-2 px-3.5 py-2.5 md:grid md:grid-cols-[200px_1fr_auto] md:items-start md:gap-3.5' +
                (isLast ? '' : ' border-b border-border-soft')
              }
            >
              {/* Row 1 (mobile) / col 1 (desktop): area name. The status
                  pill rides along on mobile via flex-row so it stays
                  inline with the name; on desktop it lives in col 3. */}
              <div className="flex items-center justify-between gap-2 md:block">
                <Text as="span" size="sm" tone="strong" className="font-semibold">
                  {a.area}
                </Text>
                <span className="md:hidden">{status}</span>
                <div className="mt-1 hidden items-center gap-1.5 md:flex">
                  <div className="h-[3px] w-[60px] shrink-0 overflow-hidden rounded-[1.5px] bg-bg-active">
                    <div
                      className="h-full"
                      style={{
                        width: `${(a.granted.length / a.all.length) * 100}%`,
                        background: isEmpty
                          ? 'transparent'
                          : a.isFull
                            ? 'var(--success-500)'
                            : accent,
                      }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-fg-dim tabular-nums">
                    {a.granted.length}/{a.all.length}
                  </span>
                </div>
              </div>

              {/* Row 2 (mobile only): progress bar + count, full-width
                  under the name row. */}
              <div className="flex items-center gap-1.5 md:hidden">
                <div className="h-[3px] flex-1 overflow-hidden rounded-[1.5px] bg-bg-active">
                  <div
                    className="h-full"
                    style={{
                      width: `${(a.granted.length / a.all.length) * 100}%`,
                      background: isEmpty
                        ? 'transparent'
                        : a.isFull
                          ? 'var(--success-500)'
                          : accent,
                    }}
                  />
                </div>
                <span className="font-mono text-[10px] text-fg-dim tabular-nums">
                  {a.granted.length}/{a.all.length}
                </span>
              </div>

              {/* Row 3 (mobile) / col 2 (desktop): chip list. */}
              <div className="flex flex-wrap gap-1">
                {visible.length === 0 ? (
                  <span className="text-[11px] italic text-fg-dim">
                    {t('roles.detail.capabilitiesNoneInArea')}
                  </span>
                ) : (
                  visible.map((c) => {
                    const has = granted.has(c.name);
                    if (has) {
                      return (
                        <Badge
                          key={c.name}
                          color="accent"
                          size="xs"
                          className="whitespace-nowrap"
                          title={c.description}
                        >
                          {c.displayName}
                        </Badge>
                      );
                    }
                    // "Show all" mode shows ungranted caps as a struck-
                    // through dim chip so the user can scan what's
                    // missing. Catalyst Badge doesn't carry a
                    // "disabled/ungranted" variant, so we restyle the
                    // base chip via className.
                    return (
                      <Badge
                        key={c.name}
                        color="zinc"
                        size="xs"
                        className="whitespace-nowrap text-fg-dim line-through opacity-70"
                        title={c.description}
                      >
                        {c.displayName}
                      </Badge>
                    );
                  })
                )}
              </div>

              {/* Col 3 (desktop only): status pill — hidden on mobile
                  because it's already inline with the area name. */}
              <div className="hidden text-right md:block">{status}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────
// Members card
// ──────────────────────────────────────────────────────────────────
function MembersCard({
  roleId,
  members,
  canManage,
}: {
  roleId: string;
  members: RoleMember[];
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const initial = members.slice(0, 6);
  const visible = expanded ? members : initial;
  const overflow = members.length - initial.length;

  return (
    <Card
      title={
        <>
          {t('roles.detail.membersHeader')}{' '}
          <span className="font-medium text-fg-dim tabular-nums">
            · {members.length}
          </span>
        </>
      }
      subtitle={t('roles.detail.membersDescription')}
      action={
        <TextLink
          href={`/settings/access/users?role=${roleId}`}
          className="text-[11.5px] font-medium no-underline hover:underline"
        >
          {t('roles.detail.openInUsers')}
        </TextLink>
      }
      padding="none"
    >
      {members.length === 0 ? (
        <div className="px-3.5 py-6 text-center text-[12px] text-fg-muted">
          {t('roles.detail.membersEmpty')}
          {canManage && (
            <div className="mt-1.5">
              <Button
                outline
                size="xs"
                onClick={() => navigate('/settings/access/users')}
              >
                {t('common.actions.add', { entity: t('entities.user') })}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div>
          {visible.map((m, i) => {
            const isLast = i === visible.length - 1;
            const fullName = memberFullName(m);
            return (
              <div
                key={m.id}
                className={
                  'grid items-center gap-2.5 px-3.5 py-2' +
                  (isLast ? '' : ' border-b border-border-soft')
                }
                style={{ gridTemplateColumns: '28px 1fr 1fr auto' }}
              >
                <Avatar
                  name={fullName}
                  src={m.photoUrl ?? undefined}
                  size="sm"
                  className="size-6 text-[10px]"
                />
                <div>
                  <div className="text-[12.5px] font-medium text-fg-strong">
                    {fullName}
                  </div>
                  <div className="mt-px text-[10.5px] text-fg-dim">
                    {memberSubline(m, roleId)}
                  </div>
                </div>
                <div className="text-[11.5px] text-fg-muted">{m.email}</div>
                {canManage && (
                  <Button
                    outline
                    size="xs"
                    onClick={() => navigate(`/settings/access/users/${m.id}`)}
                  >
                    {t('roles.detail.view')}
                  </Button>
                )}
              </div>
            );
          })}
          {overflow > 0 && (
            <div
              className={
                'bg-bg-elev-2 px-3.5 py-2 text-center' +
                (expanded ? '' : ' border-t border-border-soft')
              }
            >
              <Button plain size="xxs" onClick={() => setExpanded(!expanded)}>
                {expanded
                  ? t('roles.detail.showFewer')
                  : t('roles.detail.showAllMembers', { count: members.length })}
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────
// Lifecycle footer — three states
// ──────────────────────────────────────────────────────────────────
function LifecycleFooter({
  role,
  userCount,
  canDelete,
  onClone,
  clonePending,
  onDelete,
}: {
  role: Role;
  userCount: number;
  canDelete: boolean;
  onClone: () => void;
  clonePending: boolean;
  onDelete: () => void;
}) {
  const { t } = useTranslation();

  // State A — built-in role. Render via Callout so the lock icon, title,
  // body, and inline "clone" link share the canonical destructive-footer
  // rhythm. The clone affordance becomes a `Button plain size="xxs"`
  // inline in the body — clones aren't anchors and shouldn't render as
  // bare <button>s with link styling.
  if (role.isProtected) {
    return (
      <Callout
        kind="neutral"
        icon={<LockClosedIcon className="size-[18px]" />}
        title={t('roles.detail.builtInLockTitle')}
      >
        &ldquo;{role.name}&rdquo;{' '}
        {t('roles.detail.builtInLockBuiltinBody', {
          defaultValue:
            "is part of the default access model and can't be deleted. You can rename it, change its description, and customize its capabilities — or ",
        })}
        <Button
          plain
          size="xxs"
          onClick={onClone}
          disabled={clonePending}
          className="!inline -my-1 !align-baseline"
        >
          {t('roles.actions.clone').toLowerCase()}
        </Button>
        {' '}
        {t('roles.detail.builtInLockBuiltinTail', {
          defaultValue: 'to make a custom variant.',
        })}
      </Callout>
    );
  }

  // State B — custom role with users (delete blocked)
  // State C — custom role with no users (delete allowed)
  const hasUsers = userCount > 0;
  return (
    <Callout
      kind="neutral"
      icon={null}
      title={t('roles.detail.deleteRole')}
      action={
        canDelete ? (
          <Button
            outline={hasUsers ? true : 'red'}
            size="xxs"
            disabled={hasUsers}
            onClick={onDelete}
          >
            {t('roles.detail.deleteRole')}
          </Button>
        ) : undefined
      }
    >
      {hasUsers ? (
        <>
          {t('roles.detail.deleteBlocked', { count: userCount })}{' '}
          <TextLink
            href={`/settings/access/users?role=${role.id}`}
            className="font-medium no-underline hover:underline"
          >
            {t('roles.detail.reassignFirst')}
          </TextLink>
        </>
      ) : (
        t('roles.detail.deleteEmpty')
      )}
    </Callout>
  );
}
