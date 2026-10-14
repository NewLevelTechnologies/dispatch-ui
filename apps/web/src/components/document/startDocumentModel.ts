import { workOrderApi, type ServiceLocationDetailDto, type ServiceLocationSearchResult, type WorkOrderSummary } from '../../api/setup';

export type StartKind = 'quote' | 'invoice';

const OPEN_PROGRESS = ['NOT_STARTED', 'AWAITING_SCHEDULE', 'IN_PROGRESS', 'BLOCKED'] as const;

/** Open jobs at a location, and for an invoice also finished jobs not invoiced yet: that's where most invoices go. */
export async function jobsAt(locationId: string, kind: StartKind): Promise<WorkOrderSummary[]> {
  const open = await workOrderApi.getAll({
    serviceLocationId: locationId,
    lifecycleState: 'ACTIVE',
    progressCategory: [...OPEN_PROGRESS],
    size: 20,
  });
  if (kind === 'quote') return open.content;
  const done = await workOrderApi.getAll({ serviceLocationId: locationId, unbilled: true, size: 20 });
  const seen = new Set(open.content.map((w) => w.id));
  return [...open.content, ...done.content.filter((w) => !seen.has(w.id))];
}

/** A location page's record in the start dialog's shape. */
export const locationForStart = (l: ServiceLocationDetailDto): ServiceLocationSearchResult => ({
  id: l.id,
  customerId: l.customerId,
  customerName: l.customerName,
  locationName: l.locationName ?? null,
  premiseType: l.premiseType,
  address: l.address,
  status: l.status,
});
