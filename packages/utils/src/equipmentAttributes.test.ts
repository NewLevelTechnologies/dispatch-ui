import { describe, it, expect } from 'vitest';
import { parseAttributes, buildAttributes, matchOption, formatSpecValue } from './equipmentAttributes';
import type { EquipmentCategoryField } from '@dispatch/api';

const field = (fieldKey: string, dataType: string) =>
  ({ fieldKey, dataType }) as unknown as EquipmentCategoryField;

describe('parseAttributes', () => {
  it('parses a JSON string into a string-valued record', () => {
    expect(parseAttributes('{"brand":"Carrier","tons":5}')).toEqual({ brand: 'Carrier', tons: '5' });
  });

  it('coerces booleans to "true" / ""', () => {
    expect(parseAttributes('{"active":true,"legacy":false}')).toEqual({ active: 'true', legacy: '' });
  });

  it('returns empty object for null/undefined/empty', () => {
    expect(parseAttributes(null)).toEqual({});
    expect(parseAttributes(undefined)).toEqual({});
    expect(parseAttributes('')).toEqual({});
  });

  it('returns empty object for invalid JSON', () => {
    expect(parseAttributes('not json')).toEqual({});
  });
});

describe('buildAttributes', () => {
  it('serializes TEXT fields', () => {
    const result = buildAttributes([field('brand', 'TEXT')], { brand: 'Carrier' });
    expect(JSON.parse(result)).toEqual({ brand: 'Carrier' });
  });

  it('serializes BOOLEAN fields as real booleans', () => {
    const result = buildAttributes([field('active', 'BOOLEAN')], { active: 'true' });
    expect(JSON.parse(result)).toEqual({ active: true });
  });

  it('serializes NUMBER fields as numbers', () => {
    const result = buildAttributes([field('tons', 'NUMBER')], { tons: '5' });
    expect(JSON.parse(result)).toEqual({ tons: 5 });
  });

  it('omits empty optional TEXT fields', () => {
    const result = buildAttributes([field('brand', 'TEXT')], { brand: '  ' });
    expect(JSON.parse(result)).toEqual({});
  });

  it('omits NUMBER fields with non-finite values', () => {
    const result = buildAttributes([field('tons', 'NUMBER')], { tons: 'abc' });
    expect(JSON.parse(result)).toEqual({});
  });

  it('only includes fields from the given category', () => {
    const result = buildAttributes([field('brand', 'TEXT')], { brand: 'Carrier', stale: 'old' });
    expect(JSON.parse(result)).toEqual({ brand: 'Carrier' });
  });

  it('serializes CURRENCY fields as numbers', () => {
    const result = buildAttributes([field('cost', 'CURRENCY')], { cost: '1234.56' });
    expect(JSON.parse(result)).toEqual({ cost: 1234.56 });
  });
});

describe('matchOption', () => {
  const options = ['R-410A', 'R-22', 'R-134a'];

  it('matches exact (case/punctuation-insensitive)', () => {
    expect(matchOption('R410A', options)).toBe('R-410A');
  });

  it('matches when OCR appends noise', () => {
    expect(matchOption('R410A TXV INSTALLED', options)).toBe('R-410A');
  });

  it('prefers the longest partial match', () => {
    expect(matchOption('R134a SYSTEM', options)).toBe('R-134a');
  });

  it('returns null for no match', () => {
    expect(matchOption('R-407C', options)).toBeNull();
  });

  it('returns null for empty/null inputs', () => {
    expect(matchOption('', options)).toBeNull();
    expect(matchOption('R-410A', null)).toBeNull();
    expect(matchOption('R-410A', [])).toBeNull();
  });

  it('returns null when raw normalizes to empty', () => {
    expect(matchOption('---', options)).toBeNull();
  });
});

describe('formatSpecValue', () => {
  it('formats BOOLEAN true as Yes', () => {
    expect(formatSpecValue(field('active', 'BOOLEAN'), 'true')).toBe('Yes');
  });

  it('formats BOOLEAN false/undefined as No', () => {
    expect(formatSpecValue(field('active', 'BOOLEAN'), '')).toBe('No');
    expect(formatSpecValue(field('active', 'BOOLEAN'), undefined)).toBe('No');
  });

  it('formats CURRENCY as USD', () => {
    const result = formatSpecValue(field('cost', 'CURRENCY'), '1234.5');
    expect(result).toContain('1,234.50');
  });

  it('returns raw string for non-numeric CURRENCY', () => {
    expect(formatSpecValue(field('cost', 'CURRENCY'), 'N/A')).toBe('N/A');
  });

  it('formats DATE as locale string', () => {
    const result = formatSpecValue(field('installed', 'DATE'), '2024-06-15');
    expect(result).toContain('Jun');
    expect(result).toContain('2024');
  });

  it('returns raw string for invalid DATE', () => {
    expect(formatSpecValue(field('installed', 'DATE'), 'not-a-date')).toBe('not-a-date');
  });

  it('returns em-dash for empty/null TEXT', () => {
    expect(formatSpecValue(field('brand', 'TEXT'), '')).toBe('—');
    expect(formatSpecValue(field('brand', 'TEXT'), undefined)).toBe('—');
  });

  it('returns raw value for TEXT', () => {
    expect(formatSpecValue(field('brand', 'TEXT'), 'Carrier')).toBe('Carrier');
  });
});
