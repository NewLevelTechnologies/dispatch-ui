/* eslint-disable i18next/no-literal-string -- dense records form; short labels stay literal. Vendor is not a glossary entity; its name comes from t('entities.vendor'). */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { vendorApi, type VendorKind, type CreateVendorRequest } from '../api';
import { showError, showSuccess, extractApiError } from '../lib/toast';
import AppLayout from '../components/AppLayout';
import { Card } from '../components/catalyst/card';
import { Button } from '../components/catalyst/button';
import { Switch } from '../components/catalyst/switch';
import { Field, Label } from '../components/catalyst/fieldset';
import { Input } from '../components/catalyst/input';
import { Select } from '../components/catalyst/select';
import { Textarea } from '../components/catalyst/textarea';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { LoadingState } from '../components/ui/LoadingState';

// Create / edit a vendor. A vendor holds the account details a PO inherits
// (account #, terms, default tax, ordering method, contact), so New-PO prefills
// from the chosen vendor. Full-page form, max-w-720.
const KIND_OPTIONS: { value: VendorKind; label: string }[] = [
  { value: 'DISTRIBUTOR', label: 'Distributor' },
  { value: 'MANUFACTURER', label: 'Manufacturer' },
  { value: 'RETAIL', label: 'Retail' },
  { value: 'OTHER', label: 'Other' },
];
const TERMS_OPTIONS = ['Due on receipt', 'Net 15', 'Net 30', 'Net 60', 'Prepaid', 'COD'];
const ORDERING_OPTIONS = ['Online portal', 'Phone / email', 'Counter pickup', 'EDI'];

interface FormShape {
  name: string;
  kind: VendorKind;
  preferred: boolean;
  accountNumber: string;
  paymentTerms: string;
  taxPct: string;
  orderingMethod: string;
  rep: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

const EMPTY: FormShape = {
  name: '',
  kind: 'DISTRIBUTOR',
  preferred: false,
  accountNumber: '',
  paymentTerms: 'Net 30',
  taxPct: '',
  orderingMethod: 'Online portal',
  rep: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
};

export default function VendorFormPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const editing = !!id;

  const { data: vendor, isLoading } = useQuery({
    queryKey: ['vendor', id],
    queryFn: () => vendorApi.getById(id!),
    enabled: editing,
  });

  const [form, setForm] = useState<FormShape>(EMPTY);
  const [touchedName, setTouchedName] = useState(false);
  const set = (patch: Partial<FormShape>) => setForm((f) => ({ ...f, ...patch }));

  // Prefill once the vendor loads.
  useEffect(() => {
    if (!editing || !vendor) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot form initialization from the loaded record.
    setForm({
      name: vendor.name,
      kind: vendor.kind ?? 'DISTRIBUTOR',
      preferred: !!vendor.preferred,
      accountNumber: vendor.accountNumber ?? '',
      paymentTerms: vendor.paymentTerms ?? 'Net 30',
      taxPct: vendor.taxRate != null ? String(Math.round(vendor.taxRate * 10000) / 100) : '',
      orderingMethod: vendor.orderingMethod ?? 'Online portal',
      rep: vendor.rep ?? '',
      phone: vendor.phone ?? '',
      email: vendor.email ?? '',
      address: vendor.address ?? '',
      notes: vendor.notes ?? '',
    });
  }, [editing, vendor]);

  const nameError = touchedName && !form.name.trim() ? 'Required' : '';

