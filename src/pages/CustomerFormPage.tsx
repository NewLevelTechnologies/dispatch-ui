/* eslint-disable i18next/no-literal-string -- dense v1.5 visual form; entity names + major strings go through getName()/t(), but inline glyphs, separators, and short operational labels are kept as literals to keep the form markup readable (same convention as UserFormPage / AddLocationPage). */
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BuildingOffice2Icon, HomeIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { PatternFormat } from 'react-number-format';
import {
  customerApi,
  dispatchRegionApi,
  tenantSettingsApi,
  type PremiseType,
  type CreateCustomerRequest,
  type CustomerSearchResult,
  type AddressVerifyRequest,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { useHasCapability } from '../hooks/useCurrentUser';
import { showError, showSuccess, extractApiError } from '../lib/toast';
import AppLayout from '../components/AppLayout';
import { Card } from '../components/catalyst/card';
import { Button } from '../components/catalyst/button';
import { Checkbox } from '../components/catalyst/checkbox';
import { Field, Label } from '../components/catalyst/fieldset';
import { Input } from '../components/catalyst/input';
import { Select } from '../components/catalyst/select';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { Callout } from '../components/ui/Callout';
import AccountManagerPicker, { type AccountManagerValue } from '../components/AccountManagerPicker';
import { ToggleGroup, ToggleGroupOption } from '../components/ui/ToggleGroup';
import { US_STATES } from '../constants/states';
import { AddressSuggestion } from '../components/AddressSuggestion';
import { CustomerResultRow } from '../components/CustomerResultRow';
import { useAddressVerify } from '../hooks/useAddressVerify';

// Add Customer — creates a Customer + its FIRST service location atomically
// (one POST /customers with a nested serviceLocations[0]). The user never sees
// the two-record mechanic; CustomerShape (SINGLE/MULTI/BILLING_ONLY) is derived
// server-side, never chosen here.
//
// Design source: claude_designs/customer-add-edit.md + screen-add-customer.jsx.
// Real wiring departs from the mock in a few deliberate, backend-gated places:
//   • USPS street autocomplete + "✓ verified" is deferred — no address
//     provider is wired yet (a provider is being selected). Address fields are
//     plain inputs; the address-block is the seam where suggestion lands.
//   • Email is REQUIRED: the create contract types it `email: string`
//     (non-nullable) and the legacy dialog requires it. The mock's "optional"
//     email contradicts the live backend, so we require it here.
//   • The mock's payment-terms enum (NET_30…) maps to the real numeric
//     `paymentTermsDays` (0 = due on receipt).
//   • Duplicate guard calls the real /customers/search (name only — that's all
//     the search response carries), not the mock's hardcoded address scoring.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Addr {
  street: string;
  line2: string;
  city: string;
  state: string;
  zip: string;
}

const EMPTY_ADDR: Addr = { street: '', line2: '', city: '', state: '', zip: '' };

interface FormShape {
  name: string;
  phone: string;
  email: string;
  service: Addr;
  premise: PremiseType;
  dispatchRegionId: string;
  sameBilling: boolean;
  billing: Addr;
  paymentTermsDays: number;
  taxExempt: boolean;
  taxCert: string;
  accountManager: AccountManagerValue | null;
}

// Payment terms map to a number of days on the wire (paymentTermsDays);
// 0 = due on receipt.
const TERMS_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Due on receipt' },
  { value: 15, label: 'Net 15' },
  { value: 30, label: 'Net 30' },
  { value: 60, label: 'Net 60' },
];

const toVerifyReq = (a: Addr): AddressVerifyRequest => ({
  streetAddress: a.street,
  streetAddressLine2: a.line2 || null,
  city: a.city,
  state: a.state,
  zipCode: a.zip,
});

const toApiAddress = (a: Addr) => ({
  streetAddress: a.street.trim(),
  streetAddressLine2: a.line2.trim() || null,
  city: a.city.trim(),
  state: a.state,
  zipCode: a.zip.trim(),
});

