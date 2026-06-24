/* eslint-disable i18next/no-literal-string -- dense v1.5 settings surface; same convention as AccountSettingsPage. This panel edits the tenant's own company record (not a glossary entity), so copy lives inline rather than routing through getName()/t(). */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PatternFormat } from 'react-number-format';
import {
  EnvelopeIcon,
  GlobeAltIcon,
  ArrowUpTrayIcon,
  TrashIcon,
  BuildingOffice2Icon,
  HomeIcon,
} from '@heroicons/react/24/outline';
import {
  tenantSettingsApi,
  type TenantSettings,
  type UpdateTenantSettingsRequest,
  type PremiseType,
  type RecognitionBasis,
} from '../../api';
import { useHasCapability } from '../../hooks/useCurrentUser';
import { PageHead } from '../../components/ui/PageHead';
import { EditableCard } from '../../components/ui/EditableCard';
import { Callout } from '../../components/ui/Callout';
import { ToggleGroup, ToggleGroupOption } from '../../components/ui/ToggleGroup';
import { PremiseMark } from '../../components/ui/PremiseMark';
import { Field, Label, Description } from '../../components/catalyst/fieldset';
import { Switch } from '../../components/catalyst/switch';
import { Input } from '../../components/catalyst/input';
import { Select } from '../../components/catalyst/select';
import { Button } from '../../components/catalyst/button';
import { Text } from '../../components/catalyst/text';
import { dense } from '../../components/ui/dense';
import { US_STATES } from '../../constants/states';
import { REPORTING_TIMEZONES, reportingTimezoneLabel } from '../../constants/timezones';
import { showSuccess, showError, extractApiError } from '../../lib/toast';

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────
function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Phone is stored as raw digits and rendered formatted, so dirty-tracking
// compares like-for-like (react-number-format reformats its value prop, which
// would otherwise read as a spurious edit on mount).
function stripPhoneDigits(value?: string | null): string {
  return (value ?? '').replace(/\D/g, '');
}
function formatPhoneDisplay(value?: string | null): string {
  const d = stripPhoneDigits(value);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return value ?? '';
}

function logoFilenameFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const segment = new URL(url).pathname.split('/').filter(Boolean).pop();
    return segment ? decodeURIComponent(segment) : null;
  } catch {
    return null;
  }
}

