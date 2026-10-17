/* eslint-disable i18next/no-literal-string -- loading and error lines match the quote page's literal convention. */
// "Present in home": the proposal full screen on the advisor's device, the
// customer choosing and signing in person. The same page the link shows,
// with choices saved as the advisor's and the signature taken through the
// logged-in in-person approval (APPROVE_QUOTES). Route: /quotes/:id/present.
import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { quotesApi, tenantSettingsApi } from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { useHasAnyCapability } from '../hooks/useCurrentUser';
import { useTenantTimeZone } from '../hooks/useTenantTimeZone';
import { zonedDate } from '../lib/boardTime';
import { LoadingState } from '../components/ui/LoadingState';
import { Callout } from '../components/ui/Callout';
import { Button } from '../components/catalyst/button';
import { ProposalExperience, type ProposalActions } from '../components/public/PublicProposal';
import { allOptions, isProposal } from '../components/proposal/proposalModel';
import { isExpired, toPresentation } from '../components/proposal/presentModel';
import { useQuoteSelection } from '../components/proposal/useQuoteSelection';
import { refreshDocumentLists } from '../components/document/useDocumentEditor';

export default function PresentProposalPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { getName } = useGlossary();
  const canSign = useHasAnyCapability('APPROVE_QUOTES');
  const zone = useTenantTimeZone();
  const today = zonedDate(new Date(), zone) ?? new Date().toISOString().slice(0, 10);

  const quoteQuery = useQuery({ queryKey: ['quote', id], queryFn: () => quotesApi.getById(id), enabled: !!id });
  const quote = quoteQuery.data;
  const { data: priced, refetch: refetchSelection } = useQuoteSelection(quote);
  const { data: tenant } = useQuery({ queryKey: ['tenant-settings'], queryFn: () => tenantSettingsApi.getSettings() });
  const accepted = quote?.status === 'ACCEPTED';
  const { data: approval } = useQuery({
    queryKey: ['quote-approval', id],
    queryFn: () => quotesApi.getApproval(id),
    enabled: accepted && !!quote?.approvedByName,
    retry: false,
  });

  const names = useMemo(
    () =>
      Object.fromEntries(
        ['quote', 'invoice', 'payment'].map((code) => [code, { singular: getName(code), plural: getName(code, true) }]),
      ),
    [getName],
  );

  const back = () => navigate(`/quotes/${id}`);

  if (quoteQuery.isLoading || (quote && isProposal(quote) && allOptions(quote).length > 0 && !priced && !accepted))
    return <LoadingState label="Opening the proposal…" />;
  if (!quote || quoteQuery.isError || !isProposal(quote) || allOptions(quote).length === 0)
    return (
      <div className="mx-auto max-w-lg p-8">
        <Callout kind="warning" title="Nothing to present">
          {`Only a proposal with options can be presented.`}
        </Callout>
        <Button className="mt-4" outline onClick={back}>
          {`Back to the ${getName('quote').toLowerCase()}`}
        </Button>
      </div>
    );

  const data = toPresentation({ quote, priced, approval, tenant, names, today });
  const actions: ProposalActions = {
    save: (choice) => quotesApi.saveSelection(id, choice),
    approve: async ({ revision, ...body }) => {
      const signed = await quotesApi.approveInPerson(id, { ...body, ...(revision != null ? { revision } : {}), consent: true });
      queryClient.setQueryData(['quote', id], signed);
      queryClient.invalidateQueries({ queryKey: ['quote-selection', id] });
      queryClient.invalidateQueries({ queryKey: ['quote-approval', id] });
      queryClient.invalidateQueries({ queryKey: ['quote-activity', id] });
      refreshDocumentLists(queryClient);
    },
  };
  // A draft can be presented and signed; a declined or expired one can't.
  const canChoose = (quote.status === 'DRAFT' || quote.status === 'SENT') && !isExpired(quote, today);

  return (
    <ProposalExperience
      data={data}
      actions={actions}
      canChoose={canChoose}
      canSign={canSign}
      mode="inhome"
      onExit={back}
      onReload={() => {
        void quoteQuery.refetch();
        void refetchSelection();
      }}
    />
  );
}
