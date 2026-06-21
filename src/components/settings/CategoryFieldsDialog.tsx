/* eslint-disable i18next/no-literal-string -- dense settings dialog; reused actions (Cancel/Save/Delete) route through t(), but the field-definition labels and the data-type names stay literal, same convention as the other dense form surfaces. */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon, PlusIcon } from '@heroicons/react/24/outline';
import {
  equipmentCategoryFieldsApi,
  type EquipmentCategory,
  type EquipmentCategoryField,
  type EquipmentFieldDataType,
} from '../../api';
import { Dialog, DialogActions, DialogBody, DialogTitle } from '../catalyst/dialog';
import { Button } from '../catalyst/button';
import { Checkbox, CheckboxField } from '../catalyst/checkbox';
import { Field, Label } from '../catalyst/fieldset';
import { Input } from '../catalyst/input';
import { Select } from '../catalyst/select';
import { Textarea } from '../catalyst/textarea';
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '../catalyst/dropdown';
import IconButton from '../IconButton';
import { Pill } from '../ui/Pill';
import { EmptyState } from '../ui/EmptyState';
import { LoadingState } from '../ui/LoadingState';
import { extractApiError, showError, showSuccess } from '../../lib/toast';

const DATA_TYPES: EquipmentFieldDataType[] = ['TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT'];
const DATA_TYPE_LABEL: Record<EquipmentFieldDataType, string> = {
  TEXT: 'Text',
  NUMBER: 'Number',
  DATE: 'Date',
  BOOLEAN: 'Yes / No',
  SELECT: 'Select',
};
// Mirror of the backend rule; surfaced client-side so the error is immediate.
const FIELD_KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;

interface Props {
  category: EquipmentCategory | null;
  onClose: () => void;
}

interface FormState {
  fieldKey: string;
  label: string;
  dataType: EquipmentFieldDataType;
  optionsText: string; // newline-separated; SELECT only
  required: boolean;
  helpText: string;
}
const EMPTY_FORM: FormState = {
  fieldKey: '',
  label: '',
  dataType: 'TEXT',
  optionsText: '',
  required: false,
  helpText: '',
};

