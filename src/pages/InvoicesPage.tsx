import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useGlossary } from '../contexts/GlossaryContext';
import AppLayout from '../components/AppLayout';
import { PageHeader, StatusBadge, Toolbar, DataTable, type DataTableColumn } from '../components/shell';
import { Button } from '../components/catalyst/button';
import { Input } from '../components/catalyst/input';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../components/catalyst/dialog';
import { Field, Label } from '../components/catalyst/fieldset';
import { Select } from '../components/catalyst/select';
import { Textarea } from '../components/catalyst/textarea';
import { InvoiceStatus, invoicesApi } from '../api/financialApi';
import type { Invoice, CreateInvoiceRequest, CreateInvoiceLineItemRequest } from '../api/financialApi';
import { customerApi, workOrderApi } from '../api';

export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState<{
    customerId: string;
    workOrderId: string;
    invoiceDate: string;
    dueDate: string;
    taxRate: string;
    notes: string;
    lineItems: CreateInvoiceLineItemRequest[];
  }>({
    customerId: '',
    workOrderId: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    taxRate: '0',
    notes: '',
    lineItems: [{ description: '', quantity: 1, unitPrice: 0 }],
  });

  const [newStatus, setNewStatus] = useState<InvoiceStatus>(InvoiceStatus.DRAFT);
  const [submitting, setSubmitting] = useState(false);

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => invoicesApi.getAll(),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await customerApi.getAllPaginated({ limit: 500 });
      return response.content;
    },
  });

  const { data: workOrders = [] } = useQuery({
    queryKey: ['work-orders'],
    queryFn: () => workOrderApi.getAll(),
  });

  const safeInvoices = useMemo(() => Array.isArray(invoices) ? invoices : [], [invoices]);

  const createMutation = useMutation({
    mutationFn: (request: CreateInvoiceRequest) => invoicesApi.create(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setIsCreateOpen(false);
      resetForm();
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: InvoiceStatus }) =>
      invoicesApi.updateStatus(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setIsStatusOpen(false);
      setSelectedInvoice(null);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.customerId) {
      alert(t('invoices.form.customer') + ' is required');
      return;
    }

    if (formData.lineItems.length === 0 || !formData.lineItems.every(item => item.description && item.quantity > 0)) {
      alert('Please add at least one complete line item');
      return;
    }

    try {
      setSubmitting(true);
      const request: CreateInvoiceRequest = {
        customerId: formData.customerId,
        workOrderId: formData.workOrderId || undefined,
        invoiceDate: new Date(formData.invoiceDate).toISOString(),
        dueDate: new Date(formData.dueDate).toISOString(),
        taxRate: parseFloat(formData.taxRate),
        notes: formData.notes || undefined,
        lineItems: formData.lineItems,
      };
      await createMutation.mutateAsync(request);
    } catch (error: unknown) {
      console.error('Error creating invoice:', error);
      const message = error && typeof error === 'object' && 'response' in error &&
        error.response && typeof error.response === 'object' && 'data' in error.response &&
        error.response.data && typeof error.response.data === 'object' && 'message' in error.response.data
        ? String(error.response.data.message)
        : t('common.form.errorCreate', { entity: getName('invoice') });
      alert(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!selectedInvoice) return;

    try {
      setSubmitting(true);
      await updateStatusMutation.mutateAsync({ id: selectedInvoice.id, status: newStatus });
    } catch (error: unknown) {
      console.error('Error updating status:', error);
      const message = error && typeof error === 'object' && 'response' in error &&
        error.response && typeof error.response === 'object' && 'data' in error.response &&
        error.response.data && typeof error.response.data === 'object' && 'message' in error.response.data
        ? String(error.response.data.message)
        : 'Failed to update invoice status';
      alert(message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      customerId: '',
      workOrderId: '',
      invoiceDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      taxRate: '0',
      notes: '',
      lineItems: [{ description: '', quantity: 1, unitPrice: 0 }],
    });
  };

  const addLineItem = () => {
    setFormData({
      ...formData,
      lineItems: [...formData.lineItems, { description: '', quantity: 1, unitPrice: 0 }],
    });
  };

  const removeLineItem = (index: number) => {
    setFormData({
      ...formData,
      lineItems: formData.lineItems.filter((_, i) => i !== index),
    });
  };

  const updateLineItem = (index: number, field: keyof CreateInvoiceLineItemRequest, value: string | number) => {
    const updated = [...formData.lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, lineItems: updated });
  };

  const getCustomerName = (customerId: string) => {
    if (!Array.isArray(customers)) return customerId;
    const customer = customers.find(c => c.id === customerId);
    return customer?.name || customerId;
  };

  const filteredInvoices = useMemo(() => {
    if (!searchTerm.trim()) return safeInvoices;
    const q = searchTerm.toLowerCase();
    return safeInvoices.filter(invoice =>
      invoice.invoiceNumber.toLowerCase().includes(q) ||
      getCustomerName(invoice.customerId).toLowerCase().includes(q)
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeInvoices, searchTerm, customers]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const columns: DataTableColumn<Invoice>[] = [
    {
      key: 'invoiceNumber',
      header: t('invoices.table.invoiceNumber'),
      cellClassName: 'font-medium',
      cell: (invoice) => invoice.invoiceNumber,
    },
    {
      key: 'customer',
      header: t('invoices.table.customer'),
      cell: (invoice) => getCustomerName(invoice.customerId),
    },
    {
      key: 'invoiceDate',
      header: t('invoices.table.invoiceDate'),
      cell: (invoice) => formatDate(invoice.invoiceDate),
    },
    {
      key: 'dueDate',
      header: t('invoices.table.dueDate'),
      cell: (invoice) => formatDate(invoice.dueDate),
    },
    {
      key: 'totalAmount',
      header: t('invoices.table.totalAmount'),
      cell: (invoice) => formatCurrency(invoice.totalAmount),
    },
    {
      key: 'balanceDue',
      header: t('invoices.table.balanceDue'),
      cell: (invoice) => formatCurrency(invoice.balanceDue),
    },
    {
      key: 'status',
      header: t('invoices.table.status'),
      cell: (invoice) => (
        <StatusBadge
          status={invoice.status}
          label={t(`invoices.status.${invoice.status.toLowerCase()}`)}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      cell: (invoice) => (
        <Button
          plain
          onClick={() => {
            setSelectedInvoice(invoice);
            setNewStatus(invoice.status);
            setIsStatusOpen(true);
          }}
        >
          {t('common.edit')}
        </Button>
      ),
    },
  ];

  return (
    <AppLayout>
      <PageHeader
        title={getName('invoice', true)}
        subtitle={t('invoices.description')}
        actions={
          <Button color="accent" onClick={() => setIsCreateOpen(true)}>
            {t('common.actions.create', { entity: getName('invoice') })}
          </Button>
        }
      />

      <Toolbar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder={t('common.search')}
        rowCount={
          safeInvoices.length > 0
            ? filteredInvoices.length === safeInvoices.length
              ? `${safeInvoices.length} ${safeInvoices.length === 1 ? getName('invoice').toLowerCase() : getName('invoice', true).toLowerCase()}`
              : `${filteredInvoices.length} of ${safeInvoices.length}`
            : undefined
        }
      />

      {safeInvoices.length === 0 && !invoicesLoading ? (
        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t('common.actions.notFound', { entities: getName('invoice', true) })}
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filteredInvoices}
          isLoading={invoicesLoading}
          getRowKey={(invoice) => invoice.id}
          emptyState={t('common.actions.noMatchSearch', { entities: getName('invoice', true) })}
        />
      )}

      <Dialog open={isCreateOpen} onClose={setIsCreateOpen}>
        <DialogTitle>{t('common.actions.create', { entity: getName('invoice') })}</DialogTitle>
        <DialogDescription>{t('common.form.descriptionCreate', { entity: getName('invoice') })}</DialogDescription>
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <div className="space-y-4">
              <Field>
                <Label>{t('invoices.form.customer')}</Label>
                <Select
                  name="customerId"
                  value={formData.customerId}
                  onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                  required
                >
                  <option value="">{t('workOrders.form.customerPlaceholder')}</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field>
                <Label>{t('invoices.form.workOrder')}</Label>
                <Select
                  name="workOrderId"
                  value={formData.workOrderId}
                  onChange={(e) => setFormData({ ...formData, workOrderId: e.target.value })}
                >
                  <option value="">{t('common.none')}</option>
                  {workOrders.map((wo) => (
                    <option key={wo.id} value={wo.id}>
                      {wo.description || wo.id}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <Label>{t('invoices.form.invoiceDate')}</Label>
                  <Input
                    type="date"
                    value={formData.invoiceDate}
                    onChange={(e) => setFormData({ ...formData, invoiceDate: e.target.value })}
                    required
                  />
                </Field>

                <Field>
                  <Label>{t('invoices.form.dueDate')}</Label>
                  <Input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    required
                  />
                </Field>
              </div>

              <Field>
                <Label>{t('invoices.form.taxRate')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.taxRate}
                  onChange={(e) => setFormData({ ...formData, taxRate: e.target.value })}
                />
              </Field>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>{t('invoices.form.lineItems')}</Label>
                  <Button type="button" plain onClick={addLineItem}>
                    {t('invoices.form.addLineItem')}
                  </Button>
                </div>
                {formData.lineItems.map((item, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <Input
                      placeholder={t('invoices.form.description')}
                      value={item.description}
                      onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                      required
                    />
                    <Input
                      type="number"
                      placeholder={t('invoices.form.quantity')}
                      value={item.quantity}
                      onChange={(e) => updateLineItem(index, 'quantity', parseFloat(e.target.value))}
                      className="w-24"
                      required
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={t('invoices.form.unitPrice')}
                      value={item.unitPrice}
                      onChange={(e) => updateLineItem(index, 'unitPrice', parseFloat(e.target.value))}
                      className="w-32"
                      required
                    />
                    {formData.lineItems.length > 1 && (
                      <Button type="button" plain onClick={() => removeLineItem(index)}>
                        {t('invoices.form.removeLineItem')}
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <Field>
                <Label>{t('common.form.notes')}</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                />
              </Field>
            </div>
          </DialogBody>
          <DialogActions>
            <Button plain onClick={() => { setIsCreateOpen(false); resetForm(); }}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t('common.saving') : t('common.create')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={isStatusOpen} onClose={setIsStatusOpen}>
        <DialogTitle>{t('common.actions.edit', { entity: getName('invoice') })}</DialogTitle>
        <DialogDescription>{t('common.updateStatus', { entity: getName('invoice') })}</DialogDescription>
        <DialogBody>
          <Field>
            <Label>{t('common.form.status')}</Label>
            <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value as InvoiceStatus)}>
              {Object.values(InvoiceStatus).map((status) => (
                <option key={status} value={status}>
                  {t(`invoices.status.${status.toLowerCase()}`)}
                </option>
              ))}
            </Select>
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setIsStatusOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleStatusUpdate} disabled={submitting}>
            {submitting ? t('common.saving') : t('common.update')}
          </Button>
        </DialogActions>
      </Dialog>
    </AppLayout>
  );
}
