// ─────────────────────────────────────────────────────────────────
// The surfaces that exist when there is no usable workspace yet.
//
// All of them render BEFORE app chrome: choosing a workspace happens before
// there is an app to put a sidebar around, and the sidebar would belong to a
// tenant not yet chosen. So these are full pages, never modals and never
// toasts — a toast would leave someone staring at a page whose data is already
// unreachable.
// ─────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react';
import { useTranslation } from '@dispatch/i18n';
import {
  BuildingOffice2Icon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import type { TenantMembership } from '../../api/setup';
import { Button } from '../catalyst/button';
import TenantMark from './TenantMark';

/** Centred card on the sunken ground. No sidebar, no topbar. */
function WorkspaceShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-screen place-items-center bg-bg-sunken p-7">
      <div className="w-full max-w-[452px]">
        <div className="mb-4 text-[13px] font-semibold text-fg-strong">{t('app.name')}</div>
        <div className="rounded-xl border border-border bg-bg-elev p-[22px] shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}

function WorkspaceRow({
  membership,
  onSelect,
}: {
  membership: TenantMembership;
  onSelect: (m: TenantMembership) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(membership)}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-bg-elev px-3 py-2.5 text-left transition-colors hover:border-border-strong hover:bg-bg-hover"
    >
      <TenantMark name={membership.companyName} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold text-fg-strong">
          {membership.companyName}
        </span>
        {/* The slug is the only tenant identifier ever shown to a user — it
            disambiguates same-named companies. tenantId is never rendered. */}
        <span className="block truncate font-mono text-[11px] text-fg-dim">
          {membership.tenantSlug}
        </span>
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-fg-dim" />
    </button>
  );
}

function WorkspaceList({
  label,
  memberships,
  onSelect,
}: {
  label: string;
  memberships: TenantMembership[];
  onSelect: (m: TenantMembership) => void;
}) {
  if (memberships.length === 0) return null;
  return (
    <>
      <div className="my-3.5 h-px bg-border-soft" />
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-fg-dim">{label}</div>
      <div className="flex flex-col gap-[7px]">
        {memberships.map((m) => (
          <WorkspaceRow key={m.tenantId} membership={m} onSelect={onSelect} />
        ))}
      </div>
    </>
  );
}

function Footer({ email, onSignOut }: { email?: string; onSignOut: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="mt-4 flex items-center gap-3">
      {email && (
        <span className="min-w-0 truncate text-[11.5px] text-fg-muted">
          {t('workspace.signedInAs', { email })}
        </span>
      )}
      <span className="flex-1" />
      <Button plain size="xs" onClick={onSignOut}>
        {t('workspace.signOut')}
      </Button>
    </div>
  );
}

interface StateProps {
  memberships: TenantMembership[];
  email?: string;
  onSelect: (m: TenantMembership) => void;
  onSignOut: () => void;
}

/**
 * Picker. A fallback, not a daily gate — it appears only when nothing resolved
 * the workspace on its own.
 *
 * Rows keep the API's alphabetical order. Nothing is preselected and nothing is
 * autofocused: rows commit on a single click, so a reflexive Enter after
 * sign-in would otherwise drop someone into whichever workspace sorts first.
 */
export function WorkspacePicker({ memberships, email, onSelect, onSignOut }: StateProps) {
  const { t } = useTranslation();
  return (
    <WorkspaceShell>
      <div className="text-[19px] font-bold tracking-tight text-fg-strong">
        {t('workspace.choose.title')}
      </div>
      <div className="mt-1 text-[12.5px] text-fg-muted">
        {t('workspace.choose.subhead', { count: memberships.length })}
      </div>
      <div className="mt-4 flex flex-col gap-[7px]">
        {memberships.map((m) => (
          <WorkspaceRow key={m.tenantId} membership={m} onSelect={onSelect} />
        ))}
      </div>
      <Footer email={email} onSignOut={onSignOut} />
    </WorkspaceShell>
  );
}

/**
 * No memberships. A valid 200, so it must not wear error styling — no red, no
 * warning glyph. Every membership may simply be disabled or suspended.
 */
