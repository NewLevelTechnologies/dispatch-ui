import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  MapPinIcon,
  HomeIcon,
  BuildingOffice2Icon,
  CheckIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { customerApi, type ServiceLocationSearchResult, type CustomerSearchResult } from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { Button } from './catalyst/button';
import { Field, Label } from './catalyst/fieldset';
import { Input, InputGroup } from './catalyst/input';
import { titleCaseAddress } from '@dispatch/utils';

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
  /**
   * Keep the label for screen readers but hide it visually — for surfaces where
   * a section header already names the field (the intake page's numbered
   * "Service location" card), so repeating it above the control is just noise.
   */
  hideLabel?: boolean;
  /**
   * Opt into the search-first picker (mock: `LocationSection`). A CSR on the
   * phone is in one of three realities and doesn't know which until they've
   * typed: the location exists, the CUSTOMER exists but this property doesn't,
   * or nobody exists yet. Passing this handles all three from one box —
   * customers surface as their own result group with "+ New location" on them,
   * and a "New customer" footer catches the rest.
   *
   * Without it the picker stays a plain location search with a floating
   * dropdown, which is what the WO edit dialog wants.
   */
  searchFirst?: {
    onCreateForCustomer: (customer: CustomerSearchResult) => void;
    onCreateNewCustomer: () => void;
  };
}

// Premise glyph (PREMISE-1). Falls back to a neutral map-pin when the location
// predates the field or the search projection hasn't been redeployed.
function PremiseGlyph({
  premiseType,
  className,
}: {
  premiseType: ServiceLocationSearchResult['premiseType'];
  className?: string;
}) {
  if (premiseType === 'BUSINESS') return <BuildingOffice2Icon className={className} />;
  if (premiseType === 'RESIDENCE') return <HomeIcon className={className} />;
  return <MapPinIcon className={className} />;
}

// Result-group header. Two kinds of thing share one list, so each group has to
// say what it is and what picking from it does.
function PickerGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-border-soft bg-bg-elev-2 px-3 py-1 text-[10px] font-bold tracking-[0.05em] text-fg-muted uppercase">
      {children}
    </div>
  );
}

/* eslint-disable i18next/no-literal-string -- short operational copy, same
   convention as the rest of this picker's inline states. */
// Empty results. Search-first never dead-ends: with nothing typed it says what
// the box searches, and with no match it points at the "New customer" footer
// rather than leaving the CSR staring at "no results" mid-call.
function EmptyResults({
  searchFirst,
  hasQuery,
  query,
}: {
  searchFirst: boolean;
  hasQuery: boolean;
  query: string;
}) {
  const { getName } = useGlossary();
  const locationWord = getName('service_location').toLowerCase();
  const customerWord = getName('customer').toLowerCase();

  if (!searchFirst) {
    return (
      <div className="px-3 py-2.5 text-[12px] text-fg-muted">
        No {getName('service_location', true).toLowerCase()} found
      </div>
    );
  }
  return (
    <div className="px-3 py-2.5 text-[12px] leading-relaxed text-fg-muted">
      {hasQuery ? (
        <>
          Nothing matches “{query}”.
          <br />
          <span className="text-fg-dim">First time calling? Add them below.</span>
        </>
      ) : (
        <span className="text-fg-dim">
          Search by {locationWord}, {customerWord}, address, or phone — or add a new {customerWord}{' '}
          below.
        </span>
      )}
    </div>
  );
}
/* eslint-enable i18next/no-literal-string */

