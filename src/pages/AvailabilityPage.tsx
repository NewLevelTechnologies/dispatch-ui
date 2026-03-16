import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon, ClockIcon } from '@heroicons/react/24/outline';
import AppLayout from '../components/AppLayout';
import { Heading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/catalyst/table';
import { Badge } from '../components/catalyst/badge';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../components/catalyst/dialog';
import { Field, FieldGroup, Fieldset, Label } from '../components/catalyst/fieldset';
import { Input } from '../components/catalyst/input';
import { Select } from '../components/catalyst/select';
import { Textarea } from '../components/catalyst/textarea';
import {
  availabilityApi,
  type Availability,
  type CreateAvailabilityRequest,
  type UpdateAvailabilityRequest,
} from '../api/schedulingApi';

export default function AvailabilityPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedAvailability, setSelectedAvailability] = useState<Availability | null>(null);
  const [formData, setFormData] = useState<CreateAvailabilityRequest>({
    userId: '',
    date: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '17:00',
    status: 'AVAILABLE',
    reason: '',
    notes: '',
  });

  const { data: availability = [], isLoading, error } = useQuery({
    queryKey: ['availability'],
    queryFn: () => availabilityApi.getAll(),
  });

  // Ensure data is always an array
  const safeAvailability = Array.isArray(availability) ? availability : [];

  const createMutation = useMutation({
    mutationFn: (request: CreateAvailabilityRequest) => availabilityApi.create(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability'] });
      setIsDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAvailabilityRequest }) =>
      availabilityApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability'] });
      setIsDialogOpen(false);
      setSelectedAvailability(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => availabilityApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
  });

  const handleAdd = () => {
    resetForm();
    setSelectedAvailability(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (item: Availability) => {
    setSelectedAvailability(item);
    setFormData({
      userId: item.userId,
      date: new Date(item.date).toISOString().split('T')[0],
      startTime: new Date(item.startTime).toISOString().split('T')[1].substring(0, 5),
      endTime: new Date(item.endTime).toISOString().split('T')[1].substring(0, 5),
      status: item.status,
      reason: item.reason || '',
      notes: item.notes || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (item: Availability) => {
    if (window.confirm(t('common.actions.deleteConfirm', { name: `Availability ${item.id.slice(0, 8)}` }))) {
      deleteMutation.mutate(item.id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Combine date with time for startTime and endTime
    const dateStr = formData.date;
    const startDateTime = new Date(`${dateStr}T${formData.startTime}:00`).toISOString();
    const endDateTime = new Date(`${dateStr}T${formData.endTime}:00`).toISOString();
    const dateOnly = new Date(dateStr).toISOString();

    const request = {
      userId: formData.userId,
      date: dateOnly,
      startTime: startDateTime,
      endTime: endDateTime,
      status: formData.status,
      reason: formData.reason || undefined,
      notes: formData.notes || undefined,
    };

    if (selectedAvailability) {
      updateMutation.mutate({ id: selectedAvailability.id, data: request });
    } else {
      createMutation.mutate(request);
    }
  };

  const resetForm = () => {
    setFormData({
      userId: '',
      date: new Date().toISOString().split('T')[0],
      startTime: '09:00',
      endTime: '17:00',
      status: 'AVAILABLE',
      reason: '',
      notes: '',
    });
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, 'lime' | 'sky' | 'amber' | 'rose' | 'zinc'> = {
      AVAILABLE: 'lime',
      UNAVAILABLE: 'rose',
      TENTATIVE: 'amber',
      BUSY: 'zinc',
    };
    return <Badge color={colors[status] || 'zinc'}>{status}</Badge>;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <AppLayout>
      <div className="flex items-end justify-between gap-4">
        <div>
          <Heading>{t('scheduling.entities.availability')}</Heading>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {t('scheduling.descriptionAvailability')}
          </p>
        </div>
        <Button onClick={handleAdd}>
          {t('common.actions.add', { entity: t('scheduling.entities.availabilityRecord') })}
        </Button>
      </div>

      <div className="mt-8">
        {error && (
          <div className="rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20 mb-4">
            <p className="text-sm text-red-800 dark:text-red-400">
              {t('common.actions.errorLoading', { entities: t('scheduling.entities.availability') })}: {(error as Error).message}
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {t('common.actions.loading', { entities: t('scheduling.entities.availability') })}
            </p>
          </div>
        ) : safeAvailability.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <ClockIcon className="h-12 w-12 text-zinc-400" />
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
              {t('common.actions.notFound', { entities: t('scheduling.entities.availability') })}
            </p>
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('scheduling.table.user')}</TableHeader>
                <TableHeader>{t('scheduling.table.date')}</TableHeader>
                <TableHeader>{t('scheduling.table.startTime')}</TableHeader>
                <TableHeader>{t('scheduling.table.endTime')}</TableHeader>
                <TableHeader>{t('common.form.status')}</TableHeader>
                <TableHeader>{t('scheduling.table.reason')}</TableHeader>
                <TableHeader></TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {safeAvailability.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.userId}</TableCell>
                  <TableCell>{formatDate(item.date)}</TableCell>
                  <TableCell>{formatTime(item.startTime)}</TableCell>
                  <TableCell>{formatTime(item.endTime)}</TableCell>
                  <TableCell>{getStatusBadge(item.status)}</TableCell>
                  <TableCell>{item.reason || '-'}</TableCell>
                  <TableCell>
                    <div className="-mx-3 -my-1.5 sm:-mx-2.5">
                      <Dropdown>
                        <DropdownButton plain aria-label={t('common.moreOptions')}>
                          <EllipsisVerticalIcon className="size-5" />
                        </DropdownButton>
                        <DropdownMenu anchor="bottom end">
                          <DropdownItem onClick={() => handleEdit(item)}>
                            <DropdownLabel>{t('common.edit')}</DropdownLabel>
                          </DropdownItem>
                          <DropdownItem onClick={() => handleDelete(item)}>
                            <DropdownLabel>{t('common.delete')}</DropdownLabel>
                          </DropdownItem>
                        </DropdownMenu>
                      </Dropdown>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={isDialogOpen} onClose={setIsDialogOpen}>
        <DialogTitle>
          {selectedAvailability
            ? t('common.actions.edit', { entity: t('scheduling.entities.availabilityRecord') })
            : t('common.actions.add', { entity: t('scheduling.entities.availabilityRecord') })}
        </DialogTitle>
        <DialogDescription>
          {selectedAvailability
            ? t('common.form.descriptionEdit', { entity: t('scheduling.entities.availabilityRecord') })
            : t('common.form.descriptionCreate', { entity: t('scheduling.entities.availabilityRecord') })}
        </DialogDescription>
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <Fieldset>
              <FieldGroup>
                <Field>
                  <Label>{t('scheduling.form.user')} *</Label>
                  <Input
                    name="userId"
                    value={formData.userId}
                    onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                    placeholder="User ID"
                    required
                  />
                </Field>

                <Field>
                  <Label>{t('scheduling.form.date')} *</Label>
                  <Input
                    type="date"
                    name="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                  />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field>
                    <Label>{t('scheduling.form.startTime')} *</Label>
                    <Input
                      type="time"
                      name="startTime"
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      required
                    />
                  </Field>

                  <Field>
                    <Label>{t('scheduling.form.endTime')} *</Label>
                    <Input
                      type="time"
                      name="endTime"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      required
                    />
                  </Field>
                </div>

                <Field>
                  <Label>{t('common.form.status')} *</Label>
                  <Select
                    name="status"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    required
                  >
                    <option value="AVAILABLE">{t('scheduling.status.available')}</option>
                    <option value="UNAVAILABLE">{t('scheduling.status.unavailable')}</option>
                    <option value="TENTATIVE">{t('scheduling.status.tentative')}</option>
                    <option value="BUSY">{t('scheduling.status.busy')}</option>
                  </Select>
                </Field>

                <Field>
                  <Label>{t('scheduling.form.reason')}</Label>
                  <Input
                    name="reason"
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    placeholder={t('scheduling.form.reasonPlaceholder')}
                  />
                </Field>

                <Field>
                  <Label>{t('common.form.notes')}</Label>
                  <Textarea
                    name="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </Field>
              </FieldGroup>
            </Fieldset>
          </DialogBody>
          <DialogActions>
            <Button plain onClick={() => setIsDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">
              {selectedAvailability ? t('common.update') : t('common.create')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </AppLayout>
  );
}
