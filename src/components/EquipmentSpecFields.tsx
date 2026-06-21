/* eslint-disable i18next/no-literal-string -- spec field labels come from the tenant field definitions; only "$" and "Select…" are literal. Shared by the equipment form + detail Specs surfaces. */
import { Checkbox, CheckboxField } from './catalyst/checkbox';
import { Field, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { Select } from './catalyst/select';
import { Text } from './catalyst/text';
import type { EquipmentCategoryField } from '../api';

// One typed input for a category spec field. Currency uses the app's $/USD
// convention; a plain decimal is stored. State values are strings (booleans as
// 'true'/'') — see utils/equipmentAttributes for the JSON (de)serialization.
export function SpecFieldInput({
  field,
  value,
  onChange,
  error,
}: {
  field: EquipmentCategoryField;
  value: string;
  onChange: (v: string) => void;
  error?: string | false;
}) {
  if (field.dataType === 'BOOLEAN') {
    return (
      <div>
        <CheckboxField>
          <Checkbox checked={value === 'true'} onChange={(c) => onChange(c ? 'true' : '')} />
          <Label size="xs">{field.label}</Label>
        </CheckboxField>
        {field.helpText && <Text size="xs" tone="muted" className="mt-1">{field.helpText}</Text>}
      </div>
    );
  }
  return (
    <Field size="xs">
      <Label size="xs">
        {field.label}
        {field.required && <span className="text-fg-dim"> *</span>}
      </Label>
      {field.dataType === 'SELECT' ? (
        <Select value={value} onChange={(e) => onChange(e.target.value)} invalid={!!error}>
          <option value="">Select…</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </Select>
      ) : field.dataType === 'DATE' ? (
        <Input size="xs" type="date" value={value} onChange={(e) => onChange(e.target.value)} invalid={!!error} />
      ) : field.dataType === 'CURRENCY' ? (
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-fg-muted">$</span>
          <Input size="xs" type="number" step="0.01" className="pl-5" value={value} onChange={(e) => onChange(e.target.value)} invalid={!!error} />
        </div>
      ) : field.dataType === 'NUMBER' ? (
        <Input size="xs" type="number" value={value} onChange={(e) => onChange(e.target.value)} invalid={!!error} />
      ) : (
        <Input size="xs" type="text" value={value} onChange={(e) => onChange(e.target.value)} invalid={!!error} />
      )}
      {field.helpText && <Text size="xs" tone="muted" className="mt-1">{field.helpText}</Text>}
      {error && <Text size="xs" className="mt-1 text-danger-500">{error}</Text>}
    </Field>
  );
}
