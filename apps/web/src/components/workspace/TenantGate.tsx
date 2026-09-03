// Stands between authentication and the app: signed in is not the same as
// being in a workspace. Wraps every protected route, so a page can assume a
// tenant is active and every request it fires carries one.
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useTranslation } from '@dispatch/i18n';
import type { ReactNode } from 'react';
import { useTenant } from '../../contexts/TenantContext';
import { LoadingState } from '../ui/LoadingState';
import {
  AccessRemoved,
  NoWorkspaces,
  UnknownWorkspace,
  WorkspaceLoadError,
  WorkspacePicker,
} from './WorkspaceStates';

export default function TenantGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user, signOut } = useAuthenticator((context) => [context.user]);
  const {
    memberships,
    activeMembership,
    resolution,
    isLoading,
    error,
    revokedFrom,
    selectTenant,
    refresh,
  } = useTenant();

  // Taken from the token rather than /users/me: that endpoint is tenant-scoped,
  // so it cannot be called before a workspace exists.
  const email = user?.signInDetails?.loginId ?? undefined;

  // Revocation outranks everything below — the workspace this tab was using is
  // gone, so nothing built on it can render.
  if (revokedFrom) {
    return (
      <AccessRemoved
        lostWorkspaceName={revokedFrom.companyName}
        memberships={memberships.filter((m) => m.tenantId !== revokedFrom.tenantId)}
        onSelect={selectTenant}
        onSignOut={signOut}
      />
    );
  }

  if (isLoading) return <LoadingState label={t('workspace.loading')} />;

  // A failed bootstrap is NOT "you have no workspaces" — we don't know what
  // this person has. Saying so would be a confident lie about their access.
  if (error) {
    return <WorkspaceLoadError onRetry={refresh} onSignOut={signOut} />;
  }

  if (activeMembership) return <>{children}</>;

  switch (resolution?.kind) {
    case 'none':
      return <NoWorkspaces email={email} onRetry={refresh} onSignOut={signOut} />;
    case 'unknown-workspace':
      return (
        <UnknownWorkspace
          slug={resolution.slug}
          memberships={memberships}
          onSelect={selectTenant}
          onSignOut={signOut}
        />
      );
    case 'picker':
      return (
        <WorkspacePicker
          memberships={memberships}
          email={email}
          onSelect={selectTenant}
          onSignOut={signOut}
        />
      );
    default:
      // resolution === null: bootstrap hasn't answered yet. 'resolved' never
      // reaches here — it is caught by the activeMembership check above.
      return <LoadingState label={t('workspace.loading')} />;
  }
}
