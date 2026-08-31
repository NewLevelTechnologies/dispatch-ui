import { useEffect, useState } from 'react';
import type React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { PatternFormat } from 'react-number-format';
import { contactApi, type AdditionalContact, type CreateAdditionalContactRequest } from '../api/setup';
import { extractApiError, showError } from '../lib/toast';
import { validateEmail } from '@dispatch/utils';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { Textarea } from './catalyst/textarea';

// Shared add/edit dialog for a contact person — works for both customer-level
// and service-location-level contacts (they share the same shape + request type;
// only the endpoint differs). Deliberately small (the design's ~480px modal):
// the full field set the cards/tabs render — name, role, mobile/office/after-
// hours, email, notes — and nothing else. Notification preferences stay on the
// card/tab bell action, so this is a clean contact form, not a settings sheet.
type ParentType = 'customer' | 'service_location';

interface ContactFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  parentType: ParentType;
  parentId: string;
  // null = add (creates a non-primary contact). Otherwise edit.
  contact: AdditionalContact | null;
  // Cache key for the contacts list to invalidate on success.
  queryKey: string[];
  // Provided only for non-primary edits — renders the destructive Delete and
  // delegates confirmation to the card's ConfirmDialog. A parent must always
  // keep a primary, so the primary has no Delete (promote another first).
  onRequestDelete?: () => void;
}

type ContactForm = {
  name: string;
  role: string | null;
  mobilePhone: string | null;
  phone: string | null;
  afterHoursPhone: string | null;
  email: string | null;
  notes: string | null;
};

const emptyForm: ContactForm = {
  name: '',
  role: null,
  mobilePhone: null,
  phone: null,
  afterHoursPhone: null,
  email: null,
  notes: null,
};

const ROLE_LIST_ID = 'contact-role-suggestions';

