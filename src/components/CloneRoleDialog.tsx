import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { userApi, type Role } from '../api';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { Textarea } from './catalyst/textarea';

interface CloneRoleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  role: Role | null;
}

export default function CloneRoleDialog({ isOpen, onClose, role }: CloneRoleDialogProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [formData, setFormData] = useState<{
    name: string;
    description: string;
  }>({
    name: '',
    description: '',
  });

  useEffect(() => {
    if (!isOpen) return;

    if (role) {
      // Intentionally setting form state based on props in useEffect
      // This is the recommended pattern for initializing controlled forms
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData({
        name: `${role.name} (Copy)`,
        description: role.description || '',
      });
    } else {
      setFormData({
        name: '',
        description: '',
      });
    }
  }, [role, isOpen]);

  const cloneMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      userApi.cloneRole(role!.id, data),
    onSuccess: (newRole) => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      onClose();
      // Navigate to the new cloned role
      navigate(`/settings/access/roles/${newRole.id}`);
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('roles.actions.errorClone'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    cloneMutation.mutate({
      name: formData.name,
      description: formData.description || undefined,
    });
  };

  const handleChange = (field: 'name' | 'description', value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (!role) return null;

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogTitle>{t('roles.actions.clone')}</DialogTitle>
      <DialogDescription>
        {t('roles.actions.cloneDescription', { name: role.name })}
      </DialogDescription>
      <DialogBody>
        <form onSubmit={handleSubmit} id="clone-role-form">
          <Fieldset>
            <FieldGroup>
              <Field>
                <Label>{t('common.form.name')} *</Label>
                <Input
                  name="name"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="e.g., Almost Admin"
                  required
                />
              </Field>

              <Field>
                <Label>{t('common.form.description')}</Label>
                <Textarea
                  name="description"
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  placeholder="Brief description of this role's purpose"
                  rows={2}
                />
              </Field>
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
          form="clone-role-form"
          disabled={cloneMutation.isPending}
        >
          {cloneMutation.isPending ? t('common.cloning') : t('roles.actions.clone')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
