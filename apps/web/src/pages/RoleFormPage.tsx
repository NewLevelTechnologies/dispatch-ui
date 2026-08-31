/* eslint-disable i18next/no-literal-string -- dense v1.5 form, major copy is t()'d; inline glyphs, separators, slashes and area-name pass-throughs stay literal to keep markup readable */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { userApi, type Role } from '../api/setup';
import { Button } from '../components/catalyst/button';
import { Card } from '../components/catalyst/card';
import { Checkbox } from '../components/catalyst/checkbox';
import { Description, ErrorMessage, Field, Label } from '../components/catalyst/fieldset';
import { Switch, SwitchField } from '../components/catalyst/switch';
import { Heading } from '../components/catalyst/heading';
import { Input, InputGroup } from '../components/catalyst/input';
import { Textarea } from '../components/catalyst/textarea';
import { Text } from '../components/catalyst/text';
import { Callout } from '../components/ui/Callout';
import { AccentPicker } from '../components/ui/AccentPicker';
import {
  ROLE_ACCENT_OPTIONS,
  roleAccent,
  roleAccentFromRole,
} from '@dispatch/utils';
import { invalidateRoleConsumers } from '../utils/invalidateRoleConsumers';
import { showError, showSuccess, extractApiError } from '../lib/toast';

// Conflict shape returned from POST/PUT/clone role endpoints when accentId
// collides with another role's accent. See `frontend-roles-refinements.md`
// §1 + BE additions doc.
type AccentConflictBody = {
  code?: 'ACCENT_ID_TAKEN';
  field?: 'accentId';
  conflictingRoleId?: string;
  conflictingRoleName?: string;
};

interface RoleFormPageProps {
  mode: 'add' | 'edit';
}

