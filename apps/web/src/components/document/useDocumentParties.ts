import { useQuery } from '@tanstack/react-query';
import { formatSiteAddress, titleCaseAddress } from '@dispatch/utils';
import { customerApi, workOrderApi } from '../../api/setup';
import type { DocumentParty } from './DocumentSummaryHeader';

interface Address {
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
}

const locationParty = (id: string, locationName: string | null | undefined, address: Address): DocumentParty => {
  const street = titleCaseAddress(address.streetAddress);
  return {
    name: locationName || street,
    href: `/service-locations/${id}`,
    sub: formatSiteAddress({ street: locationName ? street : null, city: titleCaseAddress(address.city), state: address.state, zip: address.zipCode }),
  };
};

/**
 * The people and place around a quote or invoice: the bill-to (terms + email),
 * the work order (number, summary, NTE) and the service location. An invoice
 * carries no location of its own — its location is its work order's, which is
 * also where tax and membership resolve from.
 */
export function useDocumentParties({
  customerId,
  customerName,
  workOrderId,
  serviceLocationId,
}: {
  customerId: string;
  customerName?: string | null;
  workOrderId?: string | null;
  serviceLocationId?: string | null;
}) {
  const customerQuery = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => customerApi.getById(customerId),
    enabled: !!customerId,
  });
  const workOrderQuery = useQuery({
    queryKey: ['work-orders', workOrderId],
    queryFn: () => workOrderApi.getById(workOrderId!),
    enabled: !!workOrderId,
  });
  const wo = workOrderQuery.data;
  const woLocation = wo?.serviceLocation;
  // Only fetch the location when the document names one the work order doesn't already carry.
  const locationId = serviceLocationId ?? woLocation?.id ?? null;
  const needsLocation = !!serviceLocationId && (!wo || woLocation?.id !== serviceLocationId);
  const locationQuery = useQuery({
    queryKey: ['service-location', serviceLocationId],
    queryFn: () => customerApi.getServiceLocationById(serviceLocationId!),
    enabled: needsLocation && !workOrderQuery.isLoading,
  });

  const customer = customerQuery.data;
  const terms = customer ? (customer.paymentTermsDays > 0 ? `Net ${customer.paymentTermsDays}` : 'Due on receipt') : null;
  const billTo: DocumentParty = {
    name: customer?.name ?? customerName ?? '…',
    href: `/customers/${customerId}`,
    kind: customer?.type === 'BILLING_ONLY' ? 'Payer' : null,
    sub: [terms, customer?.email].filter(Boolean).join(' · ') || null,
  };

  const loc = locationQuery.data;
  const location: DocumentParty | null = loc
    ? locationParty(loc.id, loc.locationName, loc.address)
    : woLocation && woLocation.id === locationId
      ? locationParty(woLocation.id, woLocation.locationName, woLocation.address)
      : null;

  return { billTo, location, workOrder: wo ?? null };
}
