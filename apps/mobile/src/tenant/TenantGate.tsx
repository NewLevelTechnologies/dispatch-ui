import type { ReactNode } from 'react';
import { ActivityIndicator, ScrollView, Text, View, StyleSheet } from 'react-native';
import { useTranslation } from '@dispatch/i18n';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { Button, Card } from '../components';
import { useTenant } from './TenantContext';
import { WorkspaceRow } from './WorkspaceRow';
import type { TenantMembership } from '../api/setup';

/**
 * Stands between authentication and the tab shell: signed in is not the same
 * as being in a workspace. Mounted once inside (tabs)/_layout.tsx rather than
 * at the root, so it only ever renders for an already-authenticated session —
 * a signed-out user is redirected to /sign-in by the root AuthGate before this
 * ever mounts. Port of apps/web/src/components/workspace/TenantGate.tsx,
 * trimmed of the subdomain ("unknown-workspace") case that has no mobile
 * equivalent — see tenant.ts.
 */
export default function TenantGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { username, leave } = useAuth();
  const { memberships, activeMembership, resolution, isLoading, error, revokedFrom, selectTenant, refresh } =
    useTenant();

  // Revocation outranks everything below — the workspace this device was
  // using is gone, so nothing built on it can render.
  if (revokedFrom) {
    return (
      <GateShell>
        <GateHeading>
          {revokedFrom.companyName
            ? t('workspace.removed.title', { company: revokedFrom.companyName })
            : t('workspace.removed.titleGeneric')}
        </GateHeading>
        <GateBody>{t('workspace.removed.body')}</GateBody>
        <WorkspaceList
          label={t('workspace.continueIn')}
          memberships={memberships.filter((m) => m.tenantId !== revokedFrom.tenantId)}
          onSelect={selectTenant}
        />
        <GateFooter onSignOut={leave} />
      </GateShell>
    );
  }

  if (isLoading) return <GateLoading label={t('workspace.loading')} />;

  // A failed bootstrap is NOT "you have no workspaces" — we don't know what
  // this person has. Saying so would be a confident lie about their access.
  if (error) {
    return (
      <GateShell>
        <GateHeading>{t('workspace.error.title')}</GateHeading>
        <GateBody>{t('workspace.error.body')}</GateBody>
        <GateActions>
          <Button label={t('workspace.tryAgain')} variant="secondary" onPress={refresh} />
          <Button label={t('workspace.signOut')} variant="ghost" onPress={leave} />
        </GateActions>
      </GateShell>
    );
  }

  if (activeMembership) return <>{children}</>;

  switch (resolution?.kind) {
    case 'none':
      return (
        <GateShell>
          <GateHeading>{t('workspace.none.title')}</GateHeading>
          <GateBody>{t('workspace.none.body')}</GateBody>
          <AskAdminCard email={username ?? undefined} />
          <GateActions>
            <Button label={t('workspace.tryAgain')} variant="secondary" onPress={refresh} />
            <Button label={t('workspace.signOut')} variant="ghost" onPress={leave} />
          </GateActions>
        </GateShell>
      );
    case 'picker':
      return (
        <GateShell>
          <GateHeading>{t('workspace.choose.title')}</GateHeading>
          <GateBody>{t('workspace.choose.subhead', { count: memberships.length })}</GateBody>
          <WorkspaceList memberships={memberships} onSelect={selectTenant} />
          <GateFooter email={username ?? undefined} onSignOut={leave} />
        </GateShell>
      );
    default:
      // resolution === null: bootstrap hasn't answered yet. 'resolved' never
      // reaches here — it is caught by the activeMembership check above.
      return <GateLoading label={t('workspace.loading')} />;
  }
}

function GateLoading({ label }: { label: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={[styles.loading, { backgroundColor: colors.bgSunken }]}>
      <ActivityIndicator size="large" color={colors.accent500} />
      <Text style={{ color: colors.fgMuted, marginTop: spacing.sm }}>{label}</Text>
    </View>
  );
}

function GateShell({ children }: { children: ReactNode }) {
  const { colors, spacing } = useTheme();
  return (
    <ScrollView
      contentContainerStyle={[styles.shell, { backgroundColor: colors.bgSunken, padding: spacing.xl }]}
    >
      <View style={{ gap: spacing.md }}>{children}</View>
    </ScrollView>
  );
}

function GateHeading({ children }: { children: ReactNode }) {
  const { colors, typography } = useTheme();
  return (
    <Text style={{ color: colors.fgStrong, fontSize: typography.title.fontSize, fontWeight: '700' }}>
      {children}
    </Text>
  );
}

function GateBody({ children }: { children: ReactNode }) {
  const { colors, typography } = useTheme();
  return (
    <Text style={{ color: colors.fgMuted, fontSize: typography.bodyMuted.fontSize }}>{children}</Text>
  );
}

function GateActions({ children }: { children: ReactNode }) {
  const { spacing } = useTheme();
  return <View style={{ gap: spacing.sm }}>{children}</View>;
}

function GateFooter({ email, onSignOut }: { email?: string; onSignOut: () => void }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      {email && (
        <Text style={{ color: colors.fgMuted, fontSize: 12 }}>
          {t('workspace.signedInAs', { email })}
        </Text>
      )}
      <Button label={t('workspace.signOut')} variant="ghost" onPress={onSignOut} />
    </View>
  );
}

function AskAdminCard({ email }: { email?: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Card>
      <Text style={[styles.askAdminBody, { color: colors.fgMuted }]}>{t('workspace.askAdmin')}</Text>
      {email && <Text style={[styles.askAdminEmail, { color: colors.fgStrong }]}>{email}</Text>}
    </Card>
  );
}

function WorkspaceList({
  label,
  memberships,
  onSelect,
}: {
  label?: string;
  memberships: TenantMembership[];
  onSelect: (m: TenantMembership) => void;
}) {
  const { colors, spacing } = useTheme();
  if (memberships.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      {label && <Text style={[styles.listLabel, { color: colors.fgMuted }]}>{label}</Text>}
      {memberships.map((m) => (
        <WorkspaceRow key={m.tenantId} membership={m} onPress={onSelect} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askAdminBody: {
    fontSize: 12,
  },
  askAdminEmail: {
    fontFamily: 'ui-monospace, Menlo, monospace',
    fontWeight: '600',
    marginTop: 6,
  },
  listLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
