/* eslint-disable i18next/no-literal-string -- dense v1.5 visual surface; key strings (titles, CTAs, errors) are wrapped via t() while inline labels and glyphs are kept as literals — same convention as UserFormPage */
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { fetchMFAPreference } from 'aws-amplify/auth';
import { ShieldCheckIcon } from '@heroicons/react/24/outline';
import { PatternFormat } from 'react-number-format';
import AppLayout from '../components/AppLayout';
import { Button } from '../components/catalyst/button';
import { Card } from '../components/catalyst/card';
import { DataRow } from '../components/catalyst/data-row';
import { ErrorMessage, Field, Label } from '../components/catalyst/fieldset';
import { Heading } from '../components/catalyst/heading';
import { Input } from '../components/catalyst/input';
import { Text } from '../components/catalyst/text';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useTheme } from '../components/ThemeProvider';
import { userApi, type User } from '../api/setup';
import { roleColor } from '../utils/roleColor';
import { showError, showSuccess, extractApiError } from '../lib/toast';
import { Callout } from '../components/ui/Callout';
import { ToggleGroup, ToggleGroupOption } from '../components/ui/ToggleGroup';
import ConfirmDialog from '../components/ConfirmDialog';
import ChangePasswordDialog from '../components/account/ChangePasswordDialog';
import TwoFactorSetupDialog from '../components/account/TwoFactorSetupDialog';
import Disable2FADialog from '../components/account/Disable2FADialog';

