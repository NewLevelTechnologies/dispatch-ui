type Address = { streetAddress: string; city: string; state: string; zipCode: string };

/** "123 Main St, Phoenix, AZ 85001" — a single display line and, doubling as the Directions deep-link query. */
export function formatAddress(address: Address | null | undefined): string | null {
  if (!address) return null;
  const cityStateZip = [address.city, [address.state, address.zipCode].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  return [address.streetAddress, cityStateZip].filter(Boolean).join(', ');
}
