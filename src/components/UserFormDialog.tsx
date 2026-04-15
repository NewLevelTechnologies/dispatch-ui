import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { userApi, dispatchRegionApi, type User, type Role } from '../api';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, Fieldset, Label } from './catalyst/fieldset';
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

  // Fetch active dispatch regions
  const { data: activeRegions = [] } = useQuery({
    queryKey: ['dispatch-regions', 'active'],
    queryFn: () => dispatchRegionApi.getAll(false),
    enabled: isOpen,
  });

  const [formData, setFormData] = useState<{
    firstName: string;
    lastName: string;
    email: string;
    roleIds: string[];
    dispatchRegionIds: string[];
  }>({
    firstName: '',
    lastName: '',
    email: '',
    roleIds: [],
    dispatchRegionIds: [],
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
        dispatchRegionIds: user.dispatchRegionIds || [],
      });

      setSendInvite(false); // Don't send invite on edit
    } else {

      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        roleIds: [],
        dispatchRegionIds: [],
      });

      setSendInvite(true); // Send invite by default on create
    }
  }, [user, isOpen]);

  const createMutation = useMutation({
    mutationFn: (data: { firstName: string; lastName: string; email: string; roleIds: string[]; dispatchRegionIds: string[]; sendInvite?: boolean }) =>
      userApi.create({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        roleIds: data.roleIds,
        dispatchRegionIds: data.dispatchRegionIds,
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

  const updateRegionsMutation = useMutation({
    mutationFn: (dispatchRegionIds: string[]) =>
      userApi.updateRegions(user!.id!, { dispatchRegionIds }),
    onSuccess: () => {
      // Refetch user to get updated dispatchRegionIds
      queryClient.invalidateQueries({ queryKey: ['users', user!.id] });
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || 'Failed to update user dispatch regions');
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

        // Then update dispatch regions
        await updateRegionsMutation.mutateAsync(formData.dispatchRegionIds);

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

  const handleRegionToggle = (regionId: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      dispatchRegionIds: checked
        ? [...prev.dispatchRegionIds, regionId]
        : prev.dispatchRegionIds.filter((id) => id !== regionId),
    }));
  };

  // Check if admin role is selected
  const adminRole = roles.find((role) =>
    role.name.toLowerCase().includes('admin')
  );
  const hasAdminRole = adminRole && formData.roleIds.includes(adminRole.id);

  return (
    <Dialog open={isOpen} onClose={onClose} size="2xl">
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
            {/* Name Row */}
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <Label className="text-xs">{t('common.form.firstName')} *</Label>
                <Input
                  name="firstName"
                  value={formData.firstName}
                  onChange={(e) => handleChange('firstName', e.target.value)}
                  required
                />
              </Field>

              <Field>
                <Label className="text-xs">{t('common.form.lastName')} *</Label>
                <Input
                  name="lastName"
                  value={formData.lastName}
                  onChange={(e) => handleChange('lastName', e.target.value)}
                  required
                />
              </Field>
            </div>

            {/* Email Row */}
            <Field className="mt-4">
              <Label className="text-xs">{t('common.form.email')} *</Label>
              <Input
                type="email"
                name="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                required
                disabled={isEdit}
              />
            </Field>

            {/* Roles */}
            <Field className="mt-4">
              <Label className="text-xs">{t('common.form.role')} *</Label>
              {hasAdminRole && (
                <div className="mt-1.5 flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1 ring-1 ring-blue-200 dark:bg-blue-950/10 dark:ring-blue-900/20">
                  <svg className="h-3.5 w-3.5 flex-shrink-0 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <Text className="text-xs text-blue-800 dark:text-blue-400">
                    {t('users.form.adminRoleInfo')}
                  </Text>
                </div>
              )}
              <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1">
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
                      <Label className={isDisabled ? 'text-xs text-zinc-400 dark:text-zinc-600' : 'text-xs'}>
                        {role.name}
                      </Label>
                    </CheckboxField>
                  );
                })}
              </div>
            </Field>

            {/* Regions */}
            {activeRegions.length > 0 && (
              <Field className="mt-4">
                <Label className="text-xs">{t('users.form.assignedRegions')}</Label>
                <div className="mt-2 grid grid-cols-4 gap-x-6 gap-y-1">
                  {activeRegions.map((region) => (
                    <CheckboxField key={region.id}>
                      <Checkbox
                        name={`region-${region.id}`}
                        checked={formData.dispatchRegionIds.includes(region.id)}
                        onChange={(checked) => handleRegionToggle(region.id, checked)}
                      />
                      <Label className="text-xs">{region.name}</Label>
                    </CheckboxField>
                  ))}
                </div>
              </Field>
            )}

            {/* Send Invite */}
            {!isEdit && (
              <CheckboxField className="mt-4">
                <Checkbox
                  name="sendInvite"
                  checked={sendInvite}
                  onChange={(checked) => setSendInvite(checked)}
                />
                <Label className="text-xs">{t('users.form.sendInvite')}</Label>
              </CheckboxField>
            )}
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
          disabled={createMutation.isPending || updateProfileMutation.isPending || updateRolesMutation.isPending || updateRegionsMutation.isPending}
        >
          {createMutation.isPending || updateProfileMutation.isPending || updateRolesMutation.isPending || updateRegionsMutation.isPending
            ? t('common.saving')
            : t(isEdit ? 'common.update' : 'common.create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
