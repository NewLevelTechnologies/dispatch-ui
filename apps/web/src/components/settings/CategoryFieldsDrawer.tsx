/* eslint-disable i18next/no-literal-string -- dense settings drawer; reused actions (Cancel/Save/Delete/Close) route through t(), field-definition labels + data-type names stay literal, same convention as the other dense form surfaces. */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { ChevronRightIcon, EllipsisVerticalIcon, PlusIcon } from '@heroicons/react/24/outline';
import {
  equipmentCategoryFieldsApi,
  type EquipmentCategory,
  type EquipmentCategoryField,
  type EquipmentFieldDataType,
} from '../../api/setup';
import {
  SlideOver,
  SlideOverBody,
  SlideOverFooter,
  SlideOverHeader,
  SlideOverTitle,
  SlideOverDescription,
} from '../catalyst/slideover';
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
import { DragHandle } from './DragHandle';
import { Pill } from '../ui/Pill';
import { EmptyState } from '../ui/EmptyState';
import { LoadingState } from '../ui/LoadingState';
import { extractApiError, showError, showSuccess } from '../../lib/toast';

const DATA_TYPES: EquipmentFieldDataType[] = ['TEXT', 'NUMBER', 'CURRENCY', 'DATE', 'BOOLEAN', 'SELECT'];
const DATA_TYPE_LABEL: Record<EquipmentFieldDataType, string> = {
  TEXT: 'Text',
  NUMBER: 'Number',
  CURRENCY: 'Currency',
  DATE: 'Date',
  BOOLEAN: 'Yes / No',
  SELECT: 'Dropdown',
};
// Mirror of the backend rule (also enforced server-side).
const FIELD_KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;

// Label → lower_snake_case storage key. Leading non-letters dropped so it always
// starts with a letter; runs of punctuation collapse to a single underscore.
function deriveKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/_+$/g, '')
    .slice(0, 64);
}

interface SavePayload {
  fieldKey: string;
  label: string;
  dataType: EquipmentFieldDataType;
  options: string[] | null;
  required: boolean;
  helpText: string | null;
}

interface Props {
  category: EquipmentCategory | null;
  onClose: () => void;
}

