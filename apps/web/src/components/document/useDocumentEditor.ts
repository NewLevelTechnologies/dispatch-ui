import { useCallback, useRef, useState } from 'react';
import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import type { AddLineRequest, ReorderLinesRequest, UpdateLineRequest } from '../../api/setup';
import { errorCode, showError } from '../../lib/toast';
import type { LineEditing } from './DocumentLinesCard';
import { lineUpdate } from './documentModel';

/** List and rollup caches a document edit can change. Prefix-matched, so only mounted ones refetch. */
const DEPENDENT_KEYS = [
  'quotes',
  'invoices',
  'workOrderQuotes',
  'workOrderInvoices',
  'financialSummary',
  'location-invoices',
  'location-invoice-summary',
  'quoteInvoiceable',
];

/** Refetches the lists and rollups a created or changed document shows up in. */
export function refreshDocumentLists(queryClient: QueryClient) {
  for (const key of DEPENDENT_KEYS) queryClient.invalidateQueries({ queryKey: [key] });
}

/**
 * Words a document-edit failure from its `code`; the server's `message` is
 * never shown. `entity` is the glossary name, lowercase ("quote").
 */
export function documentErrorMessage(err: unknown, entity: string): string {
  switch (errorCode(err)) {
    case 'DOCUMENT_NOT_EDITABLE':
      return `This ${entity} can't be edited any more.`;
    case 'QUOTE_NOT_ACCEPTED':
      return 'Only an accepted quote can be invoiced.';
    case 'OVER_INVOICED':
      return 'That is more than is left to bill on the quote line. Put extra work on a new line.';
    case 'LABOR_RATE_NOT_SET':
      return 'That labor rate has no bill rate yet. Type a price, or set the rate.';
    case 'ITEM_NOT_PRICED':
      return 'That pricebook item has no price yet.';
    case 'INVALID_REQUEST':
      return 'Check the line: it needs a description, and prices and quantities can’t be negative.';
    case 'QUOTE_STATUS_TRANSITION':
    case 'INVOICE_STATUS_TRANSITION':
      return `That status change isn't allowed for this ${entity} any more.`;
    case 'NO_RECIPIENT':
      return 'The bill-to has no email address to send to.';
    case 'NOT_SENDABLE_STATUS':
      return `This ${entity} can't be sent in its current status.`;
    case 'RATE_LIMIT_EXCEEDED':
      return 'Too many sends just now. Try again in a minute.';
    default:
      return 'Something went wrong. Try again.';
  }
}

/**
 * Serializes edits to one quote or invoice. Each edit runs after the one
 * before it and is sent with the `version` of the latest response, so rapid
 * edits never collide with each other. On 409 STALE_VERSION (someone else
 * changed it) the document reloads, edits still queued are dropped — they
 * were made against what the user no longer sees — and `stale` is raised.
 */
export function useDocumentEditor<D extends { version?: number }>({
  queryKey,
  entity,
}: {
  queryKey: QueryKey;
  /** Glossary name, lowercase, for error wording. */
  entity: string;
}) {
  const queryClient = useQueryClient();
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const epoch = useRef(0);
  const [pending, setPending] = useState(0);
  const [stale, setStale] = useState(false);

  const refreshDependents = useCallback(() => refreshDocumentLists(queryClient), [queryClient]);

  /**
   * Queue an edit. `fn` gets the current version; when it returns the
   * recomputed document that becomes the cache, otherwise (send, status)
   * the document is refetched. Resolves true on success.
   */
  const run = useCallback(
    (fn: (version: number) => Promise<D | unknown>, failTitle: string, opts?: { returnsDocument?: boolean }) => {
      const mine = epoch.current;
      const returnsDocument = opts?.returnsDocument ?? true;
      setPending((n) => n + 1);
      const task = chain.current.then(async () => {
        try {
          if (mine !== epoch.current) return false;
          const current = queryClient.getQueryData<D>(queryKey);
          const result = await fn(current?.version ?? 0);
          if (returnsDocument) queryClient.setQueryData(queryKey, result as D);
          else await queryClient.invalidateQueries({ queryKey });
          refreshDependents();
          return true;
        } catch (err) {
          if (errorCode(err) === 'STALE_VERSION') {
            epoch.current += 1;
            setStale(true);
            await queryClient.invalidateQueries({ queryKey });
          } else {
            showError(failTitle, documentErrorMessage(err, entity));
            if (errorCode(err) === 'DOCUMENT_NOT_EDITABLE') await queryClient.invalidateQueries({ queryKey });
          }
          return false;
        } finally {
          setPending((n) => n - 1);
        }
      });
      chain.current = task;
      return task;
    },
    [queryClient, queryKey, entity, refreshDependents],
  );

  return { run, saving: pending > 0, stale, dismissStale: () => setStale(false) };
}

interface LineRoutes<D> {
  addLine: (id: string, request: AddLineRequest) => Promise<D>;
  updateLine: (id: string, lineId: string, request: UpdateLineRequest) => Promise<D>;
  deleteLine: (id: string, lineId: string, version: number) => Promise<D>;
  reorderLines: (id: string, request: ReorderLinesRequest) => Promise<D>;
}

/** Wires the lines card's edits to a document's line routes through the edit queue. */
export function lineEditing<D extends { version?: number }>(
  routes: LineRoutes<D>,
  id: string,
  run: ReturnType<typeof useDocumentEditor<D>>['run'],
): LineEditing {
  return {
    onAdd: (line) => run((version) => routes.addLine(id, { ...line, version }), 'Couldn’t add the line'),
    onUpdate: (line, change) =>
      run((version) => routes.updateLine(id, line.id, lineUpdate(line, version, change)), 'Couldn’t save the line'),
    onRemove: (line) => run((version) => routes.deleteLine(id, line.id, version), 'Couldn’t remove the line'),
    onReorder: (lineIds) => run((version) => routes.reorderLines(id, { version, lineIds }), 'Couldn’t reorder the lines'),
  };
}
