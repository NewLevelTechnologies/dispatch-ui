import { useState } from 'react';
import clsx from 'clsx';
import { useSearchParams } from 'react-router-dom';
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
import { ListToolbar } from '../components/ui/ListToolbar';
import { ListFooter } from '../components/ui/ListFooter';
import { FilterChipListbox, ChipListboxOption } from '../components/ui/FilterChipListbox';
import { DateRangeChip } from '../components/ui/DateRangeChip';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../components/catalyst/dialog';
import { Field, Label } from '../components/catalyst/fieldset';
import { Select } from '../components/catalyst/select';
import { Textarea } from '../components/catalyst/textarea';
import { PaymentMethod, paymentsApi, invoicesApi } from '../api/setup';
import type { CreatePaymentRequest, PaymentStatus } from '../api/setup';
import { customerApi, dispatchRegionApi } from '../api/setup';
import { PAYMENT_METHOD_KEY, isPaymentMethod } from '../lib/paymentMethods';
import { FilterChip } from '../components/ui/FilterChipRow';

const PAGE_SIZE = 25;

const STATUSES: PaymentStatus[] = ['RECEIVED', 'VOID'];

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Filters and page live in the URL, so the footer's page links keep them.
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const methodParam = searchParams.get('method') as PaymentMethod | null;
  const method = isPaymentMethod(methodParam) ? methodParam : null;
  // One payer, or one region, from the Payments report.
  const payer = searchParams.get('payer');
  const regionId = searchParams.get('region');
  const statusParam = searchParams.get('status') as PaymentStatus | null;
  const status = statusParam && STATUSES.includes(statusParam) ? statusParam : null;
  const setFilterParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('page');
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

  const { data: paymentPage, isLoading: paymentsLoading } = useQuery({
    queryKey: ['payments', page, from, to, method, status, payer, regionId],
    queryFn: () =>
      paymentsApi.getAll({
        from: from || undefined,
        to: to || undefined,
        method: method ? [method] : undefined,
        status: status ? [status] : undefined,
        customerId: payer ?? undefined,
        regionIds: regionId ? [regionId] : undefined,
        page: page - 1,
        size: PAGE_SIZE,
      }),
  });
  const payments = paymentPage?.content ?? [];
  const total = paymentPage?.totalElements ?? 0;
  const totalPages = paymentPage?.totalPages ?? 0;
  const narrowed = Boolean(from || to || method || status || payer || regionId);
  // The payer's name rides on their payments.
  const payerName = payer ? (payments.find((p) => p.customerId === payer)?.payerName ?? null) : null;
  const { data: regions = [] } = useQuery({
    queryKey: ['dispatch-regions', 'all'],
    queryFn: () => dispatchRegionApi.getAll(true),
    enabled: !!regionId,
  });
  const regionName = regions.find((r) => r.id === regionId)?.name;

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

  const getInvoiceBalance = (invoiceId: string) => {
    if (!Array.isArray(invoices)) return 0;
    const invoice = invoices.find(inv => inv.id === invoiceId);
    return invoice?.balanceDue || 0;
  };


  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  // paymentDate is a calendar day; read it at noon UTC so no zone shifts it.
  const formatDate = (day: string) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });

  const paymentNoun = (n: number) =>
    n === 1 ? getName('payment').toLowerCase() : getName('payment', true).toLowerCase();
  const subtitle = total > 0 ? `${total.toLocaleString()} ${paymentNoun(total)}` : t('payments.description');
  const showingStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingEnd = Math.min(page * PAGE_SIZE, total);

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

        <ListToolbar>
          <DateRangeChip
            label={t('payments.filters.received')}
            ariaLabel={t('payments.filters.received')}
            value={{ from, to }}
            onChange={(r) => setFilterParams({ from: r.from || null, to: r.to || null })}
          />
          <FilterChipListbox
            label={t('payments.table.method')}
            ariaLabel={t('payments.table.method')}
            value={method}
            displayValue={method ? t(`payments.methods.${PAYMENT_METHOD_KEY[method]}`) : null}
            onChange={(v) => setFilterParams({ method: v })}
            onClear={() => setFilterParams({ method: null })}
            resetLabel={t('payments.filters.anyMethod')}
          >
            {(Object.keys(PAYMENT_METHOD_KEY) as PaymentMethod[]).map((m) => (
              <ChipListboxOption key={m} value={m}>
                {t(`payments.methods.${PAYMENT_METHOD_KEY[m]}`)}
              </ChipListboxOption>
            ))}
          </FilterChipListbox>
          <FilterChipListbox
            label={t('common.form.status')}
            ariaLabel={t('common.form.status')}
            value={status}
            displayValue={status ? t(`payments.status.${status}`) : null}
            onChange={(v) => setFilterParams({ status: v })}
            onClear={() => setFilterParams({ status: null })}
            resetLabel={t('payments.filters.anyStatus')}
          >
            {STATUSES.map((st) => (
              <ChipListboxOption key={st} value={st}>
                {t(`payments.status.${st}`)}
              </ChipListboxOption>
            ))}
          </FilterChipListbox>
          {regionId && (
            <FilterChip
              label={regionName ?? getName('dispatch_region')}
              active
              onToggle={() => setFilterParams({ region: null })}
            />
          )}
          {payer && (
            <FilterChip
              label={payerName ?? t('payments.filters.onePayer')}
              active
              onToggle={() => setFilterParams({ payer: null })}
            />
          )}
        </ListToolbar>

        {paymentsLoading ? (
          <Card>
            <CardBody flush>
              <LoadingState label={t('common.actions.loading', { entities: getName('payment', true) })} />
            </CardBody>
          </Card>
        ) : payments.length === 0 ? (
          <Card>
            <CardBody>
              <p className="text-[12.5px] text-fg-muted">
                {narrowed
                  ? t('payments.filters.noMatch', { entities: getName('payment', true).toLowerCase() })
                  : t('common.actions.notFound', { entities: getName('payment', true) })}
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
                    <th>{t('payments.table.payer')}</th>
                    <th>{t('payments.table.appliedTo')}</th>
                    <th>{t('payments.table.paymentDate')}</th>
                    <th className="right">{t('payments.table.amount')}</th>
                    <th>{t('payments.table.method')}</th>
                    <th>{t('payments.table.reference')}</th>
                    <th>{t('payments.table.receivedBy')}</th>
                  </tr>
                </DenseTHead>
                <tbody>
                  {payments.map((payment) => {
                    const voided = payment.status === 'VOID';
                    return (
                      <DenseRow key={payment.id}>
                        <td><span className="id-mono text-fg-strong">{payment.paymentNumber}</span></td>
                        <td className="strong" data-label={t('payments.table.payer')}>{payment.payerName}</td>
                        <td className={clsx(payment.applications.length === 0 && 'muted')} data-label={t('payments.table.appliedTo')}>
                          {payment.applications.length > 0 ? (
                            <span className="id-mono text-fg-muted">
                              {payment.applications.map((a) => a.invoiceNumber).join(', ')}
                            </span>
                          ) : (
                            t('payments.table.unapplied')
                          )}
                        </td>
                        <td data-label={t('payments.table.paymentDate')}>{formatDate(payment.paymentDate)}</td>
                        <td className={clsx('right num strong', voided && 'line-through text-fg-muted')} data-label={t('payments.table.amount')}>
                          {/* Scoped to a region, the part that paid invoices there: what the report counts. */}
                          {payment.amountInScope != null && payment.amountInScope !== payment.amount ? (
                            <>
                              {formatCurrency(payment.amountInScope)}
                              <div className="text-[11px] font-normal text-fg-muted">
                                {t('payments.table.ofTotal', { amount: formatCurrency(payment.amount) })}
                              </div>
                            </>
                          ) : (
                            formatCurrency(payment.amount)
                          )}
                        </td>
                        <td>
                          <span className="inline-flex gap-1">
                            <Pill tone="neutral">{t(`payments.methods.${PAYMENT_METHOD_KEY[payment.paymentMethod]}`)}</Pill>
                            {voided && <Pill tone="danger">{t('payments.status.VOID')}</Pill>}
                          </span>
                        </td>
                        <td className={clsx('muted', !payment.referenceNumber && 'dt-empty')} data-label={t('payments.table.reference')}>{payment.referenceNumber || '-'}</td>
                        <td className={clsx('muted', !payment.receivedByName && 'dt-empty')} data-label={t('payments.table.receivedBy')}>{payment.receivedByName || '-'}</td>
                      </DenseRow>
                    );
                  })}
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
