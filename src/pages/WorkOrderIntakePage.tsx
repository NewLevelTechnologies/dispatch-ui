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
  type CreateCustomerRequest,
  type CreateWorkItemRequest,
  type ServiceLocationSearchResult,
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
import { Card } from '../components/catalyst/card';
import { Button } from '../components/catalyst/button';
import { Field, Label } from '../components/catalyst/fieldset';
import { Input } from '../components/catalyst/input';
import { Select } from '../components/catalyst/select';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { ToggleGroup, ToggleGroupOption } from '../components/ui/ToggleGroup';
import { Pill } from '../components/ui/Pill';
import { PlusIcon, XMarkIcon, CheckIcon } from '@heroicons/react/24/outline';

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
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>('existing');
  const [selectedLocation, setSelectedLocation] = useState<ServiceLocationSearchResult | null>(null);

  // New customer + location — lightweight ("just enough to start; enrich later").
  // Mirrors Add Customer's model so we don't over-ask: ONE name (a person OR a
  // company) seeds both the customer and its first location — never a separate
  // "location name" — and premise defaults from the company profile.
  const [newName, setNewName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [newAddress, setNewAddress] = useState({ ...blankAddress });
  const [premise, setPremise] = useState<PremiseType>('BUSINESS');
  const [premiseTouched, setPremiseTouched] = useState(false);
  const [dispatchRegionId, setDispatchRegionId] = useState('');

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
    enabled: customerMode === 'new',
  });
  // Premise default comes from the company profile (per-location, not a customer
  // type) — same as Add Customer. `premiseTouched` keeps a deliberate choice.
  const { data: tenantSettings } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.getSettings(),
    enabled: customerMode === 'new',
  });
  const defaultPremise: PremiseType = tenantSettings?.defaultPremiseType ?? 'BUSINESS';
  const effectivePremise = premiseTouched ? premise : defaultPremise;

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
    if (customerMode === 'new' && regions?.length === 1 && !dispatchRegionId) {
      setDispatchRegionId(regions[0].id);
    }
  }, [customerMode, regions, dispatchRegionId]);
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
    phone.trim() !== '' &&
    email.trim() !== '' &&
    newAddress.streetAddress.trim() !== '' &&
    newAddress.city.trim() !== '' &&
    newAddress.state.trim() !== '' &&
    newAddress.zipCode.trim() !== '' &&
    dispatchRegionId !== '';
  const locationReady = customerMode === 'existing' ? !!selectedLocation : newCustomerReady;
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
      if (!workOrderTypeId) showError('Pick a work order type.');
      else if (!locationReady) showError('Pick a service location, or add the new customer & location.');
      else if (complaintDrafts.length === 0) showError('Add at least one work item with a complaint.');
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

    // New customer & location — create the customer (with its first location)
    // first, then the work order against the returned ids.
    setCreatingCustomer(true);
    try {
      const customerRequest: CreateCustomerRequest = {
        name: newName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        billingAddress: newAddress,
        billingAddressSameAsService: true,
        serviceLocations: [
          {
            dispatchRegionId,
            // One name seeds both records — the first location isn't asked for
            // separately (same as Add Customer).
            locationName: newName.trim(),
            premiseType: effectivePremise,
            address: newAddress,
          },
        ],
      };
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
                  every problem the customer is reporting as a separate {getName('work_item').toLowerCase()}.
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
                <Card title={getName('service_location')}>
                  <div className="mb-2.5">
                    <ToggleGroup value={customerMode} onChange={setCustomerMode} aria-label="Customer">
                      <ToggleGroupOption value="existing">Existing</ToggleGroupOption>
                      <ToggleGroupOption value="new">New customer &amp; location</ToggleGroupOption>
                    </ToggleGroup>
                  </div>

                  {customerMode === 'existing' ? (
                    <ServiceLocationPicker
                      value={selectedLocation}
                      onChange={setSelectedLocation}
                      label={getName('service_location')}
                      restrictToCustomer={restrictToCustomer}
                      required
                    />
                  ) : (
                    <NewCustomerFields
                      name={newName}
                      setName={setNewName}
                      phone={phone}
                      setPhone={setPhone}
                      email={email}
                      setEmail={setEmail}
                      address={newAddress}
                      setAddress={setNewAddress}
                      premise={effectivePremise}
                      defaultPremise={defaultPremise}
                      onPremiseChange={(v) => {
                        setPremiseTouched(true);
                        setPremise(v);
                      }}
                      dispatchRegionId={dispatchRegionId}
                      setDispatchRegionId={setDispatchRegionId}
                      regions={regions ?? []}
                    />
                  )}
                </Card>

                {/* Job details — WO classification. */}
                <Card title="Details">
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
                      <ToggleGroup value={priority} onChange={setPriority} aria-label="Priority">
                        {PRIORITIES.map((p) => (
                          <ToggleGroupOption key={p.value} value={p.value}>
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
                    <span className="flex items-center gap-2">
                      {getName('work_item', true)}
                      <Pill tone="neutral">{drafts.length}</Pill>
                    </span>
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
                      <Label size="xs">Customer PO #</Label>
                      <Input
                        size="xs"
                        value={customerOrderNumber}
                        onChange={(e) => setCustomerOrderNumber(e.target.value)}
                        placeholder="Optional"
                        aria-label="Customer PO number"
                      />
                    </Field>
                  </div>
                </Card>
              </div>

              {/* ── Summary rail ── */}
              <aside className="lg:sticky lg:top-1">
                <IntakeRail
                  mode={customerMode}
                  selectedLocation={selectedLocation}
                  locationDetail={locationDetail}
                  newName={newName}
                  newAddress={newAddress}
                  premise={effectivePremise}
                  typeName={activeTypes.find((tx) => tx.id === workOrderTypeId)?.name ?? null}
                  divisionName={activeDivisions.find((d) => d.id === divisionId)?.name ?? null}
                  priority={priority}
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
function NewCustomerFields({
  name,
  setName,
  phone,
  setPhone,
  email,
  setEmail,
  address,
  setAddress,
  premise,
  defaultPremise,
  onPremiseChange,
  dispatchRegionId,
  setDispatchRegionId,
  regions,
}: {
  name: string;
  setName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  address: { streetAddress: string; city: string; state: string; zipCode: string };
  setAddress: (v: { streetAddress: string; city: string; state: string; zipCode: string }) => void;
  premise: PremiseType;
  defaultPremise: PremiseType;
  onPremiseChange: (v: PremiseType) => void;
  dispatchRegionId: string;
  setDispatchRegionId: (v: string) => void;
  regions: { id: string; name: string }[];
}) {
  const set = (patch: Partial<typeof address>) => setAddress({ ...address, ...patch });
  return (
    <div className="space-y-2.5">
      <Text size="xs" tone="dim">
        Just enough to start the job — full billing &amp; details enrich later on the customer’s page.
      </Text>
      {/* One name — a household or a company — seeds both records. */}
      <Field size="xs">
        <Label size="xs" required>
          Name
        </Label>
        <Input size="xs" value={name} onChange={(e) => setName(e.target.value)} placeholder="Maria Sanchez — or Iverson Properties LLC" />
      </Field>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field size="xs">
          <Label size="xs" required>
            Phone
          </Label>
          <Input size="xs" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(602) 555-0149" />
        </Field>
        <Field size="xs">
          <Label size="xs" required>
            Email
          </Label>
          <Input size="xs" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </Field>
      </div>
      <Field size="xs">
        <Label size="xs" required>
          Street address
        </Label>
        <Input size="xs" value={address.streetAddress} onChange={(e) => set({ streetAddress: e.target.value })} placeholder="123 Main St" />
      </Field>
      <div className="grid gap-2.5 sm:grid-cols-[1fr_72px_88px_1fr]">
        <Field size="xs">
          <Label size="xs" required>
            City
          </Label>
          <Input size="xs" value={address.city} onChange={(e) => set({ city: e.target.value })} />
        </Field>
        <Field size="xs">
          <Label size="xs" required>
            State
          </Label>
          <Input size="xs" value={address.state} onChange={(e) => set({ state: e.target.value.toUpperCase() })} maxLength={2} />
        </Field>
        <Field size="xs">
          <Label size="xs" required>
            ZIP
          </Label>
          <Input size="xs" value={address.zipCode} onChange={(e) => set({ zipCode: e.target.value })} />
        </Field>
        <Field size="xs">
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
      </div>
      <div>
        <MiniLabel>Premise</MiniLabel>
        <div className="mt-1">
          <ToggleGroup value={premise} onChange={onPremiseChange} aria-label="Premise">
            <ToggleGroupOption value="RESIDENCE">Residence</ToggleGroupOption>
            <ToggleGroupOption value="BUSINESS">Business</ToggleGroupOption>
          </ToggleGroup>
        </div>
        <Text size="xs" tone="dim" className="mt-1">
          Default for new locations is {defaultPremise === 'BUSINESS' ? 'Business' : 'Residence'} · set in Company profile.
        </Text>
      </div>
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
          <Label size="xs">Complaint · in the customer’s words</Label>
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
  newAddress,
  premise: newPremise,
  typeName,
  divisionName,
  priority,
  itemCount,
}: {
  mode: 'existing' | 'new';
  selectedLocation: ServiceLocationSearchResult | null;
  locationDetail: ServiceLocationDetailDto | undefined;
  newName: string;
  newAddress: { streetAddress: string; city: string; state: string; zipCode: string };
  premise: PremiseType;
  typeName: string | null;
  divisionName: string | null;
  priority: WorkOrderPriority;
  itemCount: number;
}) {
  const isNew = mode === 'new';
  // One name is both the site and the payer for a brand-new caller.
  const name = isNew ? newName : selectedLocation?.locationName || selectedLocation?.customerName;
  const address = isNew ? newAddress : selectedLocation?.address;
  const customerName = isNew ? newName : selectedLocation?.customerName;
  const premise = isNew ? newPremise : locationDetail?.premiseType;
  const pinnedNote = locationDetail?.notes?.find((n) => n.pinned) ?? locationDetail?.notes?.[0];
  const facts = locationDetail?.arrivalFacts ?? [];
  const hasLocation = isNew ? !!newName : !!selectedLocation;

  const line2 = address
    ? `${titleCaseAddress(address.streetAddress)} · ${titleCaseAddress(address.city)}, ${address.state} ${address.zipCode}`.trim()
    : null;

  return (
    <Card title="Summary" action={<Pill tone="neutral">Draft</Pill>}>
      {!hasLocation ? (
        <Text size="sm" tone="muted">
          Pick a service location to see who’s billed and how to get on site.
        </Text>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className="text-[14px] font-bold text-fg-strong">{name || 'New location'}</span>
            {premise && <Pill tone="neutral">{premise === 'BUSINESS' ? 'Business' : 'Residence'}</Pill>}
            {isNew && (
              <Pill tone="success" dot>
                New
              </Pill>
            )}
          </div>
          {line2 && <div className="mt-0.5 text-[11.5px] text-fg-muted">{line2}</div>}
          {customerName && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px]">
              <span className="font-semibold text-fg-strong">{customerName}</span>
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

      <div className="my-3 border-t border-border-soft" />

      <div className="flex items-start gap-2 text-[11.5px] text-fg-muted">
        <span
          className="mt-px grid size-4 flex-shrink-0 place-items-center rounded-full text-[9px] font-bold text-success-500"
          style={{ background: 'color-mix(in oklch, var(--success-500) 16%, var(--bg-elev))' }}
        >
          ✓
        </span>
        <span className="leading-relaxed">
          On create: one work order with {itemCount || 'no'} {itemCount === 1 ? 'item' : 'items'} in Triage. You’ll land
          on it to schedule and dispatch.
        </span>
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
