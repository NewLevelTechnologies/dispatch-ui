/* eslint-disable i18next/no-literal-string -- dense v1.5 visual form; entity names + field labels go through getName()/t(common.form.*), but inline glyphs, separators, and short operational labels are kept as literals to keep the form markup readable (same convention as CustomerFormPage / AddLocationPage). */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { PatternFormat } from 'react-number-format';
import {
  customerApi,
  contactApi,
  type CreateCustomerRequest,
  type CustomerSearchResult,
  type InvoiceDeliveryMethod,
} from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { useHasCapability } from '../hooks/useCurrentUser';
import { showError, showSuccess, extractApiError } from '../lib/toast';
import AppLayout from '../components/AppLayout';
import { Card } from '../components/catalyst/card';
import { Button } from '../components/catalyst/button';
import { Field, Label } from '../components/catalyst/fieldset';
import { Input } from '../components/catalyst/input';
import { Select } from '../components/catalyst/select';
import { Textarea } from '../components/catalyst/textarea';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { Callout } from '../components/ui/Callout';
import { CustomerResultRow } from '../components/CustomerResultRow';
import AccountManagerPicker, { type AccountManagerValue } from '../components/AccountManagerPicker';
import { US_STATES } from '../constants/states';

// Add Payer — creates a BILLING_ONLY customer with NO service location (a
// warranty co / insurer / property manager that pays invoices but has no site).
// Sibling of CustomerFormPage (same shell), differing where a payer differs:
//   • Name is the ONLY required field; everything else is optional.
//   • Remit-to is the only address and is OPTIONAL (EDI-only payers have none) —
//     plain fields, no USPS verify (it's not a service address).
//   • "Type" (subtype) is NOT collected here — it's tags, set on the detail page.
//   • AP + escalation contacts post-create via the contact API (role marks them
//     apart); invoice delivery + account manager + billing notes on the customer.
//   • Duplicate guard hits the payer-scoped name search (no address matching).
// Contract: dispatch-api/handoff/FE_HANDOFF_add_payer.md. Edit is deferred.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RemitAddr {
  street: string;
  city: string;
  state: string;
  zip: string;
}

interface PayerForm {
  name: string;
  paymentTermsDays: number;
  apName: string;
  apRole: string;
  apEmail: string;
  apPhone: string;
  remit: RemitAddr;
  invoiceDeliveryMethod: InvoiceDeliveryMethod;
  accountManager: AccountManagerValue | null;
  escName: string;
  escEmail: string;
  notes: string;
}

// Payment terms map to a number of days on the wire (0 = due on receipt).
const TERMS_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Due on receipt' },
  { value: 15, label: 'Net 15' },
  { value: 30, label: 'Net 30' },
  { value: 45, label: 'Net 45' },
  { value: 60, label: 'Net 60' },
];

const DELIVERY_OPTIONS: { value: InvoiceDeliveryMethod; label: string }[] = [
  { value: 'EMAIL', label: 'Email' },
  { value: 'EDI', label: 'EDI portal' },
  { value: 'MAIL', label: 'Mail' },
];