export default function CustomerFormPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const canAdd = useHasCapability('ADD_CUSTOMERS');

  // Seeds the premise default + the "set in Company profile" hint.
  const { data: tenantSettings } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.getSettings(),
  });
  const defaultPremise: PremiseType = tenantSettings?.defaultPremiseType ?? 'BUSINESS';

  const { data: defaultRegion } = useQuery({
    queryKey: ['dispatch-regions', 'default'],
    queryFn: () => dispatchRegionApi.getDefault(),
  });
  const { data: activeRegions } = useQuery({
    queryKey: ['dispatch-regions', 'active'],
    queryFn: () => dispatchRegionApi.getAll(false),
  });
  const hasRegions = !!activeRegions && activeRegions.length > 0;

  const [form, setForm] = useState<FormShape>({
    name: '',
    phone: '',
    email: '',
    service: { ...EMPTY_ADDR },
    premise: defaultPremise,
    dispatchRegionId: '',
    sameBilling: true,
    billing: { ...EMPTY_ADDR },
    paymentTermsDays: 30,
    taxExempt: false,
    taxCert: '',
    accountManager: null,
  });
  // Track whether the user has touched premise/region so async defaults can
  // seed them without clobbering a deliberate choice.
  const [premiseTouched, setPremiseTouched] = useState(false);
  const [regionTouched, setRegionTouched] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [dupDismissed, setDupDismissed] = useState(false);

  const set = (patch: Partial<FormShape>) => setForm((f) => ({ ...f, ...patch }));
  const mark = (key: string) => setTouched((s) => ({ ...s, [key]: true }));

  const effectivePremise = premiseTouched ? form.premise : defaultPremise;
  const effectiveRegionId = regionTouched ? form.dispatchRegionId : (defaultRegion?.id ?? '');

  // Duplicate guard — debounce the name, then hit the real picker search.
  // Quiet when nothing overlaps; dismissible. The search response carries only
  // id/number/name/type, so that's all we can honestly surface.
  const [dupQuery, setDupQuery] = useState('');
  useEffect(() => {
    const term = form.name.trim();
    const id = setTimeout(() => setDupQuery(term), 250);
    return () => clearTimeout(id);
  }, [form.name]);
  const { data: dupData } = useQuery({
    queryKey: ['customers', 'dup-search', dupQuery],
    queryFn: () => customerApi.search({ q: dupQuery, size: 5 }),
    enabled: !dupDismissed && dupQuery.length >= 2,
  });
  const dupes: CustomerSearchResult[] = dupDismissed ? [] : (dupData?.content ?? []);

  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = 'Required';
  if (!form.phone.trim()) errors.phone = 'Required';
  if (!form.email.trim()) errors.email = 'Required';
  else if (!EMAIL_RE.test(form.email.trim())) errors.email = t('common.form.invalidEmail');
  if (!form.service.street.trim()) errors['service.street'] = 'Required';
  if (!form.service.city.trim()) errors['service.city'] = 'Required';
  if (!form.service.state.trim()) errors['service.state'] = 'Required';
  if (!form.service.zip.trim()) errors['service.zip'] = 'Required';
  if (hasRegions && !effectiveRegionId) errors.dispatchRegionId = 'Required';
  if (!form.sameBilling) {
    if (!form.billing.street.trim()) errors['billing.street'] = 'Required';
    if (!form.billing.city.trim()) errors['billing.city'] = 'Required';
    if (!form.billing.state.trim()) errors['billing.state'] = 'Required';
    if (!form.billing.zip.trim()) errors['billing.zip'] = 'Required';
  }
  const hasErrors = Object.keys(errors).length > 0;

  const serviceAv = useAddressVerify();
  const billingAv = useAddressVerify();

  const createMutation = useMutation({
    mutationFn: () => {
      // Attach the geocoded coords (if the address still matches what was
      // verified) so the map pin + timezone land immediately.
      const serviceAddress = {
        ...toApiAddress(form.service),
        ...(serviceAv.coordsFor(toVerifyReq(form.service)) ?? {}),
      };
      const billingAddress = form.sameBilling
        ? serviceAddress
        : { ...toApiAddress(form.billing), ...(billingAv.coordsFor(toVerifyReq(form.billing)) ?? {}) };
      const request: CreateCustomerRequest = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        billingAddress,
        billingAddressSameAsService: form.sameBilling,
        serviceLocations: [
          {
            dispatchRegionId: effectiveRegionId,
            // The first location has no name field on this fast-intake form;
            // seed it from the customer name so the site isn't unlabeled.
            locationName: form.name.trim(),
            premiseType: effectivePremise,
            address: serviceAddress,
          },
        ],
        paymentTermsDays: form.paymentTermsDays,
        taxExempt: form.taxExempt,
        taxExemptCertificate: form.taxExempt ? form.taxCert.trim() || null : null,
        accountManagerUserId: form.accountManager?.id ?? null,
      };
      return customerApi.create(request);
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      showSuccess(
        t('common.form.successCreate', { entity: getName('customer'), defaultValue: 'Customer created' })
      );
      navigate(`/customers/${created.id}`);
    },
    onError: (err: unknown) =>
      showError(t('common.form.errorCreate', { entity: getName('customer') }), extractApiError(err) ?? undefined),
  });

  const submitting = createMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({
      name: true,
      phone: true,
      email: true,
      'service.street': true,
      'service.city': true,
      'service.state': true,
      'service.zip': true,
      dispatchRegionId: true,
      'billing.street': true,
      'billing.city': true,
      'billing.state': true,
      'billing.zip': true,
    });
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
          <Button className="mt-4" onClick={() => navigate('/customers')}>
            {t('common.actions.backTo', { entities: getName('customer', true) })}
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
            to="/customers"
            className="mb-2.5 inline-flex items-center gap-1 text-[11.5px] text-fg-muted hover:text-fg-strong"
          >
            ← {getName('customer', true)}
          </Link>

          <div className="mb-4">
            <Heading level={1} size="page-md" className="m-0">
              {t('common.actions.add', { entity: getName('customer') })}
            </Heading>
            <Text size="sm" tone="muted" className="mt-1">
              Required: name, phone, email, and service address. Everything else can be added later from the{' '}
              {getName('customer').toLowerCase()}’s page.
            </Text>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Customer — name, phone, email */}
            <Card title={getName('customer')} className="mb-3.5">
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
                  placeholder="Maria Sanchez — or Iverson Properties LLC"
                />
                {touched.name && errors.name && (
                  <Text size="xs" className="mt-1 text-danger-500">
                    {errors.name}
                  </Text>
                )}
              </Field>
              <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Field size="xs">
                  <Label size="xs" required>
                    {t('common.form.phone')}
                  </Label>
                  <PatternFormat
                    format="(###) ###-####"
                    mask="_"
                    customInput={Input}
                    size="xs"
                    type="tel"
                    value={form.phone}
                    onValueChange={(values) => set({ phone: values.value })}
                    placeholder="(602) 555-0100"
                  />
                  {touched.phone && errors.phone && (
                    <Text size="xs" className="mt-1 text-danger-500">
                      {errors.phone}
                    </Text>
                  )}
                </Field>
                <Field size="xs">
                  <Label size="xs" required>
                    {t('common.form.email')}
                  </Label>
                  <Input
                    size="xs"
                    type="email"
                    value={form.email}
                    onChange={(e) => set({ email: e.target.value })}
                    onBlur={() => mark('email')}
                    invalid={!!(touched.email && errors.email)}
                    placeholder="maria@example.com"
                  />
                  {touched.email && errors.email && (
                    <Text size="xs" className="mt-1 text-danger-500">
                      {errors.email}
                    </Text>
                  )}
                </Field>
              </div>
            </Card>

            {/* Duplicate guard — surfaces likely existing matches as the name
                is typed. Quiet when nothing overlaps; always dismissible. */}
            {dupes.length > 0 && (
              <Callout
                kind="warning"
                className="mb-3.5"
                title={
                  dupes.length === 1
                    ? `A matching ${getName('customer').toLowerCase()} already exists`
                    : `${dupes.length} matching ${getName('customer', true).toLowerCase()} already exist`
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
                        <CustomerResultRow
                          name={d.name}
                          customerNumber={d.customerNumber}
                          isPayer={d.type === 'BILLING_ONLY'}
                        />
                      </div>
                      <Button plain size="xs" onClick={() => navigate(`/customers/${d.id}`)}>
                        Use existing →
                      </Button>
                    </div>
                  ))}
                </div>
              </Callout>
            )}

            {/* Service address — where work is performed. The address block is
                the seam where USPS suggestion/verification lands later. */}
            <Card title="Service address" subtitle="Where work will be performed." className="mb-3.5">
              <AddressBlock
                value={form.service}
                onChange={(s) => set({ service: s })}
                prefix="service"
                touched={touched}
                errors={errors}
                mark={mark}
                onBlurVerify={() => serviceAv.run(toVerifyReq(form.service))}
                trailing={
                  hasRegions ? (
                    <Field size="xs" className="col-span-4">
                      <Label size="xs" required>
                        {getName('dispatch_region')}
                      </Label>
                      <Select
                        value={effectiveRegionId}
                        onChange={(e) => {
                          setRegionTouched(true);
                          set({ dispatchRegionId: e.target.value });
                        }}
                        onBlur={() => mark('dispatchRegionId')}
                        invalid={!!(touched.dispatchRegionId && errors.dispatchRegionId)}
                      >
                        <option value="">{t('dispatchRegions.form.selectRegion')}</option>
                        {activeRegions!.map((region) => (
                          <option key={region.id} value={region.id}>
                            {region.name} ({region.abbreviation})
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : undefined
                }
              />
              <AddressSuggestion
                verify={serviceAv}
                typed={toVerifyReq(form.service)}
                onAccept={(a) =>
                  set({ service: { ...form.service, street: a.streetAddress, city: a.city, state: a.state, zip: a.zipCode } })
                }
              />
            </Card>

            {/* Premise type — qualifies the address, so it follows it. */}
            <Card
              title="Premise type"
              subtitle="What a tech is walking into. Defaulted from your company profile; change it per location anytime."
              className="mb-3.5"
            >
              <ToggleGroup
                value={effectivePremise}
                onChange={(v) => {
                  setPremiseTouched(true);
                  set({ premise: v });
                }}
                aria-label="Premise type"
              >
                <ToggleGroupOption value="RESIDENCE">
                  <span className="flex items-center gap-1.5">
                    <HomeIcon className="size-4" /> Residence
                  </span>
                </ToggleGroupOption>
                <ToggleGroupOption value="BUSINESS">
                  <span className="flex items-center gap-1.5">
                    <BuildingOffice2Icon className="size-4" /> Business
                  </span>
                </ToggleGroupOption>
              </ToggleGroup>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-fg-muted">
                <BuildingOffice2Icon className="size-3" />
                Default for new locations is{' '}
                <strong className="font-semibold text-fg">
                  {defaultPremise === 'BUSINESS' ? 'Business' : 'Residence'}
                </strong>{' '}
                · set in Company profile.
              </div>
            </Card>

            {/* Billing — sameBilling is a pure address convenience, NOT a
                customer-type signal. */}
            <Card title="Billing" subtitle="Where invoices go. Defaults to the service address." className="mb-3.5">
              <label className="flex cursor-pointer items-start gap-2.5">
                <Checkbox
                  color="accent"
                  checked={form.sameBilling}
                  onChange={(v) => set({ sameBilling: v })}
                />
                <span>
                  <span className="block text-[12.5px] font-medium text-fg-strong">
                    Billing address is the same as the service address
                  </span>
                  <span className="mt-0.5 block text-[11px] text-fg-muted">
                    Uncheck to send invoices elsewhere — corporate HQ, a property manager, etc.
                  </span>
                </span>
              </label>
              {!form.sameBilling && (
                <div className="mt-3 border-t border-dashed border-border-soft pt-3">
                  <AddressBlock
                    value={form.billing}
                    onChange={(b) => set({ billing: b })}
                    prefix="billing"
                    touched={touched}
                    errors={errors}
                    mark={mark}
                    onBlurVerify={() => billingAv.run(toVerifyReq(form.billing))}
                  />
                  <AddressSuggestion
                    verify={billingAv}
                    typed={toVerifyReq(form.billing)}
                    onAccept={(a) =>
                      set({ billing: { ...form.billing, street: a.streetAddress, city: a.city, state: a.state, zip: a.zipCode } })
                    }
                  />
                </div>
              )}
            </Card>

            {/* Advanced — optional, collapsed. CSR on a panic call ignores it;
                office staff onboarding a commercial account expands it. */}
            <Card padding="none" className="mb-3.5">
              <button
                type="button"
                onClick={() => setAdvancedOpen((o) => !o)}
                className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
              >
                <span className="text-[13px] font-semibold text-fg-strong">Advanced</span>
                <span className="text-[11px] text-fg-muted">
                  · payment terms, tax exempt, account manager — optional
                </span>
                <span className="flex-1" />
                <ChevronRightIcon
                  className={`size-4 text-fg-dim transition-transform ${advancedOpen ? 'rotate-90' : ''}`}
                />
              </button>
              {advancedOpen && (
                <div className="border-t border-border-soft p-3.5">
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
                    <Field size="xs">
                      <Label size="xs">Account manager</Label>
                      <AccountManagerPicker
                        value={form.accountManager}
                        onChange={(u) => set({ accountManager: u })}
                      />
                    </Field>
                  </div>
                  <div className="mt-2.5 grid grid-cols-1 items-end gap-2.5 sm:grid-cols-2">
                    <label className="flex h-9 cursor-pointer items-center gap-2">
                      <Checkbox
                        color="accent"
                        checked={form.taxExempt}
                        onChange={(v) => set({ taxExempt: v })}
                      />
                      <span className="text-[12.5px] text-fg-strong">Tax exempt</span>
                    </label>
                    {form.taxExempt && (
                      <Field size="xs">
                        <Label size="xs">Exemption certificate #</Label>
                        <Input
                          size="xs"
                          value={form.taxCert}
                          onChange={(e) => set({ taxCert: e.target.value })}
                          placeholder="84-2200"
                        />
                      </Field>
                    )}
                  </div>
                </div>
              )}
            </Card>

            {/* Footer */}
            <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-bg-elev px-3.5 py-3 shadow-sm">
              <div className="text-[11.5px] text-fg-muted max-sm:basis-full">
                Creates the {getName('customer').toLowerCase()} and their first{' '}
                {getName('service_location').toLowerCase()} together.
              </div>
              <span className="flex-1" />
              <Button href="/customers" plain size="xs">
                {t('common.cancel')}
              </Button>
              <Button type="submit" color="accent" size="xs" disabled={submitting}>
                {submitting ? t('common.saving') : t('common.actions.add', { entity: getName('customer') })}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}

// ──────────────────────────────────────────────────────────────────
// AddressBlock — inline address grid at the dense form size used across
// the redesigned forms (matches AddLocationPage — deliberately NOT the
// default-size shared AddressFields). `trailing` renders an extra field
// (the dispatch region) in the city/state/zip row so the service block
// stays one card without an extra row.
// ──────────────────────────────────────────────────────────────────
function AddressBlock({
  value,
  onChange,
  prefix,
  required = true,
  touched,
  errors,
  mark,
  trailing,
  onBlurVerify,
}: {
  value: Addr;
  onChange: (next: Addr) => void;
  prefix: string;
  required?: boolean;
  touched: Record<string, boolean>;
  errors: Record<string, string>;
  mark: (key: string) => void;
  trailing?: ReactNode;
  onBlurVerify?: () => void;
}) {
  const { t } = useTranslation();
  const setField = (k: keyof Addr, v: string) => onChange({ ...value, [k]: v });
  const err = (k: string) => (touched[`${prefix}.${k}`] && errors[`${prefix}.${k}`]) || '';

  return (
    <>
      <div className="grid grid-cols-12 gap-2">
        <Field size="xs" className="col-span-8">
          <Label size="xs" required={required}>
            {t('common.form.streetAddress')}
          </Label>
          <Input
            size="xs"
            value={value.street}
            onChange={(e) => setField('street', e.target.value)}
            onBlur={() => { mark(`${prefix}.street`); onBlurVerify?.(); }}
            invalid={!!err('street')}
            placeholder="1820 W McDowell Rd"
          />
          {err('street') && (
            <Text size="xs" className="mt-1 text-danger-500">
              {err('street')}
            </Text>
          )}
        </Field>
        <Field size="xs" className="col-span-4">
          <Label size="xs">{t('common.form.addressLine2')}</Label>
          <Input
            size="xs"
            value={value.line2}
            onChange={(e) => setField('line2', e.target.value)}
            placeholder="Apt / Ste"
          />
        </Field>
      </div>
      <div className="mt-2.5 grid grid-cols-12 gap-2">
        <Field size="xs" className={trailing ? 'col-span-4' : 'col-span-6'}>
          <Label size="xs" required={required}>
            {t('common.form.city')}
          </Label>
          <Input
            size="xs"
            value={value.city}
            onChange={(e) => setField('city', e.target.value)}
            onBlur={() => { mark(`${prefix}.city`); onBlurVerify?.(); }}
            invalid={!!err('city')}
            placeholder="Phoenix"
          />
          {err('city') && (
            <Text size="xs" className="mt-1 text-danger-500">
              {err('city')}
            </Text>
          )}
        </Field>
        <Field size="xs" className="col-span-2">
          <Label size="xs" required={required}>
            {t('common.form.state')}
          </Label>
          <Select
            value={value.state}
            onChange={(e) => setField('state', e.target.value)}
            onBlur={() => { mark(`${prefix}.state`); onBlurVerify?.(); }}
            invalid={!!err('state')}
          >
            <option value="">{t('common.form.select')}</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field size="xs" className={trailing ? 'col-span-2' : 'col-span-4'}>
          <Label size="xs" required={required}>
            {t('common.form.zipCode')}
          </Label>
          <Input
            size="xs"
            value={value.zip}
            onChange={(e) => setField('zip', e.target.value)}
            onBlur={() => { mark(`${prefix}.zip`); onBlurVerify?.(); }}
            invalid={!!err('zip')}
            inputMode="numeric"
            placeholder="85007"
          />
          {err('zip') && (
            <Text size="xs" className="mt-1 text-danger-500">
              {err('zip')}
            </Text>
          )}
        </Field>
        {trailing}
      </div>
    </>
  );
}
