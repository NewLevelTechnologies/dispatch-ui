import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { invoicesApi, quotesApi, type ServiceLocationSearchResult } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { showError } from '../../lib/toast';
import { StartDocumentDialog, type StartAt } from './StartDocumentDialog';
import { jobsAt, type StartKind } from './startDocumentModel';
import { documentErrorMessage, refreshDocumentLists } from './useDocumentEditor';

/**
 * "New quote / New invoice" from a page that already knows the location (or
 * none, for a customer with several). A location with no job to link has
 * nothing to ask, so the draft is created straight away, billed to its
 * owner; otherwise the start dialog opens on that location.
 */
export function useStartDocument() {
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ kind: StartKind; start: StartAt | null; query?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  /** `query` starts the search when there's no single location (a customer's name lists their sites). */
  const start = async (kind: StartKind, location?: ServiceLocationSearchResult, query?: string) => {
    if (busy) return;
    if (!location) return setDialog({ kind, start: null, query });
    setBusy(true);
    const noun = getName(kind).toLowerCase();
    try {
      const jobs = await jobsAt(location.id, kind);
      if (jobs.length) {
        setDialog({ kind, start: { location } });
        return;
      }
      const body = { customerId: location.customerId, serviceLocationId: location.id };
      const doc = kind === 'quote' ? await quotesApi.create(body) : await invoicesApi.create(body);
      refreshDocumentLists(queryClient);
      navigate(`${kind === 'quote' ? `/quotes/${doc.id}` : `/invoices/${doc.id}`}?add=pricebook`);
    } catch (err) {
      showError(`Couldn’t create the ${noun}`, documentErrorMessage(err, noun));
    } finally {
      setBusy(false);
    }
  };

  const element = (
    <StartDocumentDialog kind={dialog?.kind ?? null} start={dialog?.start} query={dialog?.query} onClose={() => setDialog(null)} />
  );
  return { start, busy, element };
}