  const save = useMutation({
    mutationFn: () => {
      const body: CreateVendorRequest = {
        name: form.name.trim(),
        kind: form.kind,
        preferred: form.preferred,
        accountNumber: form.accountNumber.trim() || null,
        paymentTerms: form.paymentTerms || null,
        taxRate: form.taxPct.trim() !== '' ? (parseFloat(form.taxPct) || 0) / 100 : null,
        orderingMethod: form.orderingMethod || null,
        rep: form.rep.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      };
      return editing && id ? vendorApi.update(id, body) : vendorApi.create(body);
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      if (id) queryClient.invalidateQueries({ queryKey: ['vendor', id] });
      showSuccess(editing ? 'Vendor saved' : 'Vendor created');
      navigate(`/vendors/${saved.id}`);
    },
    onError: (err: unknown) => showError('Could not save the vendor', extractApiError(err) ?? undefined),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouchedName(true);
    if (!form.name.trim()) return;
    save.mutate();
  };

  if (editing && isLoading) {
    return (
      <AppLayout>
        <LoadingState label="Loading vendor…" />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="px-1 py-1">
        <div className="mx-auto max-w-[720px]">
          <Link
            to={editing ? `/vendors/${id}` : '/vendors'}
            className="mb-2.5 inline-flex items-center gap-1 text-[11.5px] text-fg-muted hover:text-fg-strong"
          >
            ← {editing ? vendor?.name ?? t('entities.vendor') : t('entities.vendors')}
          </Link>

          <div className="mb-4">
            <Heading level={1} size="page-md" className="m-0">
              {editing ? 'Edit vendor' : t('common.actions.add', { entity: t('entities.vendor') })}
            </Heading>
          </div>

          <form onSubmit={submit}>
            {/* Identity */}
            <Card title="Identity" className="mb-3.5">
              <Field size="xs">
                <Label size="xs" required>
                  Vendor name
                </Label>
                <Input
                  size="xs"
                  value={form.name}
                  onChange={(e) => set({ name: e.target.value })}
                  onBlur={() => setTouchedName(true)}
                  invalid={!!nameError}
                  placeholder="Ferguson HVAC Supply"
                />
                {nameError && <Text size="xs" className="mt-1 text-danger-500">{nameError}</Text>}
              </Field>
              <div className="mt-2.5 flex flex-wrap items-end gap-3">
                <Field size="xs" className="min-w-[180px] flex-1">
                  <Label size="xs">Kind</Label>
                  <Select value={form.kind} onChange={(e) => set({ kind: e.target.value as VendorKind })}>
                    {KIND_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <label className="flex h-9 cursor-pointer items-center gap-2.5">
                  <Switch checked={form.preferred} onChange={(v) => set({ preferred: v })} aria-label="Preferred vendor" />
                  <span className="text-[12.5px] text-fg-strong">Preferred vendor</span>
                </label>
              </div>
            </Card>

            {/* Account & terms */}
            <Card title="Account & terms" className="mb-3.5">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <Field size="xs">
                  <Label size="xs">Account #</Label>
                  <Input size="xs" value={form.accountNumber} onChange={(e) => set({ accountNumber: e.target.value })} placeholder="—" />
                </Field>
                <Field size="xs">
                  <Label size="xs">Terms</Label>
                  <Select value={form.paymentTerms} onChange={(e) => set({ paymentTerms: e.target.value })}>
                    {TERMS_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field size="xs">
                  <Label size="xs">Default tax %</Label>
                  <Input
                    size="xs"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.taxPct}
                    onChange={(e) => set({ taxPct: e.target.value })}
                    placeholder="8.6"
                  />
                </Field>
              </div>
              <Field size="xs" className="mt-2.5">
                <Label size="xs">Ordering method</Label>
                <Select value={form.orderingMethod} onChange={(e) => set({ orderingMethod: e.target.value })}>
                  {ORDERING_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              </Field>
            </Card>

            {/* Contact */}
            <Card title="Contact" className="mb-3.5">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Field size="xs">
                  <Label size="xs">Rep</Label>
                  <Input size="xs" value={form.rep} onChange={(e) => set({ rep: e.target.value })} placeholder="—" />
                </Field>
                <Field size="xs">
                  <Label size="xs">Phone</Label>
                  <Input size="xs" type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="(602) 555-0100" />
                </Field>
              </div>
              <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Field size="xs">
                  <Label size="xs">Email</Label>
                  <Input size="xs" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="orders@vendor.com" />
                </Field>
                <Field size="xs">
                  <Label size="xs">Address</Label>
                  <Input size="xs" value={form.address} onChange={(e) => set({ address: e.target.value })} placeholder="Street · City, ST ZIP" />
                </Field>
              </div>
            </Card>

            {/* Notes */}
            <Card title="Notes" className="mb-3.5">
              <Textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Will-call hours, lead times, rep quirks…" />
            </Card>

            {/* Footer */}
            <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-bg-elev px-3.5 py-3 shadow-sm">
              <span className="flex-1" />
              <Button href={editing ? `/vendors/${id}` : '/vendors'} plain size="xs">
                {t('common.cancel')}
              </Button>
              <Button type="submit" color="accent" size="xs" disabled={save.isPending}>
                {save.isPending ? t('common.saving') : editing ? 'Save changes' : t('common.actions.add', { entity: t('entities.vendor') })}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
