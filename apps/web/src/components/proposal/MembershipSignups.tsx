/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the quote page). */
// Proposals signed with "join" on. Signing doesn't create the agreement: the
// member price is honored on that job, and the office sets the agreement up
// here, then marks the sign-up done.
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatTimestamp } from '@dispatch/utils';
import { membershipSignupsApi, type MembershipSignup, type Quote } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { extractApiError, showError, showSuccess } from '../../lib/toast';
import { Button } from '../catalyst/button';
import { Callout } from '../ui/Callout';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '../ui/Card';
import { DenseTable, DenseTHead } from '../ui/DenseTable';
import AgreementFormDialog from '../AgreementFormDialog';

function useMarkSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ quoteId, status }: { quoteId: string; status: 'PENDING' | 'DONE' }) => membershipSignupsApi.setStatus(quoteId, status),
    onSuccess: (s) => {
      queryClient.invalidateQueries({ queryKey: ['membership-signups'] });
      queryClient.invalidateQueries({ queryKey: ['quote', s.quoteId] });
      showSuccess(s.status === 'DONE' ? `${s.planName} set up for ${s.customerName ?? 'the customer'}` : 'Sign-up reopened');
    },
    onError: (err) => showError('Couldn’t update the sign-up', extractApiError(err)),
  });
}

/** On an accepted quote signed with "join" on. */
export function MembershipSignupCallout({ quote }: { quote: Quote }) {
  const signup = quote.membershipSignup;
  const [settingUp, setSettingUp] = useState(false);
  const mark = useMarkSignup();
  if (!signup) return null;
  if (signup.status === 'DONE')
    return (
      <Callout kind="neutral" className="mb-2.5">
        {`Joined ${signup.planName} · agreement set up${signup.handledByName ? ` by ${signup.handledByName}` : ''}${signup.handledAt ? ` ${formatTimestamp(signup.handledAt)}` : ''}.`}
      </Callout>
    );
  return (
    <>
      <Callout
        kind="accent"
        className="mb-2.5"
        title={`Joined ${signup.planName} when signing`}
        action={
          <div className="flex gap-2">
            <Button outline size="xs" onClick={() => setSettingUp(true)}>
              Set up agreement
            </Button>
            <Button color="dark/zinc" size="xs" disabled={mark.isPending} onClick={() => mark.mutate({ quoteId: signup.quoteId, status: 'DONE' })}>
              Mark done
            </Button>
          </div>
        }
      >
        The member price is on this job. Set the agreement up, then mark this done.
      </Callout>
      <AgreementFormDialog isOpen={settingUp} onClose={() => setSettingUp(false)} customerId={signup.customerId} planId={signup.planId} />
    </>
  );
}

/** The office's worklist: sign-ups waiting for an agreement. Nothing shows when none are. */
export function MembershipSignupsCard() {
  const { getName } = useGlossary();
  const { data: signups = [] } = useQuery({ queryKey: ['membership-signups', 'PENDING'], queryFn: () => membershipSignupsApi.list('PENDING') });
  const [settingUp, setSettingUp] = useState<MembershipSignup | null>(null);
  const mark = useMarkSignup();
  if (signups.length === 0) return null;
  return (
    <Card className="mb-3">
      <CardHead>
        <CardTitle>{`Memberships to set up · ${signups.length}`}</CardTitle>
        <CardSub>{`Joined when signing a ${getName('quote').toLowerCase()}. Set the agreement up, then mark it done.`}</CardSub>
      </CardHead>
      <CardBody flush>
        <DenseTable>
          <DenseTHead>
            <tr>
              <th>Plan</th>
              <th>{getName('customer')}</th>
              <th>{getName('quote')}</th>
              <th>Signed</th>
              <th aria-label="Actions" />
            </tr>
          </DenseTHead>
          <tbody>
            {signups.map((s) => (
              <tr key={s.quoteId} data-testid="membership-signup">
                <td className="strong">{s.planName}</td>
                <td>
                  <RouterLink to={`/customers/${s.customerId}`} className="text-fg-accent hover:underline">
                    {s.customerName ?? '—'}
                  </RouterLink>
                </td>
                <td>
                  <RouterLink to={`/quotes/${s.quoteId}`} className="font-mono text-fg-accent hover:underline">
                    {s.quoteNumber}
                  </RouterLink>
                </td>
                <td className="num muted-cell">{formatTimestamp(s.signedAt)}</td>
                <td className="right">
                  <div className="flex justify-end gap-2">
                    <Button outline size="xs" onClick={() => setSettingUp(s)}>
                      Set up agreement
                    </Button>
                    <Button plain size="xs" disabled={mark.isPending} onClick={() => mark.mutate({ quoteId: s.quoteId, status: 'DONE' })}>
                      Mark done
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DenseTable>
      </CardBody>
      <AgreementFormDialog
        isOpen={!!settingUp}
        onClose={() => setSettingUp(null)}
        customerId={settingUp?.customerId}
        planId={settingUp?.planId}
      />
    </Card>
  );
}
