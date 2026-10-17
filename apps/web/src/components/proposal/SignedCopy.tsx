/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the quote page). */
// The signed copy of a proposal the customer approved through its link:
// stored once at approval and rendered as is.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCurrency, formatTimestamp } from '@dispatch/utils';
import { quotesApi, type QuoteApproval } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { Button } from '../catalyst/button';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../catalyst/dialog';
import { Card, CardBody, CardHead, CardTitle } from '../ui/Card';
import { DenseTable, DenseTHead } from '../ui/DenseTable';
import { REASON_LABEL } from '../document/documentModel';

/** "on the link", or "in person with Danny Ortiz". */
const signedWhere = (a: QuoteApproval) =>
  a.signedVia === 'IN_PERSON' ? (a.witnessName ? `in person with ${a.witnessName}` : 'in person') : 'on the link';

const savingName = (s: QuoteApproval['savings'][number]) =>
  s.label || (s.kind === 'WAIVE' ? 'Waived' : (REASON_LABEL[s.reasonCode] ?? s.reasonCode));

export function SignedCopyCard({ quoteId }: { quoteId: string }) {
  const [open, setOpen] = useState(false);
  const { data: approval, isError } = useQuery({
    queryKey: ['quote-approval', quoteId],
    queryFn: () => quotesApi.getApproval(quoteId),
    retry: false,
  });
  if (isError || !approval) return null;
  return (
    <Card>
      <CardHead>
        <CardTitle>Signed</CardTitle>
      </CardHead>
      <CardBody className="flex flex-col gap-2" data-testid="proposal-signed">
        <div className="text-[12px] text-fg-muted">
          {`${formatTimestamp(approval.signedAt, { withTime: true })} · ${approval.signerName} · ${signedWhere(approval)}`}
        </div>
        {approval.signatureImage && (
          <img src={approval.signatureImage} alt={`${approval.signerName}’s signature`} className="pb-signature" />
        )}
        <div className="flex items-baseline justify-between text-[12.5px]">
          <span className="font-semibold text-fg-strong">Total</span>
          <span className="text-[15px] font-bold tabular-nums text-fg-strong">{formatCurrency(approval.totals.totalAmount)}</span>
        </div>
        <Button outline size="xs" className="self-start" onClick={() => setOpen(true)}>
          View signed copy
        </Button>
      </CardBody>
      <SignedCopyDialog approval={approval} open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}

function SignedCopyDialog({ approval, open, onClose }: { approval: QuoteApproval; open: boolean; onClose: () => void }) {
  const { getName } = useGlossary();
  const t = approval.totals;
  return (
    <Dialog open={open} onClose={onClose} size="2xl">
      <DialogTitle>Signed copy</DialogTitle>
      <DialogDescription>
        {`What ${approval.signerName} signed${approval.revision != null ? ` (Rev ${approval.revision})` : ''}, exactly as it was shown. It never changes.`}
      </DialogDescription>
      <DialogBody className="flex flex-col gap-4">
        <DenseTable>
          <DenseTHead>
            <tr>
              <th>Line</th>
              <th className="right">Qty</th>
              <th className="right">Amount</th>
            </tr>
          </DenseTHead>
          <tbody>
            {approval.lines.map((l, i) => (
              <tr key={l.id ?? i}>
                <td>{l.description}</td>
                <td className="right num">{l.quantity}</td>
                <td className="right num">{l.included ? 'Included' : formatCurrency(l.netAmount)}</td>
              </tr>
            ))}
          </tbody>
        </DenseTable>
        <dl className="flex flex-col gap-1 text-[12.5px]">
          <Row label="List price" value={formatCurrency(t.listPrice)} />
          {approval.savings.map((s, i) => (
            <Row key={i} label={savingName(s)} value={`−${formatCurrency(s.amount)}`} />
          ))}
          {t.taxAmount > 0 && <Row label="Tax" value={formatCurrency(t.taxAmount)} />}
          <Row label="Total" value={formatCurrency(t.totalAmount)} strong />
          {t.afterRebate != null && <Row label="After rebate (not billed)" value={formatCurrency(t.afterRebate)} />}
        </dl>
        {approval.signatureImage && (
          <img src={approval.signatureImage} alt={`${approval.signerName}’s signature`} className="pb-signature" />
        )}
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12px]">
          <dt className="text-fg-muted">Signed by</dt>
          <dd className="text-fg">{approval.signerName}</dd>
          <dt className="text-fg-muted">When</dt>
          <dd className="text-fg">{formatTimestamp(approval.signedAt, { withTime: true })}</dd>
          <dt className="text-fg-muted">Where</dt>
          <dd className="text-fg">{signedWhere(approval)}</dd>
          <dt className="text-fg-muted">Consent</dt>
          <dd className="text-fg">{approval.consent ? `Agreed to the ${getName('quote').toLowerCase()}’s terms` : '—'}</dd>
          {approval.ipAddress && (
            <>
              <dt className="text-fg-muted">IP address</dt>
              <dd className="font-mono text-fg">{approval.ipAddress}</dd>
            </>
          )}
          {approval.userAgent && (
            <>
              <dt className="text-fg-muted">Device</dt>
              <dd className="truncate text-fg" title={approval.userAgent}>
                {approval.userAgent}
              </dd>
            </>
          )}
        </dl>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? 'flex justify-between font-semibold text-fg-strong' : 'flex justify-between text-fg-muted'}>
      <dt>{label}</dt>
      <dd className={strong ? 'tabular-nums' : 'tabular-nums text-fg'}>{value}</dd>
    </div>
  );
}
