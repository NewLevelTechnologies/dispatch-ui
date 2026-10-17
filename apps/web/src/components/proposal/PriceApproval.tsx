/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the quote page). */
// A quote below the margin floor waits for a manager: where its request
// stands (waiting, approved, rejected) under the header, and asking for
// approval to sign in person (no send). The send-and-ask lives in the Send
// dialog.
import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { quotesApi, quotePriceApprovalsApi, type Quote, type QuotePriceClearance } from '../../api/setup';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { extractApiError, showError, showSuccess } from '../../lib/toast';
import { Button } from '../catalyst/button';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../catalyst/dialog';
import { Field, Label } from '../catalyst/fieldset';
import { Input } from '../catalyst/input';
import { Callout } from '../ui/Callout';

const pct = (f: number | null | undefined) => (f == null ? '—' : `${Math.round(f * 1000) / 10}%`);

export function PriceApprovalCallout({ quote, clearance }: { quote: Quote; clearance: QuotePriceClearance }) {
  const queryClient = useQueryClient();
  const { data: me } = useCurrentUser();
  const latest = clearance.latest;
  const withdraw = useMutation({
    mutationFn: () => quotePriceApprovalsApi.cancel(latest!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-price-clearance', quote.id] });
      queryClient.invalidateQueries({ queryKey: ['quote-price-approvals'] });
      showSuccess('Approval request withdrawn');
    },
    onError: (err) => showError('Couldn’t withdraw the request', extractApiError(err)),
  });
  const floor = `${pct(clearance.lowestMargin)} margin, under the ${pct(clearance.floor)} floor`;

  if (latest?.status === 'PENDING' && latest.current)
    return (
      <Callout
        kind="warning"
        className="mb-2.5"
        title="Waiting on a manager to approve the price"
        action={
          (latest.requestedByUserId === me?.id || clearance.callerCanApprove) && (
            <Button outline size="xs" disabled={withdraw.isPending} onClick={() => withdraw.mutate()}>
              Withdraw
            </Button>
          )
        }
      >
        {`${floor}. ${latest.sendsOnApproval ? 'It goes out as soon as they approve.' : 'Once approved, it can be signed in person.'}`}
        {latest.reason && <span className="block text-fg-muted">{`“${latest.reason}” · ${latest.requestedByName ?? ''}`}</span>}
      </Callout>
    );
  if (latest?.status === 'REJECTED' && latest.current)
    return (
      <Callout kind="danger" className="mb-2.5" title={`Price rejected${latest.respondedByName ? ` by ${latest.respondedByName}` : ''}`}>
        {latest.responseNote ? `“${latest.responseNote}”. ` : ''}
        Change the price, or ask again.
      </Callout>
    );
  if (latest?.status === 'APPROVED' && latest.current)
    return (
      <Callout kind="success" className="mb-2.5">
        {`Price approved${latest.respondedByName ? ` by ${latest.respondedByName}` : ''}${latest.responseNote ? `: “${latest.responseNote}”` : ''}.`}
      </Callout>
    );
  if (clearance.approvalRequired)
    return (
      <Callout kind="warning" className="mb-2.5" title="Below the margin floor">
        {`${floor}. Sending asks a manager to approve it first${latest && !latest.current ? '; the earlier approval was for a version since changed' : ''}.`}
      </Callout>
    );
  if (clearance.belowFloor && clearance.callerCanApprove)
    return (
      <Callout kind="info" className="mb-2.5">
        {`${floor}. You can approve prices, so your own send isn’t held.`}
      </Callout>
    );
  return null;
}

/** Approval to sign in person: no send, just the price. */
export function RequestInPersonDialog({ quote, open, onClose }: { quote: Quote; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const ask = useMutation({
    mutationFn: () => quotesApi.requestPriceApproval(quote.id, { reason: reason.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-price-clearance', quote.id] });
      queryClient.invalidateQueries({ queryKey: ['quote-activity', quote.id] });
      showSuccess('Sent for approval', 'Present it in the home once a manager approves.');
      setReason('');
      onClose();
    },
    onError: (err) => showError('Couldn’t ask for approval', extractApiError(err)),
  });
  return (
    <Dialog open={open} onClose={onClose} size="md">
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (reason.trim() && !ask.isPending) ask.mutate();
        }}
      >
        <DialogTitle>Ask to approve the price</DialogTitle>
        <DialogDescription>For signing in person: nothing is sent to the customer. A manager approves it in Approvals.</DialogDescription>
        <DialogBody>
          <Field>
            <Label>Why this price</Label>
            <Input autoFocus value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="e.g. matching a competing bid" />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" color="dark/zinc" disabled={!reason.trim() || ask.isPending}>
            Ask for approval
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
