/* eslint-disable i18next/no-literal-string -- dense v1.5 visual form; entity names + major strings go through getName()/t(), but inline glyphs, separators, and short operational labels are kept as literals to keep the form markup readable (same convention as UserFormPage / ServiceLocationDetailPage). */
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { BuildingOffice2Icon, HomeIcon } from '@heroicons/react/24/outline';
import { PatternFormat } from 'react-number-format';
import {
  customerApi,
  dispatchRegionApi,
  tenantSettingsApi,
  type PremiseType,
  type CreateServiceLocationRequest,
  type AddressVerifyRequest,
} from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { useHasCapability } from '../hooks/useCurrentUser';
import { showError, showSuccess, extractApiError } from '../lib/toast';
import AppLayout from '../components/AppLayout';
import LocationCustomerPicker, { type PickedCustomer } from '../components/LocationCustomerPicker';
import { AddressSuggestion } from '../components/AddressSuggestion';
import { useAddressVerify } from '../hooks/useAddressVerify';
import { Card } from '../components/catalyst/card';
import { Button } from '../components/catalyst/button';
import { Field, Label } from '../components/catalyst/fieldset';
import { Input } from '../components/catalyst/input';
import { Select } from '../components/catalyst/select';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { Callout } from '../components/ui/Callout';
import { ToggleGroup, ToggleGroupOption } from '../components/ui/ToggleGroup';
import { US_STATES } from '../constants/states';

// Add Location — attaches one service location to an EXISTING customer.
//
// Scoped to a known customer (the FK is fixed by the route); this form does
// NOT pick a customer. Reached from the customer detail "Add location" action.
//
// Design source: claude_designs/screen-add-location.jsx. Real wiring departs
// from the mock in two deliberate places, both backend-gated:
//   • USPS street autocomplete + "✓ verified" is deferred — no address
//     provider is wired yet (same call as the location header inline-edit).
//     Address fields are plain inputs until that lands.
//   • The mock's "Hours" advanced field has no writer on
//     CreateServiceLocationRequest, so it's omitted rather than dropped
//     silently. Access instructions/notes intentionally accumulate on the
//     location page after create (fast-create stays minimal).

