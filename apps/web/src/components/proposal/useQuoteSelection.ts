import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { quotesApi, type Quote } from '../../api/setup';
import { isProposal } from './proposalModel';

/**
 * A proposal's saved choice, priced by the server: the live card totals,
 * savings, margin and price range. Keyed on the quote's version so every
 * structural edit refetches it; the customer's own choices don't move the
 * version, so it also refetches on focus.
 */
export function useQuoteSelection(quote: Quote | undefined) {
  const hasOptions = !!quote?.optionGroups?.some((g) => g.options.length > 0);
  return useQuery({
    queryKey: ['quote-selection', quote?.id, quote?.version],
    queryFn: () => quotesApi.getSelection(quote!.id),
    enabled: !!quote && isProposal(quote) && hasOptions,
    placeholderData: keepPreviousData,
  });
}
