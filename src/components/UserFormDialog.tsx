import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { userApi, type User, type Role } from '../api';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { Checkbox, CheckboxField } from './catalyst/checkbox';
import { Text } from './catalyst/text';

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
    roleIds: string[];
  }>({
    firstName: '',
    lastName: '',
    email: '',
    roleIds: [],
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
        roleIds: user.roles?.map((role) => role.id) || [],
      });

      setSendInvite(false); // Don't send invite on edit
    } else {

      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        roleIds: [],
      });

      setSendInvite(true); // Send invite by default on create
    }
  }, [user, isOpen]);

  const createMutation = useMutation({
    mutationFn: (data: { firstName: string; lastName: string; email: string; roleIds: string[]; sendInvite?: boolean }) =>
      userApi.create({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        roleIds: data.roleIds,
        phoneNumber: null,
        sendInvite: data.sendInvite,
      }),
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

  const updateProfileMutation = useMutation({
    mutationFn: (data: { firstName: string; lastName: string }) =>
      userApi.updateProfile(user!.id!, {
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: null,
      }),
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('common.form.errorUpdate', { entity: t('entities.user') }));
    },
  });

  const updateRolesMutation = useMutation({
    mutationFn: (roleIds: string[]) =>
      userApi.updateRoles(user!.id!, { roleIds }),
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || 'Failed to update user roles');
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.roleIds.length === 0) {
      alert(t('users.form.roleRequired'));
      return;
    }

    if (isEdit) {
      try {
        // Update profile first
        await updateProfileMutation.mutateAsync({
          firstName: formData.firstName,
          lastName: formData.lastName,
        });

        // Then update roles
        await updateRolesMutation.mutateAsync(formData.roleIds);

        // Refresh and close on success
        queryClient.invalidateQueries({ queryKey: ['users'] });
        queryClient.invalidateQueries({ queryKey: ['users', user!.id] });
        onClose();
      } catch {
        // Errors already handled by mutation onError callbacks
      }
    } else {
      createMutation.mutate({ ...formData, sendInvite });
    }
  };

  const handleChange = (field: 'firstName' | 'lastName' | 'email', value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleRoleToggle = (roleId: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      roleIds: checked
        ? [...prev.roleIds, roleId]
        : prev.roleIds.filter((id) => id !== roleId),
    }));
  };

  // Check if admin role is selected
  const adminRole = roles.find((role) =>
    role.name.toLowerCase().includes('admin')
  );
  const hasAdminRole = adminRole && formData.roleIds.includes(adminRole.id);

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
                {hasAdminRole && (
                  <div className="mt-2 rounded-md bg-primary-50 px-3 py-2 ring-1 ring-primary-200 dark:bg-primary-950/10 dark:ring-primary-900/20">
                    <Text className="text-sm text-primary-800 dark:text-primary-400">
                      {t('users.form.adminRoleInfo')}
                    </Text>
                  </div>
                )}
                <div className="mt-3 space-y-2">
                  {roles.map((role) => {
                    const isAdmin = role.name.toLowerCase().includes('admin');
                    const isDisabled = hasAdminRole && !isAdmin;

                    return (
                      <CheckboxField key={role.id}>
                        <Checkbox
                          name={`role-${role.id}`}
                          checked={formData.roleIds.includes(role.id)}
                          onChange={(checked) => handleRoleToggle(role.id, checked)}
                          disabled={isDisabled}
                        />
                        <Label className={isDisabled ? 'text-zinc-400 dark:text-zinc-600' : ''}>
                          {role.name}
                        </Label>
                      </CheckboxField>
                    );
                  })}
                </div>
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
          disabled={createMutation.isPending || updateProfileMutation.isPending || updateRolesMutation.isPending}
        >
          {createMutation.isPending || updateProfileMutation.isPending || updateRolesMutation.isPending
            ? t('common.saving')
            : t(isEdit ? 'common.update' : 'common.create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
