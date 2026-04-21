import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { updatePassword, updateMFAPreference, fetchMFAPreference } from 'aws-amplify/auth';
import { useQuery, useMutation } from '@tanstack/react-query';
import AppLayout from '../components/AppLayout';
import { Heading, Subheading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Divider } from '../components/catalyst/divider';
import { Field, Label } from '../components/catalyst/fieldset';
import { Input } from '../components/catalyst/input';
import { Text } from '../components/catalyst/text';

export default function AccountSettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // MFA state
  const { data: mfaPreference, refetch: refetchMFA } = useQuery({
    queryKey: ['mfa-preference'],
    queryFn: async () => {
      const pref = await fetchMFAPreference();
      return pref;
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async ({ oldPassword, newPassword }: { oldPassword: string; newPassword: string }) => {
      await updatePassword({ oldPassword, newPassword });
    },
    onSuccess: () => {
      setPasswordSuccess(t('account.passwordChangeSuccess'));
      setPasswordError('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (error: Error) => {
      setPasswordError(error.message);
      setPasswordSuccess('');
    },
  });

  const toggleMFAMutation = useMutation({
    mutationFn: async (enable: boolean) => {
      await updateMFAPreference({
        totp: enable ? 'PREFERRED' : 'DISABLED',
      });
    },
    onSuccess: () => {
      refetchMFA();
    },
  });

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword !== confirmPassword) {
      setPasswordError(t('account.passwordMismatch'));
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError(t('account.passwordTooShort'));
      return;
    }

    changePasswordMutation.mutate({
      oldPassword: currentPassword,
      newPassword: newPassword,
    });
  };

  const isMFAEnabled = mfaPreference?.enabled?.includes('TOTP') || mfaPreference?.preferred === 'TOTP';

  return (
    <AppLayout>
      <div>
        {/* Header */}
        <div className="mb-2">
          <Button plain onClick={() => navigate(-1)}>
            <ArrowLeftIcon className="size-4" />
            {t('common.actions.back')}
          </Button>
        </div>

        <Heading>{t('account.settings')}</Heading>
        <Text className="mt-1">{t('account.settingsDescription')}</Text>

        <Divider className="my-6" />

        {/* Password Section */}
        <div className="max-w-2xl">
          <Subheading>{t('account.changePassword')}</Subheading>
          <Text className="mt-1 mb-4">{t('account.changePasswordDescription')}</Text>

          <form onSubmit={handlePasswordChange} className="space-y-4">
            <Field>
              <Label>{t('account.currentPassword')}</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </Field>

            <Field>
              <Label>{t('account.newPassword')}</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </Field>

            <Field>
              <Label>{t('account.confirmPassword')}</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </Field>

            {passwordError && (
              <div className="rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
                <p className="text-sm text-red-800 dark:text-red-400">{passwordError}</p>
              </div>
            )}

            {passwordSuccess && (
              <div className="rounded-lg bg-green-50 p-4 ring-1 ring-green-200 dark:bg-green-950/10 dark:ring-green-900/20">
                <p className="text-sm text-green-800 dark:text-green-400">{passwordSuccess}</p>
              </div>
            )}

            <Button type="submit" disabled={changePasswordMutation.isPending}>
              {changePasswordMutation.isPending ? t('common.saving') : t('account.updatePassword')}
            </Button>
          </form>
        </div>

        <Divider className="my-8" />

        {/* MFA Section */}
        <div className="max-w-2xl">
          <Subheading>{t('account.twoFactorAuth')}</Subheading>
          <Text className="mt-1 mb-4">{t('account.twoFactorAuthDescription')}</Text>

          <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {t('account.twoFactorAuth')}
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {isMFAEnabled ? t('account.mfaEnabled') : t('account.mfaDisabled')}
              </p>
            </div>
            <Button
              color={isMFAEnabled ? 'zinc' : 'indigo'}
              onClick={() => toggleMFAMutation.mutate(!isMFAEnabled)}
              disabled={toggleMFAMutation.isPending}
            >
              {isMFAEnabled ? t('common.disable') : t('common.enable')}
            </Button>
          </div>

          {isMFAEnabled && (
            <div className="mt-4 rounded-lg bg-blue-50 p-4 ring-1 ring-blue-200 dark:bg-blue-950/10 dark:ring-blue-900/20">
              <p className="text-sm text-blue-800 dark:text-blue-400">
                {t('account.mfaEnabledInfo')}
              </p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
