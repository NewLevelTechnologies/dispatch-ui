import { useState, useEffect, useCallback } from 'react';
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
}

export default function ServiceLocationPicker({
  value,
  onChange,
  label = 'Service Location',
  required = false,
  autoFocus = false,
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

  // Backend search
  const { data: searchResults, isLoading } = useQuery({
    queryKey: ['service-locations-search', debouncedQuery],
    queryFn: () => customerApi.searchServiceLocations(debouncedQuery, 0, 50),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30000, // Cache for 30 seconds
  });

  const locations = searchResults?.content || [];

  // Derive showDropdown from state instead of setting in effect
  const shouldShowDropdown = showDropdown && searchQuery.length >= 2;

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
    if (e.target.value.length >= 2) {
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

      {searchQuery.length > 0 && searchQuery.length < 2 && (
        /* eslint-disable-next-line i18next/no-literal-string */
        <p className="mt-1 text-sm text-zinc-500">Type at least 2 characters to search</p>
      )}
    </Field>
  );
}
