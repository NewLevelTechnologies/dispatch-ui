import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useGlossary } from '../contexts/GlossaryContext';
import AppLayout from '../components/AppLayout';
import { PageHeader, Toolbar, DataTable, type DataTableColumn } from '../components/shell';
import { Button } from '../components/catalyst/button';
import { Input } from '../components/catalyst/input';
import { Badge } from '../components/catalyst/badge';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../components/catalyst/dialog';
import { Field, Label } from '../components/catalyst/fieldset';
import { Select } from '../components/catalyst/select';
import { Textarea } from '../components/catalyst/textarea';
import { PaymentMethod, paymentsApi, invoicesApi } from '../api/financialApi';
import type { Payment, CreatePaymentRequest } from '../api/financialApi';
import apiClient from '../api/client';

interface Customer {
  id: string;
  name: string;
}

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState<{
    invoiceId: string;
    paymentDate: string;
    amount: string;
    paymentMethod: PaymentMethod;
    referenceNumber: string;
    notes: string;
  }>({
    invoiceId: '',
    paymentDate: new Date().toISOString().split('T')[0],
    amount: '0',
    paymentMethod: PaymentMethod.CASH,
    referenceNumber: '',
    notes: '',
  });

  const [submitting, setSubmitting] = useState(false);

  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: () => paymentsApi.getAll(),
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => invoicesApi.getAll(),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await apiClient.get<Customer[]>('/customers');
      return response.data;
    },
  });

  const safePayments = useMemo(() => Array.isArray(payments) ? payments : [], [payments]);

  const createMutation = useMutation({
    mutationFn: (request: CreatePaymentRequest) => paymentsApi.create(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setIsCreateOpen(false);
      resetForm();
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.invoiceId) {
      alert(t('payments.form.invoice') + ' is required');
      return;
    }

    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      alert('Amount must be greater than 0');
      return;
    }

    try {
      setSubmitting(true);
      const request: CreatePaymentRequest = {
        invoiceId: formData.invoiceId,
        paymentDate: new Date(formData.paymentDate).toISOString(),
        amount,
        paymentMethod: formData.paymentMethod,
        referenceNumber: formData.referenceNumber || undefined,
        notes: formData.notes || undefined,
      };
      await createMutation.mutateAsync(request);
    } catch (error: unknown) {
      console.error('Error creating payment:', error);
      const message = error && typeof error === 'object' && 'response' in error &&
        error.response && typeof error.response === 'object' && 'data' in error.response &&
        error.response.data && typeof error.response.data === 'object' && 'message' in error.response.data
        ? String(error.response.data.message)
        : t('common.form.errorCreate', { entity: getName('payment') });
      alert(message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      invoiceId: '',
      paymentDate: new Date().toISOString().split('T')[0],
      amount: '0',
      paymentMethod: PaymentMethod.CASH,
      referenceNumber: '',
      notes: '',
    });
  };

  const getCustomerName = (customerId: string) => {
    if (!Array.isArray(customers)) return customerId;
    const customer = customers.find(c => c.id === customerId);
    return customer?.name || customerId;
  };

  const getInvoiceNumber = (invoiceId: string) => {
    if (!Array.isArray(invoices)) return invoiceId;
    const invoice = invoices.find(inv => inv.id === invoiceId);
    return invoice?.invoiceNumber || invoiceId;
  };

  const getInvoiceBalance = (invoiceId: string) => {
    if (!Array.isArray(invoices)) return 0;
    const invoice = invoices.find(inv => inv.id === invoiceId);
    return invoice?.balanceDue || 0;
  };

  const filteredPayments = useMemo(() => {
    if (!searchTerm.trim()) return safePayments;
    const q = searchTerm.toLowerCase();
    return safePayments.filter(payment =>
      payment.paymentNumber.toLowerCase().includes(q) ||
      getInvoiceNumber(payment.invoiceId).toLowerCase().includes(q) ||
      getCustomerName(payment.customerId).toLowerCase().includes(q)
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safePayments, searchTerm, customers, invoices]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const columns: DataTableColumn<Payment>[] = [
    {
      key: 'paymentNumber',
      header: t('payments.table.paymentNumber'),
      cellClassName: 'font-medium',
      cell: (payment) => payment.paymentNumber,
    },
    {
      key: 'customer',
      header: t('payments.table.customer'),
      cell: (payment) => getCustomerName(payment.customerId),
    },
    {
      key: 'invoice',
      header: t('payments.table.invoice'),
      cell: (payment) => getInvoiceNumber(payment.invoiceId),
    },
    {
      key: 'paymentDate',
      header: t('payments.table.paymentDate'),
      cell: (payment) => formatDate(payment.paymentDate),
    },
    {
      key: 'amount',
      header: t('payments.table.amount'),
      cell: (payment) => formatCurrency(payment.amount),
    },
    {
      key: 'method',
      header: t('payments.table.method'),
      cell: (payment) => (
        <Badge color="zinc">{t(`payments.methods.${payment.paymentMethod.toLowerCase()}`)}</Badge>
      ),
    },
    {
      key: 'reference',
      header: t('payments.table.reference'),
      cellClassName: 'text-zinc-500',
      cell: (payment) => payment.referenceNumber || '-',
    },
  ];

  return (
    <AppLayout>
      <PageHeader
        title={getName('payment', true)}
        subtitle={t('payments.description')}
        actions={
          <Button color="accent" onClick={() => setIsCreateOpen(true)}>
            {t('common.actions.create', { entity: getName('payment') })}
          </Button>
        }
      />

      <Toolbar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder={t('common.search')}
        rowCount={
          safePayments.length > 0
            ? filteredPayments.length === safePayments.length
              ? `${safePayments.length} ${safePayments.length === 1 ? getName('payment').toLowerCase() : getName('payment', true).toLowerCase()}`
              : `${filteredPayments.length} of ${safePayments.length}`
            : undefined
        }
      />

      {safePayments.length === 0 && !paymentsLoading ? (
        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t('common.actions.notFound', { entities: getName('payment', true) })}
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filteredPayments}
          isLoading={paymentsLoading}
          getRowKey={(payment) => payment.id}
          emptyState={t('common.actions.noMatchSearch', { entities: getName('payment', true) })}
        />
      )}

      <Dialog open={isCreateOpen} onClose={setIsCreateOpen}>
        <DialogTitle>{t('common.actions.create', { entity: getName('payment') })}</DialogTitle>
        <DialogDescription>{t('common.form.descriptionCreate', { entity: getName('payment') })}</DialogDescription>
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <div className="space-y-4">
              <Field>
                <Label>{t('payments.form.invoice')}</Label>
                <Select
                  name="invoiceId"
                  value={formData.invoiceId}
                  onChange={(e) => {
                    const invoiceId = e.target.value;
                    setFormData({
                      ...formData,
                      invoiceId,
                      amount: invoiceId ? getInvoiceBalance(invoiceId).toString() : '0',
                    });
                  }}
                  required
                >
                  <option value="">Select invoice...</option>
                  {(Array.isArray(invoices) ? invoices.filter(inv => inv.balanceDue > 0) : []).map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.invoiceNumber} - {getCustomerName(invoice.customerId)} - {t('payments.form.balance')}: {formatCurrency(invoice.balanceDue)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field>
                <Label>{t('payments.form.paymentDate')}</Label>
                <Input
                  type="date"
                  value={formData.paymentDate}
                  onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                  required
                />
              </Field>

              <Field>
                <Label>{t('payments.form.amount')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                />
                {formData.invoiceId && (
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {t('payments.form.invoiceBalance')}: {formatCurrency(getInvoiceBalance(formData.invoiceId))}
                  </p>
                )}
              </Field>

              <Field>
                <Label>{t('payments.form.paymentMethod')}</Label>
                <Select
                  value={formData.paymentMethod}
                  onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value as PaymentMethod })}
                  required
                >
                  {Object.values(PaymentMethod).map((method) => (
                    <option key={method} value={method}>
                      {t(`payments.methods.${method.toLowerCase()}`)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field>
                <Label>{t('payments.form.referenceNumber')}</Label>
                <Input
                  type="text"
                  placeholder="Check #, Transaction ID, etc."
                  value={formData.referenceNumber}
                  onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })}
                />
              </Field>

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
    </AppLayout>
  );
}
