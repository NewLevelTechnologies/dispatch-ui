import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { updatePassword } from 'aws-amplify/auth';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../catalyst/dialog';
import { Button } from '../catalyst/button';
import { ErrorMessage, Field, FieldGroup, Label } from '../catalyst/fieldset';
import { Input } from '../catalyst/input';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChangePasswordDialog({ isOpen, onClose }: Props) {
  const { t } = useTranslation();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const reset = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirm('');
    setError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const mutation = useMutation({
    mutationFn: async () => {
      await updatePassword({ oldPassword, newPassword });
    },
    onSuccess: () => {
      reset();
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message || t('account.changePasswordDialog.errorGeneric'));
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError(t('account.changePasswordDialog.tooShort'));
      return;
    }
    if (newPassword !== confirm) {
      setError(t('account.changePasswordDialog.mismatch'));
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} size="md">
      <DialogTitle>{t('account.changePasswordDialog.title')}</DialogTitle>
      <DialogDescription>{t('account.changePasswordDialog.description')}</DialogDescription>
      <form onSubmit={submit}>
        <DialogBody>
          <FieldGroup>
            <Field size="xs">
              <Label size="xs" required>{t('account.changePasswordDialog.currentPassword')}</Label>
              <Input
                size="xs"
                type="password"
                autoComplete="current-password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
              />
            </Field>
            <Field size="xs">
              <Label size="xs" required>{t('account.changePasswordDialog.newPassword')}</Label>
              <Input
                size="xs"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </Field>
            <Field size="xs">
              <Label size="xs" required>{t('account.changePasswordDialog.confirmPassword')}</Label>
              <Input
                size="xs"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </Field>
          </FieldGroup>
          {error && (
            <Field size="xs" className="mt-3">
              <ErrorMessage size="xs">{error}</ErrorMessage>
            </Field>
          )}
        </DialogBody>
        <DialogActions>
          <Button plain type="button" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button color="accent" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? t('common.saving') : t('account.changePasswordDialog.submit')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