export default function PayerFormPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const canAdd = useHasCapability('ADD_CUSTOMERS');

  const [form, setForm] = useState<PayerForm>({
    name: '',
    paymentTermsDays: 30,
    apName: '',
    apRole: 'Accounts Payable',
    apEmail: '',
    apPhone: '',
    remit: { street: '', city: '', state: '', zip: '' },
    invoiceDeliveryMethod: 'EMAIL',
    accountManager: null,
    escName: '',
    escEmail: '',
    notes: '',
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [dupDismissed, setDupDismissed] = useState(false);

  const set = (patch: Partial<PayerForm>) => setForm((f) => ({ ...f, ...patch }));
  const setRemit = (patch: Partial<RemitAddr>) => setForm((f) => ({ ...f, remit: { ...f.remit, ...patch } }));
  const mark = (key: string) => setTouched((s) => ({ ...s, [key]: true }));

  // Duplicate guard — debounce the name, then hit the payer-scoped name search.
  // Name only; quiet when nothing overlaps; dismissible.
  const [dupQuery, setDupQuery] = useState('');
  useEffect(() => {
    const term = form.name.trim();
    const id = setTimeout(() => setDupQuery(term), 250);
    return () => clearTimeout(id);
  }, [form.name]);
  const { data: dupData } = useQuery({
    queryKey: ['payers', 'dup-search', dupQuery],
    queryFn: () => customerApi.searchPayers(dupQuery),
    enabled: !dupDismissed && dupQuery.length >= 2,
  });
  const dupes: CustomerSearchResult[] = dupDismissed ? [] : (dupData?.content ?? []);

  // Name is the only required field. Email fields validated only when filled.
  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = 'Required';
  if (form.apEmail.trim() && !EMAIL_RE.test(form.apEmail.trim())) errors.apEmail = t('common.form.invalidEmail');
  if (form.escEmail.trim() && !EMAIL_RE.test(form.escEmail.trim())) errors.escEmail = t('common.form.invalidEmail');
  const hasErrors = Object.keys(errors).length > 0;

  const createMutation = useMutation({
    mutationFn: async () => {
      const request: CreateCustomerRequest = {
        name: form.name.trim(),
        type: 'BILLING_ONLY',
        serviceLocations: [],
        paymentTermsDays: form.paymentTermsDays,
        invoiceDeliveryMethod: form.invoiceDeliveryMethod,
        accountManagerUserId: form.accountManager?.id ?? null,
        notes: form.notes.trim() || null,
      };
      // Remit-to is the only address and is optional — omit entirely if blank.
      const r = form.remit;
      if (r.street.trim() || r.city.trim() || r.state.trim() || r.zip.trim()) {
        request.billingAddress = {
          streetAddress: r.street.trim(),
          city: r.city.trim(),
          state: r.state,
          zipCode: r.zip.trim(),
        };
      }
      const created = await customerApi.create(request);

      // AP + escalation are optional customer-level contacts created after the
      // payer. A contact failure must NOT lose the created payer — catch and
      // surface; the contact can be re-added from the detail page.
      const apName = form.apName.trim();
      const escName = form.escName.trim();
      if (apName || escName) {
        try {
          if (apName) {
            await contactApi.createCustomerContact(created.id, {
              name: apName,
              role: form.apRole.trim() || 'Accounts Payable',
              email: form.apEmail.trim() || null,
              phone: form.apPhone.trim() || null,
            });
          }
          if (escName) {
            await contactApi.createCustomerContact(created.id, {
              name: escName,
              role: 'Escalation',
              email: form.escEmail.trim() || null,
            });
          }
        } catch (err) {
          showError(
            `${getName('payer')} created, but a contact couldn’t be saved — add it from the ${getName('payer').toLowerCase()}’s page.`,
            extractApiError(err) ?? undefined
          );
        }
      }
      return created;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      showSuccess(t('common.form.successCreate', { entity: getName('payer'), defaultValue: `${getName('payer')} created` }));
      navigate(`/customers/${created.id}`);
    },
    onError: (err: unknown) =>
      showError(t('common.form.errorCreate', { entity: getName('payer') }), extractApiError(err) ?? undefined),
  });

  const submitting = createMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, apEmail: true, escEmail: true });
    if (hasErrors) return;
    createMutation.mutate();
  };

  if (!canAdd) {
    return (
      <AppLayout>
        <div className="p-8">
          <Callout kind="warning">
            {t('common.noPermission', { defaultValue: 'You don’t have permission to do that.' })}
          </Callout>
          <Button className="mt-4" onClick={() => navigate('/payers')}>
            {t('common.actions.backTo', { entities: getName('payer', true) })}
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="px-1 py-1">
        <div className="mx-auto max-w-[680px]">
          <Link
            to="/payers"
            className="mb-2.5 inline-flex items-center gap-1 text-[11.5px] text-fg-muted hover:text-fg-strong"
          >
            ← {getName('payer', true)}
          </Link>

          <div className="mb-4">
            <Heading level={1} size="page-md" className="m-0">
              {t('common.actions.add', { entity: getName('payer') })}
            </Heading>
            <Text size="sm" tone="muted" className="mt-1">
              A billing-only account — a warranty company, insurer, or property manager that pays invoices but has no
              service locations. Only a name is required.
            </Text>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Payer — name + terms. No type (tags, on the detail page) and no
                customer-level email/phone (the AP contact carries those). */}
            <Card title={getName('payer')} className="mb-3.5">
              <Field size="xs">
                <Label size="xs" required>
                  {t('common.form.name')}
                </Label>
                <Input
                  size="xs"
                  value={form.name}
                  onChange={(e) => set({ name: e.target.value })}
                  onBlur={() => mark('name')}
                  invalid={!!(touched.name && errors.name)}
                  placeholder="American Home Shield"
                />
                {touched.name && errors.name && (
                  <Text size="xs" className="mt-1 text-danger-500">
                    {errors.name}
                  </Text>
                )}
              </Field>
              <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Field size="xs">
                  <Label size="xs">Payment terms</Label>
                  <Select
                    value={String(form.paymentTermsDays)}
                    onChange={(e) => set({ paymentTermsDays: Number(e.target.value) })}
                  >
                    {TERMS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </Card>

            {/* Duplicate guard — name-only match (payers share no address space). */}
            {dupes.length > 0 && (
              <Callout
                kind="warning"
                className="mb-3.5"
                title={
                  dupes.length === 1
                    ? `A matching ${getName('payer').toLowerCase()} already exists`
                    : `${dupes.length} matching ${getName('payer', true).toLowerCase()} already exist`
                }
                action={
                  <Button plain size="xs" onClick={() => setDupDismissed(true)}>
                    Not a duplicate
                  </Button>
                }
              >
                <div className="mt-1 flex flex-col gap-1.5">
                  {dupes.map((d) => (
                    <div key={d.id} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <CustomerResultRow name={d.name} customerNumber={d.customerNumber} isPayer />
                      </div>
                      <Button plain size="xs" onClick={() => navigate(`/customers/${d.id}`)}>
                        Use existing →
                      </Button>
                    </div>
                  ))}
                </div>
              </Callout>
            )}

            {/* AP contact — optional; created post-create as a customer contact. */}
            <Card
              title="Accounts-payable contact"
              subtitle="Who to reach about invoices and payment. Optional — add later if unknown."
              className="mb-3.5"
            >
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Field size="xs">
                  <Label size="xs">{t('common.form.name')}</Label>
                  <Input
                    size="xs"
                    value={form.apName}
                    onChange={(e) => set({ apName: e.target.value })}
                    placeholder="Linda Chen"
                  />
                </Field>
                <Field size="xs">
                  <Label size="xs">{t('common.form.role')}</Label>
                  <Input
                    size="xs"
                    value={form.apRole}
                    onChange={(e) => set({ apRole: e.target.value })}
                    placeholder="Accounts Payable"
                  />
                </Field>
              </div>
              <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Field size="xs">
                  <Label size="xs">{t('common.form.email')}</Label>
                  <Input
                    size="xs"
                    type="email"
                    value={form.apEmail}
                    onChange={(e) => set({ apEmail: e.target.value })}
                    onBlur={() => mark('apEmail')}
                    invalid={!!(touched.apEmail && errors.apEmail)}
                    placeholder="claims-ap@payer.com"
                  />
                  {touched.apEmail && errors.apEmail && (
                    <Text size="xs" className="mt-1 text-danger-500">
                      {errors.apEmail}
                    </Text>
                  )}
                </Field>
                <Field size="xs">
                  <Label size="xs">{t('common.form.officePhone')}</Label>
                  <PatternFormat
                    format="(###) ###-####"
                    mask="_"
                    customInput={Input}
                    size="xs"
                    type="tel"
                    value={form.apPhone}
                    onValueChange={(values) => set({ apPhone: values.value })}
                    placeholder="(901) 555-0144"
                  />
                </Field>
              </div>
            </Card>

            {/* Remit-to address — optional, plain fields (not a service address,
                so no USPS verify). Omitted from the payload entirely if blank. */}
            <Card
              title="Remit-to address"
              subtitle="Where mailed payments / statements go. Optional — many payers are EDI-only."
              className="mb-3.5"
            >
              <Field size="xs">
                <Label size="xs">{t('common.form.streetAddress')}</Label>
                <Input
                  size="xs"
                  value={form.remit.street}
                  onChange={(e) => setRemit({ street: e.target.value })}
                  placeholder="889 Ridge Lake Blvd"
                />
              </Field>
              <div className="mt-2.5 grid grid-cols-12 gap-2">
                <Field size="xs" className="col-span-6">
                  <Label size="xs">{t('common.form.city')}</Label>
                  <Input size="xs" value={form.remit.city} onChange={(e) => setRemit({ city: e.target.value })} placeholder="Memphis" />
                </Field>
                <Field size="xs" className="col-span-2">
                  <Label size="xs">{t('common.form.state')}</Label>
                  <Select value={form.remit.state} onChange={(e) => setRemit({ state: e.target.value })}>
                    <option value="">{t('common.form.select')}</option>
                    {US_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field size="xs" className="col-span-4">
                  <Label size="xs">{t('common.form.zipCode')}</Label>
                  <Input
                    size="xs"
                    value={form.remit.zip}
                    onChange={(e) => setRemit({ zip: e.target.value })}
                    inputMode="numeric"
                    placeholder="38120"
                  />
                </Field>
              </div>
            </Card>

            {/* Advanced — invoice delivery, account manager, escalation, notes. */}
            <Card padding="none" className="mb-3.5">
              <button
                type="button"
                onClick={() => setAdvancedOpen((o) => !o)}
                className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
              >
                <span className="text-[13px] font-semibold text-fg-strong">Advanced</span>
                <span className="text-[11px] text-fg-muted">· invoice delivery, account manager, escalation — optional</span>
                <span className="flex-1" />
                <ChevronRightIcon className={`size-4 text-fg-dim transition-transform ${advancedOpen ? 'rotate-90' : ''}`} />
              </button>
              {advancedOpen && (
                <div className="border-t border-border-soft p-3.5">
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <Field size="xs">
                      <Label size="xs">Invoice delivery</Label>
                      <Select
                        value={form.invoiceDeliveryMethod}
                        onChange={(e) => set({ invoiceDeliveryMethod: e.target.value as InvoiceDeliveryMethod })}
                      >
                        {DELIVERY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field size="xs">
                      <Label size="xs">Account manager</Label>
                      <AccountManagerPicker
                        value={form.accountManager}
                        onChange={(u) => set({ accountManager: u })}
                      />
                    </Field>
                  </div>
                  <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <Field size="xs">
                      <Label size="xs">Escalation contact</Label>
                      <Input
                        size="xs"
                        value={form.escName}
                        onChange={(e) => set({ escName: e.target.value })}
                        placeholder="R. Pratt · Network Mgr"
                      />
                    </Field>
                    <Field size="xs">
                      <Label size="xs">Escalation email</Label>
                      <Input
                        size="xs"
                        type="email"
                        value={form.escEmail}
                        onChange={(e) => set({ escEmail: e.target.value })}
                        onBlur={() => mark('escEmail')}
                        invalid={!!(touched.escEmail && errors.escEmail)}
                        placeholder="escalations@payer.com"
                      />
                      {touched.escEmail && errors.escEmail && (
                        <Text size="xs" className="mt-1 text-danger-500">
                          {errors.escEmail}
                        </Text>
                      )}
                    </Field>
                  </div>
                  <div className="mt-2.5">
                    <Field size="xs">
                      <Label size="xs">Billing notes</Label>
                      <Textarea
                        rows={2}
                        value={form.notes}
                        onChange={(e) => set({ notes: e.target.value })}
                        placeholder="e.g. Pre-approval auth # required before work; per-claim cap $480"
                      />
                    </Field>
                  </div>
                </div>
              )}
            </Card>

            {/* Footer */}
            <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-bg-elev px-3.5 py-3 shadow-sm">
              <div className="text-[11.5px] text-fg-muted max-sm:basis-full">
                Creates a billing-only account — no service location.
              </div>
              <span className="flex-1" />
              <Button href="/payers" plain size="xs">
                {t('common.cancel')}
              </Button>
              <Button type="submit" color="accent" size="xs" disabled={submitting}>
                {submitting ? t('common.saving') : t('common.actions.add', { entity: getName('payer') })}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