export default function RoleFormPage({ mode }: RoleFormPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const isEdit = mode === 'edit';

  // Existing role (edit mode)
  const { data: existingRole, isLoading: loadingRole } = useQuery({
    queryKey: ['roles', id],
    queryFn: () => userApi.getRoleById(id!),
    enabled: isEdit && !!id,
  });

  // Member count — drives the capability-removal warning. We only need the
  // total here, so request size=1 and read totalElements instead of pulling
  // the full member list.
  const { data: membersResp } = useQuery({
    queryKey: ['roles', id, 'members', 'count'],
    queryFn: () => userApi.listRoleMembers(id!, { size: 1 }),
    enabled: isEdit && !!id,
  });
  const memberCount = membersResp?.totalElements ?? 0;

  // Full roles envelope — needed for `colorsInUse` in add mode (the BE
  // returns the map at the top level alongside the roles array). In edit
  // mode we prefer `existingRole.colorsInUse` from the detail response,
  // which is computed fresh per request and includes the role being edited
  // so the picker can show "taken by everyone but me" accurately.
  const { data: rolesResp } = useQuery({
    queryKey: ['roles', 'envelope'],
    queryFn: () => userApi.listRoles(),
  });
  const allRoles = useMemo(() => rolesResp?.roles ?? [], [rolesResp]);

  // Capability catalog
  const { data: catalog } = useQuery({
    queryKey: ['capabilities', 'grouped'],
    queryFn: () => userApi.getGroupedCapabilities(),
  });
  const areas = useMemo(() => catalog?.groups ?? [], [catalog]);
  const total = useMemo(
    () => areas.reduce((sum, a) => sum + a.capabilities.length, 0),
    [areas]
  );

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [accentId, setAccentId] = useState<string>('orange');
  const [performsFieldWork, setPerformsFieldWork] = useState(false);
  const [capabilities, setCapabilities] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [initialCaps, setInitialCaps] = useState<Set<string>>(new Set());
  // Set by the 409 handler with the name of the role that now owns the color
  // the user tried to claim. Cleared when the user picks a different swatch.
  const [accentConflict, setAccentConflict] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Map of accent id → owning role, sourced from the BE.
  //   · Add mode: the wrapped roles-list response carries the map directly.
  //   · Edit mode: the role detail response carries its own map. We strip
  //     the role's own entry so the user can keep their existing color.
  const colorsInUse = useMemo(() => {
    const source = isEdit ? existingRole?.colorsInUse : rolesResp?.colorsInUse;
    if (!source) return {};
    if (!isEdit) return source;
    const filtered: typeof source = {};
    for (const [k, v] of Object.entries(source)) {
      if (v.roleId !== id) filtered[k] = v;
    }
    return filtered;
  }, [isEdit, existingRole, rolesResp, id]);

  // Seed from existing role on load. When the role has no persisted color
  // (the clone flow ships `accentId: null` per the BE contract), pick the
  // first swatch that isn't taken by another role so the picker doesn't
  // land on a dimmed swatch the moment the page opens.
  useEffect(() => {
    if (!isEdit || !existingRole) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(existingRole.name);
    setDescription(existingRole.description ?? '');
    if (existingRole.accentId) {
      setAccentId(existingRole.accentId);
    } else {
      const taken = existingRole.colorsInUse ?? {};
      const firstFree =
        ROLE_ACCENT_OPTIONS.find((o) => !(o.id in taken))?.id ?? 'orange';
      setAccentId(firstFree);
    }
    setPerformsFieldWork(existingRole.performsFieldWork ?? false);
    const caps = new Set(existingRole.capabilities ?? []);
    setCapabilities(caps);
    setInitialCaps(caps);
  }, [isEdit, existingRole]);

  // Capability lookup: name → { area, displayName }
  const capabilityIndex = useMemo(() => {
    const idx = new Map<string, { area: string; displayName: string }>();
    for (const g of areas) {
      for (const c of g.capabilities) {
        idx.set(c.name, { area: g.displayName, displayName: c.displayName });
      }
    }
    return idx;
  }, [areas]);

  // Areas-with-grants count, for the footer
  const areasWithGrants = useMemo(
    () => areas.filter((a) => a.capabilities.some((c) => capabilities.has(c.name))).length,
    [areas, capabilities]
  );

  // How many capabilities the search input is hiding. Used by the
  // "{n} hidden" footer row inside the area container so a user mid-filter
  // doesn't lose track of what's outside the visible set.
  const hiddenCount = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return 0;
    let visible = 0;
    for (const a of areas) {
      visible += a.capabilities.filter((c) =>
        c.displayName.toLowerCase().includes(q)
      ).length;
    }
    return total - visible;
  }, [search, areas, total]);

  // Removal diff (edit only, when user is connected to the role)
  const removedByArea = useMemo(() => {
    if (!isEdit) return [] as { area: string; count: number; names: string[] }[];
    const dropped = [...initialCaps].filter((c) => !capabilities.has(c));
    if (dropped.length === 0) return [];
    const byArea = new Map<string, string[]>();
    for (const capName of dropped) {
      const meta = capabilityIndex.get(capName);
      const area = meta?.area ?? 'Other';
      const list = byArea.get(area) ?? [];
      list.push(meta?.displayName ?? capName);
      byArea.set(area, list);
    }
    return [...byArea.entries()].map(([area, names]) => ({
      area,
      count: names.length,
      names,
    }));
  }, [isEdit, initialCaps, capabilities, capabilityIndex]);

  // Admin lockout — system-defining role, name + capabilities are read-only
  const isAdmin =
    isEdit && !!existingRole?.isProtected && existingRole.systemRoleCode === 'ADMIN';
  // Non-admin built-ins get a small banner with restore-defaults hint
  const isBuiltInNonAdmin = isEdit && !!existingRole?.isProtected && !isAdmin;

  const valid = name.trim().length > 0 && capabilities.size > 0;

  // Submit — create or update.
  // Edit splits into two calls because the backend separates metadata
  // (name/description/accentId) from capabilities. Either may be a no-op.
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!isEdit) {
        return userApi.createRole({
          name: name.trim(),
          description: description.trim() || undefined,
          capabilities: [...capabilities],
          accentId,
          performsFieldWork,
        });
      }
      const original = existingRole!;
      const metadataChanged =
        name.trim() !== original.name ||
        (description.trim() || '') !== (original.description ?? '') ||
        accentId !== (original.accentId ?? 'orange') ||
        performsFieldWork !== (original.performsFieldWork ?? false);
      const capsChanged =
        [...capabilities].sort().join('|') !==
        [...(original.capabilities ?? [])].sort().join('|');

      let updated: Role = original;
      if (metadataChanged) {
        updated = await userApi.updateRole(original.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          accentId,
          performsFieldWork,
        });
      }
      if (capsChanged) {
        updated = await userApi.updateRoleCapabilities(original.id, {
          capabilities: [...capabilities],
        });
      }
      return updated;
    },
    onSuccess: (role) => {
      invalidateRoleConsumers(queryClient, role.id);
      showSuccess(isEdit ? `${role.name} saved` : `${role.name} created`);
      navigate(`/settings/access/roles/${role.id}`);
    },
    onError: (err) => {
      // 409 with `{ field: 'accentId', conflictingRoleName }` means another
      // role claimed our color between our last read and submit — surface
      // inline next to the picker and refresh the roles list so the picker
      // can update its taken-swatches map. Don't fire the generic toast.
      const status =
        err instanceof Error && 'response' in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined;
      const body =
        err instanceof Error && 'response' in err
          ? ((err as { response?: { data?: AccentConflictBody } }).response?.data ?? null)
          : null;
      if (status === 409 && (body?.code === 'ACCENT_ID_TAKEN' || body?.field === 'accentId')) {
        setAccentConflict(body.conflictingRoleName ?? 'another role');
        // Refetch both the list (used in add mode) and the current role's
        // detail (used in edit mode) so the picker re-derives its taken map.
        queryClient.invalidateQueries({ queryKey: ['roles'] });
        if (isEdit && id) queryClient.invalidateQueries({ queryKey: ['roles', id] });
        return;
      }
      showError(
        isEdit
          ? t('common.form.errorUpdate', { entity: t('entities.role') })
          : t('common.form.errorCreate', { entity: t('entities.role') }),
        extractApiError(err)
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitMutation.isPending) return;
    submitMutation.mutate();
  };

  const toggleCap = (capName: string) => {
    const next = new Set(capabilities);
    if (next.has(capName)) next.delete(capName);
    else next.add(capName);
    setCapabilities(next);
  };

  const toggleArea = (areaCaps: string[], allOn: boolean) => {
    const next = new Set(capabilities);
    if (allOn) areaCaps.forEach((c) => next.delete(c));
    else areaCaps.forEach((c) => next.add(c));
    setCapabilities(next);
  };

  const clearAll = () => setCapabilities(new Set());

  const cancelHref = isEdit
    ? id
      ? `/settings/access/roles/${id}`
      : '/settings/access/roles'
    : '/settings/access/roles';

  if (isEdit && loadingRole) {
    return (
      <Text as="div" size="sm" tone="muted" className="p-8">
        {t('common.actions.loading', { entities: t('entities.role') })}
      </Text>
    );
  }

  const headerName = isEdit
    ? existingRole
      ? t('roles.form.editTitle', { name: existingRole.name })
      : t('common.edit')
    : t('roles.form.addTitle');

  const liveAccent = roleAccent(accentId);

  return (
    <div className="-mx-6 -my-6 flex h-[calc(100svh-52px)] min-h-0 flex-col max-lg:-mx-4 max-lg:-my-4">
      <form
        id="role-form"
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex-1 overflow-y-auto px-7 pb-6 pt-5 max-lg:px-4">
          <div className="max-w-[720px]">
            <Link
              to={cancelHref}
              className="mb-2.5 inline-flex items-center gap-1 text-[11.5px] text-fg-muted hover:text-fg-strong"
            >
              ←{' '}
              {isEdit && existingRole
                ? existingRole.name
                : t('roles.form.allRoles', { entities: t('entities.roles').toLowerCase() })}
            </Link>

            <div className="mb-3.5">
              <Heading level={1} size="page-md" className="m-0">
                {headerName}
              </Heading>
              <Text size="sm" tone="muted" className="mt-0.5">
                {isEdit ? t('roles.form.subtitleEdit') : t('roles.form.subtitleAdd')}
              </Text>
            </div>

            {/* Identity */}
            <Card title="Identity" className="mb-3">
              <div className="grid grid-cols-1 items-start gap-2.5 sm:grid-cols-[1.4fr_1fr]">
                <Field size="xs">
                  <Label size="xs" required>
                    {t('roles.form.title')}
                  </Label>
                  <Input
                    size="xs"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('roles.form.namePlaceholder')}
                    disabled={isAdmin}
                    required
                  />
                </Field>
                <Field size="xs">
                  <Label size="xs" required>
                    {t('roles.form.colorLabel')}
                  </Label>
                  <AccentPicker
                    value={accentId}
                    onChange={(id) => {
                      setAccentId(id);
                      if (accentConflict) setAccentConflict(null);
                    }}
                    colorsInUse={colorsInUse}
                    formatTakenLabel={(owner) =>
                      t('roles.form.colorTakenBy', { name: owner.roleName })
                    }
                  />
                  {accentConflict && (
                    <ErrorMessage size="xs">
                      {t('roles.form.colorConflict', { name: accentConflict })}
                    </ErrorMessage>
                  )}
                </Field>
              </div>
              <div className="mt-2.5">
                <Field size="xs">
                  <Label size="xs" hint={t('roles.form.descriptionHint')}>
                    {t('roles.form.descriptionLabel')}
                  </Label>
                  <Textarea
                    rows={2}
                    resizable
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t('roles.form.descriptionPlaceholder')}
                  />
                </Field>
              </div>
              <div className="mt-2.5 border-t border-border-soft pt-2.5">
                <SwitchField>
                  <Switch
                    checked={performsFieldWork}
                    onChange={setPerformsFieldWork}
                  />
                  <Label>{t('roles.form.performsFieldWorkLabel')}</Label>
                  <Description>
                    {t('roles.form.performsFieldWorkHint')}
                  </Description>
                </SwitchField>
              </div>
            </Card>

            {/* Start from — add mode only */}
            {!isEdit && (
              <Card
                title={t('roles.form.startFromTitle')}
                subtitle={t('roles.form.startFromSubtitle')}
                className="mb-3"
              >
                <div className="flex flex-wrap gap-1.5">
                  <RoleStartFromChip
                    selected={capabilities.size === 0}
                    onClick={() => setCapabilities(new Set())}
                  >
                    {t('roles.form.blank')}
                  </RoleStartFromChip>
                  {allRoles.map((r) => (
                    <RoleStartFromChip
                      key={r.id}
                      onClick={() => setCapabilities(new Set(r.capabilities ?? []))}
                    >
                      <span
                        className="size-[7px] shrink-0 rounded-full"
                        style={{ background: roleAccentFromRole(r) }}
                      />
                      <span className="truncate">{r.name}</span>
                      <span className="font-mono text-[10px] text-fg-dim tabular-nums">
                        {r.capabilities?.length ?? 0}
                      </span>
                    </RoleStartFromChip>
                  ))}
                </div>
              </Card>
            )}

            {/* Capabilities */}
            <Card
              title={t('roles.table.capabilities')}
              subtitle={
                <>
                  {t('roles.form.capabilitySubtitle')}{' '}
                  <span className="font-medium text-fg-accent">
                    {t('roles.form.capabilityHelpLink')}
                  </span>
                </>
              }
              action={
                <>
                  <div className="w-[200px]">
                    <InputGroup>
                      <MagnifyingGlassIcon data-slot="icon" />
                      <Input
                        ref={searchRef}
                        type="search"
                        size="xs"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('roles.form.capabilityFilterPlaceholder')}
                        aria-label={t('roles.form.capabilityFilterPlaceholder')}
                      />
                    </InputGroup>
                  </div>
                  {capabilities.size > 0 && !isAdmin && (
                    <Button outline size="xs" onClick={clearAll}>
                      {t('roles.form.clearAll')}
                    </Button>
                  )}
                </>
              }
              className="mb-3"
            >
              {isAdmin && (
                <Callout kind="neutral" className="mb-2.5" title={t('roles.form.adminLockTitle')}>
                  {t('roles.form.adminLockBody')}
                </Callout>
              )}
              {isBuiltInNonAdmin && (
                <Callout kind="neutral" className="mb-2.5">
                  This is a built-in role.{' '}
                  <Link
                    to="/settings/access/roles"
                    className="font-medium text-fg-accent hover:underline"
                  >
                    Restore defaults
                  </Link>{' '}
                  at any time.
                </Callout>
              )}

              {memberCount > 0 && removedByArea.length > 0 && (
                <Callout
                  kind="warning"
                  className="mb-2.5"
                  title={t('roles.form.removalWarningTitle', { count: memberCount })}
                >
                  {removedByArea.length > 6
                    ? removedByArea.map((r, i) => (
                        <span key={r.area}>
                          {i > 0 && ' · '}
                          {t('roles.form.removalWarningArea', {
                            area: r.area,
                            count: r.count,
                          })}
                        </span>
                      ))
                    : removedByArea
                        .flatMap((r) => r.names)
                        .join(', ')}
                </Callout>
              )}

              <div className="overflow-hidden rounded-md border border-border-soft bg-bg-elev-2">
                {areas.map((area, areaIdx) => (
                  <AreaBlock
                    key={area.featureArea}
                    area={area}
                    isLast={areaIdx === areas.length - 1 && hiddenCount === 0}
                    capabilities={capabilities}
                    onToggleCap={toggleCap}
                    onToggleArea={toggleArea}
                    accent={liveAccent}
                    search={search}
                    disabled={isAdmin}
                  />
                ))}
                {hiddenCount > 0 && (
                  <div className="flex items-center justify-end gap-2 border-t border-border-soft bg-bg-elev px-3 py-1.5 text-[11px] text-fg-muted">
                    <span>
                      {t('roles.form.capabilitiesHiddenByFilter', { count: hiddenCount })}
                    </span>
                    <span className="text-fg-dim">·</span>
                    <Button
                      plain
                      size="xxs"
                      onClick={() => {
                        setSearch('');
                        // Refocus so a keyboard user can keep typing without
                        // reaching for the mouse.
                        requestAnimationFrame(() => searchRef.current?.focus());
                      }}
                    >
                      {t('roles.form.clearFilter')}
                    </Button>
                  </div>
                )}
              </div>

              {capabilities.size === 0 && !isAdmin && (
                <Callout kind="danger" className="mt-2.5">
                  {t('roles.form.errorEmptyCapabilities')}
                </Callout>
              )}
            </Card>
          </div>
        </div>

        {/* Sticky footer */}
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-t border-border bg-bg-elev px-7 py-3 max-lg:px-4">
          <div className="flex items-center gap-2 text-[11.5px] text-fg-muted max-sm:basis-full">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{
                background: liveAccent,
                boxShadow: `0 0 0 2px color-mix(in oklch, ${liveAccent} 20%, transparent)`,
              }}
            />
            <span>
              {t('roles.form.capCountSummary', {
                count: capabilities.size,
                total,
                areas: areasWithGrants,
              })}
            </span>
            {isEdit && (
              <>
                <span className="text-fg-dim">·</span>
                <span>{t('roles.form.changesTakeEffect')}</span>
              </>
            )}
          </div>
          <span className="flex-1" />
          <Button href={cancelHref} plain size="xs">
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            color="accent"
            size="xs"
            disabled={!valid || submitMutation.isPending}
          >
            {submitMutation.isPending
              ? t('common.saving')
              : isEdit
                ? t('roles.form.save')
                : t('roles.form.create')}
          </Button>
        </div>
      </form>
    </div>
  );
}

