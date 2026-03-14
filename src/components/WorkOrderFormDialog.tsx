import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { Textarea } from './catalyst/textarea';
import { Select } from './catalyst/select';

interface WorkOrder {
  id?: string;
  customerId: string;
  status?: 'PENDING' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  scheduledDate?: string;
  description?: string;
  notes?: string;
}

interface Customer {
  id: string;
  name: string;
  email: string;
}

interface WorkOrderFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workOrder?: WorkOrder | null;
}

export default function WorkOrderFormDialog({ isOpen, onClose, workOrder }: WorkOrderFormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = !!workOrder?.id;

  const [formData, setFormData] = useState<WorkOrder>({
    customerId: '',
    status: 'PENDING',
    scheduledDate: '',
    description: '',
    notes: '',
  });

  // Fetch customers for dropdown
  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await apiClient.get<Customer[]>('/customers');
      return response.data;
    },
    enabled: isOpen,
  });

  useEffect(() => {
    if (workOrder) {
      setFormData({
        customerId: workOrder.customerId,
        status: workOrder.status,
        scheduledDate: workOrder.scheduledDate || '',
        description: workOrder.description || '',
        notes: workOrder.notes || '',
      });
    } else {
      setFormData({
        customerId: '',
        status: 'PENDING',
        scheduledDate: '',
        description: '',
        notes: '',
      });
    }
  }, [workOrder, isOpen]);

  const createMutation = useMutation({
    mutationFn: (data: WorkOrder) => apiClient.post('/work-orders', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      onClose();
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || 'Failed to create work order');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: WorkOrder) =>
      apiClient.patch(`/work-orders/${workOrder?.id}`, {
        status: data.status,
        scheduledDate: data.scheduledDate || null,
        description: data.description,
        notes: data.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      onClose();
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || 'Failed to update work order');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.customerId) {
      alert('Please select a customer');
      return;
    }

    if (isEdit) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleChange = (field: keyof WorkOrder, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogTitle>{isEdit ? 'Edit Work Order' : 'Create Work Order'}</DialogTitle>
      <DialogDescription>
        {isEdit ? 'Update work order information.' : 'Create a new work order for a customer.'}
      </DialogDescription>
      <DialogBody>
        <form onSubmit={handleSubmit} id="work-order-form">
          <Fieldset>
            <FieldGroup>
              <Field>
                <Label>Customer *</Label>
                <Select
                  name="customerId"
                  value={formData.customerId}
                  onChange={(e) => handleChange('customerId', e.target.value)}
                  required
                  disabled={isEdit}
                >
                  <option value="">Select a customer...</option>
                  {customers?.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} ({customer.email})
                    </option>
                  ))}
                </Select>
              </Field>

              {isEdit && (
                <Field>
                  <Label>Status</Label>
                  <Select
                    name="status"
                    value={formData.status}
                    onChange={(e) => handleChange('status', e.target.value)}
                  >
                    <option value="PENDING">Pending</option>
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </Select>
                </Field>
              )}

              <Field>
                <Label>Scheduled Date</Label>
                <Input
                  type="date"
                  name="scheduledDate"
                  value={formData.scheduledDate}
                  onChange={(e) => handleChange('scheduledDate', e.target.value)}
                />
              </Field>

              <Field>
                <Label>Description</Label>
                <Textarea
                  name="description"
                  value={formData.description || ''}
                  onChange={(e) => handleChange('description', e.target.value)}
                  rows={3}
                />
              </Field>

              <Field>
                <Label>Notes</Label>
                <Textarea
                  name="notes"
                  value={formData.notes || ''}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  rows={3}
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
          form="work-order-form"
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
