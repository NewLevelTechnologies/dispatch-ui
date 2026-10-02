// Shared shapes and helpers for the callback link. The link is the only thing
// that counts; a work order's type is independent and never read here except
// for the one hint (the seeded type's fixed `systemKey`).
import { useTranslation } from '@dispatch/i18n';
import type { CallbackCandidate, CallbackOf, CallbackTechnician, WorkOrderType } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';

export const CALLBACK_SYSTEM_KEY = 'CALLBACK';

/** Whether this type is the tenant's seeded Callback type — a hint, never a rule. */
export function isSeededCallbackType(type: Pick<WorkOrderType, 'systemKey'> | undefined | null): boolean {
  return type?.systemKey === CALLBACK_SYSTEM_KEY;
}

/** What the prompt shows once a job is picked: enough to name who gets charged. */
export interface LinkedJob {
  id: string;
  workOrderNumber: string;
  summary: string | null;
  completedDate: string | null;
  locationName?: string | null;
  equipmentNames?: string[];
  chargedTechnicians: CallbackTechnician[];
}

export type CallbackValue =
  | { state: 'unset' }
  | { state: 'dismissed' }
  | { state: 'linked'; job: LinkedJob };

export const UNSET: CallbackValue = { state: 'unset' };

export function fromCandidate(c: CallbackCandidate): LinkedJob {
  return {
    id: c.id,
    workOrderNumber: c.workOrderNumber,
    summary: c.summary,
    completedDate: c.completedDate,
    equipmentNames: c.equipment.map((e) => e.name),
    chargedTechnicians: c.technicians,
  };
}

export function fromCallbackOf(c: CallbackOf): LinkedJob {
  return {
    id: c.id,
    workOrderNumber: c.workOrderNumber,
    summary: c.summary,
    completedDate: c.completedDate,
    chargedTechnicians: c.chargedTechnicians,
  };
}

/** "Daniel Park", "Daniel Park and Grace Kim", "A, B and C". */
export function joinNames(names: string[], and: string): string {
  if (names.length <= 2) return names.join(` ${and} `);
  return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`;
}

/** "Sep 18" from a date or timestamp, without a timezone shift. */
export function shortDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Whole days from `date` to `today` (both YYYY-MM-DD, or timestamps). */
export function daysBetween(date: string, today: string): number {
  const a = Date.UTC(...ymd(date));
  const b = Date.UTC(...ymd(today));
  return Math.round((b - a) / 86_400_000);
}

function ymd(value: string): [number, number, number] {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return [y, m - 1, d];
}

/**
 * `t` for `callbacks.*` copy with the glossary names every string may use
 * (work order, tech, equipment, location, agreement) already passed in.
 */
export function useCallbackT() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const words = {
    entity: getName('work_order'),
    entities: getName('work_order', true),
    tech: getName('technician'),
    techs: getName('technician', true),
    equipment: getName('equipment'),
    location: getName('service_location'),
    agreement: getName('agreement'),
  };
  return (key: string, params: Record<string, unknown> = {}) => t(key, { ...words, ...params });
}
