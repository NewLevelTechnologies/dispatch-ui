/* eslint-disable i18next/no-literal-string -- dense v1.5 visual form; entity names + major strings go through getName()/t(), but inline glyphs, separators, and short operational labels are kept as literals to keep the form markup readable (same convention as UserFormPage / AddLocationPage). */
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BuildingOffice2Icon, HomeIcon, ChevronRightIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { PatternFormat } from 'react-number-format';
import {
  customerApi,
  dispatchRegionApi,
  tenantSettingsApi,
  type PremiseType,
  type CreateCustomerRequest,
  type DuplicateCandidate,
  type DuplicateMatchReason,
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
import { Badge } from '../components/catalyst/badge';
import { US_STATES } from '../constants/states';
import { AddressSuggestion } from '../components/AddressSuggestion';
import { titleCaseAddress } from '../utils/titleCaseAddress';
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
  // Who to ask for on site. Maps to the first location's siteContactName — the
  // customer entity itself has no contact-name field. For a residence the
  // household name IS the contact, so it mirrors `name` until personalized.
  contactName: string;
  phone: string;
  email: string;
  service: Addr;
  premise: PremiseType;
  dispatchRegionId: string;
  sameBilling: boolean;
  // When billing is separate, this names the account we invoice and becomes
  // customer.name — the top-of-form name then names the service location.
  billingName: string;
  // Where the invoice goes (the payer's AP channel). When billing is separate
  // the customer IS the billing party, so these become the customer's own
  // phone/email; the top/on-site contact then moves onto the location.
  billingContactPhone: string;
  billingContactEmail: string;
  billing: Addr;
  paymentTermsDays: number;
  taxExempt: boolean;
  taxCert: string;
  accountManager: AccountManagerValue | null;
}

