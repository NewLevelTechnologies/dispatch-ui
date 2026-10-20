import { useSearchParams } from 'react-router-dom';
import { useGlossary } from '../contexts/GlossaryContext';
import { documentBack } from '../lib/backContext';

/**
 * Back to the quote or invoice this page was opened from: its href and a label
 * (the document's number, else its glossary name). Null when not opened from one.
 */
export function useDocumentBack(): { href: string; label: string } | null {
  const [params] = useSearchParams();
  const { getName } = useGlossary();
  const doc = documentBack(params);
  if (!doc) return null;
  return { href: doc.href, label: doc.number ?? getName(doc.kind) };
}