// Variant wrappers — keep route components symmetric with UserFormPage.
export function RoleAddPage() {
  return <RoleFormPage mode="add" />;
}

export function RoleEditPage() {
  return <RoleFormPage mode="edit" />;
}

// ──────────────────────────────────────────────────────────────────
// RoleStartFromChip — single chip in the add-mode template row.
// Page-local: lives here until a second surface needs it.
// ──────────────────────────────────────────────────────────────────
function RoleStartFromChip({
  selected,
  onClick,
  children,
}: {
  selected?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] font-medium transition-colors ' +
        (selected
          ? 'border-accent-500/30 bg-[color-mix(in_oklch,var(--accent-500)_10%,var(--bg-elev))] text-fg-strong'
          : 'border-border bg-bg-elev text-fg-strong hover:bg-bg-hover')
      }
    >
      {children}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────
// AreaBlock — section header (tristate checkbox + counts + select-all)
// plus 3-column grid of capability rows.
// ──────────────────────────────────────────────────────────────────
function AreaBlock({
  area,
  isLast,
  capabilities,
  onToggleCap,
  onToggleArea,
  accent,
  search,
  disabled,
}: {
  area: {
    featureArea: string;
    displayName: string;
    capabilities: { name: string; displayName: string; description: string }[];
  };
  isLast: boolean;
  capabilities: Set<string>;
  onToggleCap: (capName: string) => void;
  onToggleArea: (areaCaps: string[], allOn: boolean) => void;
  accent: string;
  search: string;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const all = area.capabilities;
  const grantedCount = all.filter((c) => capabilities.has(c.name)).length;
  const allOn = grantedCount === all.length && all.length > 0;
  const someOn = grantedCount > 0 && !allOn;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((c) => c.displayName.toLowerCase().includes(q));
  }, [all, search]);

  if (search && filtered.length === 0) return null;

  const countColor =
    grantedCount === 0
      ? 'text-fg-dim'
      : allOn
        ? 'text-success-500'
        : '';
  const countStyle = grantedCount === 0 || allOn ? undefined : { color: accent };

  return (
    <div className={isLast ? '' : 'border-b border-border-soft'}>
      <div className="flex items-center gap-2.5 border-b border-border-soft bg-bg-elev px-3 py-2">
        <label
          className={
            'inline-flex min-w-0 items-center gap-2 ' +
            (disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')
          }
        >
          <Checkbox
            color="accent"
            checked={allOn}
            disabled={disabled}
            indeterminate={someOn}
            aria-label={area.displayName}
            onChange={() => onToggleArea(all.map((c) => c.name), allOn)}
          />
          <span className="text-[12px] font-semibold text-fg-strong">
            {area.displayName}
          </span>
        </label>
        <span className="flex-1" />
        <span
          className={`font-mono text-[10.5px] font-semibold tabular-nums ${countColor}`}
          style={countStyle}
        >
          {grantedCount}/{all.length}
        </span>
        {!disabled && (
          <Button
            plain
            size="xxs"
            onClick={() => onToggleArea(all.map((c) => c.name), allOn)}
          >
            {allOn ? t('roles.form.clearArea') : t('roles.form.selectAll')}
          </Button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1 p-2 max-md:grid-cols-2 max-sm:grid-cols-1">
        {filtered.map((c) => {
          const on = capabilities.has(c.name);
          return (
            <label
              key={c.name}
              className={
                'flex items-center gap-1.5 rounded px-2 py-1 ' +
                (disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer') +
                (on ? ' border border-accent-500/25 bg-accent-500/5' : ' border border-transparent')
              }
            >
              <Checkbox
                color="accent"
                checked={on}
                disabled={disabled}
                aria-label={c.displayName}
                onChange={() => onToggleCap(c.name)}
              />
              <span
                className={
                  'truncate text-[11.5px] ' +
                  (on ? 'font-medium text-fg-strong' : 'text-fg')
                }
              >
                {c.displayName}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
