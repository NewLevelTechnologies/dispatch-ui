import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { userApi, type Role } from '../api';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { Textarea } from './catalyst/textarea';
import CapabilitiesDisplay from './CapabilitiesDisplay';

interface RoleFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  role?: Role | null;
}

export default function RoleFormDialog({ isOpen, onClose, role }: RoleFormDialogProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const isEdit = !!role?.id;

  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    capabilities: string[];
  }>({
    name: '',
    description: '',
    capabilities: [],
  });

  // Intentionally setting form state based on props in useEffect
  // This is the recommended pattern for initializing controlled forms
  useEffect(() => {
    if (!isOpen) return;

    if (role) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData({
        name: role.name || '',
        description: role.description || '',
        capabilities: role.capabilities || [],
      });
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData({
        name: '',
        description: '',
        capabilities: [],
      });
    }
  }, [role, isOpen]);

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; capabilities: string[] }) =>
      userApi.createRole({
        name: data.name,
        description: data.description,
        capabilities: data.capabilities,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      onClose();
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('common.form.errorCreate', { entity: t('entities.role') }));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; capabilities: string[] }) =>
      userApi.updateRole(role!.id, {
        name: data.name,
        description: data.description,
        capabilities: data.capabilities,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['roles', role!.id] });
      onClose();
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('common.form.errorUpdate', { entity: t('entities.role') }));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.capabilities.length === 0) {
      alert('Please select at least one capability for this role.');
      return;
    }

    if (isEdit) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleChange = (field: 'name' | 'description', value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleCapabilityToggle = (capabilityName: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      capabilities: checked
        ? [...prev.capabilities, capabilityName]
        : prev.capabilities.filter((cap) => cap !== capabilityName),
    }));
  };

  return (
    <Dialog open={isOpen} onClose={onClose} size="5xl">
      <DialogTitle>
        {t('common.form.titleCreate', {
          action: isEdit ? t('common.edit') : t('common.add'),
          entity: t('entities.role')
        })}
      </DialogTitle>
      <DialogDescription>
        {isEdit
          ? 'Update role name, description, and capabilities.'
          : 'Create a new role by defining its name, description, and capabilities.'}
      </DialogDescription>
      <DialogBody>
        <form onSubmit={handleSubmit} id="role-form">
          <Fieldset>
            <FieldGroup>
              <Field>
                <Label>{t('common.form.name')} *</Label>
                <Input
                  name="name"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="e.g., Field Technician, Office Manager"
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

          <div className="mt-6">
            <div className="mb-4">
              <Label>Capabilities *</Label>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Select the capabilities this role should have. Users assigned this role will inherit these permissions.
              </p>
              {formData.capabilities.length > 0 && (
                <p className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {formData.capabilities.length} capability(ies) selected
                </p>
              )}
            </div>

            <CapabilitiesDisplay
              selectedCapabilities={formData.capabilities}
              onCapabilityToggle={handleCapabilityToggle}
              editMode={true}
            />
          </div>
        </form>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          form="role-form"
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
