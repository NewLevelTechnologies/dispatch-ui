/* eslint-disable i18next/no-literal-string -- dense v1.5 visual form; key strings are wrapped via t() but inline glyphs/separators/labels are kept as literals to keep the form markup readable */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { ChevronRightIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { PatternFormat } from 'react-number-format';
import { userApi, dispatchRegionApi, type Role } from '../api/setup';
import { roleAccentFromRole } from '../utils/roleColor';
import { showError, showSuccess, extractApiError } from '../lib/toast';
import { Badge } from '../components/catalyst/badge';
import { Button } from '../components/catalyst/button';
import { Card } from '../components/catalyst/card';
import { Checkbox } from '../components/catalyst/checkbox';
import { Field, Label } from '../components/catalyst/fieldset';
import { Heading } from '../components/catalyst/heading';
import { Input } from '../components/catalyst/input';
import { Text } from '../components/catalyst/text';

// Above this many roles, the role grid switches on a search field and
// pins selected roles to the top so they don't scroll out of view.
// Below it, every role is visible at once — the grid IS the summary,
// no search needed.
const SEARCH_THRESHOLD = 10;

interface UserFormPageProps {
  mode: 'invite' | 'edit';
}

export default function UserFormPage({ mode }: UserFormPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const isInvite = mode === 'invite';

  const { data: existingUser, isLoading: loadingUser } = useQuery({
    queryKey: ['users', id],
    queryFn: () => userApi.getById(id!),
    enabled: !isInvite && !!id,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: () => userApi.getRoles(),
  });

  const { data: activeRegions = [] } = useQuery({
    queryKey: ['dispatch-regions', 'active'],
    queryFn: () => dispatchRegionApi.getAll(false),
  });

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    roleIds: [] as string[],
    dispatchRegionIds: [] as string[],
  });
  const [sendInvite, setSendInvite] = useState(true);

  useEffect(() => {
    if (isInvite) return;
    if (!existingUser) return;
    // Seed the form from the loaded user. This is the recommended
    // pattern for initializing controlled forms — we intentionally set
    // state inside an effect because the source-of-truth (existingUser)
    // is asynchronous.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFormData({
      firstName: existingUser.firstName,
      lastName: existingUser.lastName,
      email: existingUser.email,
      phoneNumber: existingUser.phoneNumber ?? '',
      roleIds: existingUser.roles?.map((r) => r.id) ?? [],
      dispatchRegionIds: existingUser.dispatchRegionIds ?? [],
    });
  }, [existingUser, isInvite]);

  // Live "effective capabilities" — union of capability lists across
  // every selected role. The /users/roles list response ships only
  // `capabilityCount`, not the full capability arrays, so we fetch each
  // selected role's detail (which does include `capabilities`) via
  // useQueries. React Query caches per-role, so toggling a previously-
  // loaded role recomputes the union with no network round-trip.
  const selectedRoleDetailQueries = useQueries({
    queries: formData.roleIds.map((roleId) => ({
      queryKey: ['users', 'roles', roleId],
      queryFn: () => userApi.getRoleById(roleId),
      staleTime: 5 * 60 * 1000,
    })),
  });

  const effective = useMemo(() => {
    const selected = roles.filter((r) => formData.roleIds.includes(r.id));
    const all = new Set<string>();
    for (const q of selectedRoleDetailQueries) {
      for (const c of q.data?.capabilities ?? []) all.add(c);
    }
    return { count: all.size, set: all, roles: selected };
  }, [roles, formData.roleIds, selectedRoleDetailQueries]);

  const createMutation = useMutation({
    mutationFn: () =>
      userApi.create({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        roleIds: formData.roleIds,
        dispatchRegionIds: formData.dispatchRegionIds,
        phoneNumber: formData.phoneNumber.trim() || null,
        sendInvite,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      showSuccess(
        sendInvite ? 'Invitation sent' : 'User created',
        sendInvite
          ? `Email sent to ${created.email}. Link is valid 7 days.`
          : undefined
      );
      navigate(`/settings/access/users/${created.id}`);
    },
    onError: (error: unknown) => {
      showError(
        t('common.form.errorCreate', { entity: t('entities.user') }),
        extractApiError(error)
      );
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: () =>
      userApi.updateProfile(id!, {
        firstName: formData.firstName,
        lastName: formData.lastName,
        phoneNumber: formData.phoneNumber.trim() || null,
      }),
    onError: (error: unknown) => {
      showError(
        t('common.form.errorUpdate', { entity: t('entities.user') }),
        extractApiError(error)
      );
    },
  });

  const updateRolesMutation = useMutation({
    mutationFn: () => userApi.updateRoles(id!, { roleIds: formData.roleIds }),
    onError: (err) => showError("Couldn't update roles", extractApiError(err)),
  });

  const updateRegionsMutation = useMutation({
    mutationFn: () =>
      userApi.updateRegions(id!, { dispatchRegionIds: formData.dispatchRegionIds }),
    onError: (err) => showError("Couldn't update regions", extractApiError(err)),
  });

  const submitting =
    createMutation.isPending ||
    updateProfileMutation.isPending ||
    updateRolesMutation.isPending ||
    updateRegionsMutation.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.roleIds.length === 0) {
      // The CapabilityPreview also surfaces this inline; the toast is the
      // submit-time safety net for the edit flow (where the submit button
      // isn't disabled on zero roles).
      showError(t('users.form.roleRequired'));
      return;
    }

    if (isInvite) {
      createMutation.mutate();
      return;
    }

    try {
      await updateProfileMutation.mutateAsync();
      await updateRolesMutation.mutateAsync();
      await updateRegionsMutation.mutateAsync();
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['users', id] });
      // Role / region changes emit ROLE_ADDED / ROLE_REMOVED audit events
      // that should appear in the detail page's activity feed without a
      // hard refresh.
      queryClient.invalidateQueries({ queryKey: ['account-activity', id] });
      showSuccess('Changes saved');
      navigate(`/settings/access/users/${id}`);
    } catch {
      // mutation onError handlers already showed toasts
    }
  };

  const toggleRole = (roleId: string) => {
    setFormData((prev) => ({
      ...prev,
      roleIds: prev.roleIds.includes(roleId)
        ? prev.roleIds.filter((r) => r !== roleId)
        : [...prev.roleIds, roleId],
    }));
  };

  const toggleRegion = (regionId: string) => {
    setFormData((prev) => ({
      ...prev,
      dispatchRegionIds: prev.dispatchRegionIds.includes(regionId)
        ? prev.dispatchRegionIds.filter((r) => r !== regionId)
        : [...prev.dispatchRegionIds, regionId],
    }));
  };

  const cancelHref = isInvite
    ? '/settings/access/users'
    : `/settings/access/users/${id}`;

  if (!isInvite && loadingUser) {
    return <Text as="div" size="sm" tone="muted" className="p-8">Loading…</Text>;
  }

  const headerName = isInvite
    ? 'Invite user'
    : existingUser
      ? `Edit ${existingUser.firstName} ${existingUser.lastName}`
      : 'Edit user';

  return (
    <div className="-mx-6 -my-6 flex h-[calc(100svh-52px)] min-h-0 flex-col max-lg:-mx-4 max-lg:-my-4">
      <form
        id="user-form"
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
              {isInvite
                ? `All ${t('entities.users').toLowerCase()}`
                : existingUser
                  ? `${existingUser.firstName} ${existingUser.lastName}`
                  : 'Back'}
            </Link>

            <div className="mb-3.5">
              <Heading level={1} size="page-md" className="m-0">
                {headerName}
              </Heading>
              {isInvite && (
                <Text size="sm" tone="muted" className="mt-0.5">
                  An invitation email goes out on save. Link is valid 7 days.
                </Text>
              )}
            </div>

            <Card title="Identity" className="mb-3">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Field size="xs">
                  <Label size="xs" required>First name</Label>
                  <Input
                    size="xs"
                    value={formData.firstName}
                    onChange={(e) => setFormData((p) => ({ ...p, firstName: e.target.value }))}
                    placeholder="Maria"
                    required
                  />
                </Field>
                <Field size="xs">
                  <Label size="xs" required>Last name</Label>
                  <Input
                    size="xs"
                    value={formData.lastName}
                    onChange={(e) => setFormData((p) => ({ ...p, lastName: e.target.value }))}
                    placeholder="Chen"
                    required
                  />
                </Field>
              </div>
              <div className="mt-2.5">
                <Field size="xs">
                  <Label
                    size="xs"
                    required
                    hint={!isInvite ? 'sign-in · cannot change' : undefined}
                  >
                    Email
                  </Label>
                  <Input
                    size="xs"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                    placeholder="maria@yourcompany.com"
                    disabled={!isInvite}
                    required
                  />
                </Field>
              </div>
              <div className="mt-2.5">
                <Field size="xs">
                  <Label size="xs">Phone</Label>
                  <PatternFormat
                    format="(###) ###-####"
                    mask="_"
                    customInput={Input}
                    size="xs"
                    type="tel"
                    value={formData.phoneNumber}
                    onValueChange={(values) =>
                      setFormData((p) => ({ ...p, phoneNumber: values.value }))
                    }
                    placeholder="(555) 123-4567"
                  />
                </Field>
              </div>
            </Card>

            <Card
              title="Roles"
              subtitle={
                <>
                  Pick one role for most users. Multiple roles combine their capabilities.{' '}
                  <Link
                    to="/settings/access/roles"
                    className="font-medium text-fg-accent hover:underline"
                  >
                    Manage roles →
                  </Link>
                </>
              }
              className="mb-3"
            >
              <RoleMultiSelect
                roles={roles}
                selected={formData.roleIds}
                onToggle={toggleRole}
                onClear={() =>
                  setFormData((p) => ({ ...p, roleIds: [] }))
                }
              />
              <CapabilityPreview
                effective={effective}
                selectedCount={formData.roleIds.length}
              />
            </Card>

            <Card
              title="Regions"
              subtitle="Where in the world this user works. Limits which records they see."
              className="mb-3"
            >
              <RegionMultiSelect
                regions={activeRegions}
                selected={formData.dispatchRegionIds}
                onToggle={toggleRegion}
              />
            </Card>

            {isInvite && (
              <label className="mt-2 flex items-center gap-2 px-1 text-[11.5px] text-fg-muted">
                <Checkbox
                  color="accent"
                  checked={sendInvite}
                  onChange={setSendInvite}
                />
                <span>
                  Send invitation email to{' '}
                  <strong className="text-fg-strong">
                    {formData.email || 'their address'}
                  </strong>{' '}
                  on save
                </span>
              </label>
            )}
          </div>
        </div>

        {/* Mobile (<640px) reflow: meta line takes a full row above the
            buttons (basis-full + flex-wrap) so a long summary like
            "Creates 3 roles · 4 regions · 87 capabilities" doesn't push
            Cancel/Save off-screen. */}
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-t border-border bg-bg-elev px-7 py-3 max-lg:px-4">
          <div className="text-[11.5px] text-fg-muted max-sm:basis-full">
            {isInvite ? (
              <>
                Creates{' '}
                <strong className="text-fg-strong">
                  {formData.roleIds.length} role{formData.roleIds.length !== 1 && 's'}
                </strong>{' '}
                · {formData.dispatchRegionIds.length} region
                {formData.dispatchRegionIds.length !== 1 && 's'} · {effective.count} capabilities
              </>
            ) : (
              <>Role changes take effect on next sign-in.</>
            )}
          </div>
          <span className="flex-1" />
          <Button href={cancelHref} plain size="xs">
            Cancel
          </Button>
          <Button
            type="submit"
            color="accent"
            size="xs"
            disabled={submitting || (isInvite && formData.roleIds.length === 0)}
          >
            {submitting
              ? t('common.saving')
              : isInvite
                ? 'Send invitation'
                : 'Save changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// RoleMultiSelect — 3-col grid of role rows. Search appears only when
// roles.length > 10; below that, the grid is the summary. The per-row
// `<label>` wraps a Catalyst Checkbox; native label semantics forward
// clicks anywhere in the row to the checkbox.
// ──────────────────────────────────────────────────────────────────
function RoleMultiSelect({
  roles,
  selected,
  onToggle,
  onClear,
}: {
  roles: Role[];
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  const needsSearch = roles.length > SEARCH_THRESHOLD;
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!needsSearch) return roles;
    const q = query.toLowerCase();
    return roles.filter((r) => r.name.toLowerCase().includes(q));
  }, [roles, query, needsSearch]);

  const displayed = useMemo(() => {
    if (!needsSearch) return filtered;
    // Pin selected roles to the top so they stay visible while searching.
    return [...filtered].sort((a, b) => {
      const aSel = selected.includes(a.id) ? 1 : 0;
      const bSel = selected.includes(b.id) ? 1 : 0;
      return bSel - aSel;
    });
  }, [filtered, selected, needsSearch]);

  return (
    <div>
      {needsSearch && (
        <div className="relative mb-2.5">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-fg-dim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${roles.length} roles…`}
            className="block h-7 w-full rounded-md border border-border bg-bg-elev pl-7 pr-2.5 text-[12px] text-fg-strong outline-none focus:border-accent-500"
          />
        </div>
      )}

      {displayed.length === 0 ? (
        <div className="rounded-md border border-border-soft bg-bg-elev-2 px-3 py-3.5 text-center text-[11.5px] text-fg-muted">
          No roles match "{query}".{' '}
          <Link
            to="/settings/access/roles"
            className="font-medium text-fg-accent hover:underline"
          >
            Create role →
          </Link>
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3 ${
            needsSearch ? 'max-h-[240px] overflow-y-auto p-0.5' : ''
          }`}
        >
          {displayed.map((role) => {
            const on = selected.includes(role.id);
            const capCount = role.capabilityCount ?? role.capabilities?.length ?? 0;
            const color = roleAccentFromRole(role);
            return (
              // Native <label> wrapping a Catalyst Checkbox — the browser
              // forwards clicks anywhere inside the label to the nested
              // button-role checkbox, so the whole row stays clickable.
              <label
                key={role.id}
                className="grid cursor-pointer grid-cols-[16px_1fr_auto] items-center gap-2 rounded-md border px-2.5 py-1.5"
                style={{
                  background: on
                    ? 'color-mix(in oklch, var(--accent-500) 7%, var(--bg-elev-2))'
                    : 'var(--bg-elev-2)',
                  borderColor: on
                    ? 'color-mix(in oklch, var(--accent-500) 25%, var(--border))'
                    : 'var(--border-soft)',
                }}
              >
                <Checkbox
                  color="accent"
                  checked={on}
                  onChange={() => onToggle(role.id)}
                />
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="size-1.5 flex-shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                  <span
                    className={`truncate text-[12px] text-fg-strong ${on ? 'font-semibold' : 'font-medium'}`}
                  >
                    {role.name}
                  </span>
                </span>
                <span className="font-mono text-[10px] tabular-nums text-fg-dim">
                  {capCount}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {selected.length > 1 && (
        <div className="mt-2 text-right">
          <button
            type="button"
            onClick={onClear}
            className="bg-transparent p-0 text-[11px] text-fg-muted hover:text-fg-strong"
          >
            Clear all {selected.length}
          </button>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// CapabilityPreview — live readout, expandable. Lives below the role
// grid so the admin can see what they're granting before they save.
// ──────────────────────────────────────────────────────────────────
function CapabilityPreview({
  effective,
  selectedCount,
}: {
  effective: { count: number; set: Set<string>; roles: Role[] };
  selectedCount: number;
}) {
  const [open, setOpen] = useState(false);
  // Fetch eagerly: we need the area count for the always-visible summary
  // line ("65 across 8 areas"). Lazy-loading it gated the count behind the
  // disclosure expand, which left users seeing "65 across — areas".
  const { data: groupedData } = useQuery({
    queryKey: ['capabilities', 'grouped'],
    queryFn: () => userApi.getGroupedCapabilities(),
  });

  if (selectedCount === 0) {
    return (
      <div
        className="mt-2.5 rounded-md border px-2.5 py-2 text-[11.5px]"
        style={{
          background: 'color-mix(in oklch, var(--danger-500) 7%, transparent)',
          borderColor: 'color-mix(in oklch, var(--danger-500) 25%, var(--border))',
          color: 'var(--danger-500)',
        }}
      >
        Pick at least one role. The user can't sign in with zero roles.
      </div>
    );
  }

  // Group capabilities by area. Computed whenever groupedData is loaded —
  // the summary line ("N across M areas") needs M up-front, even while the
  // disclosure is collapsed.
  const byArea =
    groupedData
      ? groupedData.groups
          .map((g) => ({
            area: g.displayName,
            caps: g.capabilities.filter((c) => effective.set.has(c.name)),
          }))
          .filter((g) => g.caps.length > 0)
      : [];

  return (
    <div className="mt-2.5 rounded-md border border-border-soft bg-bg-elev-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[11.5px]"
      >
        <ChevronRightIcon
          className={`size-3.5 text-fg-dim transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="text-fg-muted">Effective capabilities:</span>
        <span className="font-mono font-semibold tabular-nums text-fg-strong">
          {effective.count}
        </span>
        <span className="text-fg-muted">
          across{' '}
          <span className="font-semibold text-fg-strong">{byArea.length || '—'}</span> areas
        </span>
        <span className="flex-1" />
        <span className="text-[10.5px] font-medium text-fg-accent">
          {open ? 'Hide' : 'Show'} details
        </span>
      </button>
      {open && (
        <div className="max-h-[220px] overflow-y-auto border-t border-dashed border-border-soft p-2.5">
          {!groupedData ? (
            <div className="text-[11.5px] text-fg-muted">Loading capabilities…</div>
          ) : (
            byArea.map((g, i) => (
              <div key={g.area} className={i < byArea.length - 1 ? 'mb-2.5' : ''}>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                  {g.area} · {g.caps.length}
                </div>
                <div className="flex flex-wrap gap-1">
                  {g.caps.map((c) => (
                    <Badge key={c.name} color="accent" size="xs" title={c.description}>
                      {c.displayName}
                    </Badge>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// RegionMultiSelect — chip-style toggles. Selected chips fill with
// accent; unselected sit on the nested-card surface.
// ──────────────────────────────────────────────────────────────────
function RegionMultiSelect({
  regions,
  selected,
  onToggle,
}: {
  regions: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (regions.length === 0) {
    return (
      <div className="text-[11.5px] text-fg-muted">
        No active dispatch regions configured.{' '}
        <Link
          to="/settings/dispatch-regions"
          className="font-medium text-fg-accent hover:underline"
        >
          Manage regions →
        </Link>
      </div>
    );
  }

  // 3-col checkbox grid — same shape as RoleMultiSelect. The selectable
  // multi-select pattern lives in one place on this page; a separate chip
  // language for regions was confusing alongside the role grid. The third
  // column is reserved for an optional per-region count (e.g. "# of WOs")
  // when we have one to surface; today it stays empty.
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
      {regions.map((r) => {
        const on = selected.includes(r.id);
        return (
          <label
            key={r.id}
            className="grid cursor-pointer grid-cols-[16px_1fr_auto] items-center gap-2 rounded-md border px-2.5 py-1.5"
            style={{
              background: on
                ? 'color-mix(in oklch, var(--accent-500) 7%, var(--bg-elev-2))'
                : 'var(--bg-elev-2)',
              borderColor: on
                ? 'color-mix(in oklch, var(--accent-500) 25%, var(--border))'
                : 'var(--border-soft)',
            }}
          >
            <Checkbox
              color="accent"
              checked={on}
              onChange={() => onToggle(r.id)}
            />
            <span
              className={`truncate text-[12px] text-fg-strong ${on ? 'font-semibold' : 'font-medium'}`}
            >
              {r.name}
            </span>
          </label>
        );
      })}
    </div>
  );
}

// Route wrappers — keep route definitions clean so we don't have to
// thread `mode` through every <Route element={...}> declaration.
export function UserInvitePage() {
  return <UserFormPage mode="invite" />;
}

export function UserEditPage() {
  return <UserFormPage mode="edit" />;
}
