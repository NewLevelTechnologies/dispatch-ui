import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { customerApi, type CustomerListDto } from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { titleCaseAddress } from '../utils/titleCaseAddress';
import { Input } from './catalyst/input';
import { CustomerResultRow } from './CustomerResultRow';

export interface PickedCustomer {
  id: string;
  name: string;
}

// Customer picker for the "add a location" flow: the parent customer is the
// pick-target, so this is intentionally NOT the generic CustomerPicker (which
// surfaces payers for invoicing). It runs off the operational list query, which
// default-excludes BILLING_ONLY — you can't add a service location to a payer —
// and rides CustomerListDto so each row can disambiguate by full address +
// location count (reusing CustomerResultRow). A "+ New customer" escape hatch
// at the foot keeps a no-match search from dead-ending.

function addressLine(a: CustomerListDto['billingAddress']): string {
  const cityState = [titleCaseAddress(a.city), a.state].filter(Boolean).join(' ');
  return [a.streetAddress ? titleCaseAddress(a.streetAddress) : '', cityState].filter(Boolean).join(', ');
}

export default function LocationCustomerPicker({
  value,
  onChange,
}: {
  value: PickedCustomer | null;
  onChange: (customer: PickedCustomer | null) => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const customersLabel = getName('customer', true);

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', 'location-picker', debounced],
    queryFn: () => customerApi.getAllPaginated({ search: debounced, size: 8 }),
    enabled: open && debounced.length >= 2,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const results = data?.content ?? [];
  const inputValue = query !== '' ? query : (value?.name ?? '');

  const select = (c: CustomerListDto) => {
    onChange({ id: c.id, name: c.name });
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        type="text"
        value={inputValue}
        placeholder={t('common.customerPicker.placeholder', { entities: customersLabel })}
        aria-label={t('common.customerPicker.placeholder', { entities: customersLabel })}
        onFocus={() => {
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.select());
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
      />
      {open && (
        <div
          className="absolute top-full left-0 z-50 mt-1 w-full overflow-y-auto rounded-md border border-border bg-bg-elev shadow-lg"
          style={{ maxHeight: 320 }}
        >
          {debounced.length < 2 ? (
            <div className="px-3 py-2 text-[12px] text-fg-muted">{t('common.customerPicker.typeToSearch')}</div>
          ) : isLoading ? (
            <div className="px-3 py-2 text-[12px] text-fg-muted">{t('common.customerPicker.searching')}</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-fg-muted">
              {t('common.customerPicker.noResults', { entities: customersLabel, query: debounced })}
            </div>
          ) : (
            <ul role="listbox" className="py-1">
              {results.map((c) => (
                <li
                  key={c.id}
                  role="option"
                  aria-selected={c.id === value?.id}
                  onClick={() => select(c)}
                  className="cursor-pointer px-3 py-1.5 hover:bg-bg-hover"
                >
                  <CustomerResultRow
                    name={c.name}
                    customerNumber={c.customerNumber}
                    addressLine={addressLine(c.billingAddress)}
                    locationCount={c.serviceLocationCount}
                  />
                </li>
              ))}
            </ul>
          )}
          {/* Escape hatch — adding a location for a customer not yet in the
              system is a real path; don't dead-end on a no-match search. */}
          <button
            type="button"
            onClick={() => navigate('/customers/new')}
            className="flex w-full items-center gap-1.5 border-t border-border-soft bg-bg-elev-2 px-3 py-2 text-left text-[12px] font-medium text-fg-accent hover:bg-bg-hover"
          >
            <span className="text-[14px] leading-none">+</span>
            {t('common.actions.new', { entity: getName('customer') })}
          </button>
        </div>
      )}
    </div>
  );
}
