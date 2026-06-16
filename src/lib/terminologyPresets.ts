// ─────────────────────────────────────────────────────────────────
// terminologyPresets.ts
//
// Industry preset registry for the Terminology settings page.
//
// Presets are static, FE-only. Applying one merges its `overrides` map
// into the page's form state; we never send a preset id to the server
// and never store "tenant.currentPreset". The user can switch presets
// later or hand-tweak any field — see handoff/terminology-redesign.md
// §3 for the rationale.
//
// Backend reconciliation: 13/14 entity keys match the FE display name.
// The "Unit" entity uses wire key `equipment_component` (see backend
// handoff §3). Keys here MUST stay in sync with `EntityCode.kt`.
// ─────────────────────────────────────────────────────────────────
import type { ComponentType, SVGProps } from 'react';
import {
  FireIcon,
  WrenchIcon,
  BoltIcon,
  WrenchScrewdriverIcon,
  SunIcon,
  BugAntIcon,
  SparklesIcon,
  ComputerDesktopIcon,
  HomeModernIcon,
} from '@heroicons/react/24/outline';

// Each preset override carries an abbreviation too: renaming an entity should
// also reseed the short code / number prefix (e.g. Work Order → Job ⇒ JOB-00001
// instead of WO-00001). These are chosen to be valid (1–4 letters/digits) AND
// collision-free against the default abbreviations of the entities a preset
// does NOT touch — see the guard in terminologyPresets.test.ts. The user can
// still hand-edit any of them after applying.
export type PresetOverride = { singular: string; plural: string; abbreviation: string };

export type PresetId =
  | 'hvac'
  | 'plumbing'
  | 'electrical'
  | 'appliance'
  | 'landscaping'
  | 'pest'
  | 'cleaning'
  | 'it'
  | 'property';

export interface Preset {
  id: PresetId;
  label: string;
  blurb: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  overrides: Record<string, PresetOverride>;
}

// HVAC is the system default — applying it is a no-op (overrides: {}).
// Kept as a selectable chip so the row "feels" complete and so a tenant
// who has drifted onto another preset can snap back to default with one
// confirm.
export const PRESETS: Preset[] = [
  {
    id: 'hvac',
    label: 'HVAC',
    blurb: 'Equipment-centric, service-call based vocabulary.',
    Icon: FireIcon,
    overrides: {},
  },
  {
    id: 'plumbing',
    label: 'Plumbing',
    blurb: 'Job-based vocabulary with fixtures instead of equipment.',
    Icon: WrenchIcon,
    overrides: {
      work_order: { singular: 'Job', plural: 'Jobs', abbreviation: 'JOB' },
      technician: { singular: 'Plumber', plural: 'Plumbers', abbreviation: 'PLMB' },
      service_location: { singular: 'Property', plural: 'Properties', abbreviation: 'PROP' },
      equipment: { singular: 'Fixture', plural: 'Fixtures', abbreviation: 'FIX' },
      dispatch: { singular: 'Service Call', plural: 'Service Calls', abbreviation: 'SC' },
    },
  },
  {
    id: 'electrical',
    label: 'Electrical',
    blurb: 'Job-based vocabulary tuned for electrical contractors and panel work.',
    Icon: BoltIcon,
    overrides: {
      work_order: { singular: 'Job', plural: 'Jobs', abbreviation: 'JOB' },
      technician: { singular: 'Electrician', plural: 'Electricians', abbreviation: 'ELEC' },
      service_location: { singular: 'Site', plural: 'Sites', abbreviation: 'SITE' },
      equipment: { singular: 'Panel', plural: 'Panels', abbreviation: 'PNL' },
      dispatch: { singular: 'Service Call', plural: 'Service Calls', abbreviation: 'SC' },
    },
  },
  {
    id: 'appliance',
    label: 'Appliance Repair',
    blurb: 'Repair-centric vocabulary for whole-goods service shops.',
    Icon: WrenchScrewdriverIcon,
    overrides: {
      work_order: { singular: 'Repair', plural: 'Repairs', abbreviation: 'REP' },
      service_location: { singular: 'Property', plural: 'Properties', abbreviation: 'PROP' },
      equipment: { singular: 'Appliance', plural: 'Appliances', abbreviation: 'APPL' },
      dispatch: { singular: 'Service Call', plural: 'Service Calls', abbreviation: 'SC' },
    },
  },
  {
    id: 'landscaping',
    label: 'Landscaping',
    blurb: 'Job-based work with crew visits for recurring outdoor service.',
    Icon: SunIcon,
    overrides: {
      work_order: { singular: 'Job', plural: 'Jobs', abbreviation: 'JOB' },
      technician: { singular: 'Crew Member', plural: 'Crew Members', abbreviation: 'CREW' },
      service_location: { singular: 'Property', plural: 'Properties', abbreviation: 'PROP' },
      dispatch: { singular: 'Visit', plural: 'Visits', abbreviation: 'VST' },
    },
  },
  {
    id: 'pest',
    label: 'Pest Control',
    blurb: 'Treatment-based vocabulary with account-style customer relationships.',
    Icon: BugAntIcon,
    overrides: {
      customer: { singular: 'Account', plural: 'Accounts', abbreviation: 'ACCT' },
      work_order: { singular: 'Treatment', plural: 'Treatments', abbreviation: 'TRT' },
      technician: { singular: 'Specialist', plural: 'Specialists', abbreviation: 'SPEC' },
      service_location: { singular: 'Property', plural: 'Properties', abbreviation: 'PROP' },
      equipment: { singular: 'Bait Station', plural: 'Bait Stations', abbreviation: 'BAIT' },
    },
  },
  {
    id: 'cleaning',
    label: 'Cleaning',
    blurb: 'Cleaning-visit vocabulary for residential and commercial crews.',
    Icon: SparklesIcon,
    overrides: {
      work_order: { singular: 'Cleaning', plural: 'Cleanings', abbreviation: 'CLN' },
      technician: { singular: 'Cleaner', plural: 'Cleaners', abbreviation: 'CLNR' },
      service_location: { singular: 'Property', plural: 'Properties', abbreviation: 'PROP' },
      dispatch: { singular: 'Visit', plural: 'Visits', abbreviation: 'VST' },
    },
  },
  {
    id: 'it',
    label: 'IT Services',
    blurb: 'Ticket-based vocabulary for managed service providers and IT firms.',
    Icon: ComputerDesktopIcon,
    overrides: {
      customer: { singular: 'Client', plural: 'Clients', abbreviation: 'CLT' },
      work_order: { singular: 'Ticket', plural: 'Tickets', abbreviation: 'TKT' },
      technician: { singular: 'Engineer', plural: 'Engineers', abbreviation: 'ENG' },
      service_location: { singular: 'Site', plural: 'Sites', abbreviation: 'SITE' },
      equipment: { singular: 'Device', plural: 'Devices', abbreviation: 'DEV' },
    },
  },
  {
    id: 'property',
    label: 'Property Maintenance',
    blurb: 'Maintenance-request vocabulary for in-house teams across a tenant-occupied property portfolio.',
    Icon: HomeModernIcon,
    overrides: {
      work_order: { singular: 'Maintenance Request', plural: 'Maintenance Requests', abbreviation: 'MR' },
      technician: { singular: 'Maintenance Tech', plural: 'Maintenance Techs', abbreviation: 'MT' },
      // "Unit" here is a rental unit — abbreviated UNT to avoid colliding with
      // equipment_component, whose default abbreviation is UNIT.
      service_location: { singular: 'Unit', plural: 'Units', abbreviation: 'UNT' },
      equipment: { singular: 'Asset', plural: 'Assets', abbreviation: 'AST' },
    },
  },
];

