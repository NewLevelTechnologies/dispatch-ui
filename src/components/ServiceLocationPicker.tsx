import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { customerApi, type ServiceLocationSearchResult } from '../api';
import { Field, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';

interface ServiceLocationPickerProps {
  value: ServiceLocationSearchResult | null;
  onChange: (location: ServiceLocationSearchResult | null) => void;
  label?: string;
  required?: boolean;
  autoFocus?: boolean;
  /**
   * When provided, the picker stops searching tenant-wide and instead lists
   * only this customer's service locations. The dropdown opens on focus
   * (no 2-char minimum), and typing client-side filters that small list.
   */
  restrictToCustomer?: { id: string; name: string } | null;
}

export default function ServiceLocationPicker({
  value,
  onChange,
  label = 'Service Location',
  required = false,
  autoFocus = false,
  restrictToCustomer,
}: ServiceLocationPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Restricted mode: fetch this customer's locations once and filter client-side.
  const { data: customerLocations = [], isLoading: customerLocationsLoading } = useQuery({
    queryKey: ['customer-service-locations', restrictToCustomer?.id],
    queryFn: () => customerApi.getServiceLocations(restrictToCustomer!.id),
    enabled: !!restrictToCustomer?.id,
    staleTime: 30000,
  });

  // Tenant-wide mode: backend search.
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['service-locations-search', debouncedQuery],
    queryFn: () => customerApi.searchServiceLocations(debouncedQuery, 0, 50),
    enabled: !restrictToCustomer && debouncedQuery.length >= 2,
    staleTime: 30000,
  });

  const locations: ServiceLocationSearchResult[] = useMemo(() => {
    if (restrictToCustomer) {
      const customerName = restrictToCustomer.name;
      const adapted = customerLocations.map((loc) => ({
        id: loc.id,
        customerId: loc.customerId,
        customerName,
        locationName: loc.locationName ?? null,
        address: {
          streetAddress: loc.address.streetAddress,
          city: loc.address.city,
          state: loc.address.state,
          zipCode: loc.address.zipCode,
        },
        siteContactName: loc.siteContactName ?? null,
        siteContactPhone: loc.siteContactPhone ?? null,
        status: loc.status === 'CLOSED' ? 'INACTIVE' : loc.status,
      } satisfies ServiceLocationSearchResult));
      const q = searchQuery.trim().toLowerCase();
      if (!q) return adapted;
      return adapted.filter((l) => {
        const haystack = [
          l.locationName ?? '',
          l.address.streetAddress,
          l.address.city,
          l.address.state,
          l.address.zipCode,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      });
    }
    return searchResults?.content ?? [];
  }, [restrictToCustomer, customerLocations, searchResults, searchQuery]);

  const isLoading = restrictToCustomer ? customerLocationsLoading : searchLoading;

  // Restricted mode opens on focus (small list, no min length needed).
  // Tenant-wide mode requires 2+ chars to avoid a useless empty fetch.
  const shouldShowDropdown = showDropdown && (restrictToCustomer ? true : searchQuery.length >= 2);

  const handleSelect = useCallback(
    (location: ServiceLocationSearchResult) => {
      onChange(location);
      setSearchQuery('');
      setShowDropdown(false);
    },
    [onChange]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    if (restrictToCustomer || e.target.value.length >= 2) {
      setShowDropdown(true);
    }
  };

  const formatLocationDisplay = (location: ServiceLocationSearchResult) => {
    const { customerName, locationName, address } = location;
    const name = locationName || customerName;
    return `${name} - ${address.streetAddress}, ${address.city}, ${address.state}`;
  };

  const displayValue = value ? formatLocationDisplay(value) : '';

  return (
    <Field>
      {label && <Label>{label}{required && ' *'}</Label>}
      <div className="relative">
        <Input
          type="text"
          value={searchQuery || displayValue}
          onChange={handleInputChange}
          onFocus={() => {
            if (value) {
              setSearchQuery('');
            }
            if (restrictToCustomer) {
              setShowDropdown(true);
            }
          }}
          placeholder="Search by customer, address, or phone..."
          autoFocus={autoFocus}
          required={required}
        />

        {shouldShowDropdown && (
          <div className="absolute z-10 mt-1 w-full rounded-lg bg-white shadow-lg ring-1 ring-zinc-950/10 dark:bg-zinc-900 dark:ring-white/10">
            {isLoading && (
              <div className="p-3 text-sm text-zinc-600 dark:text-zinc-400">Searching...</div>
            )}

            {!isLoading && locations.length === 0 && (
              /* eslint-disable-next-line i18next/no-literal-string */
              <div className="p-3 text-sm text-zinc-600 dark:text-zinc-400">No locations found</div>
            )}

            {!isLoading && locations.length > 0 && (
              <div className="max-h-60 overflow-y-auto p-1">
                {locations.map((location) => (
                  <button
                    key={location.id}
                    type="button"
                    onClick={() => handleSelect(location)}
                    className="w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-blue-500 hover:text-white focus:bg-blue-500 focus:text-white focus:outline-hidden dark:text-white dark:hover:bg-blue-600"
                  >
                    <div className="font-medium text-zinc-950 dark:text-white group-hover:text-white">
                      {location.locationName || location.customerName}
                    </div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400 group-hover:text-white">
                      {location.address.streetAddress}, {location.address.city}, {location.address.state} {location.address.zipCode}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {!restrictToCustomer && searchQuery.length > 0 && searchQuery.length < 2 && (
        /* eslint-disable-next-line i18next/no-literal-string */
        <p className="mt-1 text-sm text-zinc-500">Type at least 2 characters to search</p>
      )}
    </Field>
  );
}
