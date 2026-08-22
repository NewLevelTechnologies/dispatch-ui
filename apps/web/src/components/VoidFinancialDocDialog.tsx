import { useEffect, useState } from 'react';
import { useTranslation } from '@dispatch/i18n';
import { Button } from './catalyst/button';
import {
  Checkbox,
  CheckboxField,
} from './catalyst/checkbox';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from './catalyst/dialog';
import { Description, Label } from './catalyst/fieldset';

interface Props {
  open: boolean;
  /**
   * Doc kind drives the title / description copy via i18n. `invoice` or
   * `quote` — keeps the component shared across the two tabs without
   * forcing them to pass duplicate translation keys.
   */
  kind: 'invoice' | 'quote';
  /**
   * Display label resolved via `useGlossary()` by the parent — passed in
   * so this component doesn't need to take a glossary dependency.
   */
  entityLabel: string;
  /** e.g. "INV-00012". */
  documentNumber: string;
  /** Pre-formatted currency string (e.g. "$1,250.00"). */
  amountDisplay: string;
  /**
   * Whether the row has an active share link the customer could currently
   * view. If false, the revoke checkbox is hidden — nothing to revoke.
   * Sourced from `lastSentAt` on the parent: a row that's never been sent
   * has no live customer-facing URL.
   */
  hasActiveShareLink: boolean;
  /** Called with the user's choice. Parent owns the actual void + revoke
   *  calls and the success / failure toasts. */
  onConfirm: (opts: { revokeShareLink: boolean }) => void;
  onClose: () => void;
  busy?: boolean;
}

/**
 * Catalyst-Dialog replacement for the prior `window.confirm()` void flow.
 * Adds the §6.4 "Revoke the share link..." checkbox so a CSR can cut
 * customer access during the same action when the void is due to a
 * wrong-customer / wrong-address mistake.
 *
 * Default OFF (per §3 locked decision: "Revoke-on-void — Default OFF,
 * opt-in via void dialog checkbox"). The voided row keeps context value
 * by default — only the explicit opt-in cuts access.
 */
export default function VoidFinancialDocDialog({
  open,
  kind,
  entityLabel,
  documentNumber,
  amountDisplay,
  hasActiveShareLink,
  onConfirm,
  onClose,
  busy,
}: Props) {
  const { t } = useTranslation();
  const [revoke, setRevoke] = useState(false);

  // Reset the checkbox each time the dialog re-opens so the prior session's
  // state doesn't bleed across rows. Keep `revoke` false at rest — the
  // opt-in nature of the checkbox is part of the locked design.
  useEffect(() => {
    if (open) {
      /* eslint-disable react-hooks/set-state-in-effect -- standard reset-on-open pattern */
      setRevoke(false);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [open]);

  const handleConfirm = () => {
    onConfirm({ revokeShareLink: revoke });
  };

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogTitle>
        {t('workOrders.financialDrawer.voidDialog.title', { entity: entityLabel })}
      </DialogTitle>
      <DialogDescription>
        {t(`workOrders.financialDrawer.voidDialog.body.${kind}`, {
          entity: entityLabel,
          number: documentNumber,
          amount: amountDisplay,
        })}
      </DialogDescription>
      <DialogBody>
        {hasActiveShareLink && (
          <CheckboxField>
            <Checkbox
              name="revokeShareLink"
              checked={revoke}
              onChange={(checked) => setRevoke(checked)}
            />
            <Label>
              {t('workOrders.financialDrawer.voidDialog.revokeLabel')}
            </Label>
            <Description>
              {t('workOrders.financialDrawer.voidDialog.revokeDescription')}
            </Description>
          </CheckboxField>
        )}
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button color="rose" onClick={handleConfirm} disabled={busy}>
          {busy
            ? t('common.saving')
            : t('workOrders.financialDrawer.voidDialog.confirm', { entity: entityLabel })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
