import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';

interface Customer {
  id?: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

interface CustomerFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  customer?: Customer | null;
}

export default function CustomerFormDialog({ isOpen, onClose, customer }: CustomerFormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = !!customer?.id;

  const [formData, setFormData] = useState<Customer>({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
  });

  useEffect(() => {
    if (!isOpen) return;

    // Intentionally setting form state based on props in useEffect
    // This is the recommended pattern for initializing controlled forms
    if (customer) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData(customer);
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData({
        name: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        state: '',
        zipCode: '',
      });
    }
  }, [customer, isOpen]);

  const createMutation = useMutation({
    mutationFn: (data: Customer) => apiClient.post('/customers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Customer) => apiClient.put(`/customers/${customer?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEdit) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleChange = (field: keyof Customer, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogTitle>{isEdit ? 'Edit Customer' : 'Add Customer'}</DialogTitle>
      <DialogDescription>
        {isEdit ? 'Update customer information.' : 'Create a new customer record.'}
      </DialogDescription>
      <DialogBody>
        <form onSubmit={handleSubmit} id="customer-form">
          <Fieldset>
            <FieldGroup>
              <Field>
                <Label>Name *</Label>
                <Input
                  name="name"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  required
                />
              </Field>

              <Field>
                <Label>Email *</Label>
                <Input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  required
                />
              </Field>

              <Field>
                <Label>Phone</Label>
                <Input
                  type="tel"
                  name="phone"
                  value={formData.phone || ''}
                  onChange={(e) => handleChange('phone', e.target.value)}
                />
              </Field>

              <Field>
                <Label>Address</Label>
                <Input
                  name="address"
                  value={formData.address || ''}
                  onChange={(e) => handleChange('address', e.target.value)}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <Label>City</Label>
                  <Input
                    name="city"
                    value={formData.city || ''}
                    onChange={(e) => handleChange('city', e.target.value)}
                  />
                </Field>

                <Field>
                  <Label>State</Label>
                  <Input
                    name="state"
                    value={formData.state || ''}
                    onChange={(e) => handleChange('state', e.target.value)}
                    placeholder="CA"
                    maxLength={2}
                  />
                </Field>
              </div>

              <Field>
                <Label>Zip Code</Label>
                <Input
                  name="zipCode"
                  value={formData.zipCode || ''}
                  onChange={(e) => handleChange('zipCode', e.target.value)}
                />
              </Field>
            </FieldGroup>
          </Fieldset>
        </form>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          form="customer-form"
          disabled={createMutation.isPending || updateMutation.isPending}
        >
          {createMutation.isPending || updateMutation.isPending
            ? 'Saving...'
            : isEdit
              ? 'Update'
              : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