export default function ContactFormDialog({
  isOpen,
  onClose,
  parentType,
  parentId,
  contact,
  queryKey,
  onRequestDelete,
}: ContactFormDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isEdit = !!contact;

  const [form, setForm] = useState<ContactForm>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset the form whenever the dialog opens or the target contact changes.
  useEffect(() => {
    if (!isOpen) return;
    setForm(
      contact
        ? {
            name: contact.name,
            role: contact.role ?? null,
            mobilePhone: contact.mobilePhone ?? null,
            phone: contact.phone ?? null,
            afterHoursPhone: contact.afterHoursPhone ?? null,
            email: contact.email ?? null,
            notes: contact.notes ?? null,
          }
        : emptyForm
    );
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, contact?.id]);

  const onSaved = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({
      queryKey: parentType === 'service_location' ? ['service-location', parentId] : ['customers', parentId],
    });
    onClose();
  };

  const buildRequest = (): CreateAdditionalContactRequest => ({
    name: form.name.trim(),
    role: form.role?.trim() || null,
    mobilePhone: form.mobilePhone || null,
    phone: form.phone || null,
    afterHoursPhone: form.afterHoursPhone || null,
    email: form.email?.trim() || null,
    notes: form.notes?.trim() || null,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateAdditionalContactRequest) =>
      parentType === 'service_location'
        ? contactApi.createServiceLocationContact(parentId, data)
        : contactApi.createCustomerContact(parentId, data),
    onSuccess: onSaved,
    onError: (err) =>
      showError(t('common.form.errorCreate', { entity: t('contacts.entity') }), extractApiError(err) ?? undefined),
  });

  const updateMutation = useMutation({
    mutationFn: (data: CreateAdditionalContactRequest) =>
      parentType === 'service_location'
        ? contactApi.updateServiceLocationContact(parentId, contact!.id, data)
        : contactApi.updateCustomerContact(parentId, contact!.id, data),
    onSuccess: onSaved,
    onError: (err) =>
      showError(t('common.form.errorUpdate', { entity: t('contacts.entity') }), extractApiError(err) ?? undefined),
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const setField = (field: keyof ContactForm, value: string | null) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = t('common.form.required', { field: t('common.form.name') });
    if (form.email && !validateEmail(form.email)) next.email = t('common.form.invalidEmail');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const data = buildRequest();
    if (isEdit) updateMutation.mutate(data);
    else createMutation.mutate(data);
  };

  // Role typeahead — datalist of common values, free text always allowed. The
  // test i18n mock can't return arrays, so guard with Array.isArray (→ no
  // suggestions under test, the real list in-app).
  const roleSuggestionsRaw = t('contacts.roleSuggestions', { returnObjects: true });
  const roleSuggestions = Array.isArray(roleSuggestionsRaw) ? (roleSuggestionsRaw as string[]) : [];

  return (
    <Dialog open={isOpen} onClose={onClose} size="lg">
      <DialogTitle>{isEdit ? t('contacts.form.titleEdit') : t('contacts.form.titleCreate')}</DialogTitle>
      <DialogDescription>
        {isEdit ? t('contacts.form.descriptionEdit') : t('contacts.form.descriptionCreate')}
      </DialogDescription>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          <Fieldset>
            <FieldGroup>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field>
                  <Label>{t('common.form.name')} *</Label>
                  <Input
                    size="xs"
                    name="name"
                    value={form.name}
                    onChange={(e) => setField('name', e.target.value)}
                    invalid={!!errors.name}
                  />
                  {errors.name && <div className="mt-1 text-[11px] text-danger-500">{errors.name}</div>}
                </Field>

                <Field>
                  <Label>{t('common.form.role')}</Label>
                  <Input
                    size="xs"
                    name="role"
                    list={ROLE_LIST_ID}
                    value={form.role ?? ''}
                    onChange={(e) => setField('role', e.target.value)}
                  />
                  <datalist id={ROLE_LIST_ID}>
                    {roleSuggestions.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </Field>

                <Field>
                  <Label>{t('common.form.mobilePhone')}</Label>
                  <PatternFormat
                    format="(###) ###-####"
                    mask="_"
                    customInput={Input}
                    size="xs"
                    name="mobilePhone"
                    value={form.mobilePhone ?? ''}
                    onValueChange={(v) => setField('mobilePhone', v.value || null)}
                  />
                </Field>

                <Field>
                  <Label>{t('common.form.officePhone')}</Label>
                  <PatternFormat
                    format="(###) ###-####"
                    mask="_"
                    customInput={Input}
                    size="xs"
                    name="phone"
                    value={form.phone ?? ''}
                    onValueChange={(v) => setField('phone', v.value || null)}
                  />
                </Field>

                <Field>
                  <Label>{t('common.form.afterHoursPhone')}</Label>
                  <PatternFormat
                    format="(###) ###-####"
                    mask="_"
                    customInput={Input}
                    size="xs"
                    name="afterHoursPhone"
                    value={form.afterHoursPhone ?? ''}
                    onValueChange={(v) => setField('afterHoursPhone', v.value || null)}
                  />
                </Field>

                <Field>
                  <Label>{t('common.form.email')}</Label>
                  <Input
                    size="xs"
                    name="email"
                    type="email"
                    value={form.email ?? ''}
                    onChange={(e) => setField('email', e.target.value)}
                    invalid={!!errors.email}
                  />
                  {errors.email && <div className="mt-1 text-[11px] text-danger-500">{errors.email}</div>}
                </Field>

                <div className="col-span-2">
                  <Field>
                    <Label>{t('common.form.notes')}</Label>
                    <Textarea
                      name="notes"
                      value={form.notes ?? ''}
                      onChange={(e) => setField('notes', e.target.value)}
                      rows={2}
                    />
                  </Field>
                </div>
              </div>
            </FieldGroup>
          </Fieldset>
        </DialogBody>
        <DialogActions>
          {/* Destructive Delete on the far left, edit-only and never for the
              primary. Delegates confirmation to the card's ConfirmDialog. */}
          {isEdit && onRequestDelete && (
            <Button outline="red" onClick={onRequestDelete} disabled={isSubmitting} className="mr-auto">
              {t('contacts.form.delete')}
            </Button>
          )}
          <Button plain onClick={onClose} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" color="accent" disabled={isSubmitting}>
            {isSubmitting ? t('common.saving') : t('common.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
