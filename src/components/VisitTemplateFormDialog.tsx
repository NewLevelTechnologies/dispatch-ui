/* eslint-disable i18next/no-literal-string -- dense config form; short operational labels stay literal, same convention as the agreement detail surfaces. */
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TrashIcon, PlusIcon } from '@heroicons/react/24/outline';
import {
  agreementApi,
  type CadenceUnit,
  type VisitScopeItem,
  type VisitTemplateResponse,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { Select } from './catalyst/select';
import { extractApiError, showSuccess } from '../lib/toast';

interface VisitTemplateFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  agreementId: string;
  template?: VisitTemplateResponse;
  // Agreement term start (YYYY-MM-DD) — lower-bounds the First occurrence date.
  termStart?: string;
}

interface ScopeRow {
  description: string;
}

const CADENCE_UNITS: CadenceUnit[] = ['WEEK', 'MONTH', 'QUARTER', 'YEAR'];

// "Quarter" / "Quarters" — pluralized by the interval so the row reads as
// natural language ("Every 2 Quarters").
const cadenceUnitLabel = (u: CadenceUnit, interval: number): string => {
  const singular = u.charAt(0) + u.slice(1).toLowerCase();
  return interval === 1 ? singular : `${singular}s`;
};

// Create/edit a visit template (the recurrence rule that drives generation).
// Scope items become the generated work order's work items.
export default function VisitTemplateFormDialog({
  isOpen,
  onClose,
  agreementId,
  template,
  termStart,
}: VisitTemplateFormDialogProps) {
  const queryClient = useQueryClient();
  const { getName } = useGlossary();
  // A "visit template" is the recurrence rule that generates work orders — so it
  // reads through the work_order glossary term (matching the Scope card).
  const woName = getName('work_order'); // e.g. "Work Order"
  const woLower = woName.toLowerCase();
  const isEdit = Boolean(template);

  const [label, setLabel] = useState('');
  const [cadenceUnit, setCadenceUnit] = useState<CadenceUnit>('QUARTER');
  const [cadenceInterval, setCadenceInterval] = useState('1');
  const [anchorDate, setAnchorDate] = useState('');
  const [windowDays, setWindowDays] = useState('30');
  const [estDurationMinutes, setEstDurationMinutes] = useState('');
  const [scopeRows, setScopeRows] = useState<ScopeRow[]>([{ description: '' }]);
  // The PATCH contract is tri-state on scopeItems: omitted = leave untouched,
  // [] = clear, [..] = replace. So we only send scopeItems when the user
  // actually touched scope — otherwise an unrelated edit (label/cadence) would
  // send [] and wipe existing scope. Only relevant on edit; create always sends.
  const [scopeDirty, setScopeDirty] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- form initialization on open */
  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    setLabel(template?.label ?? '');
    setCadenceUnit(template?.cadenceUnit ?? 'QUARTER');
    setCadenceInterval(template?.cadenceInterval != null ? String(template.cadenceInterval) : '1');
    setAnchorDate(template?.anchorDate ?? '');
    setWindowDays(template?.windowDays != null ? String(template.windowDays) : '30');
    setEstDurationMinutes(template?.estDurationMinutes != null ? String(template.estDurationMinutes) : '');
    setScopeRows(
      template && template.scopeItems.length > 0
        ? template.scopeItems.map((s) => ({ description: s.description }))
        : [{ description: '' }],
    );
    setScopeDirty(false);
  }, [isOpen, template]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const buildScopeItems = (): VisitScopeItem[] =>
    scopeRows
      .filter((r) => r.description.trim())
      // season is a dead BE field (generation reads only description); always null.
      .map((r) => ({ description: r.description.trim(), equipmentTypeId: null, season: null }));

  const createMutation = useMutation({
    mutationFn: () =>
      agreementApi.createVisitTemplate(agreementId, {
        label: label.trim(),
        cadenceUnit,
        cadenceInterval: Number(cadenceInterval) || 1,
        anchorDate,
        windowDays: Number(windowDays) || 30,
        estDurationMinutes: estDurationMinutes ? Number(estDurationMinutes) : null,
        scopeItems: buildScopeItems(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', agreementId] });
      showSuccess(`${woName} template added`);
      onClose();
    },
    onError: (err) => setErrorMessage(extractApiError(err) ?? `Failed to add ${woLower} template`),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      agreementApi.updateVisitTemplate(agreementId, template!.id, {
        label: label.trim(),
        cadenceUnit,
        cadenceInterval: Number(cadenceInterval) || 1,
        anchorDate,
        windowDays: Number(windowDays) || 30,
        estDurationMinutes: estDurationMinutes ? Number(estDurationMinutes) : null,
        // Omit when untouched so the PATCH leaves existing scope intact; send
        // the (possibly empty) array only when the user edited scope.
        scopeItems: scopeDirty ? buildScopeItems() : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', agreementId] });
      showSuccess(`${woName} template updated`);
      onClose();
    },
    onError: (err) => setErrorMessage(extractApiError(err) ?? `Failed to update ${woLower} template`),
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const canSubmit = label.trim().length > 0 && anchorDate.length > 0 && !isSaving;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!canSubmit) return;
    if (isEdit) updateMutation.mutate();
    else createMutation.mutate();
  };

  const updateRow = (i: number, patch: Partial<ScopeRow>) => {
    setScopeDirty(true);
    setScopeRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const addScopeRow = () => {
    setScopeDirty(true);
    setScopeRows((rows) => [...rows, { description: '' }]);
  };

  const removeScopeRow = (i: number) => {
    setScopeDirty(true);
    // Removing the last row clears it rather than vanishing the input.
    setScopeRows((rows) => (rows.length > 1 ? rows.filter((_, idx) => idx !== i) : [{ description: '' }]));
  };

  return (
    <Dialog open={isOpen} onClose={onClose} size="xl">
      <DialogTitle>{`${isEdit ? 'Edit' : 'Add'} ${woLower} template`}</DialogTitle>
      <DialogDescription>
        {`The recurrence rule that generates ${getName('work_order', true).toLowerCase()}. Scope items become the ${woLower}’s work items.`}
      </DialogDescription>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          {errorMessage && (
            <div role="alert" className="mb-4 rounded-lg bg-danger-100 p-3 text-[12.5px] text-danger-500 ring-1 ring-danger-500/20">
              {errorMessage}
            </div>
          )}
          <Fieldset>
            <FieldGroup className="!space-y-3">
              <Field size="xs">
                <Label size="xs" required>Label</Label>
                <Input
                  size="xs"
                  name="label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Summer PM — coil clean"
                  maxLength={255}
                  required
                  autoFocus
                />
              </Field>

              {/* Order reads as natural language: "Every [1] [Quarter(s)]". */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                <Field size="xs">
                  <Label size="xs">Every</Label>
                  <Input size="xs" type="number" min={1} value={cadenceInterval} onChange={(e) => setCadenceInterval(e.target.value)} />
                </Field>
                <Field size="xs">
                  <Label size="xs" required>Cadence</Label>
                  <Select value={cadenceUnit} onChange={(e) => setCadenceUnit(e.target.value as CadenceUnit)}>
                    {CADENCE_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {cadenceUnitLabel(u, Number(cadenceInterval) || 1)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field size="xs">
                  <Label size="xs" required>First occurrence</Label>
                  {/* Bounded to the agreement's term start so a first occurrence
                      can't predate the term (orphan work orders). */}
                  <Input size="xs" type="date" value={anchorDate} min={termStart} onChange={(e) => setAnchorDate(e.target.value)} required />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <Field size="xs">
                  <Label size="xs">Scheduling window (days)</Label>
                  <Input size="xs" type="number" min={1} value={windowDays} onChange={(e) => setWindowDays(e.target.value)} />
                </Field>
                <Field size="xs">
                  <Label size="xs">Est. duration (minutes)</Label>
                  <Input size="xs" type="number" min={0} value={estDurationMinutes} onChange={(e) => setEstDurationMinutes(e.target.value)} />
                </Field>
              </div>

              <Field size="xs">
                <Label size="xs">Scope of work</Label>
                <div className="flex flex-col gap-2">
                  {scopeRows.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {/* One full-width task input per row (stacked). Flex sizing
                          lives on the wrapper div because the Catalyst Input
                          wrapper hardcodes w-full. */}
                      <div className="min-w-0 flex-1">
                        <Input
                          size="xs"
                          value={row.description}
                          onChange={(e) => updateRow(i, { description: e.target.value })}
                          placeholder="e.g. Inspect coils, check refrigerant charge"
                          aria-label="Scope item description"
                        />
                      </div>
                      <Button plain onClick={() => removeScopeRow(i)} aria-label="Remove scope item">
                        <TrashIcon className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <div>
                    <Button plain onClick={addScopeRow}>
                      <PlusIcon className="size-4" />
                      Add scope item
                    </Button>
                  </div>
                </div>
              </Field>
            </FieldGroup>
          </Fieldset>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" color="accent" disabled={!canSubmit}>
            {isSaving ? 'Saving…' : isEdit ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