export default function CategoryFieldsDrawer({ category, onClose }: Props) {
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

  // Which row's inline editor is open: a field id, 'new' (the add row), or null.
  const [editingKey, setEditingKey] = useState<string | 'new' | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setEditingKey(null);
    setEditorError(null);
  }, [categoryId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const invalidate = () => queryClient.invalidateQueries({ queryKey: fieldsKey });

  const createMut = useMutation({
    mutationFn: (req: Parameters<typeof equipmentCategoryFieldsApi.create>[1]) =>
      equipmentCategoryFieldsApi.create(categoryId, req),
    onSuccess: () => {
      invalidate();
      showSuccess('Field added');
      setEditingKey(null);
    },
    onError: (err) => setEditorError(extractApiError(err) ?? 'Couldn’t save the field'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, req }: { id: string; req: Parameters<typeof equipmentCategoryFieldsApi.update>[2] }) =>
      equipmentCategoryFieldsApi.update(categoryId, id, req),
    onSuccess: () => {
      invalidate();
      showSuccess('Field updated');
      setEditingKey(null);
    },
    onError: (err) => setEditorError(extractApiError(err) ?? 'Couldn’t save the field'),
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

  const saving = createMut.isPending || updateMut.isPending;

  const handleSave = (field: EquipmentCategoryField | null, d: SavePayload) => {
    if (field) {
      updateMut.mutate({
        id: field.id,
        req: { label: d.label, options: d.options, required: d.required, helpText: d.helpText },
      });
    } else {
      createMut.mutate({
        fieldKey: d.fieldKey,
        label: d.label,
        dataType: d.dataType,
        options: d.options,
        required: d.required,
        helpText: d.helpText,
        sortOrder: fields.length,
      });
    }
  };

  const handleDelete = (f: EquipmentCategoryField) => {
    if (window.confirm(`Remove the “${f.label}” field? Values already saved on equipment are kept.`)) {
      deleteMut.mutate(f.id);
    }
  };

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= fields.length) return;
    const next = [...fields];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    reorderMut.mutate(next.map((f) => f.id));
  };

  const openEditor = (key: string | 'new') => {
    setEditorError(null);
    setEditingKey(key);
  };
  const closeEditor = () => {
    setEditingKey(null);
    setEditorError(null);
  };

  return (
    <SlideOver open={open} onClose={onClose} className="max-w-2xl">
      <SlideOverHeader onClose={onClose}>
        <SlideOverTitle>Fields{category ? ` — ${category.name}` : ''}</SlideOverTitle>
        <SlideOverDescription>
          These render as the Specs section on the equipment form and detail page for this category. Drag to set their order.
        </SlideOverDescription>
      </SlideOverHeader>

      <SlideOverBody>
        {isLoading ? (
          <LoadingState label="Loading fields…" />
        ) : (
          <div className="flex flex-col gap-1.5">
            {fields.length === 0 && editingKey !== 'new' && (
              <EmptyState compact title="No fields yet" description="Add one to capture specs for this category." />
            )}

            {fields.map((f, idx) =>
              editingKey === f.id ? (
                <FieldEditor
                  key={f.id}
                  field={f}
                  saving={saving}
                  error={editorError}
                  onCancel={closeEditor}
                  onSave={(d) => handleSave(f, d)}
                />
              ) : (
                <div
                  key={f.id}
                  draggable={editingKey === null}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    setDragIndex(idx);
                  }}
                  onDragOver={(e) => {
                    if (dragIndex === null) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverIndex !== idx) setDragOverIndex(idx);
                  }}
                  onDragLeave={() => {
                    if (dragOverIndex === idx) setDragOverIndex(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null) move(dragIndex, idx);
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  className={[
                    'flex items-start gap-2 rounded-md border border-border-soft bg-bg-elev px-2.5 py-2',
                    dragIndex === idx && 'opacity-50',
                    dragOverIndex === idx && dragIndex !== null && dragIndex !== idx
                      ? 'outline outline-2 outline-accent-500/40 outline-offset-[-2px]'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="mt-0.5">
                    <DragHandle />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-semibold text-fg-strong">{f.label}</span>
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
                      <DropdownItem onClick={() => openEditor(f.id)}>
                        <DropdownLabel>{t('common.edit')}</DropdownLabel>
                      </DropdownItem>
                      <DropdownItem onClick={() => move(idx, idx - 1)} disabled={idx === 0}>
                        <DropdownLabel>{t('common.moveUp')}</DropdownLabel>
                      </DropdownItem>
                      <DropdownItem onClick={() => move(idx, idx + 1)} disabled={idx === fields.length - 1}>
                        <DropdownLabel>{t('common.moveDown')}</DropdownLabel>
                      </DropdownItem>
                      <DropdownDivider />
                      <DropdownItem onClick={() => handleDelete(f)}>
                        <DropdownLabel>{t('common.delete')}</DropdownLabel>
                      </DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                </div>
              )
            )}

            {editingKey === 'new' ? (
              <FieldEditor field={null} saving={saving} error={editorError} onCancel={closeEditor} onSave={(d) => handleSave(null, d)} />
            ) : (
              <button
                type="button"
                onClick={() => openEditor('new')}
                className="mt-1 flex items-center gap-1.5 rounded-md border border-dashed border-border-strong px-3 py-2 text-[12.5px] text-fg-muted hover:border-fg-muted hover:bg-bg-elev hover:text-fg-strong"
              >
                <PlusIcon className="size-4" />
                Add field
              </button>
            )}
          </div>
        )}
      </SlideOverBody>

      <SlideOverFooter>
        <Button plain onClick={onClose}>
          {t('common.close')}
        </Button>
      </SlideOverFooter>
    </SlideOver>
  );
}

