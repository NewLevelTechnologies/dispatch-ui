/* eslint-disable i18next/no-literal-string -- route placeholders in a test fixture. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import PresentProposalPage from './PresentProposalPage';
import { useHasAnyCapability } from '../hooks/useCurrentUser';
import { pricedSelection, proposalQuote } from '../components/proposal/proposalFixtures';

const api = vi.hoisted(() => ({
  getById: vi.fn(),
  getSelection: vi.fn(),
  saveSelection: vi.fn(),
  approveInPerson: vi.fn(),
  getApproval: vi.fn(),
}));

vi.mock('../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/setup')>();
  return {
    ...actual,
    quotesApi: { ...actual.quotesApi, ...api },
    tenantSettingsApi: {
      ...actual.tenantSettingsApi,
      getSettings: () => Promise.resolve({ companyName: 'Coolfront', timezone: 'UTC', phone: '(602) 555-0100' }),
    },
  };
});

const routes = [
  { path: '/quotes/:id/present', element: <PresentProposalPage /> },
  { path: '/quotes/:id', element: <div>Quote page</div> },
];
const renderPage = () => renderWithProviders(<div />, { routes, initialPath: '/quotes/q-1/present' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useHasAnyCapability).mockImplementation((...caps: string[]) => caps.includes('APPROVE_QUOTES'));
  api.getById.mockResolvedValue(proposalQuote({ customerName: 'Tanya Reyes', advisorName: 'Danny Ortiz' }));
  api.getSelection.mockResolvedValue(pricedSelection());
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    scale: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), clearRect: vi.fn(),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,SIG');
});

const sign = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: /public.proposal.steps.review/ }));
  const pad = screen.getByLabelText('public.proposal.review.signatureLabel');
  fireEvent.pointerDown(pad, { clientX: 10, clientY: 10, pointerId: 1 });
  fireEvent.pointerUp(pad, { pointerId: 1 });
  await user.click(screen.getByRole('checkbox'));
};

describe('PresentProposalPage', () => {
  it('shows the proposal full screen, prepared for the customer, with the advisor', async () => {
    renderPage();
    expect(await screen.findAllByTestId('pp-option')).toHaveLength(2);
    expect(screen.getByText('Tanya Reyes')).toBeInTheDocument();
    expect(screen.getByText('public.proposal.with')).toBeInTheDocument();
  });

  it('takes the customer’s signature in person: the choice, the total shown and consent', async () => {
    api.approveInPerson.mockResolvedValue(proposalQuote({ status: 'ACCEPTED', approvedByName: 'Tanya Reyes' }));
    const user = userEvent.setup();
    renderPage();

    await sign(user);
    await user.click(screen.getAllByRole('button', { name: 'public.proposal.approve' })[0]);

    await waitFor(() =>
      expect(api.approveInPerson).toHaveBeenCalledWith('q-1', {
        signerName: 'Tanya Reyes',
        signature: 'data:image/png;base64,SIG',
        consent: true,
        selection: { optionIds: ['o-2'], addOnLineIds: ['l-ducts'] },
        totalAmount: 16930,
      }),
    );
  });

  it('lets someone without APPROVE_QUOTES present but not take a signature', async () => {
    vi.mocked(useHasAnyCapability).mockImplementation(() => false);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /public.proposal.steps.review/ }));
    expect(screen.queryByLabelText('public.proposal.review.signatureLabel')).not.toBeInTheDocument();
    expect(screen.getAllByText('public.proposal.noSignPermission').length).toBeGreaterThan(0);
  });

  it('goes back to the quote', async () => {
    const user = userEvent.setup();
    const { router } = renderPage();
    await user.click(await screen.findByRole('button', { name: 'public.proposal.exit' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/quotes/q-1'));
  });

  it('says there’s nothing to present on a standard quote', async () => {
    api.getById.mockResolvedValue(proposalQuote({ presentation: 'STANDARD' }));
    renderPage();
    expect(await screen.findByText('Nothing to present')).toBeInTheDocument();
  });
});
