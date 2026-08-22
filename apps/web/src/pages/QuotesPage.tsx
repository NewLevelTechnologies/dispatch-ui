import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { useGlossary } from '../contexts/GlossaryContext';
import AppLayout from '../components/AppLayout';
import { Button } from '../components/catalyst/button';
import { Input } from '../components/catalyst/input';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../components/catalyst/dialog';
import { Field, Label } from '../components/catalyst/fieldset';
import { Select } from '../components/catalyst/select';
import { Textarea } from '../components/catalyst/textarea';
import { PageHead } from '../components/ui/PageHead';
import { Card, CardBody } from '../components/ui/Card';
import { LoadingState } from '../components/ui/LoadingState';
import { Pill } from '../components/ui/Pill';
import {
  DenseTable, DenseTHead, DenseRow,
} from '../components/ui/DenseTable';
import { ListToolbar, ListSearch } from '../components/ui/ListToolbar';
import { ListFooter } from '../components/ui/ListFooter';
import { QuoteStatus, quotesApi } from '../api/setup';
import type { Quote, CreateQuoteRequest, CreateQuoteLineItemRequest } from '../api/setup';
import { customerApi } from '../api/setup';

export default function QuotesPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Form state
  const [formData, setFormData] = useState<{
    customerId: string;
    quoteDate: string;
    expirationDate: string;
    taxRate: string;
    notes: string;
    lineItems: CreateQuoteLineItemRequest[];
  }>({
    customerId: '',
    quoteDate: new Date().toISOString().split('T')[0],
    expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    taxRate: '0',
    notes: '',
    lineItems: [{ description: '', quantity: 1, unitPrice: 0 }],
  });

  const [newStatus, setNewStatus] = useState<QuoteStatus>(QuoteStatus.DRAFT);
  const [submitting, setSubmitting] = useState(false);

  const { data: quotes = [], isLoading: quotesLoading } = useQuery({
    queryKey: ['quotes'],
    queryFn: () => quotesApi.getAll(),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['quote-form-customers'],
    queryFn: async () => {
      const page = await customerApi.getAllPaginated({ size: 200, status: ['ACTIVE'] });
      return page.content;
    },
  });

  const createMutation = useMutation({
    mutationFn: (request: CreateQuoteRequest) => quotesApi.create(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      setIsCreateOpen(false);
      resetForm();
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: QuoteStatus }) =>
      quotesApi.updateStatus(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      setIsStatusOpen(false);
      setSelectedQuote(null);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.customerId) {
      alert(t('quotes.form.customer') + ' is required');
      return;
    }

    if (formData.lineItems.length === 0 || !formData.lineItems.every(item => item.description && item.quantity > 0)) {
      alert('Please add at least one complete line item');
      return;
    }

    try {
      setSubmitting(true);
      const request: CreateQuoteRequest = {
        customerId: formData.customerId,
        quoteDate: new Date(formData.quoteDate).toISOString(),
        expirationDate: new Date(formData.expirationDate).toISOString(),
        taxRate: parseFloat(formData.taxRate),
        notes: formData.notes || undefined,
        lineItems: formData.lineItems,
      };
      await createMutation.mutateAsync(request);
    } catch (error: unknown) {
      console.error('Error creating quote:', error);
      const message = error && typeof error === 'object' && 'response' in error &&
        error.response && typeof error.response === 'object' && 'data' in error.response &&
        error.response.data && typeof error.response.data === 'object' && 'message' in error.response.data
        ? String(error.response.data.message)
        : t('common.form.errorCreate', { entity: getName('quote') });
      alert(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!selectedQuote) return;

    try {
      setSubmitting(true);
      await updateStatusMutation.mutateAsync({ id: selectedQuote.id, status: newStatus });
    } catch (error: unknown) {
      console.error('Error updating status:', error);
      const message = error && typeof error === 'object' && 'response' in error &&
        error.response && typeof error.response === 'object' && 'data' in error.response &&
        error.response.data && typeof error.response.data === 'object' && 'message' in error.response.data
        ? String(error.response.data.message)
        : 'Failed to update quote status';
      alert(message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      customerId: '',
      quoteDate: new Date().toISOString().split('T')[0],
      expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
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

  const updateLineItem = (index: number, field: keyof CreateQuoteLineItemRequest, value: string | number) => {
    const updated = [...formData.lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, lineItems: updated });
  };

  const getStatusBadge = (status: QuoteStatus) => {
    const tones: Record<QuoteStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
      [QuoteStatus.DRAFT]: 'neutral',
      [QuoteStatus.SENT]: 'info',
      [QuoteStatus.ACCEPTED]: 'success',
      [QuoteStatus.DECLINED]: 'danger',
      [QuoteStatus.EXPIRED]: 'warning',
    };
    return <Pill tone={tones[status]} dot>{t(`quotes.status.${status.toLowerCase()}`)}</Pill>;
  };

  const getCustomerName = (customerId: string) => {
    if (!Array.isArray(customers)) return customerId;
    const customer = customers.find(c => c.id === customerId);
    return customer?.name || customerId;
  };

  const filteredQuotes = Array.isArray(quotes) ? quotes.filter(quote =>
    quote.quoteNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    getCustomerName(quote.customerId).toLowerCase().includes(searchTerm.toLowerCase())
  ) : [];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const quoteCount = Array.isArray(quotes) ? quotes.length : 0;
  const quoteNoun = (n: number) =>
    n === 1 ? getName('quote').toLowerCase() : getName('quote', true).toLowerCase();
  const quoteSubtitle = quoteCount > 0
    ? (filteredQuotes.length === quoteCount
        ? `${quoteCount.toLocaleString()} ${quoteNoun(quoteCount)}`
        : t('common.pagination.showing', {
            start: filteredQuotes.length > 0 ? 1 : 0,
            end: filteredQuotes.length,
            total: quoteCount.toLocaleString(),
          }))
    : t('quotes.description');

  return (
    <AppLayout>
      <div>
        <PageHead
          title={getName('quote', true)}
          sub={quoteSubtitle}
          actions={
            <Button color="accent" onClick={() => setIsCreateOpen(true)}>
              {t('common.actions.create', { entity: getName('quote') })}
            </Button>
          }
        />

        <ListToolbar
          search={
            <ListSearch
              placeholder={t('quotes.search.placeholder', {
                entity: getName('quote'),
                customer: getName('customer'),
              })}
              value={searchTerm}
              onChange={setSearchTerm}
            />
          }
        />

        {quotesLoading ? (
          <Card>
            <CardBody flush>
              <LoadingState label={t('common.actions.loading', { entities: getName('quote', true) })} />
            </CardBody>
          </Card>
        ) : filteredQuotes.length === 0 ? (
          <Card>
            <CardBody>
              <p className="text-[12.5px] text-fg-muted">
                {searchTerm ? t('common.actions.noMatchSearch', { entities: getName('quote', true) }) : t('common.actions.notFound', { entities: getName('quote', true) })}
              </p>
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardBody flush>
              <DenseTable>
                <DenseTHead>
                  <tr>
                    <th>{t('quotes.table.quoteNumber')}</th>
                    <th>{t('quotes.table.customer')}</th>
                    <th>{t('quotes.table.quoteDate')}</th>
                    <th>{t('quotes.table.expirationDate')}</th>
                    <th className="right">{t('quotes.table.totalAmount')}</th>
                    <th>{t('quotes.table.status')}</th>
                    <th></th>
                  </tr>
                </DenseTHead>
                <tbody>
                  {filteredQuotes.map((quote) => (
                    <DenseRow key={quote.id}>
                      <td><span className="id-mono text-fg-strong">{quote.quoteNumber}</span></td>
                      <td className="strong" data-label={t('quotes.table.customer')}>{getCustomerName(quote.customerId)}</td>
                      <td data-label={t('quotes.table.quoteDate')}>{formatDate(quote.quoteDate)}</td>
                      <td data-label={t('quotes.table.expirationDate')}>{formatDate(quote.expirationDate)}</td>
                      <td className="right num strong" data-label={t('quotes.table.totalAmount')}>{formatCurrency(quote.totalAmount)}</td>
                      <td>{getStatusBadge(quote.status)}</td>
                      <td>
                        <Button
                          plain
                          onClick={() => {
                            setSelectedQuote(quote);
                            setNewStatus(quote.status);
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
                left={t('common.pagination.showing', {
                  start: filteredQuotes.length > 0 ? 1 : 0,
                  end: filteredQuotes.length,
                  total: quoteCount.toLocaleString(),
                })}
              />
            </CardBody>
          </Card>
        )}
      </div>

      {/* Create Quote Dialog */}
      <Dialog open={isCreateOpen} onClose={setIsCreateOpen}>
        <DialogTitle>{t('common.actions.create', { entity: getName('quote') })}</DialogTitle>
        <DialogDescription>{t('common.form.descriptionCreate', { entity: getName('quote') })}</DialogDescription>
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <div className="space-y-4">
              <Field>
                <Label>{t('quotes.form.customer')}</Label>
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

              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <Label>{t('quotes.form.quoteDate')}</Label>
                  <Input
                    type="date"
                    value={formData.quoteDate}
                    onChange={(e) => setFormData({ ...formData, quoteDate: e.target.value })}
                    required
                  />
                </Field>

                <Field>
                  <Label>{t('quotes.form.expirationDate')}</Label>
                  <Input
                    type="date"
                    value={formData.expirationDate}
                    onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })}
                    required
                  />
                </Field>
              </div>

              <Field>
                <Label>{t('quotes.form.taxRate')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.taxRate}
                  onChange={(e) => setFormData({ ...formData, taxRate: e.target.value })}
                />
              </Field>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>{t('quotes.form.lineItems')}</Label>
                  <Button type="button" plain onClick={addLineItem}>
                    {t('quotes.form.addLineItem')}
                  </Button>
                </div>
                {formData.lineItems.map((item, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <Input
                      placeholder={t('quotes.form.description')}
                      value={item.description}
                      onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                      required
                    />
                    <Input
                      type="number"
                      placeholder={t('quotes.form.quantity')}
                      value={item.quantity}
                      onChange={(e) => updateLineItem(index, 'quantity', parseFloat(e.target.value))}
                      className="w-24"
                      required
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={t('quotes.form.unitPrice')}
                      value={item.unitPrice}
                      onChange={(e) => updateLineItem(index, 'unitPrice', parseFloat(e.target.value))}
                      className="w-32"
                      required
                    />
                    {formData.lineItems.length > 1 && (
                      <Button type="button" plain onClick={() => removeLineItem(index)}>
                        {t('quotes.form.removeLineItem')}
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
        <DialogTitle>{t('common.actions.edit', { entity: getName('quote') })}</DialogTitle>
        <DialogDescription>{t('common.updateStatus', { entity: getName('quote') })}</DialogDescription>
        <DialogBody>
          <Field>
            <Label>{t('common.form.status')}</Label>
            <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value as QuoteStatus)}>
              {Object.values(QuoteStatus).map((status) => (
                <option key={status} value={status}>
                  {t(`quotes.status.${status.toLowerCase()}`)}
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
