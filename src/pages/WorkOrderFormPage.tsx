/* eslint-disable i18next/no-literal-string -- dense v1.5 intake form; entity names + major strings go through getName()/t(), but inline glyphs, separators, and short operational labels are kept as literals to keep the markup readable (same convention as CustomerFormPage / UserFormPage / AddLocationPage). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  workOrderApi,
  workOrderTypesApi,
  divisionsApi,
  customerApi,
  type CreateWorkOrderRequest,
  type ServiceLocationSearchResult,
  type WorkOrderPriority,
  type EquipmentSummary,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { showError, showSuccess, extractApiError } from '../lib/toast';
import AppLayout from '../components/AppLayout';
import { Card } from '../components/catalyst/card';
import { Button } from '../components/catalyst/button';
import { Field, Label } from '../components/catalyst/fieldset';
import { Select } from '../components/catalyst/select';
import { Textarea } from '../components/catalyst/textarea';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { ToggleGroup, ToggleGroupOption } from '../components/ui/ToggleGroup';
import { titleCaseAddress } from '../utils/titleCaseAddress';
import ServiceLocationPicker from '../components/ServiceLocationPicker';
import EquipmentPicker from '../components/EquipmentPicker';
import { TrashIcon } from '@heroicons/react/24/outline';

// New Job (Work Order intake) — a dense, multi-work-item create form page.
// Location-led: the service location is the lead field and the PAYER (customer)
// derives from the pick — there is no separate customer section. Replaces the
// create path of WorkOrderFormDialog (which is kept for EDIT on the detail
// page). Atomic POST /work-orders with workItems[].
//
// Design source: claude_designs/workorder/work-order-intake.md. Deliberately
// deferred (handoff open questions): inline brand-new customer+location create
// (we link to /customers/new), complaint typeahead (plain text for now), and
// scheduling the first trip (created unscheduled — dispatch on the detail page).

interface ItemDraft {
  id: number;
  complaint: string;
  equipment: EquipmentSummary | null;
}

const PRIORITIES: WorkOrderPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

export default function WorkOrderFormPage() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const prefillCustomerId = searchParams.get('customerId');
  const prefillLocationId = searchParams.get('locationId');

  const [location, setLocation] = useState<ServiceLocationSearchResult | null>(null);
  const [workOrderTypeId, setWorkOrderTypeId] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [priority, setPriority] = useState<WorkOrderPriority>('NORMAL');
  const nextId = useRef(2);
  const [items, setItems] = useState<ItemDraft[]>([{ id: 1, complaint: '', equipment: null }]);

  // Tenant taxonomies.
  const { data: workOrderTypes } = useQuery({
    queryKey: ['work-order-types'],
    queryFn: () => workOrderTypesApi.getAll(),
  });
  const activeTypes = useMemo(
    () => (Array.isArray(workOrderTypes) ? workOrderTypes.filter((x) => x.isActive) : []),
    [workOrderTypes],
  );

  const { data: divisions } = useQuery({
    queryKey: ['divisions'],
    queryFn: () => divisionsApi.getAll(),
  });
  const activeDivisions = useMemo(
    () => (Array.isArray(divisions) ? divisions.filter((d) => d.isActive) : []),
    [divisions],
  );

  // Prefill: ?customerId restricts the location picker to that customer (we
  // fetch the name for the picker + summary); ?locationId pre-selects a location.
  const { data: prefillCustomer } = useQuery({
    queryKey: ['customer', prefillCustomerId],
    queryFn: () => customerApi.getById(prefillCustomerId!),
    enabled: !!prefillCustomerId,
  });
  const { data: prefillLocation } = useQuery({
    queryKey: ['service-location', prefillLocationId],
    queryFn: () => customerApi.getServiceLocationById(prefillLocationId!),
    enabled: !!prefillLocationId,
  });
  useEffect(() => {
    if (!prefillLocation || location) return;
    // Build a search-result-shaped value from the location detail.
    /* eslint-disable react-hooks/set-state-in-effect -- prefill from query */
    setLocation({
      id: prefillLocation.id,
      customerId: prefillLocation.customerId,
      customerName: prefillLocation.customerName,
      locationName: prefillLocation.locationName ?? null,
      address: prefillLocation.address,
      siteContactName: prefillLocation.siteContactName ?? null,
      siteContactPhone: prefillLocation.siteContactPhone ?? null,
      status: 'ACTIVE',
    });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [prefillLocation, location]);

  const restrictToCustomer = useMemo(
    () =>
      prefillCustomerId
        ? { id: prefillCustomerId, name: prefillCustomer?.name ?? '' }
        : null,
    [prefillCustomerId, prefillCustomer],
  );

  const addItem = () =>
    setItems((prev) => [...prev, { id: nextId.current++, complaint: '', equipment: null }]);
  const removeItem = (id: number) =>
    setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.id !== id) : prev));
  const setItem = (id: number, patch: Partial<ItemDraft>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const filledItems = items.filter((i) => i.complaint.trim());
  // Type is required per the intake spec — but only enforce it when the tenant
  // actually has types configured (don't block tenants with none).
  const typeRequired = activeTypes.length > 0;
  const canSubmit = !!location && filledItems.length > 0 && (!typeRequired || !!workOrderTypeId);

  const createMutation = useMutation({
    mutationFn: (req: CreateWorkOrderRequest) => workOrderApi.create(req),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
      showSuccess(t('common.form.successCreate', { entity: getName('work_order') }));
      navigate(`/work-orders/${created.id}`);
    },
    onError: (err) =>
      showError(t('common.form.errorCreate', { entity: getName('work_order') }), extractApiError(err) ?? undefined),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!location) {
      showError(t('workOrders.form.selectServiceLocation', { entity: getName('service_location') }));
      return;
    }
    if (typeRequired && !workOrderTypeId) {
      showError(t('workOrders.intake.selectType', { entity: getName('work_order') }));
      return;
    }
    if (filledItems.length === 0) {
      showError(t('workOrders.intake.complaintRequired', { entity: getName('work_item') }));
      return;
    }
    const req: CreateWorkOrderRequest = {
      customerId: location.customerId,
      serviceLocationId: location.id,
      workOrderTypeId: workOrderTypeId || undefined,
      divisionId: divisionId || undefined,
      priority,
      workItems: filledItems.map((i) => ({
        description: i.complaint.trim(),
        equipmentId: i.equipment?.id ?? undefined,
      })),
    };
    createMutation.mutate(req);
  };

  const submitting = createMutation.isPending;

  return (
    <AppLayout>
      <div className="px-1 py-1">
        <div className="mx-auto max-w-[1080px]">
          <Link
            to="/work-orders"
            className="mb-2.5 inline-flex items-center gap-1 text-[11.5px] text-fg-muted hover:text-fg-strong"
          >
            ← {getName('work_order', true)}
          </Link>

          <div className="mb-4">
            <Heading level={1} size="page-md" className="m-0">
              {t('common.actions.add', { entity: getName('work_order') })}
            </Heading>
            <Text size="sm" tone="muted" className="mt-1">
              {t('workOrders.intake.subtitle', {
                location: getName('service_location').toLowerCase(),
                items: getName('work_item', true).toLowerCase(),
              })}
            </Text>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-4">
              {/* Left — the form */}
              <div className="min-w-0 space-y-3.5">
                {/* Service location (lead) */}
                <Card title={getName('service_location')}>
                  <ServiceLocationPicker
                    value={location}
                    onChange={setLocation}
                    label={getName('service_location')}
                    required
                    autoFocus
                    restrictToCustomer={restrictToCustomer ?? undefined}
                  />
                  <Text size="xs" tone="muted" className="mt-2">
                    {t('workOrders.intake.payerNote', { entity: getName('customer').toLowerCase() })}{' '}
                    <Link to="/customers/new" className="text-fg-accent hover:underline">
                      ＋ {t('common.actions.add', { entity: getName('customer') })}
                    </Link>
                  </Text>
                </Card>

                {/* Job classification */}
                <Card title={t('workOrders.intake.detailsHeading', { entity: getName('work_order') })}>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {activeTypes.length > 0 && (
                      <Field size="xs">
                        <Label size="xs" required>
                          {t('workOrders.form.type')}
                        </Label>
                        <Select value={workOrderTypeId} onChange={(e) => setWorkOrderTypeId(e.target.value)}>
                          <option value="">{t('workOrders.form.typePlaceholder')}</option>
                          {activeTypes.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    )}
                    {activeDivisions.length > 0 && (
                      <Field size="xs">
                        <Label size="xs">{getName('division')}</Label>
                        <Select value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
                          <option value="">{t('workOrders.form.divisionPlaceholder')}</option>
                          {activeDivisions.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    )}
                  </div>
                  <Field size="xs" className="mt-2.5">
                    <Label size="xs">{t('workOrders.form.priority')}</Label>
                    <ToggleGroup value={priority} onChange={setPriority} aria-label={t('workOrders.form.priority')}>
                      {PRIORITIES.map((p) => (
                        <ToggleGroupOption key={p} value={p}>
                          {t(`workOrders.priority.${p.toLowerCase()}`)}
                        </ToggleGroupOption>
                      ))}
                    </ToggleGroup>
                  </Field>
                </Card>

                {/* Work-item drafts */}
                <Card
                  title={getName('work_item', true)}
                  action={
                    <Button outline size="xs" type="button" onClick={addItem}>
                      ＋ {t('common.actions.add', { entity: getName('work_item') })}
                    </Button>
                  }
                >
                  <div className="space-y-2.5">
                    {items.map((item, idx) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-border-soft p-2.5"
                      >
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          {items.length > 1 && (
                            <Button
                              plain
                              size="xs"
                              type="button"
                              onClick={() => removeItem(item.id)}
                              aria-label={t('common.delete')}
                            >
                              <TrashIcon data-slot="icon" />
                            </Button>
                          )}
                        </div>
                        <Field size="xs">
                          <Label size="xs" required={idx === 0}>
                            {t('workOrders.intake.complaint')}
                          </Label>
                          <Textarea
                            value={item.complaint}
                            onChange={(e) => setItem(item.id, { complaint: e.target.value })}
                            rows={2}
                            placeholder={t('workOrders.intake.complaintPlaceholder')}
                          />
                        </Field>
                        {location && (
                          <div className="mt-2">
                            <EquipmentPicker
                              label={getName('equipment')}
                              value={item.equipment}
                              onChange={(eq) => setItem(item.id, { equipment: eq })}
                              serviceLocationId={location.id}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              {/* Right — summary rail */}
              <div className="mt-3.5 lg:mt-0">
                <div className="lg:sticky lg:top-2">
                  <Card title={t('workOrders.intake.summaryHeading', { entity: getName('work_order') })}>
                    {location ? (
                      <div className="space-y-1">
                        <div className="text-[13px] font-semibold text-fg-strong">
                          {location.locationName || titleCaseAddress(location.address.streetAddress)}
                        </div>
                        <div className="text-[12px] text-fg-muted">
                          {titleCaseAddress(location.address.streetAddress)},{' '}
                          {titleCaseAddress(location.address.city)}, {location.address.state}{' '}
                          {location.address.zipCode}
                        </div>
                        <div className="flex items-baseline gap-1.5 pt-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
                            {t('workOrders.detail.overview.billsTo')}
                          </span>
                          <span className="text-[12px] text-fg-strong">{location.customerName}</span>
                        </div>
                      </div>
                    ) : (
                      <Text size="sm" tone="muted">
                        {t('workOrders.intake.summaryEmpty', { entity: getName('service_location').toLowerCase() })}
                      </Text>
                    )}

                    <div className="mt-3 border-t border-border-soft pt-3">
                      <div className="flex items-baseline justify-between text-[12px]">
                        <span className="text-fg-muted">{getName('work_item', true)}</span>
                        <span className="font-semibold tabular-nums text-fg-strong">{filledItems.length}</span>
                      </div>
                      <ul className="mt-2 space-y-1 text-[11.5px] text-fg-muted">
                        <li>✓ {t('workOrders.intake.checklistCreated', { entity: getName('work_order') })}</li>
                        <li>✓ {t('workOrders.intake.checklistRouted')}</li>
                      </ul>
                    </div>
                  </Card>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-3.5 flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-bg-elev px-3.5 py-3 shadow-sm">
              <div className="text-[11.5px] text-fg-muted max-sm:basis-full">
                {t('workOrders.intake.footerNote', {
                  entity: getName('work_order').toLowerCase(),
                  items: getName('work_item', true).toLowerCase(),
                })}
              </div>
              <span className="flex-1" />
              <Button href="/work-orders" plain size="xs">
                {t('common.cancel')}
              </Button>
              <Button type="submit" color="accent" size="xs" disabled={!canSubmit || submitting}>
                {submitting ? t('common.saving') : t('common.actions.add', { entity: getName('work_order') })}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
