/* eslint-disable i18next/no-literal-string -- dense v1.5 visual page; key i18n is wired via t() for major strings, but inline glyphs/separators/short labels are kept as literals to keep the markup readable */
import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { userApi, dispatchRegionApi, type User, type Role } from '../api/setup';
import { RoleChip } from '../components/RoleChip';
import { roleAccent } from '../utils/roleColor';
import { auditApi, type AccountActivityEvent } from '../api/setup';
import { formatPhone } from '@dispatch/utils';
import { useHasCapability } from '../hooks/useCurrentUser';
import { Avatar } from '../components/ui/Avatar';
import { Callout } from '../components/ui/Callout';
import { Pill } from '../components/ui/Pill';
import { Badge } from '../components/catalyst/badge';
import { Button } from '../components/catalyst/button';
import { Card } from '../components/catalyst/card';
import { DataRow } from '../components/catalyst/data-row';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import ConfirmDialog from '../components/ConfirmDialog';
import { showError, showSuccess, extractApiError } from '../lib/toast';

function formatDateShort(d: string | Date | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function relTime(ts: string): string {
  const then = new Date(ts).getTime();
  const now = Date.now();
  const diffMin = Math.round((now - then) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  if (diffD === 1) return 'Yesterday';
  if (diffD < 7) return `${diffD}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const canEditUsers = useHasCapability('EDIT_USERS');
  // Activate/deactivate moved to a dedicated capability on the backend so
  // it can be granted independently of profile/role edits.
  const canDeactivateUsers = useHasCapability('DEACTIVATE_USERS');
  const canViewAuditLogs = useHasCapability('VIEW_AUDIT_LOGS');

  const { data: user, isLoading, error } = useQuery({
    queryKey: ['users', id],
    queryFn: () => userApi.getById(id!),
  });

  const { data: allRegions } = useQuery({
    queryKey: ['dispatch-regions'],
    queryFn: () => dispatchRegionApi.getAll(true),
  });

  const disableMutation = useMutation({
    mutationFn: () => userApi.disable(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', id] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      showSuccess('User deactivated');
    },
    onError: (err) => showError("Couldn't deactivate user", extractApiError(err)),
  });

  const enableMutation = useMutation({
    mutationFn: () => userApi.enable(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', id] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      showSuccess('User reactivated');
    },
    onError: (err) => showError("Couldn't reactivate user", extractApiError(err)),
  });

  // Resend Invitation — only meaningful while the user is in INVITED or
  // INVITATION_EXPIRED state. Backend returns 409 if the user is past the
  // invitation state (shouldn't happen given the UI gate, but defend
  // against races with another admin accepting the invite).
  const resendInvitationMutation = useMutation({
    mutationFn: () => userApi.resendInvitation(id!),
    onSuccess: () => {
      // Eventual-consistency tail on the activity feed.
      window.setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['account-activity', id] });
      }, 2000);
      queryClient.invalidateQueries({ queryKey: ['users', id] });
      showSuccess('Invitation resent');
    },
    onError: (err: unknown) => {
      const status =
        err instanceof Error && 'response' in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined;
      const message = extractApiError(err);
      if (status === 409) {
        showError(message || 'This user is no longer in an invitable state.');
        // Refetch so the button drops away on the next render.
        queryClient.invalidateQueries({ queryKey: ['users', id] });
        return;
      }
      showError(message || 'Failed to resend invitation.');
    },
  });

  const handleEdit = () => {
    if (user) navigate(`/settings/access/users/${user.id}/edit`);
  };

  const handleResendInvitation = () => resendInvitationMutation.mutate();

  const [lifecycleConfirm, setLifecycleConfirm] = useState<'deactivate' | 'activate' | null>(null);
  const handleDeactivate = () => setLifecycleConfirm('deactivate');
  const handleActivate = () => setLifecycleConfirm('activate');
  const confirmLifecycle = () => {
    if (lifecycleConfirm === 'deactivate') disableMutation.mutate();
    else if (lifecycleConfirm === 'activate') enableMutation.mutate();
  };

  if (isLoading) {
    return (
      <Text as="div" size="sm" tone="muted" className="p-8 text-center">
        {t('common.actions.loading', { entities: t('entities.user') })}
      </Text>
    );
  }

  if (error || !user) {
    return (
      <div className="p-8">
        <Callout kind="danger">
          {t('common.actions.errorLoading', { entities: t('entities.user') })}
          {error && `: ${(error as Error).message}`}
        </Callout>
        <Button className="mt-4" onClick={() => navigate('/settings/access/users')}>
          <ArrowLeftIcon className="size-4" />
          {t('common.actions.back')}
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-[980px]">
      <Link
        to="/settings/access/users"
        className="mb-2.5 inline-flex items-center gap-1 text-[11.5px] text-fg-muted hover:text-fg-strong"
      >
        ← All {t('entities.users').toLowerCase()}
      </Link>

      <Header
        user={user}
        onEdit={canEditUsers ? handleEdit : undefined}
        onResendInvitation={canEditUsers ? handleResendInvitation : undefined}
        resendInvitationPending={resendInvitationMutation.isPending}
      />

      <div className="mt-3">
        <RolesAndRegionsCard user={user} regions={allRegions ?? []} onEditAccess={canEditUsers ? handleEdit : undefined} />
      </div>

      <div className="mt-3">
        <SecurityCard userId={user.id} email={user.email} canEdit={canEditUsers} />
      </div>

      {canViewAuditLogs && (
        <div className="mt-3">
          <AccountActivityCard userId={user.id} />
        </div>
      )}

      {canDeactivateUsers && (
        <div className="mt-3">
          <LifecycleFooter
            user={user}
            onDeactivate={handleDeactivate}
            onActivate={handleActivate}
            pending={disableMutation.isPending || enableMutation.isPending}
          />
        </div>
      )}

      <ConfirmDialog
        isOpen={lifecycleConfirm !== null}
        onClose={() => setLifecycleConfirm(null)}
        onConfirm={confirmLifecycle}
        title={
          lifecycleConfirm === 'deactivate'
            ? t('users.actions.disableConfirm', { name: `${user.firstName} ${user.lastName}` })
            : t('users.actions.enableConfirm', { name: `${user.firstName} ${user.lastName}` })
        }
        message={
          lifecycleConfirm === 'deactivate'
            ? t('users.actions.disableWarning')
            : t('users.actions.enableWarning')
        }
        confirmLabel={lifecycleConfirm === 'deactivate' ? 'Deactivate' : 'Reactivate'}
        isDestructive={lifecycleConfirm === 'deactivate'}
        isPending={disableMutation.isPending || enableMutation.isPending}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Header — avatar, name, role chips, inline status line, actions
// ──────────────────────────────────────────────────────────────────
function Header({
  user,
  onEdit,
  onResendInvitation,
  resendInvitationPending,
}: {
  user: User;
  onEdit?: () => void;
  onResendInvitation?: () => void;
  resendInvitationPending?: boolean;
}) {
  const fullName = `${user.firstName} ${user.lastName}`;
  // Per the v1.5 spec: "Resend invite" only surfaces while the user is in
  // INVITED or INVITATION_EXPIRED. Don't gate on `enabled` — a disabled
  // user that never accepted is still "invited".
  const canResendInvitation =
    !!onResendInvitation &&
    (user.invitationStatus === 'INVITED' || user.invitationStatus === 'INVITATION_EXPIRED');
  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-border bg-bg-elev px-4 py-3.5 sm:flex-row sm:items-center sm:gap-3.5">
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <Avatar name={fullName} src={user.photoUrl ?? undefined} size="xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <Heading level={1} size="page-sm" className="m-0">
              {fullName}
            </Heading>
            <RoleStack roles={user.roles ?? []} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-muted">
            {user.enabled ? (
              <Pill tone="success" dot live inline>Active</Pill>
            ) : (
              <Pill tone="neutral" dot inline>Disabled</Pill>
            )}
            <span className="text-fg-dim">·</span>
            <span className="break-all">{user.email}</span>
            {user.phoneNumber && (
              <>
                <span className="text-fg-dim">·</span>
                <a
                  href={`tel:${user.phoneNumber.replace(/\D/g, '')}`}
                  className="font-mono hover:text-fg-strong hover:underline"
                >
                  {formatPhone(user.phoneNumber)}
                </a>
              </>
            )}
            <span className="text-fg-dim">·</span>
            <span>Joined {formatDateShort(user.createdAt)}</span>
          </div>
        </div>
      </div>
      {/* Mobile (<640px) reflow: actions drop to a full-width row below
          the identity block, with each button claiming an equal share. At
          ≥640px the actions sit trailing on the same row as the avatar. */}
      <div className="flex gap-1.5 max-sm:w-full max-sm:[&>*]:flex-1 sm:flex-shrink-0">
        {canResendInvitation && (
          <Button
            outline
            size="xs"
            onClick={onResendInvitation}
            disabled={resendInvitationPending}
          >
            {resendInvitationPending ? 'Resending…' : 'Resend invitation'}
          </Button>
        )}
        {onEdit && (
          <Button color="accent" size="xs" onClick={onEdit}>
            Edit user
          </Button>
        )}
      </div>
    </div>
  );
}

function RoleStack({ roles, max = 3 }: { roles: Role[]; max?: number }) {
  if (!roles.length) {
    return <span className="text-[11.5px] italic text-fg-dim">No roles</span>;
  }
  const inline = roles.slice(0, max);
  const more = roles.length - inline.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {inline.map((r) => (
        <RoleChip key={r.id} name={r.name} accentId={r.accentId} />
      ))}
      {more > 0 && (
        <Badge title={roles.slice(max).map((r) => r.name).join(', ')}>
          +{more} more
        </Badge>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Roles + Regions — combined card with capabilities expander
// ──────────────────────────────────────────────────────────────────
function RolesAndRegionsCard({
  user,
  regions,
  onEditAccess,
}: {
  user: User;
  regions: { id: string; name: string }[];
  onEditAccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const userRegions = (user.dispatchRegionIds ?? [])
    .map((id) => regions.find((r) => r.id === id))
    .filter((r): r is { id: string; name: string } => !!r);
  const capCount = user.capabilities?.length ?? 0;

  return (
    <Card padding="none" footer={open && capCount > 0 ? <CapabilityDetail user={user} /> : null}>
      <DataRow
        label="Roles"
        labelWidth={90}
        action={
          onEditAccess ? (
            <Button outline size="xxs" onClick={onEditAccess}>
              Edit access
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-wrap gap-1">
          {(user.roles ?? []).length > 0 ? (
            user.roles!.map((r) => (
              <RoleChip key={r.id} name={r.name} accentId={r.accentId} />
            ))
          ) : (
            <span className="text-[11.5px] italic text-fg-dim">No roles assigned</span>
          )}
        </div>
      </DataRow>
      <DataRow label="Regions" labelWidth={90} last={capCount === 0}>
        <div className="flex flex-wrap gap-1">
          {userRegions.length === 0 ? (
            <span className="text-[11.5px] italic text-fg-muted">
              {t('users.detail.noRegionsAssigned')}
            </span>
          ) : (
            userRegions.map((r) => <Badge key={r.id}>{r.name}</Badge>)
          )}
        </div>
      </DataRow>

      {capCount > 0 && (
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 text-[11px] text-fg-muted">
          <span>
            <span className="font-mono font-semibold tabular-nums text-fg-strong">
              {capCount}
            </span>{' '}
            capabilities granted
          </span>
          <span className="text-fg-dim">·</span>
          <button
            onClick={() => setOpen(!open)}
            className="font-medium text-fg-accent hover:underline"
          >
            {open ? 'Hide details' : 'View detailed permissions'}
          </button>
        </div>
      )}
    </Card>
  );
}

// Expanded capability detail — grouped by feature area
function CapabilityDetail({ user }: { user: User }) {
  const { data } = useQuery({
    queryKey: ['capabilities', 'grouped'],
    queryFn: () => userApi.getGroupedCapabilities(),
  });

  if (!data) {
    return (
      <div className="border-t border-dashed border-border-soft px-3.5 py-3 text-[11.5px] text-fg-muted">
        Loading capabilities…
      </div>
    );
  }

  const userCaps = new Set(user.capabilities ?? []);
  const sourceRoles = (user.roles ?? []).map((r) => ({
    name: r.name,
    accentId: r.accentId,
    caps: new Set(r.capabilities ?? []),
  }));
  const groups = data.groups
    .map((g) => ({
      area: g.displayName,
      total: g.capabilities.length,
      granted: g.capabilities.filter((c) => userCaps.has(c.name)),
    }))
    .filter((g) => g.granted.length > 0);

  return (
    <div className="border-t border-dashed border-border-soft">
      <div className="flex items-center justify-between bg-bg-elev-2 px-3.5 py-2 text-[11px] text-fg-muted">
        <span>
          Capabilities grouped by area · Union of {user.roles?.length ?? 0} role
          {(user.roles?.length ?? 0) !== 1 && 's'}.
        </span>
      </div>
      <div>
        {groups.map((g, i) => (
          <DataRow
            key={g.area}
            label={g.area}
            labelWidth={180}
            last={i === groups.length - 1}
            action={
              <div className="text-right font-mono text-[10px] font-medium text-fg-dim">
                {g.granted.length}/{g.total}
              </div>
            }
          >
            <div className="flex flex-wrap gap-1">
              {g.granted.map((c) => {
                const sources = sourceRoles.filter((sr) => sr.caps.has(c.name));
                return (
                  <Badge key={c.name} color="accent" size="xs" title={c.description}>
                    {c.displayName}
                    {sources.length > 0 && sources.length < (user.roles?.length ?? 0) && (
                      <span
                        className="rounded px-1 text-[9px] font-bold uppercase tracking-wider text-white"
                        style={{ background: roleAccent(sources[0].accentId, sources[0].name) }}
                      >
                        {sources[0].name
                          .split(' ')
                          .map((w) => w[0])
                          .join('')}
                      </span>
                    )}
                  </Badge>
                );
              })}
            </div>
          </DataRow>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Security — Password / 2FA / Sign-in rows.
// Each row calls a dedicated POST endpoint on user-service. Backend
// emits matching activity-feed events; we refetch after ~2s to give
// the SNS/SQS pipeline time to land the row.
//
// The 15-min TTL hint is required copy per the v1.5 spec — it sets
// expectations that "sign out everywhere" isn't instantaneous because
// access tokens stay valid until expiry; only refresh is revoked
// immediately. Don't drop it.
// ──────────────────────────────────────────────────────────────────
function SecurityCard({ userId, email, canEdit }: { userId: string; email: string; canEdit: boolean }) {
  const queryClient = useQueryClient();

  // Eventual-consistency tail: backend emits an activity row to SNS,
  // which lands in audit-service via SQS a couple seconds later. One
  // delayed invalidation is enough; React Query handles the refetch.
  const refetchActivitySoon = () => {
    window.setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['account-activity', userId] });
    }, 2000);
  };

  const onErrorToast = (action: string) => (err: unknown) =>
    showError(`${action} failed`, extractApiError(err));

  const resetPasswordMutation = useMutation({
    mutationFn: () => userApi.sendPasswordResetLink(userId),
    onSuccess: () => {
      refetchActivitySoon();
      showSuccess('Password reset link sent');
    },
    onError: onErrorToast('Send reset link'),
  });

  // 2FA status from /users/:id/2fa/status — same shape as Amplify's
  // fetchMFAPreference (self-user). Backend pays the Cognito call lazily
  // when this endpoint is hit. Activity-feed refetch after a reset
  // separately invalidates this so the row flips ON → OFF.
  const { data: mfa } = useQuery({
    queryKey: ['user-2fa-status', userId],
    queryFn: () => userApi.get2faStatus(userId),
  });
  const activeMethod: 'TOTP' | 'SMS' | 'EMAIL' | null = (() => {
    if (!mfa) return null;
    const enabled = mfa.enabled ?? [];
    const preferred = mfa.preferred;
    const pick = (m: 'TOTP' | 'SMS' | 'EMAIL') =>
      enabled.includes(m) || preferred === m;
    if (pick('TOTP')) return 'TOTP';
    if (pick('SMS')) return 'SMS';
    if (pick('EMAIL')) return 'EMAIL';
    return null;
  })();
  const twofaOn = activeMethod !== null;
  const twofaMethodLabel = (() => {
    if (activeMethod === 'SMS') return 'Text message';
    if (activeMethod === 'EMAIL') return 'Email';
    if (activeMethod === 'TOTP') return 'Authenticator app';
    return null;
  })();

  const resetMfaMutation = useMutation({
    mutationFn: () => userApi.resetMfa(userId),
    onSuccess: () => {
      refetchActivitySoon();
      queryClient.invalidateQueries({ queryKey: ['user-2fa-status', userId] });
      showSuccess('2FA reset', 'User has been signed out of all sessions.');
    },
    onError: onErrorToast('Reset 2FA'),
  });

  const signOutMutation = useMutation({
    mutationFn: () => userApi.signOutEverywhere(userId),
    onSuccess: () => {
      refetchActivitySoon();
      showSuccess('Signed out of all sessions');
    },
    onError: onErrorToast('Sign out everywhere'),
  });

  // Confirm dialogs for all three Security-card actions. Send-reset-link is
  // confirmed because Cognito flips the user into RESET_REQUIRED on success —
  // if the email is wrong/unreachable, the user is locked out of sign-in
  // until an admin manually sets a password via the Cognito console.
  type ConfirmKind = 'resetPassword' | 'resetMfa' | 'signOut';
  const [pendingConfirm, setPendingConfirm] = useState<ConfirmKind | null>(null);

  const confirmCopy: Record<ConfirmKind, { title: string; message: string; confirmLabel: string }> = {
    resetPassword: {
      title: 'Send password reset link?',
      message:
        `A reset link will be emailed to ${email}. The user will not be able to sign in with their current password until they complete the reset.`,
      confirmLabel: 'Send reset link',
    },
    resetMfa: {
      title: 'Reset 2FA?',
      message:
        'This also signs the user out of all sessions — they will need to re-enroll an authenticator on next sign-in.',
      confirmLabel: 'Reset 2FA',
    },
    signOut: {
      title: 'Sign this user out of all sessions?',
      message:
        'Refresh tokens are revoked immediately. Access tokens may keep working for up to 15 minutes (TTL).',
      confirmLabel: 'Sign out everywhere',
    },
  };

  const runPendingConfirm = () => {
    if (pendingConfirm === 'resetPassword') resetPasswordMutation.mutate();
    else if (pendingConfirm === 'resetMfa') resetMfaMutation.mutate();
    else if (pendingConfirm === 'signOut') signOutMutation.mutate();
  };

  return (
    <Card title="Security" padding="none">
      <DataRow
        label="Password"
        labelWidth={110}
        action={
          <Button
            outline
            size="xxs"
            onClick={() => setPendingConfirm('resetPassword')}
            disabled={!canEdit || resetPasswordMutation.isPending}
          >
            {resetPasswordMutation.isPending ? 'Sending…' : 'Send reset link'}
          </Button>
        }
      >
        <Text as="div" size="sm" tone="strong">Managed via reset link</Text>
      </DataRow>

      {/* Two-factor — status pulled from /users/:id/2fa/status. ON shows
          the green pill + method label and keeps the Reset 2FA action;
          OFF shows dim "Not enrolled" and hides the action (nothing to
          reset). Mirrors AccountSettingsPage's self-user 2FA-on row. */}
      <DataRow
        label="Two-factor"
        labelWidth={110}
        action={
          twofaOn ? (
            <Button
              outline
              size="xxs"
              onClick={() => setPendingConfirm('resetMfa')}
              disabled={!canEdit || resetMfaMutation.isPending}
            >
              {resetMfaMutation.isPending ? 'Resetting…' : 'Reset 2FA'}
            </Button>
          ) : null
        }
      >
        {twofaOn ? (
          <div className="flex items-center gap-2">
            {/* TODO(design-system): replace inline "ON" pill with
                `<Badge color="green" size="xs">` once Badge gains an
                xs size variant. Mirrors AccountSettingsPage. */}
            <span className="inline-flex items-center rounded-[4px] bg-success-500/14 px-2 py-0.5 text-[11px] font-bold tracking-wider text-success-500">
              <span className="mr-1">●</span>
              ON
            </span>
            {twofaMethodLabel && (
              <Text as="span" size="sm" tone="strong">{twofaMethodLabel}</Text>
            )}
          </div>
        ) : (
          <Text as="div" size="sm" tone="muted">Not enrolled</Text>
        )}
      </DataRow>

      <DataRow
        label="Sign-in"
        labelWidth={110}
        last
        action={
          <Button
            outline
            size="xxs"
            onClick={() => setPendingConfirm('signOut')}
            disabled={!canEdit || signOutMutation.isPending}
          >
            {signOutMutation.isPending ? 'Signing out…' : 'Sign out everywhere'}
          </Button>
        }
      >
        <Text as="div" size="sm" tone="strong">Email + password</Text>
        <div className="mt-0.5 text-[10.5px] leading-snug text-fg-dim">
          Existing sessions end within 15 min (access-token TTL). Refresh is revoked immediately.
        </div>
      </DataRow>
      <ConfirmDialog
        isOpen={pendingConfirm !== null}
        onClose={() => setPendingConfirm(null)}
        onConfirm={runPendingConfirm}
        title={pendingConfirm ? confirmCopy[pendingConfirm].title : ''}
        message={pendingConfirm ? confirmCopy[pendingConfirm].message : ''}
        confirmLabel={pendingConfirm ? confirmCopy[pendingConfirm].confirmLabel : 'Confirm'}
        isDestructive
        isPending={resetPasswordMutation.isPending || resetMfaMutation.isPending || signOutMutation.isPending}
      />
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────
// Account activity — backed by /audit/account-activity/{userId}.
//
// The contract is additive: new actionType values land over time
// (failed sign-ins, success sign-ins, attempt-collapse rows from
// Cognito Lambda triggers). The classifier defaults to a generic
// "Activity" glyph so an unknown enum value renders gracefully instead
// of erroring.
//
// Cascade rows (mfa_reset + global_signout, deactivate + global_signout)
// are intentionally separate facts — render them back-to-back; do not
// de-dupe. Payload may be null; only role events populate it today.
// ──────────────────────────────────────────────────────────────────
type Kind = 'signin' | 'access' | 'security' | 'failed' | 'lifecycle' | 'lifecycle-warn';

function rolePayloadName(payload: AccountActivityEvent['payload']): string {
  if (!payload || typeof payload !== 'object') return '(unknown role)';
  const p = payload as { roleName?: unknown; roleId?: unknown };
  if (typeof p.roleName === 'string' && p.roleName) return p.roleName;
  if (typeof p.roleId === 'string' && p.roleId) return p.roleId;
  return '(unknown role)';
}

// Round a window duration to the largest human-friendly unit. Sign-in
// attempt windows are typically minutes; this rolls up to "Nh" if a
// window ever grows past 60 minutes so the meta line doesn't say "73 min".
// Cheap UA → "Browser · OS" for the sign-in meta line. Heuristic, not
// authoritative — the value only ever appears as a sub-line under "Signed
// in", so a wrong-but-close label is fine. Order matters: Edge UA strings
// also contain "Chrome", iOS Chrome also contains "Safari", etc.
function describeUserAgent(ua: string | null): string | null {
  if (!ua) return null;
  let browser: string | null = null;
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\//.test(ua)) browser = 'Opera';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  let os: string | null = null;
  if (/iPhone|iPad|iOS/.test(ua)) os = /iPad/.test(ua) ? 'iPad' : 'iOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Linux/.test(ua)) os = 'Linux';
  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function formatWindowSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 60) {
    return `${Math.max(1, Math.round(seconds))}s`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

function classifyEvent(event: AccountActivityEvent): {
  kind: Kind;
  text: string;
  // Optional per-event sub-line. When set, takes the slot the actor
  // "· By {name}" line would have occupied — sign-in runs render the
  // attempt count + window instead of an actor since the actor IS the
  // user whose detail page this is.
  meta?: string;
} {
  switch (event.actionType) {
    case 'USER_CREATED':
      return { kind: 'lifecycle', text: 'Account created' };
    case 'USER_ACTIVATED':
      return { kind: 'lifecycle', text: 'Account activated' };
    case 'USER_DEACTIVATED':
      // Lifecycle category, but warn tone per the spec — deactivation is
      // a noteworthy event and benefits from the visual cue.
      return { kind: 'lifecycle-warn', text: 'Account deactivated' };
    case 'INVITATION_RESENT':
      return { kind: 'lifecycle', text: 'Invitation resent' };
    case 'INVITATION_ACCEPTED':
      return { kind: 'lifecycle', text: 'Invitation accepted' };
    case 'ROLE_ADDED':
      return { kind: 'access', text: `Role "${rolePayloadName(event.payload)}" added` };
    case 'ROLE_REMOVED':
      return { kind: 'access', text: `Role "${rolePayloadName(event.payload)}" removed` };
    case 'PASSWORD_RESET_SENT':
      return { kind: 'security', text: 'Password reset link sent' };
    case 'MFA_RESET':
      return { kind: 'security', text: '2FA reset' };
    case 'TWO_FA_ENABLED': {
      const p = (event.payload ?? {}) as { method?: unknown };
      const method = typeof p.method === 'string' ? p.method : null;
      return {
        kind: 'security',
        text: method ? `2FA enabled (${method})` : '2FA enabled',
      };
    }
    case 'GLOBAL_SIGNOUT':
      return { kind: 'security', text: 'Signed out of all sessions' };
    case 'SIGN_IN_SUCCESS': {
      // Meta is "Browser · OS · IP" when both userAgent and ip are
      // populated. Backend doesn't fill these in yet — render an empty
      // meta rather than a misleading placeholder until it does.
      const ua = describeUserAgent(event.userAgent);
      const parts = [ua, event.ip].filter((p): p is string => !!p);
      return {
        kind: 'signin',
        text: 'Signed in',
        meta: parts.length ? parts.join(' · ') : undefined,
      };
    }
    case 'SIGN_IN_FAILED_RUN': {
      const p = (event.payload ?? {}) as {
        attemptCount?: unknown;
        windowSeconds?: unknown;
      };
      const count = typeof p.attemptCount === 'number' ? p.attemptCount : 0;
      const windowText =
        typeof p.windowSeconds === 'number'
          ? `within ${formatWindowSeconds(p.windowSeconds)}`
          : null;
      const meta = windowText
        ? `${count} attempts · ${windowText}`
        : `${count} attempts`;
      return { kind: 'failed', text: 'Failed sign-in attempts', meta };
    }
    default:
      // Forward-compat: a brand-new actionType still renders. Use access
      // tone (★) since it reads as "something happened" without claiming
      // a category.
      return { kind: 'access', text: 'Activity' };
  }
}

const KIND_STYLES: Record<Kind, { glyph: string; bg: string; fg: string }> = {
  signin: { glyph: '→', bg: 'var(--bg-active)', fg: 'var(--fg-muted)' },
  access: {
    glyph: '★',
    bg: 'color-mix(in oklch, var(--accent-500) 14%, transparent)',
    fg: 'var(--accent-700)',
  },
  security: {
    glyph: '✓',
    bg: 'color-mix(in oklch, var(--success-500) 14%, transparent)',
    fg: 'var(--success-500)',
  },
  failed: {
    glyph: '!',
    bg: 'color-mix(in oklch, var(--warning-500) 14%, transparent)',
    fg: 'var(--warning-fg)',
  },
  lifecycle: {
    glyph: '+',
    bg: 'color-mix(in oklch, var(--violet-500) 14%, transparent)',
    fg: 'var(--violet-500)',
  },
  'lifecycle-warn': {
    glyph: '−',
    bg: 'color-mix(in oklch, var(--warning-500) 14%, transparent)',
    fg: 'var(--warning-fg)',
  },
};

function AccountActivityCard({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['account-activity', userId],
    queryFn: () => auditApi.getAccountActivity(userId),
  });

  // Backend already returns the curated 20-row feed newest-first. No
  // client-side slicing or de-duping — adjacent cascade rows are two
  // separate facts (mfa_reset + global_signout, deactivate + global_signout).
  const entries = data ?? [];

  return (
    <Card
      title="Account activity"
      subtitle="Sign-ins, access changes, security events. Record edits appear on each record."
      padding="none"
    >
      {isLoading && (
        <div className="px-3.5 py-3 text-[11.5px] text-fg-muted">Loading activity…</div>
      )}
      {!isLoading && entries.length === 0 && (
        <div className="px-3.5 py-3 text-[11.5px] text-fg-muted">No activity recorded yet.</div>
      )}
      {entries.map((e, i) => {
          const cls = classifyEvent(e);
          const s = KIND_STYLES[cls.kind];
          // Per-event meta wins over the actor line. For sign-in runs the
          // meaningful sub-line is the attempt count + window; for everyone
          // else it's "By {actor}" when an actor is present.
          const subLine = cls.meta ?? (e.actor?.name ? `By ${e.actor.name}` : null);
          return (
            <div
              key={e.id}
              className={`grid grid-cols-[90px_22px_1fr] items-center gap-2.5 px-3.5 py-1.5 ${
                i < entries.length - 1 ? 'border-b border-border-soft' : ''
              }`}
            >
              <Text as="div" size="xs" tone="dim">{relTime(e.occurredAt)}</Text>
              <div
                className="flex size-[18px] items-center justify-center rounded text-[11px] font-bold"
                style={{ background: s.bg, color: s.fg }}
              >
                {s.glyph}
              </div>
              <div className="flex flex-wrap items-baseline gap-2">
                <Text as="span" size="sm" tone="strong">{cls.text}</Text>
                {subLine && (
                  <span className="text-[10.5px] text-fg-dim">· {subLine}</span>
                )}
              </div>
            </div>
          );
        })}
    </Card>
  );
}

function LifecycleFooter({
  user,
  onDeactivate,
  onActivate,
  pending,
}: {
  user: User;
  onDeactivate: () => void;
  onActivate: () => void;
  pending: boolean;
}) {
  const first = user.firstName;
  return (
    <Callout
      kind="neutral"
      icon={null}
      title={user.enabled ? `Deactivate ${first}` : `Reactivate ${first}`}
      action={
        user.enabled ? (
          <Button outline="red" size="xxs" onClick={onDeactivate} disabled={pending}>
            Deactivate
          </Button>
        ) : (
          <Button outline size="xxs" onClick={onActivate} disabled={pending}>
            Reactivate
          </Button>
        )
      }
    >
      {user.enabled
        ? 'Revokes sign-in immediately. Audit history is preserved.'
        : 'Restores sign-in access. Existing roles and regions are kept as-is.'}
    </Callout>
  );
}
