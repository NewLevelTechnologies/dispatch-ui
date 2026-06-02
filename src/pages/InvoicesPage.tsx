import { useState, useDeferredValue } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useGlossary } from '../contexts/GlossaryContext';
import { invalidateLocationInvoiceCaches } from '../lib/invalidateFinancialCaches';
import AppLayout from '../components/AppLayout';
import { Button } from '../components/catalyst/button';
import { Input } from '../components/catalyst/input';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../components/catalyst/dialog';
import { Field, Label } from '../components/catalyst/fieldset';
import { Select } from '../components/catalyst/select';
import { Textarea } from '../components/catalyst/textarea';
import { PageHead } from '../components/ui/PageHead';
import { Card, CardBody } from '../components/ui/Card';
import { Pill } from '../components/ui/Pill';
import {
  DenseTable, DenseTHead, DenseRow,
} from '../components/ui/DenseTable';
import { ListToolbar, ListSearch } from '../components/ui/ListToolbar';
import { ListFooter } from '../components/ui/ListFooter';
import { InvoiceStatus, invoicesApi } from '../api/financialApi';
import type { InvoiceListItemRow, CreateInvoiceRequest, CreateInvoiceLineItemRequest } from '../api/financialApi';

const PAGE_SIZE = 25;
import { customerApi } from '../api/customerApi';
import { workOrderApi } from '../api/workOrderApi';