export default function CategoryFieldsDialog({ category, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const open = category !== null;
  const categoryId = category?.id ?? '';
  const fieldsKey = useMemo(() => ['equipment-category-fields', categoryId], [categoryId]);

  const { data: fields = [], isLoading } = useQuery({
    queryKey: fieldsKey,
    queryFn: () => equipmentCategoryFieldsApi.getAll(categoryId),
    enabled: open,
  });

  const [mode, setMode] = useState<'list' | 'form'>('list');
  const [editingField, setEditingField] = useState<EquipmentCategoryField | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  // Reset to the list whenever the dialog opens for a different category.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMode('list');
    setEditingField(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }, [categoryId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const invalidate = () => queryClient.invalidateQueries({ queryKey: fieldsKey });

  const createMut = useMutation({
    mutationFn: (req: Parameters<typeof equipmentCategoryFieldsApi.create>[1]) =>
      equipmentCategoryFieldsApi.create(categoryId, req),
    onSuccess: () => {
      invalidate();
      showSuccess('Field added');
      setMode('list');
    },
    onError: (err) => setFormError(extractApiError(err) ?? 'Couldn’t save the field'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, req }: { id: string; req: Parameters<typeof equipmentCategoryFieldsApi.update>[2] }) =>
      equipmentCategoryFieldsApi.update(categoryId, id, req),
    onSuccess: () => {
      invalidate();
      showSuccess('Field updated');
      setMode('list');
    },
    onError: (err) => setFormError(extractApiError(err) ?? 'Couldn’t save the field'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => equipmentCategoryFieldsApi.delete(categoryId, id),
    onSuccess: () => {
      invalidate();
      showSuccess('Field removed');
    },
    onError: (err) => showError('Couldn’t remove the field', extractApiError(err) ?? undefined),
  });

  const reorderMut = useMutation({
    mutationFn: (orderedIds: string[]) => equipmentCategoryFieldsApi.reorder(categoryId, orderedIds),
    onSuccess: (updated) => queryClient.setQueryData(fieldsKey, updated),
    onError: (err) => {
      showError('Couldn’t reorder fields', extractApiError(err) ?? undefined);
      invalidate();
    },
  });

  const beginAdd = () => {
    setEditingField(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setMode('form');
  };

  const beginEdit = (f: EquipmentCategoryField) => {
    setEditingField(f);
    setForm({
      fieldKey: f.fieldKey,
      label: f.label,
      dataType: f.dataType,
      optionsText: (f.options ?? []).join('\n'),
      required: f.required,
      helpText: f.helpText ?? '',
    });
    setFormError(null);
    setMode('form');
  };

  const handleDelete = (f: EquipmentCategoryField) => {
    if (window.confirm(`Remove the “${f.label}” field? Values already saved on equipment are kept.`)) {
      deleteMut.mutate(f.id);
    }
  };

  const move = (index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= fields.length) return;
    const next = [...fields];
    const [moved] = next.splice(index, 1);
    next.splice(to, 0, moved);
    reorderMut.mutate(next.map((f) => f.id));
  };

  const isSelect = form.dataType === 'SELECT';
  const options = form.optionsText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const saving = createMut.isPending || updateMut.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!editingField && !FIELD_KEY_RE.test(form.fieldKey.trim())) {
      setFormError('Field key must be lower_snake_case and start with a letter (e.g. btu_rating).');
      return;
    }
    if (!form.label.trim()) {
      setFormError('Label is required.');
      return;
    }
    if (isSelect) {
      if (options.length === 0) {
        setFormError('Add at least one option for a Select field (one per line).');
        return;
      }
      if (new Set(options).size !== options.length) {
        setFormError('Options must be unique.');
        return;
      }
    }
    if (editingField) {
      updateMut.mutate({
        id: editingField.id,
        req: {
          label: form.label.trim(),
          options: isSelect ? options : null,
          required: form.required,
          helpText: form.helpText.trim() || null,
        },
      });
    } else {
      createMut.mutate({
        fieldKey: form.fieldKey.trim(),
        label: form.label.trim(),
        dataType: form.dataType,
        options: isSelect ? options : null,
        required: form.required,
        helpText: form.helpText.trim() || null,
        sortOrder: fields.length,
      });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} size="2xl">
      <DialogTitle>
        {mode === 'form'
          ? editingField
            ? 'Edit field'
            : 'Add field'
          : `Custom fields${category ? ` — ${category.name}` : ''}`}
      </DialogTitle>

      {mode === 'list' ? (
        <>
          <DialogBody>
            <p className="mb-3 text-[12.5px] text-fg-muted">
              Fields defined here appear on the equipment form and detail page for this category.
            </p>
            {isLoading ? (
              <LoadingState label="Loading fields…" />
            ) : fields.length === 0 ? (
              <EmptyState compact title="No custom fields yet" description="Add a field to capture category-specific specs." />
            ) : (
              <div className="flex flex-col gap-1.5">
                {fields.map((f, idx) => (
                  <div
                    key={f.id}
                    className="flex items-start gap-2.5 rounded-md border border-border-soft bg-bg-elev px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-fg-strong">{f.label}</span>
                        <span className="font-mono text-[11px] text-fg-muted">{f.fieldKey}</span>
                        <Pill tone="neutral">{DATA_TYPE_LABEL[f.dataType]}</Pill>
                        {f.required && <Pill tone="warning">Required</Pill>}
                      </div>
                      {f.dataType === 'SELECT' && f.options && f.options.length > 0 && (
                        <div className="mt-0.5 truncate text-[11.5px] text-fg-muted">{f.options.join(', ')}</div>
                      )}
                      {f.helpText && <div className="mt-0.5 text-[11.5px] text-fg-dim">{f.helpText}</div>}
                    </div>
                    <Dropdown>
                      <DropdownButton as={IconButton} aria-label={t('common.moreOptions')}>
                        <EllipsisVerticalIcon className="size-4" />
                      </DropdownButton>
                      <DropdownMenu anchor="bottom end">
                        <DropdownItem onClick={() => beginEdit(f)}>
                          <DropdownLabel>{t('common.edit')}</DropdownLabel>
                        </DropdownItem>
                        <DropdownItem onClick={() => move(idx, -1)} disabled={idx === 0}>
                          <DropdownLabel>{t('common.moveUp')}</DropdownLabel>
                        </DropdownItem>
                        <DropdownItem onClick={() => move(idx, 1)} disabled={idx === fields.length - 1}>
                          <DropdownLabel>{t('common.moveDown')}</DropdownLabel>
                        </DropdownItem>
                        <DropdownDivider />
                        <DropdownItem onClick={() => handleDelete(f)}>
                          <DropdownLabel>{t('common.delete')}</DropdownLabel>
                        </DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={beginAdd}
              className="mt-2 flex items-center gap-1.5 rounded-md border border-dashed border-border-strong px-3 py-2 text-[12.5px] text-fg-muted hover:border-fg-muted hover:bg-bg-elev hover:text-fg-strong"
            >
              <PlusIcon className="size-4" />
              Add field
            </button>
          </DialogBody>
          <DialogActions>
            <Button plain onClick={onClose}>
              {t('common.close')}
            </Button>
          </DialogActions>
        </>
      ) : (
        <form onSubmit={submit}>
          <DialogBody>
            {formError && (
              <div className="mb-4 rounded-lg bg-danger-100 p-3 text-[12.5px] text-danger-500 ring-1 ring-danger-500/20">
                {formError}
              </div>
            )}
            <div className="flex flex-col gap-3.5">
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <Field>
                  <Label>Field key *</Label>
                  <Input
                    value={form.fieldKey}
                    onChange={(e) => setForm((s) => ({ ...s, fieldKey: e.target.value }))}
                    disabled={!!editingField}
                    placeholder="btu_rating"
                    className="font-mono"
                    autoFocus={!editingField}
                  />
                  <p className="mt-1 text-[11px] text-fg-dim">
                    {editingField ? 'The storage key can’t be changed.' : 'lower_snake_case — fixed once created.'}
                  </p>
                </Field>
                <Field>
                  <Label>Data type *</Label>
                  <Select
                    value={form.dataType}
                    onChange={(e) => setForm((s) => ({ ...s, dataType: e.target.value as EquipmentFieldDataType }))}
                    disabled={!!editingField}
                  >
                    {DATA_TYPES.map((dt) => (
                      <option key={dt} value={dt}>{DATA_TYPE_LABEL[dt]}</option>
                    ))}
                  </Select>
                  {editingField && <p className="mt-1 text-[11px] text-fg-dim">The data type can’t be changed.</p>}
                </Field>
              </div>
              <Field>
                <Label>Label *</Label>
                <Input
                  value={form.label}
                  onChange={(e) => setForm((s) => ({ ...s, label: e.target.value }))}
                  placeholder="BTU Rating"
                  autoFocus={!!editingField}
                />
              </Field>
              {isSelect && (
                <Field>
                  <Label>Options *</Label>
                  <Textarea
                    value={form.optionsText}
                    onChange={(e) => setForm((s) => ({ ...s, optionsText: e.target.value }))}
                    rows={4}
                    placeholder={'R-410A\nR-22\nR-32'}
                  />
                  <p className="mt-1 text-[11px] text-fg-dim">One option per line.</p>
                </Field>
              )}
              <Field>
                <Label>Help text</Label>
                <Input
                  value={form.helpText}
                  onChange={(e) => setForm((s) => ({ ...s, helpText: e.target.value }))}
                  placeholder="Optional — shown under the field on the equipment form."
                />
              </Field>
              <CheckboxField>
                <Checkbox
                  checked={form.required}
                  onChange={(checked) => setForm((s) => ({ ...s, required: checked }))}
                />
                <Label>Required</Label>
              </CheckboxField>
            </div>
          </DialogBody>
          <DialogActions>
            <Button plain type="button" onClick={() => setMode('list')} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" color="accent" disabled={saving}>
              {saving ? t('common.saving') : editingField ? t('common.update') : t('common.create')}
            </Button>
          </DialogActions>
        </form>
      )}
    </Dialog>
  );
}