export function NoWorkspaces({
  email,
  onRetry,
  onSignOut,
}: {
  email?: string;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  const { t } = useTranslation();
  return (
    <WorkspaceShell>
      <div className="mb-3 grid size-[38px] place-items-center rounded-[10px] bg-bg-active text-fg-muted">
        <BuildingOffice2Icon className="size-5" />
      </div>
      <div className="text-[17px] font-bold text-fg-strong">{t('workspace.none.title')}</div>
      <div className="mt-1.5 text-[12.5px] leading-relaxed text-fg-muted">
        {t('workspace.none.body')}
      </div>
      <div className="mt-3.5 rounded-lg border border-border-soft bg-bg-elev-2 px-3 py-2.5">
        <div className="text-[11.5px] leading-relaxed text-fg-muted">
          {t('workspace.askAdmin')}
        </div>
        {/* On its own line rather than inline-bolded: it is the string an admin
            has to be given verbatim, so it should be easy to select. */}
        {email && (
          <div className="mt-1 font-mono text-[12px] font-semibold text-fg-strong">{email}</div>
        )}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button outline size="xs" onClick={onRetry}>
          {t('workspace.tryAgain')}
        </Button>
        <span className="flex-1" />
        <Button size="xs" onClick={onSignOut}>
          {t('workspace.signOut')}
        </Button>
      </div>
    </WorkspaceShell>
  );
}

/**
 * The bootstrap call itself failed. Deliberately NOT the zero-membership
 * screen: that one asserts this person belongs to no workspace, and here we
 * simply don't know. Claiming it would be a confident lie about their access.
 */
export function WorkspaceLoadError({
  onRetry,
  onSignOut,
}: {
  onRetry: () => void;
  onSignOut: () => void;
}) {
  const { t } = useTranslation();
  return (
    <WorkspaceShell>
      <div className="text-[17px] font-bold text-fg-strong">{t('workspace.error.title')}</div>
      <div className="mt-1.5 text-[12.5px] leading-relaxed text-fg-muted">
        {t('workspace.error.body')}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button size="xs" onClick={onRetry}>
          {t('workspace.tryAgain')}
        </Button>
        <span className="flex-1" />
        <Button plain size="xs" onClick={onSignOut}>
          {t('workspace.signOut')}
        </Button>
      </div>
    </WorkspaceShell>
  );
}

/**
 * Access removed mid-session. Revocation takes effect on the next request, so
 * this is a normal event for a working user.
 *
 * Never a toast — what they were looking at is already unreachable behind it —
 * and never a silent bounce, which reads as data loss. Name the workspace that
 * ended, then list the remaining ones so recovery is one click.
 */
export function AccessRemoved({
  lostWorkspaceName,
  memberships,
  onSelect,
  onSignOut,
}: Omit<StateProps, 'email'> & { lostWorkspaceName: string | null }) {
  const { t } = useTranslation();
  return (
    <WorkspaceShell>
      <div className="flex items-start gap-2.5">
        <span
          className="grid size-8 shrink-0 place-items-center rounded-lg"
          style={{
            background: 'color-mix(in oklch, var(--warning-500) 15%, transparent)',
            color: 'var(--warning-fg)',
          }}
        >
          <ExclamationTriangleIcon className="size-[17px]" />
        </span>
        <div>
          <div className="text-[16px] font-bold text-fg-strong">
            {lostWorkspaceName
              ? t('workspace.removed.title', { company: lostWorkspaceName })
              : t('workspace.removed.titleGeneric')}
          </div>
          <div className="mt-1 text-[12.5px] leading-relaxed text-fg-muted">
            {t('workspace.removed.body')}
          </div>
        </div>
      </div>
      <WorkspaceList
        label={t('workspace.continueIn')}
        memberships={memberships}
        onSelect={onSelect}
      />
      <Footer onSignOut={onSignOut} />
    </WorkspaceShell>
  );
}

/**
 * Shown while a switch settles. Not decorative: switching drops the whole query
 * cache and remounts, so without this the person watches every table empty and
 * every count fall to zero — indistinguishable from a broken app.
 *
 * Names the destination, which is the confirmation the click did what they
 * meant. Held a minimum beat by the caller so it reads as a transition rather
 * than a flash.
 */
export function SwitchingOverlay({ companyName }: { companyName: string }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 grid place-items-center backdrop-blur-[2px]"
      style={{ background: 'color-mix(in oklch, var(--bg-sunken) 78%, transparent)' }}
    >
      <div className="flex flex-col items-center gap-3">
        <TenantMark name={companyName} size={46} />
        <div className="text-[13.5px] font-semibold text-fg-strong">
          {t('workspace.switching.title', { company: companyName })}
        </div>
        <div className="text-[11.5px] text-fg-muted">{t('workspace.switching.body')}</div>
      </div>
    </div>
  );
}

/**
 * Phase 4 · The hostname names a workspace this person isn't in. Distinct from
 * "no workspaces at all": the remedy is to go to one they do belong to, so the
 * ones they have are listed rather than merely mentioned.
 */
export function UnknownWorkspace({ slug, memberships, onSelect, onSignOut }: StateProps & { slug: string }) {
  const { t } = useTranslation();
  return (
    <WorkspaceShell>
      <div className="text-[17px] font-bold text-fg-strong">{t('workspace.unknown.title')}</div>
      <div className="mt-1.5 text-[12.5px] leading-relaxed text-fg-muted">
        {t('workspace.unknown.body')}
      </div>
      <div className="mt-1 font-mono text-[12px] font-semibold text-fg-strong">{slug}</div>
      <WorkspaceList
        label={t('workspace.unknown.yours')}
        memberships={memberships}
        onSelect={onSelect}
      />
      <Footer onSignOut={onSignOut} />
    </WorkspaceShell>
  );
}
