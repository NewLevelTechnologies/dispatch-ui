import { describe, it, expect } from 'vitest';
import { pluralize, abbreviate, PRESETS, getPreset, ENTITY_GROUP, GROUP_ORDER } from './terminologyPresets';

describe('pluralize', () => {
  it('returns empty for empty input', () => {
    expect(pluralize('')).toBe('');
  });

  it('adds s by default', () => {
    expect(pluralize('Job')).toBe('Jobs');
    expect(pluralize('Cleaner')).toBe('Cleaners');
  });

  it('handles consonant + y → ies', () => {
    expect(pluralize('Property')).toBe('Properties');
    expect(pluralize('City')).toBe('Cities');
  });

  it('keeps vowel + y as -ys', () => {
    expect(pluralize('Day')).toBe('Days');
    expect(pluralize('Key')).toBe('Keys');
  });

  it('adds es after sibilants', () => {
    expect(pluralize('Dispatch')).toBe('Dispatches');
    expect(pluralize('Fix')).toBe('Fixes');
    expect(pluralize('Boss')).toBe('Bosses');
    expect(pluralize('Brush')).toBe('Brushes');
  });

  it('does not pluralize mass nouns', () => {
    expect(pluralize('Equipment')).toBe('Equipment');
    expect(pluralize('Gear')).toBe('Gear');
  });
});

describe('abbreviate', () => {
  const ABBR_RE = /^[A-Z0-9]{1,4}$/;

  it('returns empty for empty / punctuation-only input', () => {
    expect(abbreviate('')).toBe('');
    expect(abbreviate('   ')).toBe('');
    expect(abbreviate('—/.')).toBe('');
  });

  it('takes the first letters of a single word', () => {
    expect(abbreviate('Job')).toBe('JOB');
    expect(abbreviate('Repair')).toBe('REP');
    expect(abbreviate('Device')).toBe('DEV');
  });

  it('takes the initials of a multi-word name', () => {
    expect(abbreviate('Work Order')).toBe('WO');
    expect(abbreviate('Service Call')).toBe('SC');
    expect(abbreviate('Maintenance Request')).toBe('MR');
  });

  it('uppercases and caps at four characters', () => {
    expect(abbreviate('ticket')).toBe('TIC');
    expect(abbreviate('A B C D E')).toBe('ABCD');
  });

  it('always yields a valid code (or empty) for trade-vocab names', () => {
    for (const name of ['Job', 'Property', 'Service Call', 'Bait Station', 'IT', 'Crew Member']) {
      const a = abbreviate(name);
      expect(a === '' || ABBR_RE.test(a), `"${name}" → "${a}"`).toBe(true);
    }
  });
});

describe('PRESETS', () => {
  it('has 9 presets', () => {
    expect(PRESETS).toHaveLength(9);
  });

  it('HVAC is a no-op preset', () => {
    const hvac = getPreset('hvac');
    expect(hvac.overrides).toEqual({});
  });

  it('Plumbing has the 5 spec-listed overrides', () => {
    const p = getPreset('plumbing');
    expect(p.overrides.work_order).toEqual({ singular: 'Job', plural: 'Jobs', abbreviation: 'JOB' });
    expect(p.overrides.technician).toEqual({ singular: 'Plumber', plural: 'Plumbers', abbreviation: 'PLMB' });
    expect(p.overrides.service_location).toEqual({ singular: 'Property', plural: 'Properties', abbreviation: 'PROP' });
    expect(p.overrides.equipment).toEqual({ singular: 'Fixture', plural: 'Fixtures', abbreviation: 'FIX' });
    expect(p.overrides.dispatch).toEqual({ singular: 'Service Call', plural: 'Service Calls', abbreviation: 'SC' });
  });

  // Two distinct entities sharing a name within one preset (e.g. Work
  // Order and Dispatch both "Visit") is confusing — guard against it.
  it('no two entities collide on a name within a single preset', () => {
    for (const p of PRESETS) {
      const singulars = Object.values(p.overrides).map((o) => o.singular);
      const plurals = Object.values(p.overrides).map((o) => o.plural);
      expect(new Set(singulars).size, `${p.id} has duplicate singular overrides`).toBe(
        singulars.length
      );
      expect(new Set(plurals).size, `${p.id} has duplicate plural overrides`).toBe(
        plurals.length
      );
    }
  });
});

describe('preset abbreviations', () => {
  const ABBR_RE = /^[A-Z0-9]{1,4}$/;

  // Mirror of EntityCode.kt `defaultAbbreviation` (the BE source of truth).
  // Used to prove a preset never seeds an abbreviation that collides with the
  // default of an entity it does NOT override — which would drop the editor
  // into a validation-error state the moment the preset is applied.
  const DEFAULT_ABBR: Record<string, string> = {
    customer: 'C',
    payer: 'PAYR',
    service_location: 'L',
    work_order: 'WO',
    technician: 'TECH',
    dispatch: 'DISP',
    dispatch_region: 'DR',
    equipment: 'EQ',
    invoice: 'INV',
    quote: 'QTE',
    division: 'DIV',
    work_item: 'WI',
    payment: 'PAY',
    schedule: 'SCH',
    route: 'RTE',
    equipment_component: 'UNIT',
    agreement: 'SA',
  };

  it('every override abbreviation is a valid 1–4 char code', () => {
    for (const p of PRESETS) {
      for (const [code, ov] of Object.entries(p.overrides)) {
        expect(ABBR_RE.test(ov.abbreviation), `${p.id}.${code} = "${ov.abbreviation}"`).toBe(true);
      }
    }
  });

  it('only overrides entities that exist in the default registry', () => {
    for (const p of PRESETS) {
      for (const code of Object.keys(p.overrides)) {
        expect(DEFAULT_ABBR[code], `${p.id} overrides unknown entity "${code}"`).toBeDefined();
      }
    }
  });

  it('applying any preset yields a collision-free set of abbreviations', () => {
    for (const p of PRESETS) {
      // Effective abbreviation per entity: preset override if present, else
      // the system default the un-touched entity keeps.
      const effective: Record<string, string> = { ...DEFAULT_ABBR };
      for (const [code, ov] of Object.entries(p.overrides)) {
        effective[code] = ov.abbreviation;
      }
      const values = Object.values(effective);
      expect(new Set(values).size, `${p.id} produces colliding abbreviations`).toBe(values.length);
    }
  });
});

describe('entity grouping', () => {
  it('has all 17 known entities mapped to a group', () => {
    const keys = Object.keys(ENTITY_GROUP);
    expect(keys).toHaveLength(17);
    expect(keys).toContain('equipment_component');
    expect(keys).toContain('dispatch_region');
    expect(keys).toContain('payer');
    expect(keys).toContain('agreement');
    expect(keys).not.toContain('user');
    expect(keys).not.toContain('role');
  });

  it('every mapped group is in GROUP_ORDER', () => {
    for (const g of Object.values(ENTITY_GROUP)) {
      expect(GROUP_ORDER).toContain(g);
    }
  });
});
