/* eslint-disable i18next/no-literal-string -- dense intake form; entity names go through getName() and shared actions through t(), but inline section titles, field labels, and short operational copy stay literal to keep the markup readable (same convention as UserFormPage / EquipmentFormPage / AddLocationPage). */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  workOrderApi,
  customerApi,
  equipmentApi,
  workOrderTypesApi,
  divisionsApi,
  dispatchRegionApi,
  tenantSettingsApi,
  type CreateWorkOrderRequest,
  type CreateWorkItemRequest,
  type CreateCustomerRequest,
  type ServiceLocationSearchResult,
  type CustomerSearchResult,
  type ServiceLocationDetailDto,
  type WorkOrderPriority,
  type PremiseType,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { showError, showSuccess, extractApiError } from '../lib/toast';
import AppLayout from '../components/AppLayout';
import ServiceLocationPicker from '../components/ServiceLocationPicker';
import WOEquipmentPicker from '../components/WOEquipmentPicker';
import { titleCaseAddress } from '../utils/titleCaseAddress';
import {
  buildCustomerCreateRequest,
  contactChannelError,
  nameGuidance,
  resolveContactName,
  type CustomerCreateModel,
} from '../lib/customerCreateModel';
import { Card } from '../components/catalyst/card';
import { Button } from '../components/catalyst/button';
import { Field, Label } from '../components/catalyst/fieldset';
import { Input } from '../components/catalyst/input';
import { Select } from '../components/catalyst/select';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { ToggleGroup, ToggleGroupOption } from '../components/ui/ToggleGroup';
import { Pill } from '../components/ui/Pill';
import { Checkbox } from '../components/catalyst/checkbox';
import {
  PlusIcon,
  XMarkIcon,
  CheckIcon,
  BoltIcon,
  UserIcon,
  HomeIcon,
  BuildingOffice2Icon,
} from '@heroicons/react/24/outline';

// New Work Order intake (mock: New Job.html / screen-wo-intake.jsx). A CSR
// books this while on the phone, so it's one dense form — location-led (the
// customer derives from the picked location), WO classification, and N
// work-item drafts — with a live summary rail. POST /work-orders is atomic
// (customer + location + items[] in one call); items are created in Triage and
// equipmentId is allowed to be null (usually is — the tech attaches on site).
//
// Deliberately NOT built (no backend): tech assignment / dispatch at intake
// (scheduled on the detail page), SMS/email confirmations, estimated value.
// Complaint is free text; the tenant-history typeahead is a backend ask.

