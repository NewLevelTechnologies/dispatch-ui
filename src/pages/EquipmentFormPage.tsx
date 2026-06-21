/* eslint-disable i18next/no-literal-string -- dense v1.5 visual form; entity names + major strings go through getName()/t(), but inline glyphs, separators, section titles, and short operational labels are kept as literals to keep the form markup readable (same convention as AddLocationPage / UserFormPage). */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  customerApi,
  equipmentApi,
  equipmentTypesApi,
  equipmentCategoriesApi,
  type CreateEquipmentRequest,
  type UpdateEquipmentRequest,
  type ServiceLocationSearchResult,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { showError, showSuccess, extractApiError } from '../lib/toast';
import AppLayout from '../components/AppLayout';
import ServiceLocationPicker from '../components/ServiceLocationPicker';
import { Card } from '../components/catalyst/card';
import { Button } from '../components/catalyst/button';
import { Field, Label } from '../components/catalyst/fieldset';
import { Input } from '../components/catalyst/input';
import { Select } from '../components/catalyst/select';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { Callout } from '../components/ui/Callout';

// Add / Edit Equipment — full-page form. The redesigned sibling of Add
// Location / Add Customer (same max-w-[680px], section cards, gated
// validation, footer-with-primary). Replaces EquipmentFormDialog everywhere
// EXCEPT the in-context Work Order flows (add-to-work-item, add-sub-unit),
// which keep the dialog because they chain `onCreated` and must not navigate
// away from the work order.
//
// One file, route-driven:
//   • /service-locations/:locId/equipment/new   scoped add (FK from route)
//       + ?parent=:equipId → sub-unit under that system
//   • /equipment/new                            standalone add (location picker)
//   • /equipment/:id/edit                        edit
//
// Departures from claude_designs/screen-add-equipment.jsx, all backend-gated
// (asks tracked separately):
//   • Specs card (category-driven spec template) is NOT built — no backend
//     spec-template registry, and `attributes` is write-only today (nothing
//     renders it). The Type→Category cascade still ships; specs do not.
//   • Warranty is a single expiry date + details (backend has one date), not
//     the mock's parts/labor split.
//   • Placement (edit) re-parents (parentId is patchable) but Location is
//     read-only — serviceLocationId is immutable on PATCH; relocation needs a
//     dedicated endpoint.

interface FormState {
  name: string;
  make: string;
  model: string;
  serialNumber: string;
  installDate: string;
  equipmentTypeId: string;
  equipmentCategoryId: string;
  warrantyExpiresAt: string;
  warrantyLaborExpiresAt: string;
  warrantyDetails: string;
  parentId: string;
}

const blankForm: FormState = {
  name: '',
  make: '',
  model: '',
  serialNumber: '',
  installDate: '',
  equipmentTypeId: '',
  equipmentCategoryId: '',
  warrantyExpiresAt: '',
  warrantyLaborExpiresAt: '',
  warrantyDetails: '',
  parentId: '',
};

