import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useGlossary } from '../contexts/GlossaryContext';
import AppLayout from '../components/AppLayout';
import { Heading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Input, InputGroup } from '../components/catalyst/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/catalyst/table';
import { Badge } from '../components/catalyst/badge';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../components/catalyst/dialog';
import { Field, Label } from '../components/catalyst/fieldset';
import { Select } from '../components/catalyst/select';
import { Textarea } from '../components/catalyst/textarea';
import { PaymentMethod, paymentsApi, invoicesApi } from '../api/financialApi';
import type { CreatePaymentRequest } from '../api/financialApi';
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

  // Form state
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

  const getPaymentMethodBadge = (method: PaymentMethod) => {
    return <Badge color="zinc">{t(`payments.methods.${method.toLowerCase()}`)}</Badge>;
  };

  const filteredPayments = Array.isArray(payments) ? payments.filter(payment =>
    payment.paymentNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    getInvoiceNumber(payment.invoiceId).toLowerCase().includes(searchTerm.toLowerCase()) ||
    getCustomerName(payment.customerId).toLowerCase().includes(searchTerm.toLowerCase())
  ) : [];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <AppLayout>
      <div className="flex items-end justify-between gap-4">
        <div>
          <Heading>{getName('payment', true)}</Heading>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{t('payments.description')}</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          {t('common.actions.create', { entity: getName('payment') })}
        </Button>
      </div>

      {/* Quick Search Bar */}
      <div className="mt-2 flex items-center gap-4">
        <InputGroup className="flex-1 max-w-md">
          <MagnifyingGlassIcon data-slot="icon" />
          <Input
            type="text"
            placeholder={t('common.search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </InputGroup>
        {payments && payments.length > 0 && (
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            {filteredPayments.length === payments.length
              ? `${payments.length} ${payments.length === 1 ? getName('payment').toLowerCase() : getName('payment', true).toLowerCase()}`
              : `${filteredPayments.length} of ${payments.length}`}
          </div>
        )}
      </div>

      {paymentsLoading ? (
        <div className="mt-4 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('common.actions.loading', { entities: getName('payment', true) })}</p>
        </div>
      ) : filteredPayments.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {searchTerm ? t('common.actions.noMatchSearch', { entities: getName('payment', true) }) : t('common.actions.notFound', { entities: getName('payment', true) })}
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <Table dense className="[--gutter:theme(spacing.1)] text-sm">
          <TableHead>
            <TableRow>
              <TableHeader>{t('payments.table.paymentNumber')}</TableHeader>
              <TableHeader>{t('payments.table.customer')}</TableHeader>
              <TableHeader>{t('payments.table.invoice')}</TableHeader>
              <TableHeader>{t('payments.table.paymentDate')}</TableHeader>
              <TableHeader>{t('payments.table.amount')}</TableHeader>
              <TableHeader>{t('payments.table.method')}</TableHeader>
              <TableHeader>{t('payments.table.reference')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredPayments.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell className="font-medium">{payment.paymentNumber}</TableCell>
                <TableCell>{getCustomerName(payment.customerId)}</TableCell>
                <TableCell>{getInvoiceNumber(payment.invoiceId)}</TableCell>
                <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                <TableCell>{formatCurrency(payment.amount)}</TableCell>
                <TableCell>{getPaymentMethodBadge(payment.paymentMethod)}</TableCell>
                <TableCell className="text-zinc-500">{payment.referenceNumber || '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      )}

      {/* Create Payment Dialog */}
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
