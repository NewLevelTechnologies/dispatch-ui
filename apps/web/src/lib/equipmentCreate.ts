import { createSearchParams } from 'react-router-dom';

// Launch the full-page equipment create in-context. "Creating a record is a
// page" — the shared WOEquipmentPicker's "+ Add new equipment", the equipment
// drawer's "+ Add unit", and customer-detail "+ Add equipment" all route here
// instead of a modal. EquipmentFormPage returns to `returnTo` on save with
// `?newEquipmentId=<id>` (and the echoed `?attachTo`) appended, so the caller
// can auto-wire the new record onto whatever launched it.
//
//   • returnTo    where to come back to on save AND cancel
//   • locationId  scope the create to this service location (skips the picker)
//   • customerId  restrict the location picker to one customer (multi-location
//     + customerName  customer-detail add — the location is still chosen there)
//   • attachTo    opaque token echoed back; we use `wi:<workItemId>` so the WO
//                 detail page can attach the new equipment to that work item
//   • parent      create a sub-unit under this equipment
export function equipmentCreateUrl(opts: {
  returnTo: string;
  locationId?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  attachTo?: string | null;
  parent?: string | null;
}): string {
  const params: Record<string, string> = { returnTo: opts.returnTo };
  if (opts.locationId) params.locationId = opts.locationId;
  if (opts.customerId) params.customerId = opts.customerId;
  if (opts.customerName) params.customerName = opts.customerName;
  if (opts.attachTo) params.attachTo = opts.attachTo;
  if (opts.parent) params.parent = opts.parent;
  return `/equipment/new?${createSearchParams(params)}`;
}

// Edit an existing equipment record on the full page, returning to the caller
// on save/cancel (e.g. customer-detail "Edit equipment" → back to the customer).
export function equipmentEditUrl(id: string, returnTo?: string): string {
  return returnTo ? `/equipment/${id}/edit?${createSearchParams({ returnTo })}` : `/equipment/${id}/edit`;
}

// The work-item attach token the WO detail page reads on return.
export const workItemAttachToken = (workItemId: string) => `wi:${workItemId}`;
export const parseWorkItemAttachToken = (attachTo: string | null): string | null =>
  attachTo && attachTo.startsWith('wi:') ? attachTo.slice(3) : null;