// Personal Account Settings — separate from company-wide Settings. The
// sidebar user popup links here. Phase 1 ships the visual redesign and
// keeps 2FA on Amplify-direct TOTP. SMS/email methods + server-issued
// recovery codes + code-gated disable land when backend's /users/me/2fa/*
// endpoints are ready.
export default function AccountSettingsPage() {
  const { t } = useTranslation();
  const { data: currentUser, isLoading } = useCurrentUser();

  return (
    <AppLayout>
      <div className="mx-auto max-w-[760px] px-1 pb-16">
        <div className="mb-5">
          <Heading size="page-lg">{t('account.settingsHeading')}</Heading>
        </div>

        {isLoading || !currentUser ? (
          <Card>{t('common.loading')}</Card>
        ) : (
          <>
            <ProfileCard user={currentUser} />
            <div className="mt-3.5">
              <SecurityCard user={currentUser} />
            </div>
            <div className="mt-3.5">
              <PreferencesCard />
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

// ──────────────────────────────────────────────────────────────────
// Profile card
// ──────────────────────────────────────────────────────────────────
// Server enforces the same limits, but we pre-check client-side so the
// user gets feedback before paying the upload cost.
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_MIME_TYPES = ['image/png', 'image/jpeg'];

// Strip everything except digits — PatternFormat works in raw digits and
// legacy "(XXX) XXX-XXXX" rows need to normalize before comparison.
function stripPhoneDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

// Map the backend's photo-upload error messages onto the friendly copy the
// designer specified. Falls back to the raw API message if we don't have a
// canonical translation for the failure mode.
function mapPhotoError(err: unknown, t: (key: string) => string): string | undefined {
  const raw = extractApiError(err);
  if (!raw) return undefined;
  if (/file too large/i.test(raw)) return t('account.profile.photoErrorSize');
  if (/invalid file type/i.test(raw)) return t('account.profile.photoErrorType');
  if (/unable to read image/i.test(raw)) return t('account.profile.photoErrorCorrupted');
  return raw;
}

function ProfileCard({ user }: { user: User }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  // Phone state holds raw digits; PatternFormat handles the (XXX) XXX-XXXX
  // display. Legacy rows with formatted strings in storage normalize to
  // digits on next save, which is the documented backfill path.
  const [phone, setPhone] = useState(stripPhoneDigits(user.phoneNumber));
  const [saveError, setSaveError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fullName = `${user.firstName} ${user.lastName}`.trim() || user.email;
  const initials = (() => {
    const f = user.firstName?.[0] ?? '';
    const l = user.lastName?.[0] ?? '';
    return `${f}${l}`.toUpperCase() || user.email.charAt(0).toUpperCase() || 'U';
  })();
  const avatarBg = roleColor(fullName);

  // State holds raw digits, but legacy rows might still carry "(XXX) XXX-XXXX"
  // — normalize both sides before comparing.
  const dirty =
    firstName !== user.firstName ||
    lastName !== user.lastName ||
    phone !== stripPhoneDigits(user.phoneNumber);

  // Every self-update returns the full User — push it into the currentUser
  // cache and invalidate the user list/detail queries so the sidebar,
  // Users page, and User detail page all repaint with the new identity
  // (name, phone, photo) without a manual refresh.
  const onSelfUserUpdated = (updated: User) => {
    queryClient.setQueryData(['currentUser'], updated);
    queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      userApi.updateMyProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneNumber: phone || null,
      }),
    onSuccess: (updated) => {
      onSelfUserUpdated(updated);
      setSaveError('');
      showSuccess(t('account.profile.saveSuccess'));
    },
    onError: (err: unknown) => {
      setSaveError(extractApiError(err) || t('account.profile.errorGeneric'));
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => userApi.uploadMyPhoto(file),
    onSuccess: (updated) => {
      onSelfUserUpdated(updated);
      showSuccess(t('account.profile.photoUploadSuccess'));
    },
    onError: (err: unknown) => {
      showError(t('account.profile.photoUploadError'), mapPhotoError(err, t));
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => userApi.deleteMyPhoto(),
    onSuccess: (updated) => {
      onSelfUserUpdated(updated);
      showSuccess(t('account.profile.photoRemoveSuccess'));
    },
    onError: (err: unknown) => {
      showError(t('account.profile.photoRemoveError'), extractApiError(err));
    },
  });

  const handleReset = () => {
    setFirstName(user.firstName);
    setLastName(user.lastName);
    setPhone(stripPhoneDigits(user.phoneNumber));
    setSaveError('');
  };

  const handlePickPhoto = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so picking the same file twice still fires onChange.
    e.target.value = '';
    if (!file) return;
    if (!PHOTO_MIME_TYPES.includes(file.type)) {
      showError(t('account.profile.photoUploadError'), t('account.profile.photoErrorType'));
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      showError(t('account.profile.photoUploadError'), t('account.profile.photoErrorSize'));
      return;
    }
    uploadMutation.mutate(file);
  };

  const photoBusy = uploadMutation.isPending || removeMutation.isPending;

  return (
    <Card title={t('account.profile.title')}>
      {/* Mobile: avatar + identity stack on row 1, photo actions on row 2
          aligned to the right so they don't crash into the name. ≥sm reverts
          to a single horizontal row. */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {/* TODO(design-system): replace this tinted-initials block with a
              Catalyst `<Avatar>` extension that supports a deterministic
              tinted background (currently Avatar takes a src; we need a
              colored-initials variant). */}
          {user.photoUrl ? (
            <img
              src={user.photoUrl}
              alt=""
              className="size-14 shrink-0 rounded-full object-cover ring-1 ring-border-soft"
              aria-hidden="true"
            />
          ) : (
            <div
              className="grid size-14 shrink-0 place-items-center rounded-full text-[19px] font-semibold text-white"
              style={{
                background: avatarBg,
                border: `1px solid color-mix(in oklch, ${avatarBg} 70%, black)`,
              }}
              aria-hidden="true"
            >
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold text-fg-strong">{fullName}</div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-[11.5px] text-fg-muted">
              <span className="truncate">{user.email}</span>
              <span className="text-[10.5px] text-fg-dim">· {t('account.profile.emailHint')}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          <input
            ref={fileInputRef}
            type="file"
            accept={PHOTO_MIME_TYPES.join(',')}
            className="hidden"
            onChange={handleFileChange}
          />
          <Button outline size="xs" type="button" onClick={handlePickPhoto} disabled={photoBusy}>
            {uploadMutation.isPending
              ? t('account.profile.photoUploading')
              : t('account.profile.changePhoto')}
          </Button>
          {user.photoUrl && (
            <Button
              plain
              size="xs"
              type="button"
              onClick={() => removeMutation.mutate()}
              disabled={photoBusy}
            >
              {removeMutation.isPending
                ? t('account.profile.photoRemoving')
                : t('account.profile.removePhoto')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 border-t border-border-soft pt-3.5 sm:grid-cols-2">
        <Field size="xs">
          <Label size="xs">{t('account.profile.firstName')}</Label>
          <Input size="xs" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </Field>
        <Field size="xs">
          <Label size="xs">{t('account.profile.lastName')}</Label>
          <Input size="xs" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </Field>
        <Field size="xs">
          <Label size="xs">{t('account.profile.phone')}</Label>
          <PatternFormat
            format="(###) ###-####"
            mask="_"
            customInput={Input}
            size="xs"
            type="tel"
            name="phone"
            value={phone}
            onValueChange={(values) => setPhone(values.value)}
            placeholder={t('account.profile.phonePlaceholder')}
          />
        </Field>
      </div>

      {saveError && (
        <Field size="xs" className="mt-3">
          <ErrorMessage size="xs">{saveError}</ErrorMessage>
        </Field>
      )}

      <div className="mt-3.5 flex justify-end gap-1.5 border-t border-border-soft pt-3">
        <Button plain size="xs" type="button" disabled={!dirty || saveMutation.isPending} onClick={handleReset}>
          {t('account.profile.reset')}
        </Button>
        <Button color="accent" size="xs" type="button" disabled={!dirty || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? t('common.saving') : t('account.profile.save')}
        </Button>
      </div>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────
// Security card — Password / 2FA / Sessions
//
// 2FA enroll + disable both go through /users/me/2fa/* (twoFactorApi). The
// server enforces the "one primary method" guarantee — verifying a new
// method automatically disables the prior one — so the FE doesn't need a
// switch-method UX. Status detection still reads Amplify's MFA
// preference (Cognito-native list of enabled types) until a dedicated
// GET endpoint ships.
// ──────────────────────────────────────────────────────────────────
function SecurityCard({ user }: { user: User }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pwOpen, setPwOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const { data: mfa, refetch } = useQuery({
    queryKey: ['mfa-preference'],
    queryFn: fetchMFAPreference,
  });

  // Amplify reports enabled MFA types as 'TOTP' / 'SMS' / 'EMAIL'. We
  // accept any of them as "on" and label the row accordingly.
  const activeMethod: 'TOTP' | 'SMS' | 'EMAIL' | null = useMemo(() => {
    if (!mfa) return null;
    const enabled = (mfa.enabled ?? []) as string[];
    const preferred = mfa.preferred as string | undefined;
    const pick = (m: string) => enabled.includes(m) || preferred === m;
    if (pick('TOTP')) return 'TOTP';
    if (pick('SMS')) return 'SMS';
    if (pick('EMAIL')) return 'EMAIL';
    return null;
  }, [mfa]);
  const isOn = activeMethod !== null;
  const activeMethodLabel = (() => {
    if (activeMethod === 'SMS') return t('account.security.twofaOnMethodSms');
    if (activeMethod === 'EMAIL') return t('account.security.twofaOnMethodEmail');
    return t('account.security.twofaOnMethod');
  })();

  const signOutMutation = useMutation({
    mutationFn: () => userApi.signOutEverywhere(user.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account-activity', user.id] });
      showSuccess('Signed out of all sessions');
    },
    onError: (err: unknown) =>
      showError(t('account.security.sessionsSignOutError'), extractApiError(err)),
  });

  return (
    <>
      <Card title={t('account.security.title')} padding="none">
        {/* Password */}
        <DataRow
          label={t('account.security.passwordLabel')}
          action={
            <Button outline size="xs" type="button" onClick={() => setPwOpen(true)}>
              {t('account.security.passwordChange')}
            </Button>
          }
        >
          <Text as="div" size="sm" tone="strong">{t('account.security.passwordValue')}</Text>
          <Text as="div" size="xs" tone="dim" className="mt-0.5">
            {t('account.security.passwordHint')}
          </Text>
        </DataRow>

        {/* 2FA */}
        {isOn ? (
          <DataRow
            label={t('account.security.twofaRowLabel')}
            action={
              <Button outline size="xs" type="button" onClick={() => setDisableOpen(true)}>
                {t('account.security.disableLabel')}
              </Button>
            }
          >
            <div className="flex items-center gap-2">
              {/* TODO(design-system): replace inline "ON" pill with
                  `<Badge color="green" size="xs">` once Badge gains an
                  xs size variant. */}
              <span className="inline-flex items-center rounded-[4px] bg-success-500/14 px-2 py-0.5 text-[11px] font-bold tracking-wider text-success-500">
                <span className="mr-1">●</span>
                {t('account.security.twofaOnPill')}
              </span>
              <Text as="span" size="sm" tone="strong">{activeMethodLabel}</Text>
            </div>
            <Text as="div" size="xs" tone="dim" className="mt-0.5">
              {t('account.security.twofaOnHint')}
            </Text>
          </DataRow>
        ) : (
          <div className="my-2 px-3.5">
            <Callout
              kind="accent"
              icon={
                <div className="grid size-9 place-items-center rounded-lg bg-accent-500 text-white">
                  <ShieldCheckIcon className="size-[18px]" />
                </div>
              }
              title={t('account.security.twofaCtaTitle')}
              action={
                <Button color="accent" size="xs" type="button" onClick={() => setSetupOpen(true)}>
                  {t('account.security.enable')}
                </Button>
              }
            >
              {t('account.security.twofaCtaDescription')}
            </Callout>
          </div>
        )}

        {/* Sessions */}
        <DataRow
          label={t('account.security.sessionsLabel')}
          last
          action={
            <Button
              outline
              size="xs"
              type="button"
              onClick={() => setSignOutOpen(true)}
              disabled={signOutMutation.isPending}
            >
              {signOutMutation.isPending
                ? t('account.security.sessionsSignOutPending')
                : t('account.security.sessionsSignOutSubmit')}
            </Button>
          }
        >
          <Text as="div" size="sm" tone="strong">{t('account.security.sessionsValue')}</Text>
          <Text as="div" size="xs" tone="dim" className="mt-0.5">
            {t('account.security.sessionsHint')}
          </Text>
        </DataRow>
      </Card>

      <ChangePasswordDialog isOpen={pwOpen} onClose={() => setPwOpen(false)} />
      <TwoFactorSetupDialog
        isOpen={setupOpen}
        onClose={() => setSetupOpen(false)}
        onEnabled={() => refetch()}
        email={user.email}
      />
      <Disable2FADialog
        isOpen={disableOpen}
        onClose={() => setDisableOpen(false)}
        onDisabled={() => {
          refetch();
          showSuccess(t('account.security.disableSuccess'));
        }}
      />
      <ConfirmDialog
        isOpen={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        onConfirm={() => signOutMutation.mutate()}
        title={t('account.security.sessionsSignOutConfirmTitle')}
        message={t('account.security.sessionsSignOutConfirmMessage')}
        confirmLabel={t('account.security.sessionsSignOutSubmit')}
        isDestructive
      />
    </>
  );
}

// ──────────────────────────────────────────────────────────────────
// Preferences card — mirrors the chips already in the sidebar user
// popup. The popup keeps them for fast access; this surface is the
// canonical place if a user goes looking for it.
//
// `system` follows the OS color-scheme preference live; ThemeProvider
// subscribes to the prefers-color-scheme media query while in that mode.
// ──────────────────────────────────────────────────────────────────
function PreferencesCard() {
  const { t } = useTranslation();
  const { mode, accent, setMode, setAccent } = useTheme();

  return (
    <Card title={t('account.preferences.title')} padding="none">
      <DataRow label={t('account.preferences.theme')}>
        <ToggleGroup value={mode} onChange={setMode} aria-label={t('account.preferences.theme')}>
          <ToggleGroupOption value="light">
            <span aria-hidden="true">☀</span>
            {t('account.preferences.themeLight')}
          </ToggleGroupOption>
          <ToggleGroupOption value="dark">
            <span aria-hidden="true">☾</span>
            {t('account.preferences.themeDark')}
          </ToggleGroupOption>
          <ToggleGroupOption value="system">
            <span aria-hidden="true">⊙</span>
            {t('account.preferences.themeSystem')}
          </ToggleGroupOption>
        </ToggleGroup>
      </DataRow>
      <DataRow label={t('account.preferences.accent')} last>
        <ToggleGroup value={accent} onChange={setAccent} aria-label={t('account.preferences.accent')}>
          <ToggleGroupOption value="warm">
            <Swatch color="oklch(68% 0.185 50)" />
            {t('account.preferences.accentWarm')}
          </ToggleGroupOption>
          <ToggleGroupOption value="cool">
            <Swatch color="oklch(56% 0.125 215)" />
            {t('account.preferences.accentCool')}
          </ToggleGroupOption>
        </ToggleGroup>
      </DataRow>
    </Card>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block size-2.5 rounded-full ring-1 ring-black/10"
      style={{ background: color }}
      aria-hidden="true"
    />
  );
}