// The collapsed picked state (mock: `LocationField` in screen-wo-intake.jsx).
// Reads as an identity row rather than a form control: premise glyph, what we
// call the site, then the address the tech will drive to. Clicking anywhere
// reopens the search.
//
// Premise is carried by the glyph alone — no RESIDENCE/BUSINESS text badge. The
// glyph is unambiguous, and the words cost a slot on the row's one dense line.
//
// The mock also carries a distance and a "Primary" marker; the search
// projection has neither, so they're left out rather than faked.
function PickedLocation({
  location,
  onChange,
}: {
  location: ServiceLocationSearchResult;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const { locationName, customerName, premiseType, address } = location;
  const name = locationName || customerName;
  const premiseLabel =
    premiseType === 'BUSINESS'
      ? t('common.premiseBusiness')
      : premiseType === 'RESIDENCE'
        ? t('common.premiseResidence')
        : undefined;
  // The owner only earns a slot when the site is named for something other than
  // the customer — otherwise it just repeats the name.
  const owner = locationName && customerName !== locationName ? customerName : null;

  return (
    <button
      type="button"
      onClick={onChange}
      className="flex w-full items-center gap-3 rounded-md border border-border bg-bg px-3 py-2 text-left transition-colors hover:border-border-strong hover:bg-bg-hover focus:outline-none focus-visible:border-accent-500"
    >
      {/* Titled so the premise the glyph encodes is still reachable on hover
          and by screen readers now that the text badge is gone. */}
      <span
        className="grid size-[34px] shrink-0 place-items-center rounded-lg bg-bg-active text-fg-muted"
        title={premiseLabel}
        aria-label={premiseLabel}
      >
        <PremiseGlyph premiseType={premiseType} className="size-[17px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] font-bold text-fg-strong">{name}</span>
        </span>
        <span className="mt-0.5 block truncate text-[11.5px] text-fg-muted">
          {/* State code skips titleCaseAddress — it would lower-case "GA". */}
          {titleCaseAddress(address.streetAddress)} · {titleCaseAddress(address.city)}, {address.state}{' '}
          {address.zipCode}
          {owner ? ` · ${owner}` : ''}
        </span>
      </span>
      {/* eslint-disable-next-line i18next/no-literal-string */}
      <span className="card-action shrink-0">Change</span>
    </button>
  );
}

export default function ServiceLocationPicker({
  value,
  onChange,
  label: labelProp,
  required = false,
  autoFocus = false,
  restrictToCustomer,
  hideLabel = false,
  searchFirst,
}: ServiceLocationPickerProps) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  // Entity names are tenant-configurable, so the fallback label is the glossary
  // term rather than a baked-in "Service Location". `??` (not `||`) so a caller
  // passing "" to suppress the label still gets no label.
  const label = labelProp ?? getName('service_location');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  // Re-opened the search box on an already-picked location ("Change").
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Once a location is chosen the CSR is done searching — they now need to read
  // the site back to the caller. So the field collapses into a dense identity
  // row instead of staying an editable text input (mock: `LocationField`).
  const collapsed = !!value && !editing;

  // Reopening should land the caret in the search box. In restricted mode the
  // focus handler also opens the (short) list, so re-picking is one click.
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

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

  // Search-first zero-state: the tenant's recently active locations, so opening
  // the picker with the caller on the line never shows an empty panel. Its own
  // endpoint and its own query key — no cache key whose meaning flips on an
  // empty string. Restricted mode already opens on focus with the customer's
  // own locations, so it never had the empty-panel problem.
  const { data: recentResults, isLoading: recentLoading } = useQuery({
    queryKey: ['service-locations-recent'],
    queryFn: () => customerApi.getRecentServiceLocations(8),
    enabled: !!searchFirst && !restrictToCustomer && debouncedQuery.trim().length < 2,
    staleTime: 30000,
  });

  // Search-first only: customers as their own result group. This is what makes
  // "new location on an existing account" a one-click path instead of a mode the
  // CSR has to know to switch into — and it's what stops them reaching for
  // "New customer" and creating a duplicate of an account we already have.
  const { data: customerResults } = useQuery({
    queryKey: ['customers-search', debouncedQuery],
    queryFn: () => customerApi.search({ q: debouncedQuery, page: 0, size: 5 }),
    enabled: !!searchFirst && !restrictToCustomer && debouncedQuery.length >= 2,
    staleTime: 30000,
  });
  // Payers are billing-only accounts — they pay for work but hold no service
  // locations, so "+ New location" on one would offer something the model
  // doesn't allow. Drop them from the group rather than showing a dead row.
  const customers = (customerResults?.content ?? []).filter((c) => c.type !== 'BILLING_ONLY');

  const locations: ServiceLocationSearchResult[] = useMemo(() => {
    if (restrictToCustomer) {
      const customerName = restrictToCustomer.name;
      const adapted = customerLocations.map((loc) => ({
        id: loc.id,
        customerId: loc.customerId,
        customerName,
        locationName: loc.locationName ?? null,
        premiseType: loc.premiseType ?? null,
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
    // Zero-state falls back to the recency panel rather than an empty list.
    if (searchFirst && searchQuery.trim().length < 2) return recentResults?.content ?? [];
    return searchResults?.content ?? [];
  }, [restrictToCustomer, customerLocations, searchResults, searchQuery, searchFirst, recentResults]);

  const isLoading = restrictToCustomer
    ? customerLocationsLoading
    : searchFirst && searchQuery.trim().length < 2
      ? recentLoading
      : searchLoading;

  // Restricted mode opens on focus (small list, no min length needed).
  // Tenant-wide mode requires 2+ chars to avoid a useless empty fetch.
  //
  // Search-first keeps the panel open the whole time it's in search mode: it's
  // in flow rather than floating, and the "New customer" footer is the escape
  // hatch for a caller who isn't on file — it has to be reachable before the
  // CSR has typed anything worth searching.
  const hasQuery = searchQuery.trim().length >= 2;
  const shouldShowDropdown = searchFirst
    ? true
    : showDropdown && (restrictToCustomer ? true : searchQuery.length >= 2);

  const handleSelect = useCallback(
    (location: ServiceLocationSearchResult) => {
      onChange(location);
      setSearchQuery('');
      setShowDropdown(false);
      setEditing(false);
    },
    [onChange]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    if (restrictToCustomer || e.target.value.length >= 2) {
      setShowDropdown(true);
    }
  };

  const labelCls = hideLabel ? 'sr-only' : undefined;

  if (collapsed && value) {
    return (
      <Field>
        {label && <Label className={labelCls}>{label}</Label>}
        <PickedLocation location={value} onChange={() => setEditing(true)} />
      </Field>
    );
  }

  return (
    <Field>
      {label && <Label className={labelCls}>{label}{required && ' *'}</Label>}
      <div className="relative">
        <InputGroup>
          <MagnifyingGlassIcon data-slot="icon" />
          <Input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={handleInputChange}
            onFocus={() => {
              if (restrictToCustomer) {
                setShowDropdown(true);
              }
            }}
            placeholder={`Search by ${getName('customer').toLowerCase()}, address, or phone...`}
            autoFocus={autoFocus}
            // A picked location already satisfies the field; requiring the
            // search box too would block submit whenever the CSR opens
            // "Change" and doesn't retype.
            required={required && !value}
          />
        </InputGroup>

        {shouldShowDropdown && (
          <div
            className={
              searchFirst
                ? // In flow, not floating — the section card can never clip the
                  // results, and the customer group + footer need the room.
                  'mt-2 overflow-hidden rounded-md border border-border bg-bg-elev'
                : 'absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-bg-elev shadow-md'
            }
          >
            {isLoading && (
              /* eslint-disable-next-line i18next/no-literal-string */
              <div className="px-3 py-2.5 text-[12px] text-fg-muted">Searching…</div>
            )}

            {!isLoading && locations.length === 0 && !(searchFirst && customers.length > 0) && (
              <EmptyResults searchFirst={!!searchFirst} hasQuery={hasQuery} query={searchQuery.trim()} />
            )}

            {!isLoading && searchFirst && locations.length > 0 && (
              <PickerGroup>
                {hasQuery ? getName('service_location', true) : t('common.recent')}
              </PickerGroup>
            )}

            {!isLoading && locations.length > 0 && (
              <div className={searchFirst ? 'max-h-72 overflow-y-auto' : 'max-h-72 overflow-y-auto p-1'}>
                {locations.map((location) => {
                  const name = location.locationName || location.customerName;
                  // Show the owner when the site is named for something other
                  // than the customer (disambiguates "Rental" vs "Residence",
                  // repeated addresses, etc.).
                  const owner =
                    location.locationName && location.customerName !== location.locationName
                      ? location.customerName
                      : null;
                  const selected = value?.id === location.id;
                  return (
                    <button
                      key={location.id}
                      type="button"
                      onClick={() => handleSelect(location)}
                      className="flex w-full items-start gap-2.5 rounded-sm px-2 py-2 text-left transition-colors hover:bg-bg-hover focus-visible:bg-bg-hover focus:outline-none"
                      style={
                        selected
                          ? { background: 'color-mix(in oklch, var(--accent-500) 9%, transparent)' }
                          : undefined
                      }
                    >
                      <span className="mt-px grid size-7 flex-shrink-0 place-items-center rounded-md bg-bg-active text-fg-muted">
                        <PremiseGlyph premiseType={location.premiseType} className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-[12.5px] font-semibold text-fg-strong">{name}</span>
                          {owner && <span className="ml-auto flex-shrink-0 text-[11px] text-fg-dim">{owner}</span>}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-fg-muted">
                          {titleCaseAddress(location.address.streetAddress)}, {titleCaseAddress(location.address.city)}, {location.address.state} {location.address.zipCode}
                        </span>
                      </span>
                      {selected && <CheckIcon className="mt-0.5 size-4 flex-shrink-0 text-fg-accent" />}
                    </button>
                  );
                })}
              </div>
            )}

            {!isLoading && searchFirst && customers.length > 0 && (
              <>
                {/* The label carries the affordance: a CSR scanning results
                    shouldn't have to infer why accounts are in a location
                    picker. */}
                {/* eslint-disable-next-line i18next/no-literal-string */}
                <PickerGroup>{getName('customer', true)} · add a new {getName('service_location').toLowerCase()} to an existing account</PickerGroup>
                {customers.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => searchFirst.onCreateForCustomer(customer)}
                    className="flex w-full items-center gap-2.5 border-b border-border-soft px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-bg-hover focus-visible:bg-bg-hover focus:outline-none"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-bg-active text-fg-muted">
                      {customer.category === 'RESIDENTIAL' ? (
                        <UserIcon className="size-4" />
                      ) : (
                        <BuildingOffice2Icon className="size-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-fg-strong">{customer.name}</span>
                      {customer.customerNumber && (
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-fg-muted">
                          {customer.customerNumber}
                        </span>
                      )}
                    </span>
                    {/* eslint-disable-next-line i18next/no-literal-string */}
                    <span className="card-action shrink-0">
                      + New {getName('service_location').toLowerCase()}
                    </span>
                  </button>
                ))}
              </>
            )}

            {!isLoading && searchFirst && (
              <button
                type="button"
                onClick={searchFirst.onCreateNewCustomer}
                className="flex w-full items-center gap-2 border-t border-border-soft bg-bg-elev-2 px-3 py-2.5 text-left transition-colors hover:bg-bg-hover focus-visible:bg-bg-hover focus:outline-none"
              >
                <PlusIcon className="size-3.5 text-fg-accent" />
                {/* eslint-disable-next-line i18next/no-literal-string */}
                <span className="card-action">New {getName('customer').toLowerCase()}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Reopened on an existing pick — offer the way back, or "Change" is a
          one-way trip and a mis-click costs the CSR the location they had. */}
      {value && (
        <div className="mt-1.5 flex justify-end">
          <Button
            type="button"
            plain
            size="xxs"
            onClick={() => {
              setSearchQuery('');
              setShowDropdown(false);
              setEditing(false);
            }}
          >
            {t('common.cancel')}
          </Button>
        </div>
      )}

      {/* Search-first says the same thing inside the panel, where the CSR is
          already looking — a second copy below the box is just noise. */}
      {!searchFirst && !restrictToCustomer && searchQuery.length > 0 && searchQuery.length < 2 && (
        /* eslint-disable-next-line i18next/no-literal-string */
        <p className="mt-1 text-[11px] text-fg-dim">Type at least 2 characters to search</p>
      )}
    </Field>
  );
}
