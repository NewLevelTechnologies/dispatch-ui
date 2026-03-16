import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import apiClient from '../api/client';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { Select } from './catalyst/select';
import { Checkbox, CheckboxField } from './catalyst/checkbox';

interface User {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  roles?: Role[];
  enabled?: boolean;
}

interface Role {
  id: string;
  name: string;
}

interface UserFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user?: User | null;
  roles: Role[];
}

export default function UserFormDialog({ isOpen, onClose, user, roles }: UserFormDialogProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const isEdit = !!user?.id;

  const [formData, setFormData] = useState<{
    firstName: string;
    lastName: string;
    email: string;
    roleId: string;
  }>({
    firstName: '',
    lastName: '',
    email: '',
    roleId: '',
  });

  const [sendInvite, setSendInvite] = useState(true);

  // Intentionally setting form state based on props in useEffect
  // This is the recommended pattern for initializing controlled forms
  useEffect(() => {
    if (!isOpen) return;

    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        roleId: user.roles?.[0]?.id || '',
      });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSendInvite(false); // Don't send invite on edit
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        roleId: '',
      });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSendInvite(true); // Send invite by default on create
    }
  }, [user, isOpen]);

  const createMutation = useMutation({
    mutationFn: (data: { firstName: string; lastName: string; email: string; roleId: string; sendInvite?: boolean }) =>
      apiClient.post('/users', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('common.form.errorCreate', { entity: t('entities.user') }));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { firstName: string; lastName: string; email: string; roleId: string }) =>
      apiClient.put(`/users/${user?.id}`, {
        firstName: data.firstName,
        lastName: data.lastName,
        roleId: data.roleId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('common.form.errorUpdate', { entity: t('entities.user') }));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.roleId) {
      alert(t('users.form.roleRequired'));
      return;
    }

    if (isEdit) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate({ ...formData, sendInvite });
    }
  };

  const handleChange = (field: 'firstName' | 'lastName' | 'email' | 'roleId', value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogTitle>
        {t('common.form.titleCreate', {
          action: isEdit ? t('common.edit') : t('common.add'),
          entity: t('entities.user')
        })}
      </DialogTitle>
      <DialogDescription>
        {t(isEdit ? 'common.form.descriptionEdit' : 'common.form.descriptionCreate', {
          entity: t('entities.user')
        })}
      </DialogDescription>
      <DialogBody>
        <form onSubmit={handleSubmit} id="user-form">
          <Fieldset>
            <FieldGroup>
              <Field>
                <Label>{t('common.form.firstName')} *</Label>
                <Input
                  name="firstName"
                  value={formData.firstName}
                  onChange={(e) => handleChange('firstName', e.target.value)}
                  required
                />
              </Field>

              <Field>
                <Label>{t('common.form.lastName')} *</Label>
                <Input
                  name="lastName"
                  value={formData.lastName}
                  onChange={(e) => handleChange('lastName', e.target.value)}
                  required
                />
              </Field>

              <Field>
                <Label>{t('common.form.email')} *</Label>
                <Input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  required
                  disabled={isEdit}
                />
              </Field>

              <Field>
                <Label>{t('common.form.role')} *</Label>
                <Select
                  name="roleId"
                  value={formData.roleId}
                  onChange={(e) => handleChange('roleId', e.target.value)}
                  required
                >
                  <option value="">{t('users.form.rolePlaceholder')}</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </Select>
              </Field>

              {!isEdit && (
                <CheckboxField>
                  <Checkbox
                    name="sendInvite"
                    checked={sendInvite}
                    onChange={(checked) => setSendInvite(checked)}
                  />
                  <Label>{t('users.form.sendInvite')}</Label>
                </CheckboxField>
              )}
            </FieldGroup>
          </Fieldset>
        </form>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          form="user-form"
          disabled={createMutation.isPending || updateMutation.isPending}
        >
          {createMutation.isPending || updateMutation.isPending
            ? t('common.saving')
            : t(isEdit ? 'common.update' : 'common.create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
