/* eslint-disable i18next/no-literal-string -- dense v1.5 visual form; entity names + major strings go through getName()/t(), but inline glyphs, separators, section titles, and short operational labels are kept as literals to keep the form markup readable (same convention as AddLocationPage / UserFormPage). */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  customerApi,
  equipmentApi,
  equipmentImagesApi,
  equipmentTypesApi,
  equipmentCategoriesApi,
  equipmentCategoryFieldsApi,
  tenantSettingsApi,
  EQUIPMENT_IMAGE_CONTENT_TYPES,
  EQUIPMENT_IMAGE_MAX_BYTES,
  type CreateEquipmentRequest,
  type UpdateEquipmentRequest,
  type NameplateExtractionResponse,
  type ServiceLocationSearchResult,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { showError, showSuccess, extractApiError } from '../lib/toast';
import AppLayout from '../components/AppLayout';
import ServiceLocationPicker from '../components/ServiceLocationPicker';
import { EquipmentNameplateHero } from '../components/EquipmentNameplateHero';
import { Card } from '../components/catalyst/card';
import { Button } from '../components/catalyst/button';
import { Field, Label } from '../components/catalyst/fieldset';
import { Input } from '../components/catalyst/input';
import { Select } from '../components/catalyst/select';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { Callout } from '../components/ui/Callout';
import { SpecFieldInput } from '../components/EquipmentSpecFields';
import { parseAttributes, buildAttributes, matchOption } from '../utils/equipmentAttributes';

// Nameplate review markers. READ = OCR filled it (accent); VERIFY = OCR is
// error-prone here, confirm it (amber). Cleared the moment the field is edited.
type NameplateMark = 'read' | 'verify';
function NameplateBadge({ kind }: { kind: NameplateMark }) {
  const text = kind === 'read' ? 'READ' : 'VERIFY';
  const cls =
    kind === 'read'
      ? 'bg-accent-500/15 text-fg-accent'
      : 'bg-warning-500/20 text-warning-fg';
  return (
    <span className={`ml-1.5 inline-block rounded-[3px] px-1 py-px align-middle text-[9px] font-bold tracking-[0.04em] ${cls}`}>
      {text}
    </span>
  );
}

// Add / Edit Equipment — full-page form. The redesigned sibling of Add
// Location / Add Customer (same max-w-[680px], section cards, gated
// validation, footer-with-primary). This is the ONE surface for creating an
// equipment record — the legacy EquipmentFormDialog is gone. In-context
// callers (a WO work-item picker, the equipment drawer's "+ Add unit", a
// customer-detail add) launch this page with a returnTo and auto-attach the
// new record when it hands them back the id (see the launch contract below).
//
// One file, route-driven:
//   • /service-locations/:locId/equipment/new   scoped add (FK from route)
//       + ?parent=:equipId → sub-unit under that system
//   • /equipment/new                            standalone add (location picker)
//   • /equipment/:id/edit                        edit
//
// In-context launch contract (create only, all query params):
//   • ?locationId=  scope to this location, skip the picker (like :locId)
//   • ?returnTo=    URL-encoded path to return to on save AND cancel
//   • ?attachTo=    opaque token echoed back on the return URL
//   • ?parent=      sub-unit parent (as above)
// On save with a returnTo, we navigate to `returnTo?newEquipmentId=<id>
// [&attachTo=<token>]`; the caller reads those to wire the new record on.
//
// Notes:
//   • Specs card renders the chosen category's custom fields (tenant registry)
//     as typed inputs and writes their values into the `attributes` JSON.
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
  locationOnSite: string;
  equipmentTypeId: string;
  equipmentCategoryId: string;
  warrantyExpiresAt: string;
  warrantyLaborExpiresAt: string;
  warrantyDetails: string;
  parentId: string;
}

// Build the return URL for an in-context create. Only when the caller gave an
// attach token do we hand back the new id (+ token) for auto-wiring; otherwise
// (sub-unit, customer-detail add) we return clean, since the form already
// invalidated the caller's caches. Preserves any query the returnTo carries.
function appendReturnParams(returnTo: string, newEquipmentId: string, attachTo: string | null): string {
  if (!attachTo) return returnTo;
  const [path, existing] = returnTo.split('?');
  const params = new URLSearchParams(existing ?? '');
  params.set('newEquipmentId', newEquipmentId);
  params.set('attachTo', attachTo);
  return `${path}?${params.toString()}`;
}