export function getPreset(id: PresetId): Preset {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown preset: ${id}`);
  return p;
}

// English pluralization — covers the common rules used in trade-vocab
// presets. Not exhaustive; the admin always has the override path if our
// guess is wrong. Returns '' on empty input so the placeholder logic can
// fall back to the system default.
export function pluralize(s: string): string {
  if (!s) return '';
  const lower = s.toLowerCase();
  if (['equipment', 'gear', 'staff', 'feedback'].some((w) => lower.endsWith(w))) return s;
  if (s.endsWith('y') && !/[aeiou]y$/i.test(s)) return s.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh)$/i.test(s)) return s + 'es';
  return s + 's';
}

// Short-code suggestion from a display name — the number-prefix counterpart to
// `pluralize`. Multi-word names use the initials (Work Order → WO); single
// words use the first letters (Job → JOB). Always a valid 1–4 char code, or ''
// on empty / punctuation-only input so the placeholder logic can fall back to
// the system default. A guess, not gospel: the admin can override the field.
export function abbreviate(s: string): string {
  const words = s
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean);
  if (words.length === 0) return '';
  const code =
    words.length >= 2
      ? words.map((w) => w[0]).join('') // initials: Work Order → WO
      : words[0].slice(0, 3); // first letters: Job → JOB
  return code.slice(0, 4).toUpperCase();
}

// Entity-code → group bucket. Used by the page to render six grouped
// cards instead of one long flat list. The eyebrow labels live in i18n.
// 'other' is a catch-all bucket for entity codes the backend returns that
// aren't in ENTITY_GROUP below. No entity maps to it statically; it only
// appears when the FE registry has drifted behind the BE. See the
// bucketing logic in TerminologyPanel.
export type GroupId =
  | 'customer'
  | 'work'
  | 'people'
  | 'equipment'
  | 'operations'
  | 'money'
  | 'other';

export const GROUP_ORDER: GroupId[] = [
  'customer',
  'work',
  'people',
  'equipment',
  'operations',
  'money',
  'other',
];

export const ENTITY_GROUP: Record<string, GroupId> = {
  customer: 'customer',
  service_location: 'customer',
  work_order: 'work',
  work_item: 'work',
  dispatch: 'work',
  schedule: 'work',
  route: 'work',
  technician: 'people',
  equipment: 'equipment',
  equipment_component: 'equipment',
  division: 'operations',
  dispatch_region: 'operations',
  invoice: 'money',
  quote: 'money',
  payment: 'money',
};