const PRIORITIES: { value: WorkOrderPriority; label: string }[] = [
  { value: 'LOW', label: 'Low' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

const PRIORITY_TONE: Record<WorkOrderPriority, 'neutral' | 'info' | 'warning' | 'danger'> = {
  LOW: 'neutral',
  NORMAL: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
};

interface Draft {
  key: number;
  complaint: string;
  equipmentId: string | null;
  equipmentName: string | null;
  // true = needs equipment (default), false = explicit "No equipment needed".
  equipmentNeeded: boolean;
  // Equipment sub-UI state for this draft.
  ui: 'idle' | 'picking' | 'quickadd';
  quickName: string;
}

const newDraft = (key: number): Draft => ({
  key,
  complaint: '',
  equipmentId: null,
  equipmentName: null,
  equipmentNeeded: true,
  ui: 'idle',
  quickName: '',
});

const blankAddress = { streetAddress: '', city: '', state: '', zipCode: '' };


// Standalone label (Catalyst's <Label> requires a <Field> ancestor; these sit
// above a segmented control / bare input, so use a plain styled label).
function MiniLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[11px] font-semibold text-fg-strong">{children}</div>;
}

// Numbered step badge on each section header (mock: the flow reads as an
// ordered checklist). Flips to a ✓ once the section has what it needs.
function StepBadge({ n, complete }: { n: number; complete?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-[18px] shrink-0 place-items-center rounded-full text-[10px] font-bold ${
        complete ? 'bg-success-500 text-white' : 'border border-border-strong bg-bg-active text-fg-muted'
      }`}
    >
      {complete ? '✓' : n}
    </span>
  );
}

// A section title with its step badge — passed to <Card title=…>.
function StepTitle({ n, complete, children }: { n: number; complete?: boolean; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <StepBadge n={n} complete={complete} />
      {children}
    </span>
  );
}

export default function WorkOrderIntakePage() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const prefillLocationId = searchParams.get('locationId');
  const prefillCustomerId = searchParams.get('customerId');

  // ── Classification ────────────────────────────────────────────────────
  const [workOrderTypeId, setWorkOrderTypeId] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [priority, setPriority] = useState<WorkOrderPriority>('NORMAL');
  const [scheduledDate, setScheduledDate] = useState('');
  const [customerOrderNumber, setCustomerOrderNumber] = useState('');

  // ── Location ──────────────────────────────────────────────────────────
  // The three realities a CSR can be in when the phone rings. Which one they're
  // in is discovered by searching, not declared up front — the picker routes
  // here, there's no mode toggle to pre-answer the question.
  //   existing     — the location is on file
  //   new-location — the CUSTOMER is on file, this property isn't
  //   new          — nobody is on file yet
  const [customerMode, setCustomerMode] = useState<'existing' | 'new-location' | 'new'>('existing');
  const [selectedLocation, setSelectedLocation] = useState<ServiceLocationSearchResult | null>(null);
  // Set only in 'new-location': the account the new property hangs off.
  const [createForCustomer, setCreateForCustomer] = useState<CustomerSearchResult | null>(null);
  const [newLocationName, setNewLocationName] = useState('');

  // Both create paths need a region + the tenant's premise default.
  const creatingLocation = customerMode !== 'existing';
  // The panel has been filled in and collapsed, but NOTHING is written yet.
  // Intake has no server-side draft on purpose: everything lands in one
  // transaction on job submit, so Cancel means cancel. Committing the customer
  // early would leave a record behind on the mis-starts that live calls are
  // full of — wrong number, "let me call you back", a hang-up mid-address —
  // and the CSR wouldn't know it existed, so the next call makes a second one.
  const [staged, setStaged] = useState(false);

  // New customer + location — lightweight ("just enough to start; enrich later").
  // Mirrors Add Customer's model so we don't over-ask: ONE name (a person OR a
  // company) seeds both the customer and its first location — never a separate
  // "location name" — and premise defaults from the company profile.
  const [newCustomer, setNewCustomer] = useState<CustomerCreateModel>({
    name: '',
    contactName: '',
    phone: '',
    email: '',
    premise: 'BUSINESS',
    sameBilling: true,
    billingName: '',
    billingContactPhone: '',
    billingContactEmail: '',
  });
  const patchNewCustomer = (patch: Partial<CustomerCreateModel>) =>
    setNewCustomer((c) => ({ ...c, ...patch }));
  const [contactNameTouched, setContactNameTouched] = useState(false);
  const [newAddress, setNewAddress] = useState({ ...blankAddress });
  // Only collected when a separate party is invoiced — where the invoice goes.
  const [newBillingAddress, setNewBillingAddress] = useState({ ...blankAddress });
  const [premiseTouched, setPremiseTouched] = useState(false);
  const [dispatchRegionId, setDispatchRegionId] = useState('');
  const newName = newCustomer.name;

  // ── Work items ──────────────────────────────────────────────────────────
  const [drafts, setDrafts] = useState<Draft[]>([newDraft(1)]);
  const nextKey = useRef(2);
  const patchDraft = (key: number, patch: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const addDraft = () => setDrafts((ds) => [...ds, newDraft(nextKey.current++)]);
  const removeDraft = (key: number) => setDrafts((ds) => (ds.length > 1 ? ds.filter((d) => d.key !== key) : ds));

  // ── Reference data ────────────────────────────────────────────────────
  const { data: types } = useQuery({ queryKey: ['work-order-types'], queryFn: () => workOrderTypesApi.getAll() });
  const activeTypes = Array.isArray(types) ? types.filter((x) => x.isActive) : [];
  const { data: divisions } = useQuery({ queryKey: ['divisions'], queryFn: () => divisionsApi.getAll() });
  const activeDivisions = Array.isArray(divisions) ? divisions.filter((d) => d.isActive) : [];
  const { data: regions } = useQuery({
    queryKey: ['dispatch-regions', 'active'],
    queryFn: () => dispatchRegionApi.getAll(false),
    enabled: creatingLocation,
  });
  // Premise default comes from the company profile (per-location, not a customer
  // type) — same as Add Customer. `premiseTouched` keeps a deliberate choice.
  const { data: tenantSettings } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.getSettings(),
    enabled: creatingLocation,
  });
  const defaultPremise: PremiseType = tenantSettings?.defaultPremiseType ?? 'BUSINESS';
  const effectivePremise = premiseTouched ? newCustomer.premise : defaultPremise;

  // Prefill the customer name for the restricted picker (from ?customerId).
  const { data: prefillCustomer } = useQuery({
    queryKey: ['customer', prefillCustomerId],
    queryFn: () => customerApi.getById(prefillCustomerId!),
    enabled: !!prefillCustomerId,
  });
  const restrictToCustomer = prefillCustomerId
    ? { id: prefillCustomerId, name: prefillCustomer?.name ?? '' }
    : null;

  // Prefill a specific location (from ?locationId) — preselect it once.
  const [prefillApplied, setPrefillApplied] = useState(false);
  const { data: prefillLocation } = useQuery({
    queryKey: ['service-location', prefillLocationId],
    queryFn: () => customerApi.getServiceLocationById(prefillLocationId!),
    enabled: !!prefillLocationId && !prefillApplied,
  });
  // Form initialization from async prefill data — the sanctioned use of
  // set-state-in-effect (see CLAUDE.md); it runs once and converges.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!prefillLocation || prefillApplied || selectedLocation) return;
    // Map the detail DTO onto the picker's search-result shape and preselect it.
    setSelectedLocation({
      id: prefillLocation.id,
      customerId: prefillLocation.customerId,
      customerName: prefillLocation.customerName,
      locationName: prefillLocation.locationName,
      address: prefillLocation.address,
      status: prefillLocation.status,
    });
    setPrefillApplied(true);
  }, [prefillLocation, prefillApplied, selectedLocation]);

  // Auto-select the only region so a single-region tenant never has to pick.
  useEffect(() => {
    if (creatingLocation && regions?.length === 1 && !dispatchRegionId) {
      setDispatchRegionId(regions[0].id);
    }
  }, [creatingLocation, regions, dispatchRegionId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // The resolved, real service location (existing mode only) — scopes equipment
  // and drives the rail's reference details.
  const activeLocationId = customerMode === 'existing' ? selectedLocation?.id ?? null : null;

  // Location detail for the rail (gate/access/pinned note/payer).
  const { data: locationDetail } = useQuery({
    queryKey: ['service-location', activeLocationId],
    queryFn: () => customerApi.getServiceLocationById(activeLocationId!),
    enabled: !!activeLocationId,
  });

  // Location equipment — shared cache key with WOEquipmentPicker; used to
  // resolve an attached id → name for the draft chip.
  const { data: locEquip } = useQuery({
    queryKey: ['equipment', { serviceLocationId: activeLocationId, forPicker: true }],
    queryFn: () => equipmentApi.list({ serviceLocationId: activeLocationId! }),
    enabled: !!activeLocationId,
  });
  const equipName = (id: string) => locEquip?.content.find((e) => e.id === id)?.name ?? null;

  // ── Validation ────────────────────────────────────────────────────────
  const newCustomerReady =
    newName.trim() !== '' &&
    // At least one reachable channel — neither is required on its own.
    contactChannelError(newCustomer.phone, newCustomer.email) === null &&
    // A separate payer has to be named AND have somewhere to receive the
    // invoice, or we'd mail it to the job site under a flag saying we didn't.
    (newCustomer.sameBilling ||
      (newCustomer.billingName.trim() !== '' &&
        newBillingAddress.streetAddress.trim() !== '' &&
        newBillingAddress.city.trim() !== '' &&
        newBillingAddress.state.trim() !== '' &&
        newBillingAddress.zipCode.trim() !== '' &&
        // The invoice has to reach the payer, not just be addressed to them.
        contactChannelError(newCustomer.billingContactPhone, newCustomer.billingContactEmail) === null)) &&
    newAddress.streetAddress.trim() !== '' &&
    newAddress.city.trim() !== '' &&
    newAddress.state.trim() !== '' &&
    newAddress.zipCode.trim() !== '' &&
    dispatchRegionId !== '';
  // A new property on a known account only needs the address — the customer is
  // already on file, so we never re-ask for their name, phone or email.
  const newLocationReady =
    !!createForCustomer &&
    // Every location is named — same rule as the Add Location page.
    newLocationName.trim() !== '' &&
    newAddress.streetAddress.trim() !== '' &&
    newAddress.city.trim() !== '' &&
    newAddress.state.trim() !== '' &&
    newAddress.zipCode.trim() !== '' &&
    dispatchRegionId !== '';
  const locationReady = customerMode === 'existing' ? !!selectedLocation : staged;
  const complaintDrafts = drafts.filter((d) => d.complaint.trim() !== '');
  const canSubmit = locationReady && !!workOrderTypeId && complaintDrafts.length > 0;

  // ── Create ──────────────────────────────────────────────────────────────
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  const buildWorkItems = (): CreateWorkItemRequest[] =>
    complaintDrafts.map((d) => ({
      description: d.complaint.trim(),
      equipmentId: d.equipmentId ?? undefined,
      // Only send the flag when the CSR explicitly said "no equipment needed".
      ...(d.equipmentNeeded === false ? { equipmentNeeded: false } : {}),
    }));

  const createMutation = useMutation({
    mutationFn: (request: CreateWorkOrderRequest) => workOrderApi.create(request),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
      showSuccess(t('common.form.successCreate', { entity: getName('work_order'), defaultValue: 'Work order created' }));
      navigate(`/work-orders/${created.id}`);
    },
    onError: (err) => {
      setCreatingCustomer(false);
      showError(t('common.form.errorCreate', { entity: getName('work_order') }), extractApiError(err) ?? undefined);
    },
  });

  const submitting = createMutation.isPending || creatingCustomer;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) {
      if (!workOrderTypeId) showError(`Pick a ${getName('work_order').toLowerCase()} type.`);
      else if (!locationReady)
        showError(
          `Pick a ${getName('service_location').toLowerCase()}, or add the new ${getName('customer').toLowerCase()} & ${getName('service_location').toLowerCase()}.`
        );
      else if (complaintDrafts.length === 0)
        showError(`Add at least one ${getName('work_item').toLowerCase()} with a complaint.`);
      return;
    }

    const base = {
      workOrderTypeId,
      divisionId: divisionId || undefined,
      priority,
      scheduledDate: scheduledDate || undefined,
      customerOrderNumber: customerOrderNumber.trim() || undefined,
      workItems: buildWorkItems(),
    };

    if (customerMode === 'existing' && selectedLocation) {
      createMutation.mutate({
        ...base,
        customerId: selectedLocation.customerId,
        serviceLocationId: selectedLocation.id,
      });
      return;
    }

    // New property on an existing account — create just the location under the
    // customer we already have, then the work order. Critically NOT a customer
    // create: reaching for that path here is what produces a duplicate account.
    if (customerMode === 'new-location' && createForCustomer) {
      setCreatingCustomer(true);
      try {
        const location = await customerApi.addServiceLocation(createForCustomer.id, {
          dispatchRegionId,
          locationName: newLocationName.trim(),
          premiseType: effectivePremise,
          address: newAddress,
        });
        queryClient.invalidateQueries({ queryKey: ['service-locations'] });
        queryClient.invalidateQueries({ queryKey: ['customer-service-locations', createForCustomer.id] });
        createMutation.mutate({ ...base, customerId: createForCustomer.id, serviceLocationId: location.id });
      } catch (err) {
        setCreatingCustomer(false);
        showError(
          t('common.form.errorCreate', { entity: getName('service_location') }),
          extractApiError(err) ?? undefined
        );
      }
      return;
    }

    // New customer & location — create the customer (with its first location)
    // first, then the work order against the returned ids.
    setCreatingCustomer(true);
    try {
      // Shared with Add Customer: when a separate party is billed, the bill-to
      // name becomes the CUSTOMER and the typed name demotes to the location.
      const customerRequest: CreateCustomerRequest = buildCustomerCreateRequest(
        { ...newCustomer, premise: effectivePremise },
        {
          serviceAddress: newAddress,
          billingAddress: newCustomer.sameBilling ? undefined : newBillingAddress,
          dispatchRegionId,
          contactNameTouched,
        }
      );
      const createdCustomer = await customerApi.create(customerRequest);
      const firstLocation = createdCustomer.serviceLocations[0];
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['service-locations'] });
      createMutation.mutate({ ...base, customerId: createdCustomer.id, serviceLocationId: firstLocation.id });
    } catch (err) {
      setCreatingCustomer(false);
      showError(t('common.form.errorCreate', { entity: getName('customer') }), extractApiError(err) ?? undefined);
    }
  };

  return (
    <AppLayout>
      <div className="px-1 py-1">
        <form onSubmit={handleSubmit}>
          <div className="mx-auto max-w-[1080px]">
            <Link
              to="/work-orders"
              className="mb-2.5 inline-flex items-center gap-1 text-[11.5px] text-fg-muted hover:text-fg-strong"
            >
              ← {getName('work_order', true)}
            </Link>

            {/* Header — title + primary actions (always visible, no sticky footer). */}
            <div className="mb-3.5 flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <Heading level={1} size="page-md" className="m-0">
                  {t('common.actions.add', { entity: getName('work_order') })}
                </Heading>
                <Text size="sm" tone="muted" className="mt-0.5">
                  Book a {getName('work_order').toLowerCase()} at a {getName('service_location').toLowerCase()}. Add
                  every problem the {getName('customer').toLowerCase()} is reporting as a separate{' '}
                  {getName('work_item').toLowerCase()}.
                </Text>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <Button href="/work-orders" plain size="xs">
                  {t('common.cancel')}
                </Button>
                <Button type="submit" color="accent" size="xs" disabled={!canSubmit || submitting}>
                  {submitting ? t('common.saving') : t('common.actions.add', { entity: getName('work_order') })}
                </Button>
              </div>
            </div>

            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              {/* ── Form column ── */}
              <div className="min-w-0 space-y-3.5">
                {/* Service location — the lead section; customer derives from it. */}
                <Card
                  title={<StepTitle n={1} complete={locationReady}>{getName('service_location')}</StepTitle>}
                  // One way out of the section, on the section itself — rather
                  // than a Cancel buried inside whichever panel is open.
                  action={
                    creatingLocation ? (
                      <Button
                        type="button"
                        plain
                        size="xxs"
                        onClick={() => {
                          setCreateForCustomer(null);
                          setStaged(false);
                          setCustomerMode('existing');
                        }}
                      >
                        {t('common.cancel')}
                      </Button>
                    ) : undefined
                  }
                >
                  {customerMode === 'existing' ? (
                    <ServiceLocationPicker
                      value={selectedLocation}
                      onChange={setSelectedLocation}
                      label={getName('service_location')}
                      // The numbered card header above already names this.
                      hideLabel
                      restrictToCustomer={restrictToCustomer}
                      // Entering from a customer record already answers "which
                      // account", so the restricted picker keeps its own shape.
                      searchFirst={
                        restrictToCustomer
                          ? undefined
                          : {
                              onCreateForCustomer: (c) => {
                                setCreateForCustomer(c);
                                setCustomerMode('new-location');
                              },
                              onCreateNewCustomer: () => setCustomerMode('new'),
                            }
                      }
                      required
                    />
                  ) : staged ? (
                    <StagedLocationRow
                      name={
                        customerMode === 'new-location'
                          ? newLocationName.trim()
                          : newCustomer.name.trim()
                      }
                      address={newAddress}
                      owner={customerMode === 'new-location' ? (createForCustomer?.name ?? null) : null}
                      pillLabel={
                        customerMode === 'new-location'
                          ? `New ${getName('service_location').toLowerCase()}`
                          : `New ${getName('customer').toLowerCase()}`
                      }
                      premise={effectivePremise}
                      onChange={() => setStaged(false)}
                    />
                  ) : customerMode === 'new-location' && createForCustomer ? (
                    <NewLocationFields
                      customer={createForCustomer}
                      onChangeAccount={() => {
                        setCreateForCustomer(null);
                        setCustomerMode('existing');
                      }}
                      ready={newLocationReady}
                      onCreate={() => setStaged(true)}
                      locationName={newLocationName}
                      setLocationName={setNewLocationName}
                      address={newAddress}
                      setAddress={setNewAddress}
                      premise={effectivePremise}
                      onPremiseChange={(v) => {
                        setPremiseTouched(true);
                        patchNewCustomer({ premise: v });
                      }}
                      dispatchRegionId={dispatchRegionId}
                      setDispatchRegionId={setDispatchRegionId}
                      regions={regions ?? []}
                    />
                  ) : (
                    <NewCustomerFields
                      ready={newCustomerReady}
                      onCreate={() => setStaged(true)}
                      model={{ ...newCustomer, premise: effectivePremise }}
                      setModel={patchNewCustomer}
                      contactNameTouched={contactNameTouched}
                      setContactNameTouched={setContactNameTouched}
                      address={newAddress}
                      setAddress={setNewAddress}
                      billingAddress={newBillingAddress}
                      setBillingAddress={setNewBillingAddress}
                      defaultPremise={defaultPremise}
                      onPremiseChange={(v) => {
                        setPremiseTouched(true);
                        patchNewCustomer({ premise: v });
                      }}
                      dispatchRegionId={dispatchRegionId}
                      setDispatchRegionId={setDispatchRegionId}
                      regions={regions ?? []}
                    />
                  )}
                </Card>

                {/* Job details — WO classification. */}
                <Card title={<StepTitle n={2} complete={!!workOrderTypeId}>Job details</StepTitle>}>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <Field size="xs">
                      <Label size="xs" required>
                        Type
                      </Label>
                      <Select
                        size="xs"
                        value={workOrderTypeId}
                        onChange={(e) => setWorkOrderTypeId(e.target.value)}
                        aria-label="Type"
                      >
                        <option value="">Select a type…</option>
                        {activeTypes.map((tx) => (
                          <option key={tx.id} value={tx.id}>
                            {tx.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field size="xs">
                      <Label size="xs">Division</Label>
                      <Select
                        size="xs"
                        value={divisionId}
                        onChange={(e) => setDivisionId(e.target.value)}
                        aria-label="Division"
                      >
                        <option value="">— None —</option>
                        {activeDivisions.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <div className="mt-2.5">
                    <MiniLabel>Priority</MiniLabel>
                    <div className="mt-1">
                      <ToggleGroup value={priority} onChange={setPriority} variant="joined" aria-label="Priority">
                        {PRIORITIES.map((p) => (
                          // Same tone the value gets as a pill on the rail and
                          // on list rows, so severity reads consistently.
                          <ToggleGroupOption key={p.value} value={p.value} tone={PRIORITY_TONE[p.value]}>
                            {p.label}
                          </ToggleGroupOption>
                        ))}
                      </ToggleGroup>
                    </div>
                  </div>
                </Card>

                {/* Work items — repeatable drafts. */}
                <Card
                  title={
                    <StepTitle n={3} complete={complaintDrafts.length > 0}>
                      {getName('work_item', true)}
                      <Pill tone="neutral">{drafts.length}</Pill>
                    </StepTitle>
                  }
                  action={
                    <Button type="button" outline size="xxs" onClick={addDraft}>
                      <PlusIcon data-slot="icon" />
                      {t('common.actions.add', { entity: getName('work_item') })}
                    </Button>
                  }
                  padding="none"
                >
                  {drafts.map((draft, i) => (
                    <WorkItemDraftCard
                      key={draft.key}
                      draft={draft}
                      index={i}
                      last={i === drafts.length - 1}
                      canRemove={drafts.length > 1}
                      serviceLocationId={activeLocationId}
                      workItemLabel={getName('work_item')}
                      equipmentLabel={getName('equipment')}
                      resolveEquipName={equipName}
                      onChange={(patch) => patchDraft(draft.key, patch)}
                      onRemove={() => removeDraft(draft.key)}
                    />
                  ))}
                </Card>

                {/* Scheduling — real API fields only (target date + PO#). The
                    trip/tech dispatch happens on the detail page after create. */}
                <Card title="Scheduling &amp; reference">
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <Field size="xs">
                      <Label size="xs">Target date</Label>
                      <Input
                        size="xs"
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        aria-label="Target date"
                      />
                    </Field>
                    <Field size="xs">
                      <Label size="xs">{getName('customer')} PO #</Label>
                      <Input
                        size="xs"
                        value={customerOrderNumber}
                        onChange={(e) => setCustomerOrderNumber(e.target.value)}
                        placeholder="Optional"
                        aria-label={`${getName('customer')} PO number`}
                      />
                    </Field>
                  </div>
                </Card>
              </div>

              {/* ── Summary rail — live summary + on-create read-back ── */}
              <aside className="space-y-3.5 lg:sticky lg:top-1">
                <IntakeRail
                  mode={customerMode}
                  newLocationName={newLocationName}
                  existingCustomerName={createForCustomer?.name ?? null}
                  selectedLocation={selectedLocation}
                  locationDetail={locationDetail}
                  newName={newName}
                  newAddress={newAddress}
                  typeName={activeTypes.find((tx) => tx.id === workOrderTypeId)?.name ?? null}
                  divisionName={activeDivisions.find((d) => d.id === divisionId)?.name ?? null}
                  priority={priority}
                  itemCount={complaintDrafts.length}
                />
                <OnCreateCard
                  mode={customerMode}
                  newName={newName}
                  existingCustomerName={createForCustomer?.name ?? null}
                  selectedLocation={selectedLocation}
                  itemCount={complaintDrafts.length}
                />
              </aside>
            </div>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}

// ── New customer & location — lightweight inline create ───────────────────
// Mirrors Add Customer's "don't over-ask" model: ONE name (a person OR a
// company) becomes both the customer and its first location — we never ask for
// a separate location name — and premise is a per-location default from the
// company profile, not a customer type. Full billing / advanced live on the
// Add Customer page for back-office enrichment.
// The existing account a new property hangs off. Confirms WHICH account before
// the CSR types an address — and Change is the way out if the picker matched
// the wrong same-named customer.
function AttachedAccount({
  customer,
  onChange,
}: {
  customer: CustomerSearchResult;
  onChange: () => void;
}) {
  const { getName } = useGlossary();
  // A true count from the customer's own locations — it's what distinguishes a
  // 12-site national account from a same-named single-site one.
  const { data: locations } = useQuery({
    queryKey: ['customer-service-locations', customer.id],
    queryFn: () => customerApi.getServiceLocations(customer.id),
    staleTime: 30000,
  });
  const count = locations?.length;

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-bg-elev-2 px-3 py-2">
      <span className="grid size-[34px] shrink-0 place-items-center rounded-lg bg-bg-active text-fg-muted">
        {customer.category === 'RESIDENTIAL' ? (
          <UserIcon className="size-[17px]" />
        ) : (
          <BuildingOffice2Icon className="size-[17px]" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold text-fg-strong">{customer.name}</span>
        <span className="mt-0.5 block truncate text-[11.5px] text-fg-muted">
          Existing {getName('customer').toLowerCase()}
          {count !== undefined
            ? ` · ${count} ${count === 1 ? getName('service_location').toLowerCase() : getName('service_location', true).toLowerCase()} on file`
            : ''}
        </span>
      </span>
      <button type="button" onClick={onChange} className="card-action shrink-0">
        Change
      </button>
    </div>
  );
}

// Footer for a create panel: what the button will do, and the button. Creating
// here rather than at submit means the record exists before the CSR moves on —
// which is what lets the summary rail fill in and the work-item equipment
// picker (scoped to a real service location) work at all.
function CreatePanelFoot({
  readback,
  label,
  disabled,
  onCreate,
}: {
  readback: string;
  label: string;
  disabled: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="mt-1 flex items-center justify-between gap-3 border-t border-border-soft pt-2.5">
      {/* Says plainly that pressing this writes nothing — the values are held
          in page state until the job is created, so a CSR who abandons a call
          leaves no record behind. */}
      <span className="text-[11.5px] text-fg-muted">
        {readback}
        <span className="text-fg-dim"> · saved when you create the job</span>
      </span>
      <Button type="button" size="xs" disabled={disabled} onClick={onCreate}>
        <CheckIcon className="size-3" />
        {label}
      </Button>
    </div>
  );
}

// A staged location — filled in, collapsed, NOT yet written. Mirrors the shape
// of the picker's collapsed row so the section reads the same whether the
// location was picked or typed, with a pill making the pending state explicit.
function StagedLocationRow({
  name,
  address,
  owner,
  pillLabel,
  premise,
  onChange,
}: {
  name: string;
  address: { streetAddress: string; city: string; state: string; zipCode: string };
  owner: string | null;
  pillLabel: string;
  premise: PremiseType;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const line = [
    titleCaseAddress(address.streetAddress),
    `${titleCaseAddress(address.city)}, ${address.state} ${address.zipCode}`.trim(),
    owner,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      type="button"
      onClick={onChange}
      className="flex w-full items-center gap-3 rounded-md border border-border bg-bg px-3 py-2 text-left transition-colors hover:border-border-strong hover:bg-bg-hover focus:outline-none focus-visible:border-accent-500"
    >
      <span className="grid size-[34px] shrink-0 place-items-center rounded-lg bg-bg-active text-fg-muted">
        {premise === 'RESIDENCE' ? <HomeIcon className="size-[17px]" /> : <BuildingOffice2Icon className="size-[17px]" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] font-bold text-fg-strong">{name}</span>
          <Pill tone="success" dot>
            {pillLabel}
          </Pill>
        </span>
        <span className="mt-0.5 block truncate text-[11.5px] text-fg-muted">{line}</span>
      </span>
      <span className="card-action shrink-0">{t('common.edit')}</span>
    </button>
  );
}

// Panel heading. Cancel is NOT here — it lives on the section card header,
// where the mock puts it, so there's one way out of the section rather than a
// control the CSR has to hunt for inside the panel.
function CreatePanelHead({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3 border-b border-border-soft pb-2">
      <span className="text-[12.5px] font-semibold text-fg-strong">{children}</span>
      {hint && <span className="text-[11px] text-fg-dim">{hint}</span>}
    </div>
  );
}

// A new property on an account we already have. Deliberately does NOT re-ask
// for name / phone / email — the customer is on file, and asking again is both
// wasted keystrokes on a live call and the road to a duplicate account.
function NewLocationFields({
  customer,
  onChangeAccount,
  ready,
  onCreate,
  locationName,
  setLocationName,
  address,
  setAddress,
  premise,
  onPremiseChange,
  dispatchRegionId,
  setDispatchRegionId,
  regions,
}: {
  customer: CustomerSearchResult;
  onChangeAccount: () => void;
  ready: boolean;
  onCreate: () => void;
  locationName: string;
  setLocationName: (v: string) => void;
  address: { streetAddress: string; city: string; state: string; zipCode: string };
  setAddress: (v: { streetAddress: string; city: string; state: string; zipCode: string }) => void;
  premise: PremiseType;
  onPremiseChange: (v: PremiseType) => void;
  dispatchRegionId: string;
  setDispatchRegionId: (v: string) => void;
  regions: { id: string; name: string }[];
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const hasRegions = regions.length > 0;
  const set = (patch: Partial<typeof address>) => setAddress({ ...address, ...patch });
  // Name examples are persona-ordered by the tenant default premise: same two
  // examples, the likely one first (matches AddLocationPage verbatim).
  // Scoped to a known account, so the guidance follows the SITE's premise
  // rather than the tenant default, and closes with who gets invoiced — the
  // fact that most often makes a CSR pause on a multi-site account.
  const customerName = customer.name;
  const residence = premise === 'RESIDENCE';
  const namePlaceholder = residence ? 'Avila' : 'Red Lobster #123';
  const nameHelper = residence
    ? `The homeowner’s name. Invoices go to ${customerName}.`
    : `The store or building — not the parent company. Invoices go to ${customerName}.`;
  return (
    <div className="space-y-2.5">
      {/* Just what this is. Which account is the card's job, right below, and
          the footer states it again where the CSR commits — naming it here too
          made it three times in one panel. */}
      <CreatePanelHead hint="just enough to start — enrich later">
        New {getName('service_location').toLowerCase()}
      </CreatePanelHead>

      {/* The account this hangs off, shown as a row rather than left implicit
          in the heading. It's the anti-duplicate affordance made visible: the
          CSR can see they're adding to an EXISTING account, and Change is the
          way out if it's the wrong one. */}
      <AttachedAccount customer={customer} onChange={onChangeAccount} />

      {/* Identity before address, and required — same as the Add Location page.
          Premise rides the label row (as on the new-customer panel) because a
          property manager can own residential rentals: the account's kind does
          not decide the site's. */}
      <Field size="xs">
        <div className="mb-1 flex items-center justify-between gap-3">
          <Label size="xs" required>
            {t('common.form.locationName', { entity: getName('service_location') })}
          </Label>
          <ToggleGroup value={premise} onChange={onPremiseChange} size="sm" aria-label="Premise">
            <ToggleGroupOption value="RESIDENCE" tone="success">
              <HomeIcon className="size-3" />
              Residence
            </ToggleGroupOption>
            <ToggleGroupOption value="BUSINESS" tone="info">
              <BuildingOffice2Icon className="size-3" />
              Business
            </ToggleGroupOption>
          </ToggleGroup>
        </div>
        <Input
          size="xs"
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          placeholder={namePlaceholder}
        />
        <Text size="xs" tone="muted" className="mt-1">
          {nameHelper}
        </Text>
      </Field>

      <Field size="xs">
        <Label size="xs" required>
          Street address
        </Label>
        <Input size="xs" value={address.streetAddress} onChange={(e) => set({ streetAddress: e.target.value })} placeholder="123 Main St" />
      </Field>
      {/* Same 12-column split as Add Customer's AddressBlock. */}
      <div className="grid grid-cols-12 gap-2">
        <Field size="xs" className={hasRegions ? 'col-span-4' : 'col-span-6'}>
          <Label size="xs" required>
            City
          </Label>
          <Input size="xs" value={address.city} onChange={(e) => set({ city: e.target.value })} placeholder="Chandler" />
        </Field>
        <Field size="xs" className="col-span-2">
          <Label size="xs" required>
            State
          </Label>
          <Input size="xs" value={address.state} onChange={(e) => set({ state: e.target.value.toUpperCase() })} maxLength={2} placeholder="AZ" />
        </Field>
        <Field size="xs" className={hasRegions ? 'col-span-2' : 'col-span-4'}>
          <Label size="xs" required>
            ZIP
          </Label>
          <Input size="xs" value={address.zipCode} onChange={(e) => set({ zipCode: e.target.value })} placeholder="85224" />
        </Field>
        {hasRegions && (
          <Field size="xs" className="col-span-4">
            <Label size="xs" required>
              Region
            </Label>
            <Select size="xs" value={dispatchRegionId} onChange={(e) => setDispatchRegionId(e.target.value)} aria-label="Region">
              <option value="">Select…</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <CreatePanelFoot
        readback={`Adds this ${getName('service_location').toLowerCase()} to ${customerName}`}
        label={`Use this ${getName('service_location').toLowerCase()}`}
        disabled={!ready}
        onCreate={onCreate}
      />
    </div>
  );
}

function NewCustomerFields({
  ready,
  onCreate,
  model,
  setModel,
  contactNameTouched,
  setContactNameTouched,
  address,
  setAddress,
  billingAddress,
  setBillingAddress,
  defaultPremise,
  onPremiseChange,
  dispatchRegionId,
  setDispatchRegionId,
  regions,
}: {
  ready: boolean;
  onCreate: () => void;
  model: CustomerCreateModel;
  setModel: (patch: Partial<CustomerCreateModel>) => void;
  contactNameTouched: boolean;
  setContactNameTouched: (v: boolean) => void;
  address: { streetAddress: string; city: string; state: string; zipCode: string };
  setAddress: (v: { streetAddress: string; city: string; state: string; zipCode: string }) => void;
  billingAddress: { streetAddress: string; city: string; state: string; zipCode: string };
  setBillingAddress: (v: { streetAddress: string; city: string; state: string; zipCode: string }) => void;
  defaultPremise: PremiseType;
  onPremiseChange: (v: PremiseType) => void;
  dispatchRegionId: string;
  setDispatchRegionId: (v: string) => void;
  regions: { id: string; name: string }[];
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const hasRegions = regions.length > 0;
  const set = (patch: Partial<typeof address>) => setAddress({ ...address, ...patch });
  const setBilling = (patch: Partial<typeof billingAddress>) => setBillingAddress({ ...billingAddress, ...patch });
  const guidance = nameGuidance(model.premise);
  const billingContactErr = contactChannelError(model.billingContactPhone, model.billingContactEmail);
  // Mirrors the household name into the contact until someone personalizes it.
  const effectiveContactName = resolveContactName(model, contactNameTouched);
  const contactError = contactChannelError(model.phone, model.email);

  return (
    <div className="space-y-2.5">
      {/* Named for what the panel ASKS for, not everything it creates. The
          first field below is the site's name (it becomes locationName; the
          customer name derives from it), so a "new customer" heading points a
          CSR at the wrong thing. That a customer is created too is stated in
          the footer read-back and in the rail's on-create list.

          The sibling panel is distinguished by its account card, not by a noun
          here — that card is a far louder signal than a heading word. */}
      <CreatePanelHead hint="just enough to start — enrich later">
        New {getName('service_location').toLowerCase()}
      </CreatePanelHead>

      {/* Premise rides on the Name label row because it decides what "Name"
          MEANS — a household vs a specific site. Below the field it would ask
          the CSR to re-read what they just typed. */}
      <Field size="xs">
        <div className="mb-1 flex items-center justify-between gap-3">
          <Label size="xs" required hint={guidance.hint ?? undefined}>
            {t('common.form.locationName', { entity: getName('service_location') })}
          </Label>
          <ToggleGroup value={model.premise} onChange={onPremiseChange} size="sm" aria-label="Premise">
            <ToggleGroupOption value="RESIDENCE" tone="success">
              <HomeIcon className="size-3" />
              Residence
            </ToggleGroupOption>
            <ToggleGroupOption value="BUSINESS" tone="info">
              <BuildingOffice2Icon className="size-3" />
              Business
            </ToggleGroupOption>
          </ToggleGroup>
        </div>
        <Input
          size="xs"
          value={model.name}
          onChange={(e) => setModel({ name: e.target.value })}
          placeholder={guidance.placeholder}
        />
        <Text size="xs" tone="dim" className="mt-1">
          Default is {defaultPremise === 'BUSINESS' ? 'Business' : 'Residence'} · set in Company profile.
        </Text>
      </Field>

      <Field size="xs">
        <Label size="xs" required>
          Street address
        </Label>
        <Input
          size="xs"
          value={address.streetAddress}
          onChange={(e) => set({ streetAddress: e.target.value })}
          placeholder="4821 E Indian School Rd"
        />
      </Field>
      {/* Same 12-column split as Add Customer's AddressBlock: Region rides the
          city/state/ZIP row, and the row re-widens when a tenant has none. */}
      <div className="grid grid-cols-12 gap-2">
        <Field size="xs" className={hasRegions ? 'col-span-4' : 'col-span-6'}>
          <Label size="xs" required>
            City
          </Label>
          <Input size="xs" value={address.city} onChange={(e) => set({ city: e.target.value })} placeholder="Phoenix" />
        </Field>
        <Field size="xs" className="col-span-2">
          <Label size="xs" required>
            State
          </Label>
          <Input size="xs" value={address.state} onChange={(e) => set({ state: e.target.value.toUpperCase() })} maxLength={2} placeholder="AZ" />
        </Field>
        <Field size="xs" className={hasRegions ? 'col-span-2' : 'col-span-4'}>
          <Label size="xs" required>
            ZIP
          </Label>
          <Input size="xs" value={address.zipCode} onChange={(e) => set({ zipCode: e.target.value })} placeholder="85018" />
        </Field>
        {hasRegions && (
          <Field size="xs" className="col-span-4">
            <Label size="xs" required>
              Region
            </Label>
            <Select size="xs" value={dispatchRegionId} onChange={(e) => setDispatchRegionId(e.target.value)} aria-label="Region">
              <option value="">Select…</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <div className="pt-1">
        <div className="mb-1.5 text-[10px] font-bold tracking-[0.05em] text-fg-muted uppercase">Contact</div>
        <Field size="xs">
          <Label size="xs" hint="who we ask for">
            Contact name
          </Label>
          <Input
            size="xs"
            value={effectiveContactName}
            onChange={(e) => {
              setContactNameTouched(true);
              setModel({ contactName: e.target.value });
            }}
            placeholder="Tanya Avila"
          />
        </Field>
        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
          <Field size="xs">
            <Label size="xs">Phone</Label>
            <Input
              size="xs"
              type="tel"
              value={model.phone}
              onChange={(e) => setModel({ phone: e.target.value })}
              placeholder="(602) 555-0100"
            />
          </Field>
          <Field size="xs">
            <Label size="xs">Email</Label>
            <Input
              size="xs"
              type="email"
              value={model.email}
              onChange={(e) => setModel({ email: e.target.value })}
              placeholder="name@example.com"
            />
          </Field>
        </div>
        {/* Neither channel is required on its own; having none is what's
            invalid, so the rule is stated once under the pair. */}
        {contactError ? (
          <p className="mt-1 text-[11px] text-danger-500">{contactError}</p>
        ) : (
          <Text size="xs" tone="dim" className="mt-1">
            At least one — we send confirmations and invoices through them.
          </Text>
        )}
      </div>

      {/* Who pays. Defaulted on, because the common case is that the caller is
          the payer — the checkbox exists for the franchise / property-manager
          / corporate-AP case, and unchecking it re-points the whole record. */}
      <label
        className="flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 transition-colors"
        style={
          model.sameBilling
            ? {
                borderColor: 'color-mix(in oklch, var(--accent-500) 30%, var(--border))',
                background: 'color-mix(in oklch, var(--accent-500) 6%, transparent)',
              }
            : { borderColor: 'var(--border)', background: 'var(--bg-elev-2)' }
        }
      >
        <Checkbox
          color="accent"
          // The visible text sits in a sibling span, so the control needs its
          // own name — a bare <label> around a non-input doesn't associate.
          aria-label="Bill this customer directly"
          checked={model.sameBilling}
          onChange={(v) =>
            setModel({
              sameBilling: v,
              // Seed the bill-to name from the top name when splitting off, so
              // "same party, different mailing address" needs no retype.
              billingName: !v && !model.billingName.trim() ? model.name.trim() : model.billingName,
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

      {/* Following the mock's BillingBlock: who pays, where the invoice is
          mailed, then how it's delivered. */}
      {!model.sameBilling && (
        <div className="space-y-2.5 border-t border-dashed border-border-soft pt-2.5">
          <Field size="xs">
            <Label size="xs" required hint="the company that pays">
              Bill to
            </Label>
            <Input
              size="xs"
              value={model.billingName}
              onChange={(e) => setModel({ billingName: e.target.value })}
              placeholder="Darden Restaurants"
            />
          </Field>
          <Field size="xs">
            <Label size="xs" required>
              Billing street address
            </Label>
            <Input
              size="xs"
              value={billingAddress.streetAddress}
              onChange={(e) => setBilling({ streetAddress: e.target.value })}
              placeholder="1000 Darden Center Dr"
            />
          </Field>
          <div className="grid grid-cols-12 gap-2">
            <Field size="xs" className="col-span-6">
              <Label size="xs" required>
                City
              </Label>
              <Input size="xs" value={billingAddress.city} onChange={(e) => setBilling({ city: e.target.value })} placeholder="Orlando" />
            </Field>
            <Field size="xs" className="col-span-2">
              <Label size="xs" required>
                State
              </Label>
              <Input
                size="xs"
                value={billingAddress.state}
                onChange={(e) => setBilling({ state: e.target.value.toUpperCase() })}
                maxLength={2}
                placeholder="FL"
              />
            </Field>
            <Field size="xs" className="col-span-4">
              <Label size="xs" required>
                ZIP
              </Label>
              <Input size="xs" value={billingAddress.zipCode} onChange={(e) => setBilling({ zipCode: e.target.value })} placeholder="32837" />
            </Field>
          </div>
          <div className="border-t border-border-soft pt-2.5">
            {/* No AP contact name: accounts payable is a department, not a
                person we ask for — the channel is the whole requirement. */}
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Field size="xs">
                <Label size="xs">Billing phone</Label>
                <Input
                  size="xs"
                  type="tel"
                  value={model.billingContactPhone}
                  onChange={(e) => setModel({ billingContactPhone: e.target.value })}
                />
              </Field>
              <Field size="xs">
                <Label size="xs">Billing email</Label>
                <Input
                  size="xs"
                  type="email"
                  value={model.billingContactEmail}
                  onChange={(e) => setModel({ billingContactEmail: e.target.value })}
                />
              </Field>
            </div>
            {billingContactErr ? (
              <p className="mt-1 text-[11px] text-danger-500">{billingContactErr}</p>
            ) : (
              <Text size="xs" tone="dim" className="mt-1">
                At least one — this is where we send the invoice.
              </Text>
            )}
          </div>
          <Text size="xs" tone="dim">
            “{model.billingName.trim() || 'The name above'}” becomes the {'customer'}; “
            {model.name.trim() || 'the name at the top'}” names the location.
          </Text>
        </div>
      )}
      <CreatePanelFoot
        readback={`Adds this ${getName('customer').toLowerCase()} and their first ${getName('service_location').toLowerCase()}`}
        label={`Use this ${getName('customer').toLowerCase()}`}
        disabled={!ready}
        onCreate={onCreate}
      />
    </div>
  );
}

// ── Work-item draft — complaint + optional equipment ──────────────────────
function WorkItemDraftCard({
  draft,
  index,
  last,
  canRemove,
  serviceLocationId,
  workItemLabel,
  equipmentLabel,
  resolveEquipName,
  onChange,
  onRemove,
}: {
  draft: Draft;
  index: number;
  last: boolean;
  canRemove: boolean;
  serviceLocationId: string | null;
  workItemLabel: string;
  equipmentLabel: string;
  resolveEquipName: (id: string) => string | null;
  onChange: (patch: Partial<Draft>) => void;
  onRemove: () => void;
}) {
  const queryClient = useQueryClient();
  const { getName } = useGlossary();
  const [quickBusy, setQuickBusy] = useState(false);

  const attach = (id: string, name: string | null) =>
    onChange({ equipmentId: id, equipmentName: name, equipmentNeeded: true, ui: 'idle', quickName: '' });

  // Name-only quick-add (the mock's "air conditioner" case). Real records —
  // make/model/serial/specs — are created on site from the WO detail card.
  const quickAdd = async () => {
    const name = draft.quickName.trim();
    if (!name || !serviceLocationId || quickBusy) return;
    setQuickBusy(true);
    try {
      const created = await equipmentApi.create({ name, serviceLocationId });
      queryClient.invalidateQueries({ queryKey: ['equipment', { serviceLocationId, forPicker: true }] });
      attach(created.id, created.name);
    } catch (err) {
      showError('Couldn’t add equipment', extractApiError(err) ?? undefined);
    } finally {
      setQuickBusy(false);
    }
  };

  const attachedName = draft.equipmentId ? draft.equipmentName ?? resolveEquipName(draft.equipmentId) : null;

  return (
    <div className={`px-3.5 py-3 ${last ? '' : 'border-b border-border-soft'}`}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] font-semibold text-fg-dim">{String(index + 1).padStart(2, '0')}</span>
        <span className="text-[12px] font-semibold text-fg-strong">{workItemLabel}</span>
        <span className="flex-1" />
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${workItemLabel} ${index + 1}`}
            className="rounded p-0.5 text-fg-dim hover:bg-bg-hover hover:text-fg-strong"
          >
            <XMarkIcon className="size-4" />
          </button>
        )}
      </div>

      <div className="mt-2">
        <Field size="xs">
          <Label size="xs">Complaint · in the {getName('customer').toLowerCase()}’s words</Label>
          <Input
            size="xs"
            value={draft.complaint}
            onChange={(e) => onChange({ complaint: e.target.value })}
            placeholder="e.g. No cooling upstairs"
            aria-label={`Complaint ${index + 1}`}
          />
        </Field>
      </div>

      {/* Equipment — only when a real, existing location is picked (needs its id
          to list candidates + create against). Brand-new callers rarely have
          equipment on file; the tech attaches it on site. */}
      {serviceLocationId && (
        <div className="mt-2">
          {attachedName ? (
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className="text-fg-dim">{equipmentLabel}:</span>
              <span className="font-semibold text-fg-strong">{attachedName}</span>
              <button
                type="button"
                className="card-action"
                onClick={() => onChange({ equipmentId: null, equipmentName: null, ui: 'picking' })}
              >
                Change
              </button>
            </div>
          ) : draft.equipmentNeeded === false ? (
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className="text-fg-dim">No {equipmentLabel.toLowerCase()} needed</span>
              <button type="button" className="card-action" onClick={() => onChange({ equipmentNeeded: true, ui: 'picking' })}>
                Undo
              </button>
            </div>
          ) : draft.ui === 'quickadd' ? (
            <div className="rounded-sm border border-border bg-bg-elev-2 p-2.5">
              <MiniLabel>New {equipmentLabel.toLowerCase()} · name only</MiniLabel>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  size="xs"
                  autoFocus
                  value={draft.quickName}
                  onChange={(e) => onChange({ quickName: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void quickAdd();
                    }
                  }}
                  placeholder="e.g. Air conditioner"
                  aria-label="New equipment name"
                />
                <Button type="button" color="accent" size="xxs" disabled={!draft.quickName.trim() || quickBusy} onClick={() => void quickAdd()}>
                  <CheckIcon data-slot="icon" />
                  Add
                </Button>
                <Button type="button" plain size="xxs" onClick={() => onChange({ ui: 'picking', quickName: '' })}>
                  Cancel
                </Button>
              </div>
              <Text size="xs" tone="dim" className="mt-1">
                Make, model, serial and specs get added on site.
              </Text>
            </div>
          ) : draft.ui === 'picking' ? (
            <WOEquipmentPicker
              serviceLocationId={serviceLocationId}
              value={draft.equipmentId}
              onPick={(id) => {
                if (id) attach(id, resolveEquipName(id));
                else onChange({ equipmentId: null, equipmentName: null });
              }}
              onAddNew={() => onChange({ ui: 'quickadd' })}
              addNewLabel={`Add new ${equipmentLabel.toLowerCase()} — name only`}
              onCancel={() => onChange({ ui: 'idle' })}
              onNotNeeded={() => onChange({ equipmentNeeded: false, equipmentId: null, equipmentName: null, ui: 'idle' })}
            />
          ) : (
            <button type="button" className="card-action" onClick={() => onChange({ ui: 'picking' })}>
              <PlusIcon className="size-3" />
              Attach {equipmentLabel.toLowerCase()} · optional
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Live summary rail ─────────────────────────────────────────────────────
function IntakeRail({
  mode,
  selectedLocation,
  locationDetail,
  newName,
  newLocationName,
  existingCustomerName,
  newAddress,
  typeName,
  divisionName,
  priority,
  itemCount,
}: {
  mode: 'existing' | 'new-location' | 'new';
  selectedLocation: ServiceLocationSearchResult | null;
  locationDetail: ServiceLocationDetailDto | undefined;
  newName: string;
  newLocationName: string;
  existingCustomerName: string | null;
  newAddress: { streetAddress: string; city: string; state: string; zipCode: string };
  typeName: string | null;
  divisionName: string | null;
  priority: WorkOrderPriority;
  itemCount: number;
}) {
  const { getName } = useGlossary();
  // The site is new in both create paths; only one of them also creates the
  // customer. Keeping those separate is what lets the rail say "billed to
  // Darden" while the property itself is brand new.
  const isNewSite = mode !== 'existing';
  const isNewCustomer = mode === 'new';
  // One name is both the site and the payer for a brand-new caller. On a known
  // account the site may be unnamed, in which case it reads as the account.
  const name = isNewCustomer
    ? newName
    : mode === 'new-location'
      ? newLocationName.trim() || existingCustomerName
      : selectedLocation?.locationName || selectedLocation?.customerName;
  const address = isNewSite ? newAddress : selectedLocation?.address;
  const customerName = isNewCustomer
    ? newName
    : mode === 'new-location'
      ? existingCustomerName
      : selectedLocation?.customerName;
  // Only say who's billed when that's a DIFFERENT party from the site already
  // named above. When a location is named for its customer the line just repeats
  // the headline, and asking a CSR to notice that the two are the same is the
  // kind of noise that makes them start checking every time. Same rule the
  // collapsed picker row uses to decide whether the owner earns a slot.
  const billedTo = customerName && customerName !== name ? customerName : null;
  const pinnedNote = locationDetail?.notes?.find((n) => n.pinned) ?? locationDetail?.notes?.[0];
  const facts = locationDetail?.arrivalFacts ?? [];
  const hasLocation = isNewCustomer ? !!newName : mode === 'new-location' ? !!existingCustomerName : !!selectedLocation;

  const line2 = address
    ? `${titleCaseAddress(address.streetAddress)} · ${titleCaseAddress(address.city)}, ${address.state} ${address.zipCode}`.trim()
    : null;

  return (
    <Card title="Job summary">
      {!hasLocation ? (
        <Text size="sm" tone="muted">
          Pick a {getName('service_location').toLowerCase()} to see who’s billed and how to get on
          site.
        </Text>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className="text-[14px] font-bold text-fg-strong">
              {name || `New ${getName('service_location').toLowerCase()}`}
            </span>
            {isNewSite && (
              <Pill tone="success" dot>
                {isNewCustomer ? 'New' : `New ${getName('service_location').toLowerCase()}`}
              </Pill>
            )}
          </div>
          {line2 && <div className="mt-0.5 text-[11.5px] text-fg-muted">{line2}</div>}
          {billedTo && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px]">
              <span className="font-semibold text-fg-strong">{billedTo}</span>
              <span className="text-fg-dim">billed</span>
            </div>
          )}

          {pinnedNote && (
            <div
              className="mt-2.5 rounded-sm border-l-[3px] px-2.5 py-1.5 text-[11px] leading-relaxed text-fg"
              style={{
                borderColor: 'var(--warning-500)',
                background: 'color-mix(in oklch, var(--warning-500) 9%, var(--bg-elev))',
              }}
            >
              {pinnedNote.body}
            </div>
          )}

          {(facts.length > 0 || locationDetail?.accessInstructions) && (
            <div className="mt-2 space-y-0.5 text-[11px] text-fg-muted">
              {facts.slice(0, 3).map((f) => (
                <div key={f.id}>
                  <span className="text-fg-dim">{f.label}</span> · <span className={f.mono ? 'font-mono' : ''}>{f.value}</span>
                </div>
              ))}
              {locationDetail?.accessInstructions && (
                <div>
                  <span className="text-fg-dim">Access</span> · {locationDetail.accessInstructions}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="my-3 border-t border-border-soft" />

      <dl className="space-y-1 text-[12px]">
        <RailRow label="Type" value={typeName} />
        <RailRow label="Division" value={divisionName} />
        <RailRow
          label="Priority"
          value={
            <Pill tone={PRIORITY_TONE[priority]} dot>
              {PRIORITIES.find((p) => p.value === priority)?.label}
            </Pill>
          }
        />
        <RailRow label="Work items" value={String(itemCount)} />
      </dl>
    </Card>
  );
}

// ── "On create we'll…" — a plain-language read-back so the CSR can confirm
// exactly what the button does before committing. Only lists what actually
// happens today: create the customer/location (when new) + the work order in
// Triage. No dispatch/SMS lines — those aren't wired at intake yet, so
// promising them here would be a lie.
function OnCreateCard({
  mode,
  newName,
  existingCustomerName,
  selectedLocation,
  itemCount,
}: {
  mode: 'existing' | 'new-location' | 'new';
  newName: string;
  existingCustomerName: string | null;
  selectedLocation: ServiceLocationSearchResult | null;
  itemCount: number;
}) {
  const { getName } = useGlossary();
  const customerWord = getName('customer').toLowerCase();
  const locationWord = getName('service_location').toLowerCase();

  const lines: string[] = [];
  if (mode === 'new') {
    lines.push(`Create the ${customerWord}${newName.trim() ? ` ${newName.trim()}` : ''}`);
    lines.push(`Create their first ${locationWord}`);
  }
  // Says the quiet part out loud: this path adds a property to an account that
  // already exists, and does NOT create a second copy of that customer.
  if (mode === 'new-location') {
    lines.push(`Add a new ${locationWord} to ${existingCustomerName ?? `the selected ${customerWord}`}`);
  }
  lines.push(
    `Create the ${getName('work_order').toLowerCase()} with ${itemCount || 'no'} ${itemCount === 1 ? 'item' : 'items'} in Triage — number assigned on save`
  );
  lines.push(
    mode === 'existing' && selectedLocation
      ? `Attach it to ${selectedLocation.customerName}`
      : mode === 'new-location' && existingCustomerName
        ? `Bill it to ${existingCustomerName}`
        : `Land you on the ${getName('work_order').toLowerCase()} to schedule & dispatch`
  );

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <BoltIcon className="size-3.5 text-fg-muted" />
          On create we’ll
        </span>
      }
    >
      <div className="flex flex-col gap-2">
        {lines.map((s, i) => (
          <div key={i} className="flex items-start gap-2 text-[12px] text-fg">
            <span
              className="mt-px grid size-[15px] shrink-0 place-items-center rounded-full text-[9px] font-bold text-success-500"
              style={{ background: 'color-mix(in oklch, var(--success-500) 16%, var(--bg-elev))' }}
            >
              ✓
            </span>
            <span className="leading-relaxed">{s}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function RailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-fg-strong">{value ?? <span className="text-fg-dim">—</span>}</dd>
    </div>
  );
}