// ── Inline expanding editor — used for both "add" (field=null) and "edit". ──
function FieldEditor({
  field,
  saving,
  error,
  onSave,
  onCancel,
}: {
  field: EquipmentCategoryField | null;
  saving: boolean;
  error: string | null;
  onSave: (d: SavePayload) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = !!field;
  const [label, setLabel] = useState(field?.label ?? '');
  const [fieldKey, setFieldKey] = useState(field?.fieldKey ?? '');
  // For a new field the key auto-fills from the label until the admin overrides it.
  const [keyDirty, setKeyDirty] = useState(isEdit);
  const [dataType, setDataType] = useState<EquipmentFieldDataType>(field?.dataType ?? 'TEXT');
  const [optionsText, setOptionsText] = useState((field?.options ?? []).join('\n'));
  const [required, setRequired] = useState(field?.required ?? false);
  const [helpText, setHelpText] = useState(field?.helpText ?? '');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isSelect = dataType === 'SELECT';
  const options = optionsText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const onLabelChange = (v: string) => {
    setLabel(v);
    if (!isEdit && !keyDirty) setFieldKey(deriveKey(v));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!label.trim()) {
      setLocalError('Label is required.');
      return;
    }
    if (!isEdit && !FIELD_KEY_RE.test(fieldKey.trim())) {
      setLocalError('Field key must be lower_snake_case and start with a letter (e.g. btu_rating).');
      return;
    }
    if (isSelect) {
      if (options.length === 0) {
        setLocalError('Add at least one option for a Dropdown (one per line).');
        return;
      }
      if (new Set(options).size !== options.length) {
        setLocalError('Options must be unique.');
        return;
      }
    }
    onSave({
      fieldKey: fieldKey.trim(),
      label: label.trim(),
      dataType,
      options: isSelect ? options : null,
      required,
      helpText: helpText.trim() || null,
    });
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-md border border-accent-500/50 bg-bg-elev p-3 shadow-sm"
    >
      {(localError || error) && (
        <div className="mb-3 rounded-md bg-danger-100 p-2.5 text-[12px] text-danger-500 ring-1 ring-danger-500/20">
          {localError || error}
        </div>
      )}
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
          <Field>
            <Label>Label *</Label>
            <Input value={label} onChange={(e) => onLabelChange(e.target.value)} placeholder="BTU Rating" autoFocus />
          </Field>
          <Field>
            <Label>Type</Label>
            <Select
              value={dataType}
              onChange={(e) => setDataType(e.target.value as EquipmentFieldDataType)}
              disabled={isEdit}
            >
              {DATA_TYPES.map((dt) => (
                <option key={dt} value={dt}>{DATA_TYPE_LABEL[dt]}</option>
              ))}
            </Select>
          </Field>
        </div>

        {isSelect && (
          <Field>
            <Label>Options *</Label>
            <Textarea
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              rows={3}
              placeholder={'R-410A\nR-454B\nR-22'}
            />
            <p className="mt-1 text-[11px] text-fg-dim">One option per line.</p>
          </Field>
        )}

        <Field>
          <Label>Help text</Label>
          <Input
            value={helpText}
            onChange={(e) => setHelpText(e.target.value)}
            placeholder="Optional — shown under the field on the equipment form."
          />
        </Field>

        <CheckboxField>
          <Checkbox checked={required} onChange={setRequired} />
          <Label>Required</Label>
        </CheckboxField>

        {/* Advanced — the storage key. Auto-derived from the label; admins rarely touch it. */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1 text-[11.5px] font-medium text-fg-muted hover:text-fg-strong"
          >
            <ChevronRightIcon className={`size-3.5 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
            Advanced
          </button>
          {showAdvanced && (
            <Field className="mt-2">
              <Label>Field key</Label>
              <Input
                value={fieldKey}
                onChange={(e) => {
                  setKeyDirty(true);
                  setFieldKey(e.target.value);
                }}
                disabled={isEdit}
                className="font-mono"
                placeholder="btu_rating"
              />
              <p className="mt-1 text-[11px] text-fg-dim">
                {isEdit
                  ? 'The storage key can’t change once a field is created.'
                  : 'Auto-filled from the label. lower_snake_case; fixed after the field is created.'}
              </p>
            </Field>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button plain type="button" onClick={onCancel} disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" color="accent" size="xs" disabled={saving}>
          {saving ? t('common.saving') : isEdit ? t('common.update') : t('common.create')}
        </Button>
      </div>
    </form>
  );
}