// Key/value pair for the view-mode body of each card. The DS has no 2-column
// KV grid primitive (DataRow is row-oriented for `padding="none"` cards), so
// this small presentational helper stays local to the panel.
function Kv({
  label,
  children,
  span2,
  empty,
}: {
  label: string;
  children: ReactNode;
  span2?: boolean;
  empty?: boolean;
}) {
  return (
    <div className={span2 ? 'min-w-0 sm:col-span-2' : 'min-w-0'}>
      {/* 10.5px uppercase micro-label — below the Text scale, kept inline per
          the DS "keep inline" guidance for micro labels. */}
      <div className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-fg-muted">
        {label}
      </div>
      <Text as="div" size="sm" tone={empty ? 'dim' : 'strong'} className={empty ? 'mt-1 italic' : 'mt-1'}>
        {children}
      </Text>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Panel — fetch + loading/error + the three editable cards
// ──────────────────────────────────────────────────────────────────
export default function CompanyProfilePanel() {
  const canEdit = useHasCapability('EDIT_SETTINGS');

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.getSettings(),
  });

  return (
    <>
      <PageHead
        title="Company Profile"
        sub="Your business identity, operating settings, and branding. These appear on customer-facing documents (invoices, quotes, dispatch emails) and in the app header."
      />

      {isLoading || !settings ? (
        error ? (
          <Callout kind="danger" title="Couldn't load company profile">
            {extractApiError(error) ?? (error as Error).message}
          </Callout>
        ) : (
          <Text tone="muted">Loading settings…</Text>
        )
      ) : (
        <div className="flex max-w-[920px] flex-col gap-3.5">
          <IdentityCard settings={settings} canEdit={canEdit} />
          <OperatingCard settings={settings} canEdit={canEdit} />
          <RevenueRecognitionCard settings={settings} canEdit={canEdit} />
          <BrandingCard settings={settings} canEdit={canEdit} />
          <AiFeaturesCard settings={settings} canEdit={canEdit} />
          <NotificationsCard settings={settings} canEdit={canEdit} />
        </div>
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────
// Card 1 — Identity
// ──────────────────────────────────────────────────────────────────
type IdentityForm = {
  companyName: string;
  companyNameShort: string;
  companySlogan: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  email: string;
};

function buildIdentityForm(s: TenantSettings): IdentityForm {
  return {
    companyName: s.companyName ?? '',
    companyNameShort: s.companyNameShort ?? '',
    companySlogan: s.companySlogan ?? '',
    streetAddress: s.streetAddress ?? '',
    city: s.city ?? '',
    state: s.state ?? '',
    zipCode: s.zipCode ?? '',
    phone: stripPhoneDigits(s.phone),
    email: s.email ?? '',
  };
}

function IdentityCard({ settings, canEdit }: { settings: TenantSettings; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<IdentityForm>(() => buildIdentityForm(settings));

  // Re-sync from server when settings change and we're not mid-edit (after a
  // save here, or a refetch from elsewhere). In-progress edits are never
  // clobbered because the sync is gated on `!editing`.
  useEffect(() => {
    if (!editing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm(buildIdentityForm(settings));
    }
  }, [settings, editing]);

  const initial = useMemo(() => buildIdentityForm(settings), [settings]);
  const dirty = (Object.keys(form) as (keyof IdentityForm)[]).some((k) => form[k] !== initial[k]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: UpdateTenantSettingsRequest = {
        companyName: form.companyName.trim(),
        companyNameShort: form.companyNameShort.trim() || null,
        companySlogan: form.companySlogan.trim() || null,
        streetAddress: form.streetAddress.trim() || null,
        city: form.city.trim() || null,
        state: form.state || null,
        zipCode: form.zipCode.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
      };
      return tenantSettingsApi.updateSettings(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      setEditing(false);
      showSuccess('Company profile saved');
    },
    onError: (err: unknown) => showError("Couldn't save changes", extractApiError(err)),
  });

  const set = (k: keyof IdentityForm, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const handleCancel = () => {
    setForm(buildIdentityForm(settings));
    setEditing(false);
  };

  const isEmpty = !settings.companyName;
  const cityStateZip = [settings.city, [settings.state, settings.zipCode].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');

  return (
    <EditableCard
      title="Identity"
      subtitle="Name and contact info shown on invoices, quotes, and customer-facing emails."
      editing={editing}
      onEdit={canEdit ? () => setEditing(true) : () => {}}
      onCancel={handleCancel}
      onSave={() => saveMutation.mutate()}
      saving={saveMutation.isPending}
      saveDisabled={!dirty || saveMutation.isPending}
      editLabel={isEmpty ? 'Complete identity' : 'Edit'}
    >
      {editing ? (
        <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <Field size="xs">
            <Label size="xs" required>Company name</Label>
            <Input size="xs" value={form.companyName} onChange={(e) => set('companyName', e.target.value)} placeholder="Pinecrest HVAC" />
          </Field>
          <Field size="xs">
            <Label size="xs" hint="used in tight spaces">Short name</Label>
            <Input size="xs" value={form.companyNameShort} onChange={(e) => set('companyNameShort', e.target.value)} placeholder="Pinecrest" />
          </Field>

          <Field size="xs" className="sm:col-span-2">
            <Label size="xs" hint="optional">Slogan</Label>
            <Input size="xs" value={form.companySlogan} onChange={(e) => set('companySlogan', e.target.value)} placeholder="(optional)" />
            <Description size="xs">Appears on invoice + quote headers when set.</Description>
          </Field>

          <Field size="xs" className="sm:col-span-2">
            <Label size="xs" required>Street address</Label>
            <Input size="xs" value={form.streetAddress} onChange={(e) => set('streetAddress', e.target.value)} placeholder="123 Main St" />
          </Field>

          <Field size="xs">
            <Label size="xs">City</Label>
            <Input size="xs" value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Atlanta" />
          </Field>
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <Field size="xs">
              <Label size="xs">State</Label>
              <Select className={dense.select} value={form.state} onChange={(e) => set('state', e.target.value)}>
                <option value="">—</option>
                {US_STATES.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </Select>
            </Field>
            <Field size="xs">
              <Label size="xs">ZIP</Label>
              <Input size="xs" inputMode="numeric" value={form.zipCode} onChange={(e) => set('zipCode', e.target.value)} placeholder="30318" />
            </Field>
          </div>

          <Field size="xs">
            <Label size="xs" required>Phone</Label>
            <PatternFormat
              format="(###) ###-####"
              mask="_"
              customInput={Input}
              size="xs"
              type="tel"
              value={form.phone}
              onValueChange={(values) => set('phone', values.value)}
              placeholder="(404) 555-0100"
            />
          </Field>
          <Field size="xs">
            <Label size="xs" required>Email</Label>
            <Input size="xs" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="hello@example.com" />
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
          <Kv label="Company name" empty={isEmpty}>
            {settings.companyName || 'Set your company name'}
          </Kv>
          <Kv label="Short name" empty={!settings.companyNameShort}>
            {settings.companyNameShort || '—'}
          </Kv>

          {(settings.companySlogan || isEmpty) && (
            <Kv label="Slogan" span2 empty={!settings.companySlogan}>
              {settings.companySlogan || 'Not set'}
            </Kv>
          )}

          <Kv label="Address" span2 empty={!settings.streetAddress}>
            {settings.streetAddress ? (
              <>
                {settings.streetAddress}
                {cityStateZip && (
                  <>
                    <br />
                    {cityStateZip}
                  </>
                )}
              </>
            ) : (
              'Set your business address'
            )}
          </Kv>

          <Kv label="Phone" empty={!settings.phone}>
            {settings.phone ? formatPhoneDisplay(settings.phone) : 'Set phone'}
          </Kv>
          <Kv label="Email" empty={!settings.email}>
            {settings.email ? (
              <span className="inline-flex items-center gap-1.5">
                <EnvelopeIcon className="size-3.5 text-fg-muted" />
                {settings.email}
              </span>
            ) : (
              'Set email'
            )}
          </Kv>
        </div>
      )}
    </EditableCard>
  );
}

// ──────────────────────────────────────────────────────────────────
// Card 2 — Operating (reporting timezone)
// ──────────────────────────────────────────────────────────────────
function OperatingCard({ settings, canEdit }: { settings: TenantSettings; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [timezone, setTimezone] = useState(settings.timezone);
  const [premise, setPremise] = useState<PremiseType>(settings.defaultPremiseType);

  useEffect(() => {
    if (!editing) {
      setTimezone(settings.timezone);
      setPremise(settings.defaultPremiseType);
    }
  }, [settings.timezone, settings.defaultPremiseType, editing]);

  // Browser-detected zone. Offered as an explicit override only — the
  // authoritative source is the business address (resolved BE-side). Hidden
  // when it already matches the current selection.
  const detectedZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return null;
    }
  }, []);

  const dirty = timezone !== settings.timezone || premise !== settings.defaultPremiseType;

  const saveMutation = useMutation({
    // Partial PUT — send only what changed.
    mutationFn: () => {
      const payload: UpdateTenantSettingsRequest = {};
      if (timezone !== settings.timezone) payload.timezone = timezone;
      if (premise !== settings.defaultPremiseType) payload.defaultPremiseType = premise;
      return tenantSettingsApi.updateSettings(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      setEditing(false);
      showSuccess('Operating settings saved');
    },
    onError: (err: unknown) => showError("Couldn't save changes", extractApiError(err)),
  });

  const handleCancel = () => {
    setTimezone(settings.timezone);
    setPremise(settings.defaultPremiseType);
    setEditing(false);
  };

  // Provenance line — the recovery affordance. Renders real data only:
  //   • manual change → "Last changed by {name}, {date}" (BE-pending fields)
  //   • BE-confirmed auto-detect (timezoneSetBy === null) → "Auto-detected…"
  //   • neither known yet → a neutral recovery hint (no fabricated history)
  // The provenance fields don't exist on the tenant-settings endpoint yet;
  // see PR notes for the BE ask. This lights up automatically once they land.
  const provenance: ReactNode = (() => {
    if (settings.timezoneSetByName && settings.timezoneSetAt) {
      return (
        <>
          Last changed by <span className="text-fg">{settings.timezoneSetByName}</span>
          {formatDate(settings.timezoneSetAt) ? `, ${formatDate(settings.timezoneSetAt)}` : ''}
        </>
      );
    }
    if (settings.timezoneSetBy === null && settings.zipCode) {
      return `Auto-detected on signup from your business address (${settings.zipCode}). Change if your business operates from a different timezone.`;
    }
    return 'Change this if your business operates from a different timezone.';
  })();

  return (
    <EditableCard
      title="Operating"
      subtitle="Defaults that drive your business day — reporting timezone (scheduling, invoice aging, end-of-day reports, 'today' rollups) and the premise type new service locations start as. Customer-facing job times follow each job's service location."
      editing={editing}
      onEdit={canEdit ? () => setEditing(true) : () => {}}
      onCancel={handleCancel}
      onSave={() => saveMutation.mutate()}
      saving={saveMutation.isPending}
      saveDisabled={!dirty || saveMutation.isPending}
    >
      {editing ? (
        <div className="flex max-w-[460px] flex-col gap-4">
          <Field size="xs">
            <Label size="xs" required>Reporting timezone</Label>
            <Select className={dense.select} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {REPORTING_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label} · {tz.value}</option>
              ))}
            </Select>
            <Description size="xs">
              Defines your business day. Changing it shifts which work orders count as "today," when invoice aging clocks tick over, and how scheduled reports group by date.
            </Description>
            {detectedZone && detectedZone !== timezone && (
              <Button plain size="xs" type="button" className="mt-1.5" onClick={() => setTimezone(detectedZone)}>
                <GlobeAltIcon className="size-3" />
                Use my device timezone ({detectedZone})
              </Button>
            )}
          </Field>
          <Field size="xs">
            <Label size="xs">Default for new service locations</Label>
            <ToggleGroup<PremiseType> value={premise} onChange={setPremise} aria-label="Default premise type for new service locations" className="mt-1">
              <ToggleGroupOption value="BUSINESS">
                <BuildingOffice2Icon className="size-3.5" />
                Business
              </ToggleGroupOption>
              <ToggleGroupOption value="RESIDENCE">
                <HomeIcon className="size-3.5" />
                Residence
              </ToggleGroupOption>
            </ToggleGroup>
            <Description size="xs">
              Applies to new locations only — existing locations keep their current premise. You can override this on any individual location.
            </Description>
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
          <Kv label="Reporting timezone">
            <span className="inline-flex items-center gap-1.5">
              <GlobeAltIcon className="size-3.5 text-fg-muted" />
              {reportingTimezoneLabel(settings.timezone)}
            </span>
            <Text as="div" size="xs" tone="muted" className="ml-[19px]">{settings.timezone}</Text>
            {/* 10.5px provenance / recovery hint — micro-metadata in fg-dim, kept inline. */}
            <div className="mt-1.5 max-w-[380px] text-[10.5px] leading-[1.45] text-fg-dim">
              {provenance}
            </div>
          </Kv>
          <Kv label="New location default">
            <span className="inline-flex items-center gap-1.5">
              <PremiseMark premise={settings.defaultPremiseType} />
              {settings.defaultPremiseType === 'BUSINESS' ? 'Business' : 'Residence'}
            </span>
          </Kv>
        </div>
      )}
    </EditableCard>
  );
}

// ──────────────────────────────────────────────────────────────────
// Card — Revenue recognition (accrual reporting gate + basis)
// ──────────────────────────────────────────────────────────────────
const RECOGNITION_BASIS_LABEL: Record<RecognitionBasis, string> = {
  STRAIGHT_LINE: 'Straight-line',
  PER_VISIT: 'Per-visit',
};

function RevenueRecognitionCard({ settings, canEdit }: { settings: TenantSettings; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  // Absent on older responses — treat undefined as off / straight-line.
  const currentEnabled = settings.revenueRecognitionEnabled ?? false;
  const currentBasis = settings.revenueRecognitionBasis ?? 'STRAIGHT_LINE';
  const [enabled, setEnabled] = useState(currentEnabled);
  const [basis, setBasis] = useState<RecognitionBasis>(currentBasis);

  useEffect(() => {
    if (!editing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEnabled(currentEnabled);
      setBasis(currentBasis);
    }
  }, [currentEnabled, currentBasis, editing]);

  const dirty = enabled !== currentEnabled || basis !== currentBasis;

  const saveMutation = useMutation({
    // Partial PUT — send only what changed.
    mutationFn: () => {
      const payload: UpdateTenantSettingsRequest = {};
      if (enabled !== currentEnabled) payload.revenueRecognitionEnabled = enabled;
      if (basis !== currentBasis) payload.revenueRecognitionBasis = basis;
      return tenantSettingsApi.updateSettings(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      setEditing(false);
      showSuccess('Revenue recognition saved');
    },
    onError: (err: unknown) => showError("Couldn't save changes", extractApiError(err)),
  });

  const handleCancel = () => {
    setEnabled(currentEnabled);
    setBasis(currentBasis);
    setEditing(false);
  };

  return (
    <EditableCard
      title="Revenue recognition"
      subtitle="Accrual reporting for service agreements — show contract value as it's earned (recognized) vs. unearned (deferred). A management/reporting metric, not your posted books. Leave off for cash-basis accounting."
      editing={editing}
      onEdit={canEdit ? () => setEditing(true) : () => {}}
      onCancel={handleCancel}
      onSave={() => saveMutation.mutate()}
      saving={saveMutation.isPending}
      saveDisabled={!dirty || saveMutation.isPending}
    >
      {editing ? (
        <div className="flex max-w-[460px] flex-col gap-4">
          {/* Canonical settings toggle-row scale (matches AI features). */}
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-fg-strong">Show recognized / deferred revenue</div>
              <div className="mt-0.5 text-[12px] text-fg-muted">
                Adds a recognition breakdown to each service agreement. Off by default — most shops run cash-basis.
              </div>
            </div>
            <Switch
              checked={enabled}
              onChange={setEnabled}
              disabled={!canEdit}
              aria-label="Show recognized / deferred revenue"
              className="mt-0.5 shrink-0"
            />
          </div>
          {/* Basis only matters once it's shown — reveal on enable so the
              bookkeeper sets both in one edit. */}
          {enabled && (
            <Field size="xs">
              <Label size="xs">Recognition basis</Label>
              <ToggleGroup<RecognitionBasis> value={basis} onChange={setBasis} aria-label="Revenue recognition basis" className="mt-1">
                <ToggleGroupOption value="STRAIGHT_LINE">Straight-line</ToggleGroupOption>
                <ToggleGroupOption value="PER_VISIT">Per-visit</ToggleGroupOption>
              </ToggleGroup>
              <Description size="xs">
                Straight-line earns the contract value evenly across the term (stand-ready coverage). Per-visit earns it per completed work order (prepaid discrete visits). An accounting-policy choice — your bookkeeper sets it.
              </Description>
            </Field>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
          <Kv label="Revenue recognition">
            {currentEnabled ? `On · ${RECOGNITION_BASIS_LABEL[currentBasis]}` : 'Off'}
          </Kv>
        </div>
      )}
    </EditableCard>
  );
}

// ──────────────────────────────────────────────────────────────────
// Card — AI features (tenant-wide enablement toggle)
// ──────────────────────────────────────────────────────────────────
function AiFeaturesCard({ settings, canEdit }: { settings: TenantSettings; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  // Absent on older responses — treat undefined as off.
  const current = settings.enableAiFeatures ?? false;
  const [enabled, setEnabled] = useState(current);

  useEffect(() => {
    if (!editing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEnabled(current);
    }
  }, [current, editing]);

  const dirty = enabled !== current;

  const saveMutation = useMutation({
    mutationFn: () => tenantSettingsApi.updateSettings({ enableAiFeatures: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      setEditing(false);
      showSuccess('AI features saved');
    },
    onError: (err: unknown) => showError("Couldn't save changes", extractApiError(err)),
  });

  const handleCancel = () => {
    setEnabled(current);
    setEditing(false);
  };

  return (
    <EditableCard
      title="AI features"
      subtitle="Turn on AI-assisted tools across the app — smarter summaries, suggestions, and automation."
      editing={editing}
      onEdit={canEdit ? () => setEditing(true) : () => {}}
      onCancel={handleCancel}
      onSave={() => saveMutation.mutate()}
      saving={saveMutation.isPending}
      saveDisabled={!dirty || saveMutation.isPending}
    >
      {editing ? (
        // Canonical settings toggle-row scale (matches the destructive-footer /
        // DataRow pattern): label 13px/600, description 12px/muted, control on
        // the right — deliberately a clear step below the card header.
        <div className="flex max-w-[460px] items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-fg-strong">Enable AI features</div>
            <div className="mt-0.5 text-[12px] text-fg-muted">
              Allow the app to use AI for summaries, suggestions, and automation.
            </div>
          </div>
          <Switch
            checked={enabled}
            onChange={setEnabled}
            disabled={!canEdit}
            aria-label="Enable AI features"
            className="mt-0.5 shrink-0"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
          <Kv label="AI features">{current ? 'Enabled' : 'Disabled'}</Kv>
        </div>
      )}
    </EditableCard>
  );
}

// ──────────────────────────────────────────────────────────────────
// Card — Notifications (tenant-wide external email/SMS master switch)
//
// Single boolean ridden onto PUT /tenant-settings. When OFF, notification-
// service suppresses every outbound email/SMS to customers and technicians
// (in-app streams are unaffected) — the intended use is loading real customer
// data while exploring the app without contacting anyone. Defaults ON; the
// OFF state is surfaced loudly (a warning Callout) in both view and edit mode
// since a silent suppression is a high-consequence, easy-to-forget state.
// ──────────────────────────────────────────────────────────────────
function NotificationsCard({ settings, canEdit }: { settings: TenantSettings; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const current = settings.enableExternalNotifications;
  const [enabled, setEnabled] = useState(current);

  useEffect(() => {
    if (!editing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEnabled(current);
    }
  }, [current, editing]);

  const dirty = enabled !== current;

  const saveMutation = useMutation({
    mutationFn: () => tenantSettingsApi.updateSettings({ enableExternalNotifications: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      setEditing(false);
      showSuccess('Notification settings saved');
    },
    onError: (err: unknown) => showError("Couldn't save changes", extractApiError(err)),
  });

  const handleCancel = () => {
    setEnabled(current);
    setEditing(false);
  };

  return (
    <EditableCard
      title="Notifications"
      subtitle="Control whether the app sends email and SMS to your customers and technicians."
      editing={editing}
      onEdit={canEdit ? () => setEditing(true) : () => {}}
      onCancel={handleCancel}
      onSave={() => saveMutation.mutate()}
      saving={saveMutation.isPending}
      saveDisabled={!dirty || saveMutation.isPending}
    >
      {editing ? (
        <div className="flex flex-col gap-3">
          {/* Toggle-row scale mirrors the AI features card. */}
          <div className="flex max-w-[460px] items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-fg-strong">
                Send external notifications (email/SMS)
              </div>
              <div className="mt-0.5 text-[12px] text-fg-muted">
                When off, customers and technicians won't receive any emails or texts. Use this
                while exploring the app with real data.
              </div>
            </div>
            <Switch
              checked={enabled}
              onChange={setEnabled}
              disabled={!canEdit}
              aria-label="Send external notifications"
              className="mt-0.5 shrink-0"
            />
          </div>
          {!enabled && (
            <Callout kind="warning" className="max-w-[560px]">
              All outbound email and SMS will be suppressed for every customer and technician.
              In-app notifications are unaffected.
            </Callout>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
            <Kv label="External notifications">{current ? 'Enabled' : 'Disabled'}</Kv>
          </div>
          {!current && (
            <Callout kind="warning" className="max-w-[560px]">
              External email and SMS are turned off — customers and technicians aren't receiving
              any notifications.
            </Callout>
          )}
        </div>
      )}
    </EditableCard>
  );
}

// ──────────────────────────────────────────────────────────────────
// Card 3 — Branding (logo)
//
// Upload/replace use POST /tenant-settings/logo; removal uses DELETE
// /tenant-settings/logo. Both are staged in edit mode (file held locally, or a
// removal flagged) and applied on Save, so the card keeps its per-card Save
// model — Cancel backs out of a pending upload *or* removal without touching
// the server. Upload and removal are mutually exclusive: choosing one clears
// the other.
// ──────────────────────────────────────────────────────────────────
const LOGO_MAX_BYTES = 1 * 1024 * 1024;
const LOGO_MIME_TYPES = ['image/png', 'image/svg+xml'];

function BrandingCard({ settings, canEdit }: { settings: TenantSettings; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // Staged removal of the saved logo, applied on Save (mutually exclusive with
  // a staged file upload). Cancel/clear resets it.
  const [removeRequested, setRemoveRequested] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const savedLogoUrl = settings.logoThumbnailUrl ?? settings.logoMediumUrl ?? null;
  const savedFilename =
    logoFilenameFromUrl(settings.logoOriginalUrl) ?? logoFilenameFromUrl(savedLogoUrl);
  const uploadedAt = formatDate(settings.updatedAt);

  const dirty = file !== null || removeRequested;

  const uploadMutation = useMutation({
    mutationFn: (f: File) => tenantSettingsApi.uploadLogo(f),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      clearSelection();
      setEditing(false);
      showSuccess('Logo updated');
    },
    onError: (err: unknown) => showError("Couldn't upload logo", extractApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => tenantSettingsApi.deleteLogo(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      clearSelection();
      setEditing(false);
      showSuccess('Logo removed');
    },
    onError: (err: unknown) => showError("Couldn't remove logo", extractApiError(err)),
  });

  const saving = uploadMutation.isPending || deleteMutation.isPending;

  function clearSelection() {
    setFile(null);
    setPreview(null);
    setRemoveRequested(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    if (!LOGO_MIME_TYPES.includes(picked.type)) {
      showError("Couldn't use that file", 'Logo must be a PNG or SVG.');
      return;
    }
    if (picked.size > LOGO_MAX_BYTES) {
      showError("Couldn't use that file", 'Logo must be 1 MB or smaller.');
      return;
    }
    setRemoveRequested(false);
    setFile(picked);
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(picked);
  };

  // Flag the saved logo for removal, discarding any staged upload.
  const handleRequestRemove = () => {
    setFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setRemoveRequested(true);
  };

  const handleCancel = () => {
    clearSelection();
    setEditing(false);
  };

  const handleSave = () => {
    if (removeRequested) deleteMutation.mutate();
    else if (file) uploadMutation.mutate(file);
  };

  const shownLogoUrl = removeRequested ? null : (preview ?? savedLogoUrl);

  const logoBox = shownLogoUrl ? (
    <img
      src={shownLogoUrl}
      alt="Company logo"
      className="size-16 shrink-0 rounded-lg border border-border bg-bg-elev-2 object-contain"
    />
  ) : (
    <div className="grid size-16 shrink-0 place-items-center rounded-lg border border-dashed border-border bg-bg-elev-2 text-center text-[10px] leading-tight text-fg-dim">
      No
      <br />
      logo
    </div>
  );

  return (
    <EditableCard
      title="Branding"
      subtitle="Your logo. Appears in the app header and on customer-facing email + PDF templates."
      editing={editing}
      onEdit={canEdit ? () => setEditing(true) : () => {}}
      onCancel={handleCancel}
      onSave={handleSave}
      saving={saving}
      saveDisabled={!dirty || saving}
    >
      {editing ? (
        <div className="flex items-center gap-4">
          {logoBox}
          <div className="min-w-0 flex-1">
            <input
              ref={fileInputRef}
              type="file"
              accept={LOGO_MIME_TYPES.join(',')}
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <Button outline size="xs" type="button" onClick={() => fileInputRef.current?.click()}>
                <ArrowUpTrayIcon className="size-3.5" />
                {savedLogoUrl && !removeRequested ? 'Replace logo' : 'Upload logo'}
              </Button>
              {savedLogoUrl &&
                (removeRequested ? (
                  <Button plain size="xs" type="button" onClick={() => setRemoveRequested(false)}>
                    Keep current logo
                  </Button>
                ) : (
                  <Button plain size="xs" type="button" onClick={handleRequestRemove}>
                    <TrashIcon className="size-3.5" />
                    Remove
                  </Button>
                ))}
            </div>
            {removeRequested ? (
              <Text size="xs" tone="dim" className="mt-1.5">Logo will be removed — save to apply.</Text>
            ) : file ? (
              <Text size="xs" tone="dim" className="mt-1.5">{file.name} — save to apply</Text>
            ) : (
              <Text size="xs" tone="muted" className="mt-1.5 leading-[1.5]">
                PNG or SVG recommended · transparent background · square or wide formats · max 1 MB.
              </Text>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-[18px]">
          {logoBox}
          <div className="min-w-0">
            {savedLogoUrl ? (
              <>
                <Text as="div" size="sm" tone="strong" className="truncate font-medium">
                  {savedFilename ?? 'Logo uploaded'}
                </Text>
                {uploadedAt && (
                  <Text as="div" size="xs" tone="muted" className="mt-0.5">Uploaded {uploadedAt}</Text>
                )}
              </>
            ) : (
              <Text size="sm" tone="muted">
                No logo set yet. Your initials will be used as a fallback in the meantime.
              </Text>
            )}
          </div>
        </div>
      )}
    </EditableCard>
  );
}