const blankForm: FormState = {
  name: '',
  make: '',
  model: '',
  serialNumber: '',
  installDate: '',
  locationOnSite: '',
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
  // In-context launch contract (create only). A caller — a WO work-item
  // equipment picker, the equipment drawer's "+ Add unit", a customer-detail
  // "+ Add equipment" — sends the location to scope to (`locationId`) and the
  // URL to return to (`returnTo`). `attachTo` is an opaque token we echo back
  // untouched so the caller can wire the new record onto whatever launched us
  // (a saved work item, a local draft). See appendReturnParams.
  // returnTo works in both modes (edit returns to the caller too — e.g.
  // customer-detail equipment edit); the rest are create-only concepts.
  const returnTo = searchParams.get('returnTo');
  const queryLocationId = !isEdit ? searchParams.get('locationId') : null;
  const attachTo = !isEdit ? searchParams.get('attachTo') : null;
  // Restrict the standalone location picker to one customer (a multi-location
  // customer-detail "+ Add equipment" — the location is still chosen here).
  const queryCustomerId = !isEdit ? searchParams.get('customerId') : null;
  const queryCustomerName = !isEdit ? searchParams.get('customerName') : null;
  const restrictCustomer = queryCustomerId ? { id: queryCustomerId, name: queryCustomerName ?? '' } : null;
  // The owning location is fixed when it arrives via the route (`:locId`) or the
  // `?locationId=` query param; only a bare /equipment/new needs the picker.
  const scopedLocationId = locId ?? queryLocationId ?? null;
  const standalone = !isEdit && !scopedLocationId;

  const [pickedLocation, setPickedLocation] = useState<ServiceLocationSearchResult | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [hydrated, setHydrated] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  // Spec values for the chosen category's custom fields (keyed by fieldKey).
  const [specValues, setSpecValues] = useState<Record<string, string>>({});
  const setSpec = (key: string, value: string) => setSpecValues((s) => ({ ...s, [key]: value }));

  // ===== Nameplate OCR (add mode, AI-gated) =====
  // The photo is kept client-side and uploaded as durable media after create.
  const [nameplateFile, setNameplateFile] = useState<File | null>(null);
  const [nameplateState, setNameplateState] = useState<'idle' | 'reading' | 'done'>('idle');
  const [nameplateError, setNameplateError] = useState<string | null>(null);
  const [nameplateWarnings, setNameplateWarnings] = useState<string[]>([]);
  // Raw OCR'd spec map, retained across category changes. The plate may report
  // specs (refrigerant, voltage…) before a category is chosen — we hold them and
  // re-apply once the category's field list is known (snapping selects to options).
  const [nameplateAttrs, setNameplateAttrs] = useState<Record<string, string>>({});
  // field key ('make' | 'model' | 'serialNumber' | `spec:${fieldKey}`) → marker
  const [nameplateMarks, setNameplateMarks] = useState<Record<string, NameplateMark>>({});
  // Backstop for a 403 racing past the settings gate (AI turned off mid-session).
  const [nameplateForceHidden, setNameplateForceHidden] = useState(false);
  const clearMark = (key: string) =>
    setNameplateMarks((m) => {
      if (!m[key]) return m;
      const next = { ...m };
      delete next[key];
      return next;
    });

  // AI Features gate — the hero only exists in add mode when the tenant enables
  // AI. Shares the settings cache key with the Company Profile panel.
  const { data: tenantSettings } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.getSettings(),
    enabled: !isEdit,
  });
  const showNameplateHero = !isEdit && tenantSettings?.enableAiFeatures === true && !nameplateForceHidden;

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
        locationOnSite: equipment.locationOnSite ?? '',
        equipmentTypeId: equipment.equipmentTypeId ?? '',
        equipmentCategoryId: equipment.equipmentCategoryId ?? '',
        warrantyExpiresAt: equipment.warrantyExpiresAt ?? '',
        // No backfill on labor coverage — existing rows are null → empty field.
        warrantyLaborExpiresAt: equipment.warrantyLaborExpiresAt ?? '',
        warrantyDetails: equipment.warrantyDetails ?? '',
        parentId: equipment.parentId ?? '',
      });
      setSpecValues(parseAttributes(equipment.attributes));
      setHydrated(true);
    }
  }, [isEdit, equipment, hydrated]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Location that owns this unit (route/query in scoped/edit, picked in standalone).
  const headerLocationId = isEdit ? equipment?.serviceLocationId : standalone ? undefined : scopedLocationId;
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
  // Custom fields ("Specs") for the chosen category — shares the cache key with
  // the settings drawer + the detail page.
  const { data: specFields = [] } = useQuery({
    queryKey: ['equipment-category-fields', form.equipmentCategoryId],
    queryFn: () => equipmentCategoryFieldsApi.getAll(form.equipmentCategoryId),
    enabled: Boolean(form.equipmentCategoryId),
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
      : scopedLocationId;

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
  // Required spec fields (booleans always have a value).
  for (const f of specFields) {
    if (!f.required || f.dataType === 'BOOLEAN') continue;
    const raw = specValues[f.fieldKey];
    if (raw == null || raw.trim() === '') errors[`spec:${f.fieldKey}`] = 'Required';
  }
  const hasErrors = Object.keys(errors).length > 0;
  // Edit-mode cue: switching category replaces the spec set; pre-existing values
  // that don't map to the new category won't be saved.
  const categoryChanged =
    isEdit && Boolean(equipment?.attributes) && form.equipmentCategoryId !== (equipment?.equipmentCategoryId ?? '');

  const locationLabel =
    serviceLocation?.locationName || serviceLocation?.customerName || getName('service_location');

  const cancelHref = returnTo
    ? returnTo
    : isEdit
      ? `/equipment/${id}`
      : addParentId
        ? `/equipment/${addParentId}`
        : standalone
          ? '/equipment'
          : `/service-locations/${scopedLocationId}?tab=equipment`;

  const backLabel = isEdit
    ? (equipment?.name ?? getName('equipment'))
    : addParentId
      ? (addParent?.name ?? getName('equipment'))
      : standalone
        ? getName('equipment', true)
        : locationLabel;

  // Apply an OCR result: fill make/model/serial now (serial → VERIFY since OCR
  // fumbles it; the rest → READ), and retain the spec map for the reconcile
  // effect below — the spec fields may not exist until a category is chosen.
  const applyNameplate = (res: NameplateExtractionResponse) => {
    setForm((f) => ({
      ...f,
      make: res.make ?? f.make,
      model: res.model ?? f.model,
      serialNumber: res.serialNumber ?? f.serialNumber,
    }));
    setNameplateAttrs(res.attributes ?? {});
    const marks: Record<string, NameplateMark> = {};
    if (res.make) marks.make = 'read';
    if (res.model) marks.model = 'read';
    if (res.serialNumber) marks.serialNumber = 'verify';
    setNameplateMarks(marks);
    setNameplateWarnings(res.warnings ?? []);
  };

  // Reconcile retained OCR specs against the chosen category's field list. Runs
  // when the field set arrives or changes (category pick / switch), filling only
  // still-empty fields so it never clobbers a manual edit; SELECT reads snap to
  // a matching option ("R410A" → "R-410A"). This is what lets a spec the plate
  // reported before category selection land in the right field afterward. The
  // functional updater reads the latest values, so no extra deps / no clobber.
  useEffect(() => {
    if (specFields.length === 0 || Object.keys(nameplateAttrs).length === 0) return;
    // Derive spec prefill from the category field list once it loads; runs only
    // on field-set / OCR-result change, and the updater reads the latest values
    // so it converges (no cascading loop).
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setSpecValues((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const f of specFields) {
        const raw = nameplateAttrs[f.fieldKey];
        if (raw == null || raw === '') continue;
        if ((prev[f.fieldKey] ?? '') !== '') continue; // never overwrite an edit
        const value = f.dataType === 'SELECT' ? matchOption(raw, f.options) : raw;
        if (!value) continue;
        next[f.fieldKey] = value;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [specFields, nameplateAttrs]);

  // A spec field shows the nameplate READ badge while its value still equals what
  // the plate read (snapped for selects); editing the field diverges it and the
  // badge clears on its own — no stored per-field marker needed.
  const specNameplateMark = (fieldKey: string): NameplateMark | undefined => {
    const raw = nameplateAttrs[fieldKey];
    if (raw == null || raw === '') return undefined;
    const field = specFields.find((f) => f.fieldKey === fieldKey);
    if (!field) return undefined;
    const ocrValue = field.dataType === 'SELECT' ? matchOption(raw, field.options) : raw;
    return ocrValue != null && (specValues[fieldKey] ?? '') === ocrValue ? 'read' : undefined;
  };

  const extractMutation = useMutation({
    mutationFn: (file: File) => equipmentApi.extractNameplate(file),
    onSuccess: (res) => {
      applyNameplate(res);
      setNameplateState('done');
    },
    onError: (err: unknown) => {
      const status =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined;
      if (status === 403) {
        // AI turned off at the tenant — pull the hero, keep manual entry.
        setNameplateForceHidden(true);
        setNameplateState('idle');
        return;
      }
      setNameplateState('idle');
      setNameplateError(extractApiError(err) ?? 'Could not read the nameplate — enter the details manually.');
    },
  });

  // Validate client-side (HEIC from the photo library 400s server-side until the
  // transcode lands), then read.
  const pickNameplate = (file: File) => {
    setNameplateError(null);
    if (!(EQUIPMENT_IMAGE_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      setNameplateError(
        'Use a JPEG, PNG, or WebP photo. (iPhone HEIC isn’t supported yet — take the photo with the camera, or convert it first.)'
      );
      return;
    }
    if (file.size > EQUIPMENT_IMAGE_MAX_BYTES) {
      setNameplateError('That photo is over 25 MB — use a smaller one.');
      return;
    }
    setNameplateFile(file);
    setNameplateState('reading');
    extractMutation.mutate(file);
  };

  const resetNameplate = () => {
    setNameplateFile(null);
    setNameplateState('idle');
    setNameplateError(null);
    setNameplateWarnings([]);
    setNameplateMarks({});
    setNameplateAttrs({});
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const base = {
        name: form.name.trim(),
        make: form.make.trim() || null,
        model: form.model.trim() || null,
        serialNumber: form.serialNumber.trim() || null,
        locationOnSite: form.locationOnSite.trim() || null,
        equipmentTypeId: form.equipmentTypeId || null,
        equipmentCategoryId: form.equipmentCategoryId || null,
        installDate: form.installDate || null,
        warrantyExpiresAt: form.warrantyExpiresAt || null,
        warrantyLaborExpiresAt: form.warrantyLaborExpiresAt || null,
        warrantyDetails: form.warrantyDetails.trim() || null,
        // Send the full attributes object only when the category defines fields
        // (a PATCH without attributes is never validated server-side).
        ...(specFields.length > 0 ? { attributes: buildAttributes(specFields, specValues) } : {}),
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
      const created = await equipmentApi.create(payload);
      // The nameplate photo is the durable record — attach it once the unit
      // exists, then flag it as the source-of-truth shot. Non-fatal: a failed
      // upload/flag must not lose the created record.
      if (nameplateFile) {
        try {
          const img = await equipmentImagesApi.upload(created.id, nameplateFile, { caption: 'Nameplate' });
          await equipmentImagesApi.patch(created.id, img.id, { isNameplate: true });
        } catch {
          /* record stands; the photo just didn't attach */
        }
      }
      return created;
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
      // In-context launch: return to the caller (create hands back the id for
      // auto-attach; edit just goes back) instead of the record page.
      if (returnTo) {
        navigate(appendReturnParams(returnTo, saved.id, attachTo));
        return;
      }
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
    setTouched({
      name: true,
      equipmentTypeId: true,
      equipmentCategoryId: true,
      serviceLocationId: true,
      ...Object.fromEntries(specFields.map((f) => [`spec:${f.fieldKey}`, true])),
    });
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
            {/* Nameplate OCR hero — add mode's primary fill path, AI-gated.
                Cleanly omitted (no placeholder) when AI Features are off. */}
            {showNameplateHero && (
              <EquipmentNameplateHero
                state={nameplateState}
                error={nameplateError}
                warnings={nameplateWarnings}
                onPick={pickNameplate}
                onReset={resetNameplate}
              />
            )}

            {/* Location — standalone add only (scoped/edit carry it in the header). */}
            {standalone && (
              <Card title={getName('service_location')} className="mb-3.5">
                <ServiceLocationPicker
                  value={pickedLocation}
                  onChange={setPickedLocation}
                  label={getName('service_location')}
                  restrictToCustomer={restrictCustomer}
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

            {/* Identity — before Specs: Name is the one required field here, and
                after a scan the VERIFY/READ markers live here, so it sits directly
                under the nameplate banner that says "verify these". */}
            <Card title="Identity" className="mb-3.5">
              {/* Name + on-site paired: the tech is standing at the unit during
                  intake, so the "where on the premises" is fresh in mind. */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
                <Field size="xs">
                  <Label size="xs">{t('equipment.form.locationOnSite')}</Label>
                  <Input
                    size="xs"
                    value={form.locationOnSite}
                    onChange={(e) => set('locationOnSite', e.target.value)}
                    placeholder="Roof · SE quadrant, Basement…"
                  />
                </Field>
              </div>
              <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Field size="xs">
                  <Label size="xs">{t('equipment.form.make')}{nameplateMarks.make && <NameplateBadge kind={nameplateMarks.make} />}</Label>
                  <Input size="xs" value={form.make} onChange={(e) => { set('make', e.target.value); clearMark('make'); }} placeholder="Carrier" />
                </Field>
                <Field size="xs">
                  <Label size="xs">{t('equipment.form.model')}{nameplateMarks.model && <NameplateBadge kind={nameplateMarks.model} />}</Label>
                  <Input size="xs" className="font-mono" value={form.model} onChange={(e) => { set('model', e.target.value); clearMark('model'); }} placeholder="50TC-A06" />
                </Field>
                <Field size="xs">
                  <Label size="xs">{t('equipment.form.serialNumber')}{nameplateMarks.serialNumber && <NameplateBadge kind={nameplateMarks.serialNumber} />}</Label>
                  <Input
                    size="xs"
                    className={nameplateMarks.serialNumber === 'verify' ? 'font-mono [&_input]:!border-warning-500' : 'font-mono'}
                    value={form.serialNumber}
                    onChange={(e) => { set('serialNumber', e.target.value); clearMark('serialNumber'); }}
                    placeholder="A1142099"
                  />
                </Field>
                <Field size="xs">
                  <Label size="xs">{t('equipment.form.installDate')}</Label>
                  <Input size="xs" type="date" value={form.installDate} onChange={(e) => set('installDate', e.target.value)} />
                </Field>
              </div>
            </Card>

            {/* Specs — the chosen category's custom fields (from the tenant
                registry). Renders only once a category with fields is picked. */}
            {form.equipmentCategoryId && specFields.length > 0 && (
              <Card title="Specs" subtitle="Category-specific details." className="mb-3.5">
                {categoryChanged && (
                  <Text size="xs" className="mb-2.5 text-warning-fg">
                    Changing the category replaces these fields — values that don’t apply to the new category won’t be saved.
                  </Text>
                )}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {specFields.map((f) => {
                    const mark = specNameplateMark(f.fieldKey);
                    return (
                      <SpecFieldInput
                        key={f.id}
                        field={f}
                        value={specValues[f.fieldKey] ?? ''}
                        onChange={(v) => setSpec(f.fieldKey, v)}
                        error={touched[`spec:${f.fieldKey}`] && errors[`spec:${f.fieldKey}`]}
                        badge={mark && <NameplateBadge kind={mark} />}
                      />
                    );
                  })}
                </div>
              </Card>
            )}

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
