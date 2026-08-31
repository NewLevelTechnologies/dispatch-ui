// Customer Activity tab feed (ACT-1). The customer-scoped projection of the
// shared merged-activity stream — work-order + financial events interleaved by
// timestamp. There's no customer-level audit stream, so the "Changes" chip is
// absent (the stream component handles that from the scope). Thin wrapper so the
// call site reads with the rest of the Customer* tab components.
import LocationActivityStream from '../LocationActivityStream';

export default function CustomerActivityStream({ customerId }: { customerId: string }) {
  return <LocationActivityStream customerId={customerId} />;
}