interface FormState {
  locationName: string;
  premise: PremiseType;
  streetAddress: string;
  streetAddressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  dispatchRegionId: string;
  siteContactName: string;
  siteContactPhone: string;
  siteContactEmail: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0][0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export default function AddLocationPage() {
  const { customerId: routeCustomerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();

  const canAdd = useHasCapability('ADD_SERVICE_LOCATIONS');

  // Reached two ways: customer-scoped (/customers/:customerId/service-locations/new,
  // FK fixed by the route) or standalone from the global Locations list
  // (/service-locations/new), where the CSR picks the customer first.
  const standalone = !routeCustomerId;
  const [pickedCustomer, setPickedCustomer] = useState<PickedCustomer | null>(null);
  const effectiveCustomerId = routeCustomerId ?? pickedCustomer?.id ?? '';

  const { data: customer, isLoading: loadingCustomer, error: customerError } = useQuery({
    queryKey: ['customers', effectiveCustomerId],
    queryFn: () => customerApi.getById(effectiveCustomerId),
    enabled: !!effectiveCustomerId,
  });

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

  const [form, setForm] = useState<FormState>({
    locationName: '',
    premise: defaultPremise,
    streetAddress: '',
    streetAddressLine2: '',
    city: '',
    state: '',
    zipCode: '',
    dispatchRegionId: '',
    siteContactName: '',
    siteContactPhone: '',
    siteContactEmail: '',
  });
  // Track whether the user has touched premise/region so async defaults can
  // seed them without clobbering a deliberate choice.
  const [premiseTouched, setPremiseTouched] = useState(false);
  const [regionTouched, setRegionTouched] = useState(false);
  // Set once the user edits the site-contact name — stops the residence
  // soft-prefill from mirroring the location name.
  const [contactNameDirty, setContactNameDirty] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Seed premise from the tenant default once it arrives (premise is always
  // editable — we only seed when the user hasn't already chosen).
  const effectivePremise = premiseTouched ? form.premise : defaultPremise;
  // Seed region from the tenant default region once it arrives.
  const effectiveRegionId = regionTouched ? form.dispatchRegionId : (defaultRegion?.id ?? '');

  const av = useAddressVerify();
  const serviceReq: AddressVerifyRequest = {
    streetAddress: form.streetAddress,
    streetAddressLine2: form.streetAddressLine2 || null,
    city: form.city,
    state: form.state,
    zipCode: form.zipCode,
  };

  // Residence soft-prefill: a home's site contact is almost always the
  // homeowner, i.e. the location name. Mirror it into the contact-name field
  // only while that field is untouched — fully overridable, and never for a
  // Business (flipping to Business drops the mirror).
  const effectiveContactName =
    !contactNameDirty && effectivePremise === 'RESIDENCE' ? form.locationName : form.siteContactName;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const mark = (key: string) => setTouched((s) => ({ ...s, [key]: true }));

  const errors: Record<string, string> = {};
  // Name is required for every location — a homeowner's name for a residence,
  // a recognizable label for a commercial site.
  if (!form.locationName.trim()) errors.locationName = 'Required';
  if (!form.streetAddress.trim()) errors.streetAddress = 'Required';
  if (!form.city.trim()) errors.city = 'Required';
  if (!form.state.trim()) errors.state = 'Required';
  if (!form.zipCode.trim()) errors.zipCode = 'Required';
  if (hasRegions && !effectiveRegionId) errors.dispatchRegionId = 'Required';
  if (form.siteContactEmail && !EMAIL_RE.test(form.siteContactEmail))
    errors.siteContactEmail = t('common.form.invalidEmail');
  const hasErrors = Object.keys(errors).length > 0;

  const cancelHref =
    standalone || searchParams.get('from') === 'locations'
      ? '/service-locations'
      : `/customers/${routeCustomerId}`;

  // Name examples are persona-ordered by the tenant default premise: same two
  // examples (commercial label / homeowner's name), the likely one first.
  const residenceDefault = defaultPremise === 'RESIDENCE';
  const namePlaceholder = residenceDefault
    ? 'Homeowner’s name, or a label like Retail #047'
    : 'Label like “Headquarters” or “Retail #047” — or homeowner’s name';
  const nameHelper = residenceDefault
    ? 'For a home, use the homeowner’s name. For commercial, a label staff recognize (“Headquarters”, “Retail #047”).'
    : 'For commercial, a label staff recognize (“Headquarters”, “Retail #047”). For a home, use the homeowner’s name.';

  const createMutation = useMutation({
    mutationFn: () => {
      const request: CreateServiceLocationRequest = {
        dispatchRegionId: effectiveRegionId,
        locationName: form.locationName.trim(),
        premiseType: effectivePremise,
        address: {
          streetAddress: form.streetAddress.trim(),
          streetAddressLine2: form.streetAddressLine2.trim() || null,
          city: form.city.trim(),
          state: form.state,
          zipCode: form.zipCode.trim(),
          ...(av.coordsFor(serviceReq) ?? {}),
        },
        siteContactName: effectiveContactName.trim() || null,
        siteContactPhone: form.siteContactPhone.trim() || null,
        siteContactEmail: form.siteContactEmail.trim() || null,
      };
      return customerApi.addServiceLocation(effectiveCustomerId, request);
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['customers', effectiveCustomerId] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['service-locations'] });
      showSuccess(t('common.form.successCreate', { entity: getName('service_location'), defaultValue: 'Location created' }));
      navigate(`/service-locations/${created.id}?from=${standalone ? 'locations' : 'customer'}`);
    },
    onError: (err: unknown) =>
      showError(t('common.form.errorCreate', { entity: getName('service_location') }), extractApiError(err) ?? undefined),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ locationName: true, streetAddress: true, city: true, state: true, zipCode: true, dispatchRegionId: true, siteContactEmail: true });
    if (hasErrors) return;
    createMutation.mutate();
  };

  const submitting = createMutation.isPending;

  if (!canAdd) {
    return (
      <AppLayout>
        <div className="p-8">
          <Callout kind="warning">{t('common.noPermission', { defaultValue: 'You don’t have permission to do that.' })}</Callout>
          <Button className="mt-4" onClick={() => navigate(cancelHref)}>
            {t('common.actions.backTo', { entities: getName('service_location', true) })}
          </Button>
        </div>
      </AppLayout>
    );
  }

  // Standalone entry (global Locations list), no customer chosen yet — show the
  // picker; the location form appears once a customer is selected.
  if (standalone && !effectiveCustomerId) {
    return (
      <AppLayout>
        <div className="px-1 py-1">
          <div className="mx-auto max-w-[680px]">
            <Link
              to="/service-locations"
              className="mb-2.5 inline-flex items-center gap-1 text-[11.5px] text-fg-muted hover:text-fg-strong"
            >
              ← {getName('service_location', true)}
            </Link>
            <div className="mb-4">
              <Heading level={1} size="page-md" className="m-0">
                {t('common.actions.add', { entity: getName('service_location') })}
              </Heading>
              <Text size="sm" tone="muted" className="mt-1">
                Pick the {getName('customer').toLowerCase()} this {getName('service_location').toLowerCase()} belongs to, then fill in the site.
              </Text>
            </div>
            <Card title={getName('customer')}>
              <Field size="xs">
                <Label size="xs" required>{getName('customer')}</Label>
                <LocationCustomerPicker value={pickedCustomer} onChange={setPickedCustomer} />
              </Field>
            </Card>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (loadingCustomer) {
    return (
      <AppLayout>
        <div className="p-8 text-center text-[12.5px] text-fg-muted">
          {t('common.actions.loading', { entities: getName('customer', true) })}
        </div>
      </AppLayout>
    );
  }

  if (customerError || !customer) {
    return (
      <AppLayout>
        <div className="p-8">
          <Callout kind="danger">
            {t('common.actions.errorLoadingEntity', { entity: getName('customer') })}
          </Callout>
          <Button className="mt-4" onClick={() => navigate(standalone ? '/service-locations' : '/customers')}>
            {t('common.actions.backTo', { entities: getName('customer', true) })}
          </Button>
        </div>
      </AppLayout>
    );
  }

  const nextLocationNumber = customer.serviceLocations.length + 1;

  return (
    <AppLayout>
      <div className="px-1 py-1">
        <div className="mx-auto max-w-[680px]">
          <Link
            to={cancelHref}
            className="mb-2.5 inline-flex max-w-[600px] items-center gap-1 truncate text-[11.5px] text-fg-muted hover:text-fg-strong"
          >
            ← {standalone ? getName('service_location', true) : customer.name}
          </Link>

          <div className="mb-4">
            <Heading level={1} size="page-md" className="m-0">
              {t('common.actions.add', { entity: getName('service_location') })}
            </Heading>
            <Text size="sm" tone="muted" className="mt-1">
              Required: location name and service address. Contact and hours can be added later — anyone can fill them in as they learn the site.
            </Text>
          </div>

          {/* Customer context banner — the FK is fixed by the route. */}
          <div className="mb-3.5 flex items-center gap-2.5 rounded-[10px] border border-border bg-bg-elev px-3.5 py-2.5 shadow-sm">
            <div className="grid size-8 shrink-0 place-items-center rounded-[7px] bg-gradient-to-br from-accent-500 to-accent-700 text-[12px] font-bold text-white">
              {initials(customer.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-semibold text-fg-strong">{customer.name}</div>
              <div className="text-[11px] text-fg-muted">
                Adding location #{nextLocationNumber}
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Location identity — name is required (homeowner's name for a
                residence, a recognizable label for a commercial site). */}
            <Card title={getName('service_location')} className="mb-3.5">
              <Field size="xs">
                <Label size="xs" required>{t('common.form.locationName')}</Label>
                <Input
                  size="xs"
                  value={form.locationName}
                  onChange={(e) => set('locationName', e.target.value)}
                  onBlur={() => mark('locationName')}
                  invalid={!!(touched.locationName && errors.locationName)}
                  placeholder={namePlaceholder}
                />
                {touched.locationName && errors.locationName && (
                  <Text size="xs" className="mt-1 text-danger-500">{errors.locationName}</Text>
                )}
              </Field>
              <Text size="xs" tone="muted" className="mt-1.5">
                {nameHelper}
              </Text>
            </Card>

            {/* Service address */}
            <Card title="Service address" subtitle="Where work will be performed." className="mb-3.5">
              <div className="grid grid-cols-12 gap-2">
                <Field size="xs" className="col-span-8">
                  <Label size="xs" required>{t('common.form.streetAddress')}</Label>
                  <Input
                    size="xs"
                    value={form.streetAddress}
                    onChange={(e) => set('streetAddress', e.target.value)}
                    onBlur={() => { mark('streetAddress'); av.run(serviceReq); }}
                    invalid={!!(touched.streetAddress && errors.streetAddress)}
                    placeholder="1820 W McDowell Rd"
                  />
                  {touched.streetAddress && errors.streetAddress && (
                    <Text size="xs" className="mt-1 text-danger-500">{errors.streetAddress}</Text>
                  )}
                </Field>
                <Field size="xs" className="col-span-4">
                  <Label size="xs">{t('common.form.addressLine2')}</Label>
                  <Input size="xs" value={form.streetAddressLine2} onChange={(e) => set('streetAddressLine2', e.target.value)} placeholder="Apt / Ste" />
                </Field>
              </div>
              <div className="mt-2.5 grid grid-cols-12 gap-2">
                <Field size="xs" className={hasRegions ? 'col-span-4' : 'col-span-6'}>
                  <Label size="xs" required>{t('common.form.city')}</Label>
                  <Input
                    size="xs"
                    value={form.city}
                    onChange={(e) => set('city', e.target.value)}
                    onBlur={() => { mark('city'); av.run(serviceReq); }}
                    invalid={!!(touched.city && errors.city)}
                    placeholder="Phoenix"
                  />
                  {touched.city && errors.city && <Text size="xs" className="mt-1 text-danger-500">{errors.city}</Text>}
                </Field>
                <Field size="xs" className="col-span-2">
                  <Label size="xs" required>{t('common.form.state')}</Label>
                  <Select
                    value={form.state}
                    onChange={(e) => set('state', e.target.value)}
                    onBlur={() => { mark('state'); av.run(serviceReq); }}
                    invalid={!!(touched.state && errors.state)}
                  >
                    <option value="">{t('common.form.select')}</option>
                    {US_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </Select>
                </Field>
                <Field size="xs" className={hasRegions ? 'col-span-2' : 'col-span-4'}>
                  <Label size="xs" required>{t('common.form.zipCode')}</Label>
                  <Input
                    size="xs"
                    value={form.zipCode}
                    onChange={(e) => set('zipCode', e.target.value)}
                    onBlur={() => { mark('zipCode'); av.run(serviceReq); }}
                    invalid={!!(touched.zipCode && errors.zipCode)}
                    inputMode="numeric"
                    placeholder="85007"
                  />
                  {touched.zipCode && errors.zipCode && <Text size="xs" className="mt-1 text-danger-500">{errors.zipCode}</Text>}
                </Field>
                {hasRegions && (
                  <Field size="xs" className="col-span-4">
                    <Label size="xs" required>{getName('dispatch_region')}</Label>
                    <Select
                      value={effectiveRegionId}
                      onChange={(e) => { setRegionTouched(true); set('dispatchRegionId', e.target.value); }}
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
                )}
              </div>
              <AddressSuggestion
                verify={av}
                typed={serviceReq}
                onAccept={(a) => {
                  set('streetAddress', a.streetAddress);
                  set('city', a.city);
                  set('state', a.state);
                  set('zipCode', a.zipCode);
                }}
              />
            </Card>

            {/* Premise type — qualifies the address, so it follows it. */}
            <Card
              title="Premise type"
              subtitle="What a tech is walking into. Defaulted from your company profile; change it per location anytime."
              className="mb-3.5"
            >
              <ToggleGroup value={effectivePremise} onChange={(v) => { setPremiseTouched(true); set('premise', v); }} aria-label="Premise type">
                <ToggleGroupOption value="RESIDENCE">
                  <span className="flex items-center gap-1.5"><HomeIcon className="size-4" /> Residence</span>
                </ToggleGroupOption>
                <ToggleGroupOption value="BUSINESS">
                  <span className="flex items-center gap-1.5"><BuildingOffice2Icon className="size-4" /> Business</span>
                </ToggleGroupOption>
              </ToggleGroup>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-fg-muted">
                <BuildingOffice2Icon className="size-3" />
                Default for new locations is{' '}
                <strong className="font-semibold text-fg">{defaultPremise === 'BUSINESS' ? 'Business' : 'Residence'}</strong> · set in Company profile.
              </div>
            </Card>

            {/* Site contact — optional */}
            <Card title="Site contact" subtitle="Who to call about this site. Optional — fill in when known." className="mb-3.5">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Field size="xs">
                  <Label size="xs">{t('common.form.siteContactName')}</Label>
                  <Input
                    size="xs"
                    value={effectiveContactName}
                    onChange={(e) => { setContactNameDirty(true); set('siteContactName', e.target.value); }}
                    placeholder="e.g., Maria Reyes"
                  />
                </Field>
                <Field size="xs">
                  <Label size="xs">{t('common.form.siteContactPhone')}</Label>
                  <PatternFormat
                    format="(###) ###-####"
                    mask="_"
                    customInput={Input}
                    size="xs"
                    type="tel"
                    value={form.siteContactPhone}
                    onValueChange={(values) => set('siteContactPhone', values.value)}
                    placeholder="(602) 555-0100"
                  />
                </Field>
              </div>
              <div className="mt-2.5">
                <Field size="xs">
                  <Label size="xs">{t('common.form.siteContactEmail')}</Label>
                  <Input
                    size="xs"
                    type="email"
                    value={form.siteContactEmail}
                    onChange={(e) => set('siteContactEmail', e.target.value)}
                    onBlur={() => mark('siteContactEmail')}
                    invalid={!!(touched.siteContactEmail && errors.siteContactEmail)}
                    placeholder="optional · for updates + scheduling"
                  />
                  {touched.siteContactEmail && errors.siteContactEmail && (
                    <Text size="xs" className="mt-1 text-danger-500">{errors.siteContactEmail}</Text>
                  )}
                </Field>
              </div>
            </Card>

            {/* Footer */}
            <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-bg-elev px-3.5 py-3 shadow-sm">
              <div className="text-[11.5px] text-fg-muted max-sm:basis-full">
                Adds one {getName('service_location').toLowerCase()} under <strong className="text-fg-strong">{customer.name}</strong>.
              </div>
              <span className="flex-1" />
              <Button href={cancelHref} plain size="xs">
                {t('common.cancel')}
              </Button>
              <Button type="submit" color="accent" size="xs" disabled={submitting}>
                {submitting ? t('common.saving') : t('common.actions.add', { entity: getName('service_location') })}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