export default function EquipmentFormPage() {
  const { locId, id } = useParams<{ locId?: string; id?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();

  const isEdit = Boolean(id);
  // Sub-unit context — only meaningful in (scoped) add mode.
  const addParentId = !isEdit ? searchParams.get('parent') : null;
  const standalone = !isEdit && !locId;

  const [pickedLocation, setPickedLocation] = useState<ServiceLocationSearchResult | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [hydrated, setHydrated] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // ===== Edit: load the record (separate key so the includeDescendants
  // projection doesn't pollute the detail page's cache) =====
  const {
    data: equipment,
    isLoading: loadingEquipment,
    error: equipmentError,
  } = useQuery({
    queryKey: ['equipment-form', id],
    queryFn: () => equipmentApi.getById(id!, { includeDescendants: true }),
    enabled: isEdit,
  });

  // Seed the form once the edit record arrives. Intentional form-init sync.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isEdit && equipment && !hydrated) {
      setForm({
        name: equipment.name ?? '',
        make: equipment.make ?? '',
        model: equipment.model ?? '',
        serialNumber: equipment.serialNumber ?? '',
        installDate: equipment.installDate ?? '',
        equipmentTypeId: equipment.equipmentTypeId ?? '',
        equipmentCategoryId: equipment.equipmentCategoryId ?? '',
        warrantyExpiresAt: equipment.warrantyExpiresAt ?? '',
        // No backfill on labor coverage — existing rows are null → empty field.
        warrantyLaborExpiresAt: equipment.warrantyLaborExpiresAt ?? '',
        warrantyDetails: equipment.warrantyDetails ?? '',
        parentId: equipment.parentId ?? '',
      });
      setHydrated(true);
    }
  }, [isEdit, equipment, hydrated]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Location that owns this unit (route in scoped/edit, picked in standalone).
  const headerLocationId = isEdit ? equipment?.serviceLocationId : standalone ? undefined : locId;
  const { data: serviceLocation } = useQuery({
    queryKey: ['service-location', headerLocationId],
    queryFn: () => customerApi.getServiceLocationById(headerLocationId!),
    enabled: Boolean(headerLocationId),
  });

  // Parent system, when adding a sub-unit via ?parent=.
  const { data: addParent } = useQuery({
    queryKey: ['equipment-form-parent', addParentId],
    queryFn: () => equipmentApi.getById(addParentId!),
    enabled: Boolean(addParentId),
  });

  // ===== Reference data: Type → Category cascade =====
  const { data: types = [] } = useQuery({
    queryKey: ['equipment-types'],
    queryFn: () => equipmentTypesApi.getAll(),
  });
  const { data: categories = [] } = useQuery({
    queryKey: ['equipment-categories', form.equipmentTypeId],
    queryFn: () => equipmentCategoriesApi.getAll(form.equipmentTypeId || undefined),
    enabled: Boolean(form.equipmentTypeId),
  });

  // ===== Re-parent options (edit): active units at the same location, top-level
  // only (enforces the 2-level depth rule + excludes self). =====
  const { data: locEquipment } = useQuery({
    queryKey: ['equipment', 'by-location', equipment?.serviceLocationId],
    queryFn: () =>
      equipmentApi.list({ serviceLocationId: equipment!.serviceLocationId, status: 'ACTIVE', size: 200 }),
    enabled: isEdit && Boolean(equipment?.serviceLocationId),
  });
  const parentOptions = useMemo(
    () => (locEquipment?.content ?? []).filter((r) => r.id !== equipment?.id && !r.parentId),
    [locEquipment, equipment?.id]
  );
  // A unit that already has sub-units can't itself become a sub-unit (2 levels max).
  const isSystemWithUnits = isEdit && (equipment?.descendantCount ?? 0) > 0;
  const parentChanged = isEdit && form.parentId !== (equipment?.parentId ?? '');

  const effectiveServiceLocationId = isEdit
    ? equipment?.serviceLocationId
    : standalone
      ? pickedLocation?.id
      : locId;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const mark = (key: string) => setTouched((s) => ({ ...s, [key]: true }));

  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = 'Required';
  if (!form.equipmentTypeId) errors.equipmentTypeId = 'Required';
  // Category is required when the chosen type actually has categories — don't
  // trap the user on a type that has none configured yet.
  if (categories.length > 0 && !form.equipmentCategoryId) errors.equipmentCategoryId = 'Required';
  if (standalone && !pickedLocation) errors.serviceLocationId = 'Required';
  const hasErrors = Object.keys(errors).length > 0;

  const locationLabel =
    serviceLocation?.locationName || serviceLocation?.customerName || getName('service_location');

  const cancelHref = isEdit
    ? `/equipment/${id}`
    : addParentId
      ? `/equipment/${addParentId}`
      : standalone
        ? '/equipment'
        : `/service-locations/${locId}?tab=equipment`;

  const backLabel = isEdit
    ? (equipment?.name ?? getName('equipment'))
    : addParentId
      ? (addParent?.name ?? getName('equipment'))
      : standalone
        ? getName('equipment', true)
        : locationLabel;

  const saveMutation = useMutation({
    mutationFn: () => {
      const base = {
        name: form.name.trim(),
        make: form.make.trim() || null,
        model: form.model.trim() || null,
        serialNumber: form.serialNumber.trim() || null,
        equipmentTypeId: form.equipmentTypeId || null,
        equipmentCategoryId: form.equipmentCategoryId || null,
        installDate: form.installDate || null,
        warrantyExpiresAt: form.warrantyExpiresAt || null,
        warrantyLaborExpiresAt: form.warrantyLaborExpiresAt || null,
        warrantyDetails: form.warrantyDetails.trim() || null,
      };
      if (isEdit && equipment) {
        const payload: UpdateEquipmentRequest = {
          ...base,
          // Don't touch parentId on a system that owns sub-units (the select is
          // disabled there); otherwise persist the chosen parent (or clear it).
          parentId: isSystemWithUnits ? (equipment.parentId ?? null) : form.parentId || null,
        };
        return equipmentApi.update(equipment.id, payload);
      }
      const payload: CreateEquipmentRequest = {
        ...base,
        serviceLocationId: effectiveServiceLocationId!,
        parentId: addParentId ?? null,
      };
      return equipmentApi.create(payload);
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      queryClient.invalidateQueries({ queryKey: ['equipment-detail'] });
      queryClient.invalidateQueries({ queryKey: ['equipment-form'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
      if (effectiveServiceLocationId) {
        queryClient.invalidateQueries({ queryKey: ['service-location', effectiveServiceLocationId] });
      }
      showSuccess(
        isEdit
          ? t('common.form.successUpdate', { entity: getName('equipment'), defaultValue: 'Equipment updated' })
          : t('common.form.successCreate', { entity: getName('equipment'), defaultValue: 'Equipment created' })
      );
      navigate(`/equipment/${saved.id}`);
    },
    onError: (err: unknown) =>
      showError(
        isEdit
          ? t('common.form.errorUpdate', { entity: getName('equipment') })
          : t('common.form.errorCreate', { entity: getName('equipment') }),
        extractApiError(err) ?? undefined
      ),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, equipmentTypeId: true, equipmentCategoryId: true, serviceLocationId: true });
    if (hasErrors) return;
    saveMutation.mutate();
  };

  const submitting = saveMutation.isPending;

  // ===== Edit-mode load gates =====
  if (isEdit && loadingEquipment) {
    return (
      <AppLayout>
        <div className="p-8 text-center text-[12.5px] text-fg-muted">
          {t('common.actions.loading', { entities: getName('equipment', true) })}
        </div>
      </AppLayout>
    );
  }
  if (isEdit && (equipmentError || !equipment)) {
    return (
      <AppLayout>
        <div className="p-8">
          <Callout kind="danger">
            {t('common.actions.errorLoadingEntity', { entity: getName('equipment') })}
          </Callout>
          <Button className="mt-4" onClick={() => navigate('/equipment')}>
            {t('common.actions.backTo', { entities: getName('equipment', true) })}
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
            to={cancelHref}
            className="mb-2.5 inline-flex max-w-[600px] items-center gap-1 truncate text-[11.5px] text-fg-muted hover:text-fg-strong"
          >
            ← {backLabel}
          </Link>

          <div className="mb-4">
            <Heading level={1} size="page-md" className="m-0">
              {isEdit
                ? t('common.actions.edit', { entity: getName('equipment') })
                : t('common.actions.add', { entity: getName('equipment') })}
            </Heading>
            {/* Context line: where the unit lives + (optionally) its parent system. */}
            {!standalone ? (
              <Text size="sm" tone="muted" className="mt-1">
                At <strong className="font-semibold text-fg-strong">{locationLabel}</strong>
                {addParent && (
                  <>
                    {' '}· part of{' '}
                    <strong className="font-semibold text-fg-strong">{addParent.name}</strong>
                  </>
                )}
                .
              </Text>
            ) : (
              <Text size="sm" tone="muted" className="mt-1">
                Pick the {getName('service_location').toLowerCase()} this {getName('equipment').toLowerCase()} lives at,
                then fill in the details. Type and category come from your Types &amp; Categories settings.
              </Text>
            )}
          </div>

          <form onSubmit={handleSubmit}>
            {/* Location — standalone add only (scoped/edit carry it in the header). */}
            {standalone && (
              <Card title={getName('service_location')} className="mb-3.5">
                <ServiceLocationPicker
                  value={pickedLocation}
                  onChange={setPickedLocation}
                  label={getName('service_location')}
                  required
                />
                {touched.serviceLocationId && errors.serviceLocationId && (
                  <Text size="xs" className="mt-1 text-danger-500">{errors.serviceLocationId}</Text>
                )}
              </Card>
            )}

            {/* Classification — Type then Category, from the tenant registry. */}
            <Card
              title="Classification"
              subtitle="Type then category — from your Types & Categories settings."
              className="mb-3.5"
            >
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Field size="xs">
                  <Label size="xs" required>{t('equipment.form.type')}</Label>
                  <Select
                    value={form.equipmentTypeId}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, equipmentTypeId: e.target.value, equipmentCategoryId: '' }))
                    }
                    onBlur={() => mark('equipmentTypeId')}
                    invalid={!!(touched.equipmentTypeId && errors.equipmentTypeId)}
                  >
                    <option value="">Select type…</option>
                    {types.map((ty) => (
                      <option key={ty.id} value={ty.id}>{ty.name}</option>
                    ))}
                  </Select>
                  {touched.equipmentTypeId && errors.equipmentTypeId && (
                    <Text size="xs" className="mt-1 text-danger-500">{errors.equipmentTypeId}</Text>
                  )}
                </Field>
                <Field size="xs">
                  <Label size="xs" required>{t('equipment.form.category')}</Label>
                  <Select
                    value={form.equipmentCategoryId}
                    onChange={(e) => set('equipmentCategoryId', e.target.value)}
                    onBlur={() => mark('equipmentCategoryId')}
                    invalid={!!(touched.equipmentCategoryId && errors.equipmentCategoryId)}
                    disabled={!form.equipmentTypeId}
                  >
                    <option value="">{form.equipmentTypeId ? 'Select category…' : 'Pick a type first'}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                  {touched.equipmentCategoryId && errors.equipmentCategoryId && (
                    <Text size="xs" className="mt-1 text-danger-500">{errors.equipmentCategoryId}</Text>
                  )}
                </Field>
              </div>
            </Card>

            {/* Identity */}
            <Card title="Identity" className="mb-3.5">
              <Field size="xs">
                <Label size="xs" required>{t('common.form.name')}</Label>
                <Input
                  size="xs"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  onBlur={() => mark('name')}
                  invalid={!!(touched.name && errors.name)}
                  placeholder="RTU-3, Walk-in freezer…"
                />
                {touched.name && errors.name && (
                  <Text size="xs" className="mt-1 text-danger-500">{errors.name}</Text>
                )}
              </Field>
              <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Field size="xs">
                  <Label size="xs">{t('equipment.form.make')}</Label>
                  <Input size="xs" value={form.make} onChange={(e) => set('make', e.target.value)} placeholder="Carrier" />
                </Field>
                <Field size="xs">
                  <Label size="xs">{t('equipment.form.model')}</Label>
                  <Input size="xs" className="font-mono" value={form.model} onChange={(e) => set('model', e.target.value)} placeholder="50TC-A06" />
                </Field>
                <Field size="xs">
                  <Label size="xs">{t('equipment.form.serialNumber')}</Label>
                  <Input size="xs" className="font-mono" value={form.serialNumber} onChange={(e) => set('serialNumber', e.target.value)} placeholder="A1142099" />
                </Field>
                <Field size="xs">
                  <Label size="xs">{t('equipment.form.installDate')}</Label>
                  <Input size="xs" type="date" value={form.installDate} onChange={(e) => set('installDate', e.target.value)} />
                </Field>
              </div>
            </Card>

            {/* Placement — edit only. Re-parent works; relocation is backend-gated. */}
            {isEdit && (
              <Card
                title="Placement"
                subtitle="Which system this unit belongs to. Reassigning is rare — use it when a unit was attached to the wrong system."
                className="mb-3.5"
              >
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <Field size="xs">
                    <Label size="xs">{getName('service_location')}</Label>
                    <div className="flex h-8 items-center rounded-[7px] border border-border bg-bg px-2.5 text-[12.5px] text-fg-strong">
                      <span className="truncate">{locationLabel}</span>
                    </div>
                    <Text size="xs" tone="muted" className="mt-1">Moving a unit to another location isn’t available here yet.</Text>
                  </Field>
                  <Field size="xs">
                    <Label size="xs">Part of (parent system)</Label>
                    <Select
                      value={form.parentId}
                      onChange={(e) => set('parentId', e.target.value)}
                      disabled={isSystemWithUnits}
                    >
                      <option value="">None — standalone</option>
                      {parentOptions.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </Select>
                    {isSystemWithUnits ? (
                      <Text size="xs" tone="muted" className="mt-1">This unit has sub-units, so it can’t become a sub-unit itself.</Text>
                    ) : parentChanged ? (
                      <Text size="xs" className="mt-1 text-warning-fg">Moves this unit’s service-history context under the new system.</Text>
                    ) : null}
                  </Field>
                </div>
              </Card>
            )}

            {/* Warranty — optional; parts vs labor coverage drives the under-warranty signal + billing guidance. */}
            <Card
              title="Warranty"
              subtitle="Optional — parts vs labor coverage drives the under-warranty signal and billing guidance."
              className="mb-3.5"
            >
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Field size="xs">
                  <Label size="xs">Parts covered through</Label>
                  <Input size="xs" type="date" value={form.warrantyExpiresAt} onChange={(e) => set('warrantyExpiresAt', e.target.value)} />
                </Field>
                <Field size="xs">
                  <Label size="xs">Labor covered through</Label>
                  <Input size="xs" type="date" value={form.warrantyLaborExpiresAt} onChange={(e) => set('warrantyLaborExpiresAt', e.target.value)} />
                </Field>
              </div>
              <div className="mt-2.5">
                <Field size="xs">
                  <Label size="xs">{t('equipment.form.warrantyDetails')}</Label>
                  <Input size="xs" value={form.warrantyDetails} onChange={(e) => set('warrantyDetails', e.target.value)} placeholder="e.g., compressor 10yr" />
                </Field>
              </div>
            </Card>

            {/* Footer */}
            <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-bg-elev px-3.5 py-3 shadow-sm">
              <div className="text-[11.5px] text-fg-muted max-sm:basis-full">
                {isEdit
                  ? 'Saves changes to this equipment record.'
                  : addParent
                    ? <>Adds a sub-unit under <strong className="text-fg-strong">{addParent.name}</strong>.</>
                    : <>Creates one {getName('equipment').toLowerCase()} record{!standalone && <> at <strong className="text-fg-strong">{locationLabel}</strong></>}.</>}
              </div>
              <span className="flex-1" />
              <Button href={cancelHref} plain size="xs">
                {t('common.cancel')}
              </Button>
              <Button type="submit" color="accent" size="xs" disabled={submitting}>
                {submitting
                  ? t('common.saving')
                  : isEdit
                    ? t('common.actions.edit', { entity: getName('equipment') })
                    : t('common.actions.add', { entity: getName('equipment') })}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