// Premise decides what "Name" means, so the field is explained by it. Residence:
// the household ("Avila"). Business: the store/building, never the parent company
// (that distinction is the one genuinely useful thing to say here).
function nameGuidance(premise: PremiseType): { placeholder: string; hint: string | null } {
  return premise === 'RESIDENCE'
    ? { placeholder: 'Avila', hint: null }
    : { placeholder: 'Red Lobster #123', hint: 'The store or building — not the parent company.' };
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
    contactName: '',
    phone: '',
    email: '',
    service: { ...EMPTY_ADDR },
    premise: defaultPremise,
    dispatchRegionId: '',
    sameBilling: true,
    billingName: '',
    billingContactPhone: '',
    billingContactEmail: '',
    billing: { ...EMPTY_ADDR },
    paymentTermsDays: 30,
    taxExempt: false,
    taxCert: '',
    accountManager: null,
  });
  // Track whether the user has touched premise/region/contact-name so async
  // defaults + the residence mirror can seed them without clobbering a choice.
  const [premiseTouched, setPremiseTouched] = useState(false);
  const [regionTouched, setRegionTouched] = useState(false);
  const [contactNameTouched, setContactNameTouched] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [dupDismissed, setDupDismissed] = useState(false);

  const set = (patch: Partial<FormShape>) => setForm((f) => ({ ...f, ...patch }));
  const mark = (key: string) => setTouched((s) => ({ ...s, [key]: true }));

  const effectivePremise = premiseTouched ? form.premise : defaultPremise;
  const effectiveRegionId = regionTouched ? form.dispatchRegionId : (defaultRegion?.id ?? '');
  const nameG = nameGuidance(effectivePremise);
  // Residence: the household name IS the contact, so it's mirrored until someone
  // personalizes it — one name typed once.
  const effectiveContactName =
    contactNameTouched || effectivePremise !== 'RESIDENCE' ? form.contactName : form.contactName || form.name;
  // customer.name is the account we invoice: the billing name when billing is
  // separate, otherwise the top name. The top name always names the location.
  const resolvedCustomerName = (form.sameBilling ? form.name : form.billingName.trim() || form.name).trim();

  // Live readback in the footer — surfaces the resolved customer name so a
  // mistaken bill-to name is caught before submit.
  const custLabel = resolvedCustomerName || `this ${getName('customer').toLowerCase()}`;
  const svcStreet = form.service.street.trim();
  const locLabel = getName('service_location').toLowerCase();
  const readback = form.sameBilling
    ? `Creates ${custLabel}${svcStreet ? ` at ${svcStreet}` : ''} with their first ${locLabel}.`
    : `Creates ${custLabel} with the ${locLabel}${form.name.trim() ? ` “${form.name.trim()}”` : ''}${
        svcStreet ? ` at ${svcStreet}` : ''
      }, billed to a separate address.`;

  // Duplicate guard — address-first. Debounce name + service address, then hit
  // /customers/duplicate-check. Address matches are near-certain (one address is
  // one place) and shown loud; name matches are "possible" and shown quiet — the
  // endpoint tags each candidate with matchReason. Dismissible.
  const [dupParams, setDupParams] = useState({ name: '', street: '', city: '', state: '', zip: '' });
  useEffect(() => {
    const id = setTimeout(
      () =>
        setDupParams({
          name: form.name.trim(),
          street: form.service.street.trim(),
          city: form.service.city.trim(),
          state: form.service.state.trim(),
          zip: form.service.zip.trim(),
        }),
      250
    );
    return () => clearTimeout(id);
  }, [form.name, form.service.street, form.service.city, form.service.state, form.service.zip]);
  // The endpoint 400s without a name or street; guard so we only fire with one.
  const dupEnabled = !dupDismissed && (dupParams.name.length >= 2 || dupParams.street.length >= 4);
  const { data: dupData } = useQuery({
    queryKey: ['customers', 'dup-check', dupParams],
    queryFn: () =>
      customerApi.duplicateCheck({
        name: dupParams.name.length >= 2 ? dupParams.name : undefined,
        street: dupParams.street.length >= 4 ? dupParams.street : undefined,
        city: dupParams.city || undefined,
        state: dupParams.state || undefined,
        zip: dupParams.zip || undefined,
      }),
    enabled: dupEnabled,
  });
  const dupes: DuplicateCandidate[] = dupDismissed ? [] : (dupData?.candidates ?? []);

  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = 'Required';
  // Contact is one rule, not two: at least one of phone/email. A record with
  // neither is unreachable — the system sends confirmations, en-route notices
  // and invoices through them. (Backend types both optional; this is the FE
  // floor.) Email, if given, must be well-formed.
  if (!form.phone.trim() && !form.email.trim()) {
    errors.contact = 'Add a phone or email — we send confirmations and invoices through them.';
  }
  if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) errors.email = t('common.form.invalidEmail');
  if (!form.service.street.trim()) errors['service.street'] = 'Required';
  if (!form.service.city.trim()) errors['service.city'] = 'Required';
  if (!form.service.state.trim()) errors['service.state'] = 'Required';
  if (!form.service.zip.trim()) errors['service.zip'] = 'Required';
  if (hasRegions && !effectiveRegionId) errors.dispatchRegionId = 'Required';
  if (!form.sameBilling) {
    if (!form.billingName.trim()) errors['billing.name'] = 'Required';
    if (!form.billing.street.trim()) errors['billing.street'] = 'Required';
    if (!form.billing.city.trim()) errors['billing.city'] = 'Required';
    if (!form.billing.state.trim()) errors['billing.state'] = 'Required';
    if (!form.billing.zip.trim()) errors['billing.zip'] = 'Required';
    // The invoice has to reach the payer — require a billing channel.
    if (!form.billingContactPhone.trim() && !form.billingContactEmail.trim()) {
      errors['billing.contact'] = 'Add a phone or email — this is where we deliver the invoice.';
    }
    if (form.billingContactEmail.trim() && !EMAIL_RE.test(form.billingContactEmail.trim())) {
      errors['billing.email'] = t('common.form.invalidEmail');
    }
  }
  const hasErrors = Object.keys(errors).length > 0;

  // One line under the phone/email pair: the danger message if the contact rule
  // or email format is violated (once touched), else the muted at-least-one note.
  const contactMsg =
    (touched.contact && errors.contact) || (touched.email && errors.email) || '';
  const billingContactMsg =
    (touched['billing.contact'] && errors['billing.contact']) ||
    (touched['billing.email'] && errors['billing.email']) ||
    '';

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
      const separate = !form.sameBilling;
      const billingAddress = separate
        ? { ...toApiAddress(form.billing), ...(billingAv.coordsFor(toVerifyReq(form.billing)) ?? {}) }
        : serviceAddress;
      // The customer's own phone/email = the billing/AP contact when a separate
      // party pays (the customer IS that party), else the top contact. The
      // on-site (top) contact always lands on the location; when billing is
      // separate that's the ONLY place it lives.
      const request: CreateCustomerRequest = {
        // The account we invoice: the billing name when billing is separate,
        // else the top name. The first location keeps the top name below.
        name: resolvedCustomerName,
        // Optional on the wire (only name is required). Send null, not "".
        email: (separate ? form.billingContactEmail : form.email).trim() || null,
        phone: (separate ? form.billingContactPhone : form.phone).trim() || null,
        billingAddress,
        billingAddressSameAsService: form.sameBilling,
        serviceLocations: [
          {
            dispatchRegionId: effectiveRegionId,
            // The first location has no name field on this fast-intake form;
            // seed it from the customer name so the site isn't unlabeled.
            locationName: form.name.trim(),
            premiseType: effectivePremise,
            // Who a tech asks for at the door.
            siteContactName: effectiveContactName.trim() || null,
            siteContactPhone: separate ? form.phone.trim() || null : null,
            siteContactEmail: separate ? form.email.trim() || null : null,
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
      contact: true,
      email: true,
      'service.street': true,
      'service.city': true,
      'service.state': true,
      'service.zip': true,
      dispatchRegionId: true,
      'billing.name': true,
      'billing.street': true,
      'billing.city': true,
      'billing.state': true,
      'billing.zip': true,
      'billing.contact': true,
      'billing.email': true,
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
              Name, address, and one way to reach them. Everything else can be added later from the{' '}
              {getName('customer').toLowerCase()}’s page.
            </Text>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Customer — one card: who, where, and how to reach them. Premise
                rides on the Name label because it decides what "Name" means; the
                service address is the operative fact; contact closes it out.
                The top Name is the SERVICE LOCATION — when billing is separate,
                the billing Name (below) becomes the customer/account name. */}
            <Card
              title={getName('customer')}
              action={
                <ToggleGroup
                  size="sm"
                  value={effectivePremise}
                  onChange={(v) => {
                    setPremiseTouched(true);
                    set({ premise: v });
                  }}
                  aria-label="Premise type"
                >
                  <ToggleGroupOption value="RESIDENCE">
                    <HomeIcon className="size-3" />
                    Residence
                  </ToggleGroupOption>
                  <ToggleGroupOption value="BUSINESS">
                    <BuildingOffice2Icon className="size-3" />
                    Business
                  </ToggleGroupOption>
                </ToggleGroup>
              }
              className="mb-3.5"
            >
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
                  placeholder={nameG.placeholder}
                />
                {touched.name && errors.name ? (
                  <Text size="xs" className="mt-1 text-danger-500">
                    {errors.name}
                  </Text>
                ) : nameG.hint ? (
                  <Text size="xs" tone="muted" className="mt-1">
                    {nameG.hint}
                  </Text>
                ) : null}
              </Field>

              {/* Service address — where work is performed. This block is the
                  seam where USPS suggestion/verification lands later. */}
              <div className="mt-3">
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
              </div>

              {/* Duplicate guard — address-first, directly under the fields
                  that trigger it. Address matches are near-certain (loud);
                  name matches are possible-only (quiet). */}
              {dupes.length > 0 && (
                <div className="mt-3">
                  <DuplicateGuard
                    dupes={dupes}
                    onDismiss={() => setDupDismissed(true)}
                    // An address match found a specific LOCATION (and the address
                    // typed here IS that location's) — go there, not just the
                    // parent customer. Name-only matches have no location.
                    onUse={(c) =>
                      navigate(
                        c.serviceLocationId ? `/service-locations/${c.serviceLocationId}` : `/customers/${c.customerId}`
                      )
                    }
                  />
                </div>
              )}

              <div className="my-3.5 border-t border-border-soft" />

              {/* Contact — who to ask for + at least one channel. For a
                  residence the household name mirrors in until personalized. */}
              <Field size="xs">
                <Label size="xs" hint={effectivePremise === 'RESIDENCE' ? 'who we ask for' : 'who to ask for on site'}>
                  {t('common.form.contactName')}
                </Label>
                <Input
                  size="xs"
                  value={effectiveContactName}
                  onChange={(e) => {
                    setContactNameTouched(true);
                    set({ contactName: e.target.value });
                  }}
                  placeholder={effectivePremise === 'RESIDENCE' ? 'Tanya Avila' : 'Marcus Bell · GM'}
                />
              </Field>
              <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Field size="xs">
                  <Label size="xs">{t('common.form.phone')}</Label>
                  <PatternFormat
                    format="(###) ###-####"
                    mask="_"
                    customInput={Input}
                    size="xs"
                    type="tel"
                    value={form.phone}
                    onValueChange={(values) => set({ phone: values.value })}
                    onBlur={() => mark('contact')}
                    invalid={!!(touched.contact && errors.contact)}
                    placeholder="(602) 555-0100"
                  />
                </Field>
                <Field size="xs">
                  <Label size="xs">{t('common.form.email')}</Label>
                  <Input
                    size="xs"
                    type="email"
                    value={form.email}
                    onChange={(e) => set({ email: e.target.value })}
                    onBlur={() => {
                      mark('contact');
                      mark('email');
                    }}
                    invalid={!!((touched.contact && errors.contact) || (touched.email && errors.email))}
                    placeholder="maria@example.com"
                  />
                </Field>
              </div>
              {contactMsg ? (
                <Text size="xs" className="mt-1.5 text-danger-500">
                  {contactMsg}
                </Text>
              ) : (
                <Text size="xs" tone="muted" className="mt-1.5">
                  At least one — we send confirmations and invoices through them.
                </Text>
              )}
            </Card>

            {/* Who pays? — bill this customer directly, or name a different party.
                When separate, the Bill-to name becomes the customer/account name
                and its AP contact becomes the customer's own; the on-site contact
                then moves onto the location. Not a customer-type signal. */}
            <Card
              title="Who pays?"
              subtitle="Invoices go to this customer unless you name someone else."
              className="mb-3.5"
            >
              <label className="flex cursor-pointer items-start gap-2.5">
                <Checkbox
                  color="accent"
                  checked={form.sameBilling}
                  onChange={(v) =>
                    set({
                      sameBilling: v,
                      // Seed the bill-to name from the top name when splitting
                      // off, so the common "same party, different mailing
                      // address" case needs no retype. Editable when it's a
                      // genuinely different account.
                      billingName: !v && !form.billingName.trim() ? form.name.trim() : form.billingName,
                    })
                  }
                />
                <span>
                  <span className="block text-[12.5px] font-medium text-fg-strong">Bill this customer directly</span>
                  <span className="mt-0.5 block text-[11px] text-fg-muted">
                    Uncheck only if someone else is invoiced — a franchise owner, property manager, or corporate AP.
                  </span>
                </span>
              </label>
              {!form.sameBilling && (
                <div className="mt-3 border-t border-dashed border-border-soft pt-3">
                  <Field size="xs" className="mb-2.5">
                    <Label size="xs" required hint="the company that pays">
                      Bill to
                    </Label>
                    <Input
                      size="xs"
                      value={form.billingName}
                      onChange={(e) => set({ billingName: e.target.value })}
                      onBlur={() => mark('billing.name')}
                      invalid={!!(touched['billing.name'] && errors['billing.name'])}
                      placeholder="Darden Restaurants"
                    />
                    {touched['billing.name'] && errors['billing.name'] && (
                      <Text size="xs" className="mt-1 text-danger-500">
                        {errors['billing.name']}
                      </Text>
                    )}
                  </Field>
                  <AddressBlock
                    value={form.billing}
                    onChange={(b) => set({ billing: b })}
                    prefix="billing"
                    streetLabel="Billing street address"
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

                  {/* Where the invoice goes — no AP contact name (accounts
                      payable is a department, not a person we ask for); the
                      channel is the whole requirement. Phone/email become the
                      customer's own (the customer IS the payer here). */}
                  <div className="my-3 h-px bg-border-soft" />
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <Field size="xs">
                      <Label size="xs">Billing phone</Label>
                      <PatternFormat
                        format="(###) ###-####"
                        mask="_"
                        customInput={Input}
                        size="xs"
                        type="tel"
                        value={form.billingContactPhone}
                        onValueChange={(values) => set({ billingContactPhone: values.value })}
                        onBlur={() => mark('billing.contact')}
                        invalid={!!(touched['billing.contact'] && errors['billing.contact'])}
                        placeholder="(602) 555-0100"
                      />
                    </Field>
                    <Field size="xs">
                      <Label size="xs">Billing email</Label>
                      <Input
                        size="xs"
                        type="email"
                        value={form.billingContactEmail}
                        onChange={(e) => set({ billingContactEmail: e.target.value })}
                        onBlur={() => {
                          mark('billing.contact');
                          mark('billing.email');
                        }}
                        invalid={
                          !!(
                            (touched['billing.contact'] && errors['billing.contact']) ||
                            (touched['billing.email'] && errors['billing.email'])
                          )
                        }
                        placeholder="name@email.com"
                      />
                    </Field>
                  </div>
                  {billingContactMsg ? (
                    <Text size="xs" className="mt-1.5 text-danger-500">
                      {billingContactMsg}
                    </Text>
                  ) : (
                    <Text size="xs" tone="muted" className="mt-1.5">
                      At least one — this is where we send the invoice.
                    </Text>
                  )}
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
              <div className="text-[11.5px] text-fg-muted max-sm:basis-full">{readback}</div>
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
  streetLabel,
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
  // Overrides the street field label (e.g. "Billing street address").
  streetLabel?: string;
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
            {streetLabel ?? t('common.form.streetAddress')}
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

// ──────────────────────────────────────────────────────────────────
// DuplicateGuard — address-first dedup, rendered under the address fields.
// ADDRESS/BOTH matches are near-certain (one address is one place) → loud,
// warning-tinted, "adding it again splits the service history." NAME matches
// are possible-only (a surname matches many households) → quiet, neutral,
// "probably someone else." The backend tags each candidate with matchReason;
// the FE renders confidence, it doesn't re-score. Each row leads with the
// address, because that's what settles identity.
// ──────────────────────────────────────────────────────────────────
const REASON_LABEL: Record<DuplicateMatchReason, string> = {
  BOTH: 'Same address + name',
  ADDRESS: 'Same address',
  NAME: 'Same name',
};

function formatLastService(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function DuplicateGuard({
  dupes,
  onDismiss,
  onUse,
}: {
  dupes: DuplicateCandidate[];
  onDismiss: () => void;
  onUse: (candidate: DuplicateCandidate) => void;
}) {
  const strongRows = dupes.filter((d) => d.matchReason !== 'NAME');
  const weakRows = dupes.filter((d) => d.matchReason === 'NAME');
  const strong = strongRows.length > 0;
  const mixed = strong && weakRows.length > 0;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

  // Headline states the match, not a generic warning — an address hit and a name
  // hit are different claims and warrant different confidence.
  const head = mixed
    ? `You already service this address — plus ${plural(weakRows.length, 'name match')}`
    : strong
      ? strongRows.length === 1
        ? 'You already service this address'
        : `You already service this address — ${strongRows.length} records`
      : weakRows.length === 1
        ? 'A customer with a similar name exists'
        : `${weakRows.length} customers have a similar name`;
  const sub = mixed
    ? 'The address match splits this place’s history if you add it again. The name matches are different addresses — probably other people.'
    : strong
      ? 'Adding it again splits the service history for this place across two records.'
      : 'Different address, so this is probably someone else — check before you add.';

  return (
    <div
      className="overflow-hidden rounded-[10px] border"
      // Tint via inline style (not an arbitrary Tailwind class) so it always
      // wins over layered utilities — warning-tinted for a near-certain address
      // match, neutral for a name-only match.
      style={{
        borderColor: strong ? 'color-mix(in oklch, var(--warning-500) 45%, var(--border))' : 'var(--border)',
        background: strong ? 'color-mix(in oklch, var(--warning-500) 7%, var(--bg-elev))' : 'var(--bg-elev-2)',
      }}
    >
      <div className="flex items-start gap-2 px-3 py-2.5">
        <ExclamationTriangleIcon
          className={`mt-px size-3.5 shrink-0 ${strong ? 'text-warning-fg' : 'text-fg-muted'}`}
        />
        <div className="min-w-0">
          <div className={`text-[12.5px] font-bold ${strong ? 'text-warning-fg' : 'text-fg-strong'}`}>{head}</div>
          <div className="mt-0.5 text-[11.5px] leading-snug text-fg-muted">{sub}</div>
        </div>
      </div>

      {dupes.map((d) => {
        const last = formatLastService(d.lastServiceAt);
        // On an address match the matched LOCATION's name is the operative label
        // (it's what we route to); the owning customer becomes secondary context.
        // Falls back to the customer name until the backend sends locationName.
        const locName = d.locationName?.trim();
        const primaryName = locName || d.name;
        const account = locName && locName !== d.name ? d.name : null;
        // Lifetime job count was dropped server-side; only open work is returned.
        const meta = [account, last && `Last job ${last}`, d.openJobCount > 0 && `${d.openJobCount} open`].filter(
          Boolean
        );
        return (
          <div
            key={`${d.customerId}-${d.serviceLocationId ?? 'name'}`}
            className="flex items-center gap-3 border-t bg-bg-elev px-3 py-2.5"
            style={{
              borderTopColor: strong
                ? 'color-mix(in oklch, var(--warning-500) 22%, var(--border-soft))'
                : 'var(--border-soft)',
            }}
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-bg-active text-fg-muted">
              {d.premiseType === 'RESIDENCE' ? (
                <HomeIcon className="size-[15px]" />
              ) : (
                <BuildingOffice2Icon className="size-[15px]" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[13px] font-semibold text-fg-strong">{primaryName}</span>
                <span
                  className={`text-[10.5px] font-semibold ${
                    d.matchReason === 'BOTH'
                      ? 'text-danger-500'
                      : d.matchReason === 'ADDRESS'
                        ? 'text-warning-fg'
                        : 'text-fg-muted'
                  }`}
                >
                  {REASON_LABEL[d.matchReason]}
                </span>
                {(d.status === 'INACTIVE' || d.status === 'CLOSED') && (
                  <Badge color="zinc">{d.status === 'CLOSED' ? 'Closed' : 'Inactive'}</Badge>
                )}
              </div>
              {/* The address settles identity, so it leads. A NAME-only match
                  carries no address from the backend — fall back to the number. */}
              <div className="mt-0.5 text-[12px] text-fg">
                {d.address
                  ? `${titleCaseAddress(d.address.streetAddress)}, ${titleCaseAddress(d.address.city)}, ${d.address.state} ${d.address.zipCode}`
                  : d.customerNumber}
              </div>
              {meta.length > 0 && <div className="mt-0.5 text-[11px] text-fg-muted">{meta.join(' · ')}</div>}
            </div>
            <Button color="accent" onClick={() => onUse(d)} className="shrink-0">
              {d.serviceLocationId ? 'Use this location →' : 'Use this customer →'}
            </Button>
          </div>
        );
      })}

      <div className="flex justify-end border-t border-border-soft bg-bg-elev-2 px-3 py-1.5">
        <button
          type="button"
          onClick={onDismiss}
          className="text-[11.5px] text-fg-muted underline decoration-border-strong underline-offset-2 hover:text-fg"
        >
          Not a duplicate — keep adding
        </button>
      </div>
    </div>
  );
}
