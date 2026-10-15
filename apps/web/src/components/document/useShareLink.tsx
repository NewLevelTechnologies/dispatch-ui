import { useState } from 'react';
import { showError, showSuccess } from '../../lib/toast';
import { DropdownItem, DropdownLabel } from '../catalyst/dropdown';
import ConfirmDialog from '../ConfirmDialog';
import { documentErrorMessage } from './useDocumentEditor';
import { useGlossary } from '../../contexts/GlossaryContext';

interface ShareLinkRoutes {
  reissueShareLink: (id: string) => Promise<unknown>;
  extendShareLink: (id: string) => Promise<unknown>;
}

/**
 * The customer's link on a sent quote or invoice: replace it (the old one
 * stops working) or give it another year. Returns the ⋯ menu items and the
 * confirmations they open.
 */
export function useShareLink({ routes, id, number, entity }: { routes: ShareLinkRoutes; id: string; number: string; entity: string }) {
  const { getName } = useGlossary();
  const [confirm, setConfirm] = useState<'reissue' | 'extend' | null>(null);

  const run = async (kind: 'reissue' | 'extend') => {
    try {
      if (kind === 'reissue') {
        await routes.reissueShareLink(id);
        showSuccess('New link made', `The old link no longer works. Send or resend to give the ${getName('customer').toLowerCase()} the new one.`);
      } else {
        await routes.extendShareLink(id);
        showSuccess('Link extended', 'It works for another year.');
      }
    } catch (err) {
      showError(`Couldn’t change the ${getName('customer').toLowerCase()}’s link`, documentErrorMessage(err, entity));
    }
  };

  const items = (
    <>
      <DropdownItem onClick={() => setConfirm('reissue')}>
        <DropdownLabel>{`Replace ${getName('customer').toLowerCase()} link`}</DropdownLabel>
      </DropdownItem>
      <DropdownItem onClick={() => setConfirm('extend')}>
        <DropdownLabel>{`Extend ${getName('customer').toLowerCase()} link`}</DropdownLabel>
      </DropdownItem>
    </>
  );

  const dialogs = (
    <>
      <ConfirmDialog
        isOpen={confirm === 'reissue'}
        onClose={() => setConfirm(null)}
        onConfirm={() => void run('reissue')}
        title={`Replace the link to ${number}?`}
        message={`The link the ${getName('customer').toLowerCase()} has stops working. Send the ${entity} again to give them the new one.`}
        confirmLabel="Replace link"
      />
      <ConfirmDialog
        isOpen={confirm === 'extend'}
        onClose={() => setConfirm(null)}
        onConfirm={() => void run('extend')}
        title={`Extend the link to ${number}?`}
        message={`The link the ${getName('customer').toLowerCase()} has keeps working for another year from today.`}
        confirmLabel="Extend link"
      />
    </>
  );

  return { items, dialogs };
}
