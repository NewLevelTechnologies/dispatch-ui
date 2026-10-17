import { useQuery } from '@tanstack/react-query';
import { quotesApi, type Quote } from '../../api/setup';

/** Whether the quote can be sent as it stands, keyed on its version: an edit voids an earlier approval. */
export function usePriceClearance(quote: Quote | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['quote-price-clearance', quote?.id, quote?.version],
    queryFn: () => quotesApi.getPriceClearance(quote!.id),
    enabled: !!quote && enabled,
  });
}
