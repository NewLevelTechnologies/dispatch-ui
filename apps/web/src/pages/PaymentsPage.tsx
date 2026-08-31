import { useState } from 'react';
import clsx from 'clsx';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { useGlossary } from '../contexts/GlossaryContext';
import { invalidateLocationInvoiceCaches } from '../lib/invalidateFinancialCaches';
import AppLayout from '../components/AppLayout';
import { Button } from '../components/catalyst/button';
import { Input } from '../components/catalyst/input';
import { PageHead } from '../components/ui/PageHead';
import { Card, CardBody } from '../components/ui/Card';
import { LoadingState } from '../components/ui/LoadingState';
import { Pill } from '../components/ui/Pill';
import {
  DenseTable, DenseTHead, DenseRow,
} from '../components/ui/DenseTable';
import { ListToolbar, ListSearch } from '../components/ui/ListToolbar';
import { ListFooter } from '../components/ui/ListFooter';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../components/catalyst/dialog';
import { Field, Label } from '../components/catalyst/fieldset';
import { Select } from '../components/catalyst/select';
import { Textarea } from '../components/catalyst/textarea';
import { PaymentMethod, paymentsApi, invoicesApi } from '../api/setup';
import type { CreatePaymentRequest } from '../api/setup';
import { customerApi } from '../api/setup';

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

  // Invoice list backs the record-payment picker (id / number / balanceDue /
  // customerId lookups). The list endpoint is paged + lean now; pull one large
  // page for the picker (bounded; server caps at 200) and read .content.
  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', { picker: true }],
    queryFn: () => invoicesApi.getAll({ size: 200 }).then((p) => p.content),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['payment-form-customers'],
    queryFn: async () => {
      const page = await customerApi.getAllPaginated({ size: 200, status: ['ACTIVE'] });
      return page.content;
    },
  });

  const createMutation = useMutation({
    mutationFn: (request: CreatePaymentRequest) => paymentsApi.create(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      invalidateLocationInvoiceCaches(queryClient);
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

    const selectedInvoice = Array.isArray(invoices)
      ? invoices.find((inv) => inv.id === formData.invoiceId)
      : undefined;
    if (!selectedInvoice) {
      alert('Invoice not found');
      return;
    }

    try {
      setSubmitting(true);
      const request: CreatePaymentRequest = {
        // Bill-to customer sourced from the invoice (may differ from the
        // WO's customer when billing is routed to a third party).
        customerId: selectedInvoice.customerId,
        // Backend wants LocalDate (YYYY-MM-DD) for paymentDate, not Instant.
        paymentDate: formData.paymentDate,
        amount,
        paymentMethod: formData.paymentMethod,
        referenceNumber: formData.referenceNumber || undefined,
        notes: formData.notes || undefined,
        // Single-application case: the whole amount lands on the selected
        // invoice. Split-payment UI is not built; if needed it'd construct
        // multiple entries here.
        applications: [
          { invoiceId: formData.invoiceId, amountApplied: amount },
        ],
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
    return <Pill tone="neutral">{t(`payments.methods.${method.toLowerCase()}`)}</Pill>;
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

  const paymentsCount = Array.isArray(payments) ? payments.length : 0;
  const paymentNoun = (n: number) =>
    n === 1 ? getName('payment').toLowerCase() : getName('payment', true).toLowerCase();
  const subtitle = paymentsCount > 0
    ? (filteredPayments.length === paymentsCount
        ? `${paymentsCount.toLocaleString()} ${paymentNoun(paymentsCount)}`
        : t('common.pagination.showing', {
            start: filteredPayments.length > 0 ? 1 : 0,
            end: filteredPayments.length,
            total: paymentsCount.toLocaleString(),
          }))
    : t('payments.description');

  return (
    <AppLayout>
      <div>
        <PageHead
          title={getName('payment', true)}
          sub={subtitle}
          actions={
            <Button color="accent" onClick={() => setIsCreateOpen(true)}>
              {t('common.actions.create', { entity: getName('payment') })}
            </Button>
          }
        />

        <ListToolbar
          search={
            <ListSearch
              placeholder={t('payments.search.placeholder', {
                customer: getName('customer'),
                invoice: getName('invoice'),
              })}
              value={searchTerm}
              onChange={setSearchTerm}
            />
          }
        />

        {paymentsLoading ? (
          <Card>
            <CardBody flush>
              <LoadingState label={t('common.actions.loading', { entities: getName('payment', true) })} />
            </CardBody>
          </Card>
        ) : filteredPayments.length === 0 ? (
          <Card>
            <CardBody>
              <p className="text-[12.5px] text-fg-muted">
                {searchTerm ? t('common.actions.noMatchSearch', { entities: getName('payment', true) }) : t('common.actions.notFound', { entities: getName('payment', true) })}
              </p>
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardBody flush>
              <DenseTable className="dense-stack">
                <DenseTHead>
                  <tr>
                    <th>{t('payments.table.paymentNumber')}</th>
                    <th>{t('payments.table.customer')}</th>
                    <th>{t('payments.table.invoice')}</th>
                    <th>{t('payments.table.paymentDate')}</th>
                    <th className="right">{t('payments.table.amount')}</th>
                    <th>{t('payments.table.method')}</th>
                    <th>{t('payments.table.reference')}</th>
                  </tr>
                </DenseTHead>
                <tbody>
                  {filteredPayments.map((payment) => (
                    <DenseRow key={payment.id}>
                      <td><span className="id-mono text-fg-strong">{payment.paymentNumber}</span></td>
                      <td className="strong" data-label={t('payments.table.customer')}>{getCustomerName(payment.customerId)}</td>
                      <td data-label={t('payments.table.invoice')}><span className="id-mono text-fg-muted">{getInvoiceNumber(payment.invoiceId)}</span></td>
                      <td data-label={t('payments.table.paymentDate')}>{formatDate(payment.paymentDate)}</td>
                      <td className="right num strong" data-label={t('payments.table.amount')}>{formatCurrency(payment.amount)}</td>
                      <td>{getPaymentMethodBadge(payment.paymentMethod)}</td>
                      <td className={clsx('muted', !payment.referenceNumber && 'dt-empty')} data-label={t('payments.table.reference')}>{payment.referenceNumber || '-'}</td>
                    </DenseRow>
                  ))}
                </tbody>
              </DenseTable>
              <ListFooter
                left={t('common.pagination.showing', {
                  start: filteredPayments.length > 0 ? 1 : 0,
                  end: filteredPayments.length,
                  total: paymentsCount.toLocaleString(),
                })}
              />
            </CardBody>
          </Card>
        )}
      </div>

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