export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceListItemRow | null>(null);

  // Server-side search + pagination (the list endpoint is paged + lean now, so
  // client-side filtering would only search the loaded page). Page lives in the
  // URL (1-based; API is 0-based); search is mirrored to the URL so the footer's
  // page links preserve it.
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') ?? '');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const deferredSearch = useDeferredValue(searchQuery.trim());

  const onSearchChange = (value: string) => {
    setSearchQuery(value);
    const next = new URLSearchParams(searchParams);
    if (value) next.set('search', value);
    else next.delete('search');
    next.delete('page'); // new query → back to page 1
    setSearchParams(next, { replace: true });
  };

  const pageHref = (target: number): string => {
    const next = new URLSearchParams(searchParams);
    if (target <= 1) next.delete('page');
    else next.set('page', String(target));
    const qs = next.toString();
    return qs ? `?${qs}` : '?';
  };

  // Form state
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

  const { data: invoicePage, isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices', page, deferredSearch],
    queryFn: () =>
      invoicesApi.getAll({
        q: deferredSearch || undefined,
        page: page - 1,
        size: PAGE_SIZE,
        sort: 'invoiceDate,desc',
      }),
  });
  const invoices = invoicePage?.content ?? [];
  const total = invoicePage?.totalElements ?? 0;
  const totalPages = invoicePage?.totalPages ?? 0;

  const { data: customers = [] } = useQuery({
    queryKey: ['invoice-form-customers'],
    queryFn: async () => {
      const page = await customerApi.getAllPaginated({ limit: 200, status: ['ACTIVE'] });
      return page.content;
    },
  });

  const { data: workOrders = [] } = useQuery({
    queryKey: ['invoice-form-work-orders'],
    queryFn: async () => {
      const page = await workOrderApi.getAll({ size: 200 });
      return page.content;
    },
  });

  const createMutation = useMutation({
    mutationFn: (request: CreateInvoiceRequest) => invoicesApi.create(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      invalidateLocationInvoiceCaches(queryClient);
      setIsCreateOpen(false);
      resetForm();
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: InvoiceStatus }) =>
      invoicesApi.updateStatus(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      invalidateLocationInvoiceCaches(queryClient);
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
        // Business dates are LocalDate (yyyy-MM-dd) on the wire — pass
        // the date-input value through raw, not as an ISO Instant.
        invoiceDate: formData.invoiceDate,
        dueDate: formData.dueDate,
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

  const getStatusBadge = (status: InvoiceStatus) => {
    const tones: Record<InvoiceStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
      [InvoiceStatus.DRAFT]: 'neutral',
      [InvoiceStatus.SENT]: 'info',
      [InvoiceStatus.PAID]: 'success',
      [InvoiceStatus.OVERDUE]: 'danger',
      [InvoiceStatus.CANCELLED]: 'neutral',
      [InvoiceStatus.VOID]: 'neutral',
    };
    return <Pill tone={tones[status]} dot>{t(`invoices.status.${status.toLowerCase()}`)}</Pill>;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const showingStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingEnd = Math.min(page * PAGE_SIZE, total);
  const invoiceSubtitle = total > 0
    ? t('common.pagination.showing', {
        start: showingStart,
        end: showingEnd,
        total: total.toLocaleString(),
      })
    : t('invoices.description');

  return (
    <AppLayout>
      <div>
        <PageHead
          title={getName('invoice', true)}
          sub={invoiceSubtitle}
          actions={
            <Button color="accent" onClick={() => setIsCreateOpen(true)}>
              {t('common.actions.create', { entity: getName('invoice') })}
            </Button>
          }
        />

        <ListToolbar
          search={
            <ListSearch
              placeholder={t('invoices.search.placeholder', {
                entity: getName('invoice'),
                customer: getName('customer'),
              })}
              value={searchQuery}
              onChange={onSearchChange}
            />
          }
        />

        {invoicesLoading ? (
          <Card>
            <CardBody>
              <p className="text-center text-[12.5px] text-fg-muted">
                {t('common.actions.loading', { entities: getName('invoice', true) })}
              </p>
            </CardBody>
          </Card>
        ) : invoices.length === 0 ? (
          <Card>
            <CardBody>
              <p className="text-[12.5px] text-fg-muted">
                {deferredSearch ? t('common.actions.noMatchSearch', { entities: getName('invoice', true) }) : t('common.actions.notFound', { entities: getName('invoice', true) })}
              </p>
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardBody flush>
              <DenseTable>
                <DenseTHead>
                  <tr>
                    <th>{t('invoices.table.invoiceNumber')}</th>
                    <th>{t('invoices.table.customer')}</th>
                    <th>{t('invoices.table.invoiceDate')}</th>
                    <th>{t('invoices.table.dueDate')}</th>
                    <th className="right">{t('invoices.table.totalAmount')}</th>
                    <th className="right">{t('invoices.table.balanceDue')}</th>
                    <th>{t('invoices.table.status')}</th>
                    <th></th>
                  </tr>
                </DenseTHead>
                <tbody>
                  {invoices.map((invoice) => (
                    <DenseRow key={invoice.id}>
                      <td>
                        <span className="id-mono text-fg-muted">{invoice.invoiceNumber}</span>
                      </td>
                      <td className="strong">{invoice.customerName ?? invoice.customerId}</td>
                      <td>{formatDate(invoice.invoiceDate)}</td>
                      <td>{formatDate(invoice.dueDate)}</td>
                      <td className="right num strong">{formatCurrency(invoice.totalAmount)}</td>
                      <td className="right num">
                        {invoice.balanceDue > 0 ? (
                          <span className="font-semibold text-warning-500">{formatCurrency(invoice.balanceDue)}</span>
                        ) : (
                          formatCurrency(invoice.balanceDue)
                        )}
                      </td>
                      <td>{getStatusBadge(invoice.status)}</td>
                      <td>
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
                      </td>
                    </DenseRow>
                  ))}
                </tbody>
              </DenseTable>
              <ListFooter
                page={page}
                totalPages={totalPages}
                pageHref={pageHref}
                left={t('common.pagination.showing', {
                  start: showingStart,
                  end: showingEnd,
                  total: total.toLocaleString(),
                })}
              />
            </CardBody>
          </Card>
        )}
      </div>

      {/* Create Invoice Dialog */}
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
                      {wo.workOrderNumber
                        ? `${wo.workOrderNumber}${wo.customer?.name ? ` — ${wo.customer.name}` : ''}`
                        : wo.id}
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

      {/* Update Status Dialog */}
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
