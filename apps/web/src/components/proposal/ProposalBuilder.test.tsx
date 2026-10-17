import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import { ProposalBuilder } from './ProposalBuilder';
import { pricedSelection, proposalQuote } from './proposalFixtures';
import type { Quote } from '../../api/setup';

const api = vi.hoisted(() => ({
  addOptionGroup: vi.fn(),
  addOption: vi.fn(),
  updateOption: vi.fn(),
  deleteOption: vi.fn(),
  reorderOptions: vi.fn(),
  setAddOnMode: vi.fn(),
  setLinePlacement: vi.fn(),
  deleteLine: vi.fn(),
  updateHeader: vi.fn(),
  addLine: vi.fn(),
  getSelection: vi.fn(),
  getApproval: vi.fn(),
  getActivity: vi.fn(),
  addAdjustment: vi.fn(),
  deleteAdjustment: vi.fn(),
}));

vi.mock('../../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/setup')>();
  return {
    ...actual,
    quotesApi: { ...actual.quotesApi, ...api },
    laborRatesApi: { ...actual.laborRatesApi, getAll: () => Promise.resolve([]) },
    promotionsApi: { ...actual.promotionsApi, getAll: () => Promise.resolve([]) },
    userApi: { ...actual.userApi, getById: () => Promise.resolve({ id: 'u-1', firstName: 'Danny', lastName: 'Ortiz' }) },
  };
});

// The edit queue: runs the edit at the quote's version and reports success.
const run = vi.fn(async (fn: (version: number) => Promise<unknown>) => {
  await fn(4);
  return true;
});

const renderBuilder = (quote: Quote = proposalQuote(), editable = true) =>
  renderWithProviders(<ProposalBuilder quote={quote} editable={editable} run={run} />);

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(api)) fn.mockResolvedValue(proposalQuote());
  // Until a test prices it, the cards show the quote's own totals.
  api.getSelection.mockReturnValue(new Promise(() => {}));
});

describe('ProposalBuilder', () => {
  it('shows each option side by side with its lines, included add-ons and totals', () => {
    renderBuilder();

    const [essential, comfort] = screen.getAllByTestId('proposal-option');
    expect(within(essential).getByLabelText('Option name')).toHaveValue('Essential');
    expect(within(essential).getByText('3-ton 15.2 SEER2 split system')).toBeInTheDocument();
    expect(within(essential).getByText('15.2 SEER2')).toBeInTheDocument();
    expect(essential).toHaveTextContent('1 highlight from the pricebook item');
    expect(within(essential).getAllByText('$11,480.00')).toHaveLength(2); // list price and total

    expect(within(comfort).getByRole('button', { name: '★ Most popular' })).toHaveAttribute('aria-pressed', 'true');
    // The thermostat is included with Comfort, at no charge.
    expect(within(comfort).getByText('Smart Wi-Fi thermostat')).toBeInTheDocument();
    expect(within(comfort).getByText('Included · set in add-ons')).toBeInTheDocument();
    expect(within(comfort).getByText('No photo')).toBeInTheDocument();
    expect(within(comfort).getByText('$15,560.00')).toBeInTheDocument(); // after the $400 rebate
  });

  it('renames an option, sending it back whole', async () => {
    const user = userEvent.setup();
    renderBuilder();

    const [essential] = screen.getAllByTestId('proposal-option');
    const name = within(essential).getByLabelText('Option name');
    await user.clear(name);
    await user.type(name, 'Basic{Enter}');

    await waitFor(() =>
      expect(api.updateOption).toHaveBeenCalledWith('q-1', 'o-1', expect.objectContaining({ version: 4, name: 'Basic', specs: ['15.2 SEER2'] })),
    );
  });

  it('adds an option without a cap', async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.click(screen.getByRole('button', { name: 'Add option' }));
    await waitFor(() => expect(api.addOption).toHaveBeenCalledWith('q-1', { version: 4, groupId: 'g-1', name: 'Option 3' }));
  });

  it('cycles an add-on’s mode per option: offer → included → hidden', async () => {
    const user = userEvent.setup();
    renderBuilder();

    const [ducts] = screen.getAllByTestId('proposal-addon');
    await user.click(within(ducts).getByRole('button', { name: 'Duct sealing with Essential: Offer' }));
    await waitFor(() => expect(api.setAddOnMode).toHaveBeenCalledWith('q-1', 'o-1', 'l-ducts', { version: 4, mode: 'INCLUDED' }));
    const [, tstat] = screen.getAllByTestId('proposal-addon');
    await user.click(within(tstat).getByRole('button', { name: 'Smart Wi-Fi thermostat with Comfort: Included' }));
    await waitFor(() => expect(api.setAddOnMode).toHaveBeenLastCalledWith('q-1', 'o-2', 'l-tstat', { version: 4, mode: 'HIDDEN' }));
  });

  it('recommends an add-on and saves why', async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.click(screen.getByRole('switch', { name: 'Recommend Duct sealing' }));
    await waitFor(() =>
      expect(api.setLinePlacement).toHaveBeenCalledWith('q-1', 'l-ducts', {
        version: 4,
        optionId: null,
        role: 'ADD_ON',
        recommended: true,
        recommendationNote: null,
      }),
    );
  });

  it('saves the recommendation note on an already-recommended add-on', async () => {
    const user = userEvent.setup();
    const q = proposalQuote();
    q.lineItems = q.lineItems.map((l) => (l.id === 'l-ducts' ? { ...l, recommended: true } : l));
    renderBuilder(q);

    await user.click(screen.getByRole('button', { name: 'Add note' }));
    await user.type(screen.getByLabelText('Why you recommend Duct sealing'), 'Ducts leak 27%');
    await user.tab();
    await waitFor(() =>
      expect(api.setLinePlacement).toHaveBeenLastCalledWith('q-1', 'l-ducts', expect.objectContaining({ recommendationNote: 'Ducts leak 27%' })),
    );
  });

  it('saves the cover note with the rest of the header', async () => {
    const user = userEvent.setup();
    renderBuilder();

    const note = screen.getByLabelText('Cover note');
    await user.clear(note);
    await user.type(note, 'Three ways to replace it.');
    await user.tab();
    await waitFor(() =>
      expect(api.updateHeader).toHaveBeenCalledWith('q-1', expect.objectContaining({ version: 4, coverNote: 'Three ways to replace it.', notes: null })),
    );
  });

  it('starts an empty proposal with a group and its first option', async () => {
    const withGroup = proposalQuote({ version: 5, optionGroups: [{ id: 'g-7', name: 'Options', sortOrder: 0, options: [] }] });
    api.addOptionGroup.mockResolvedValue(withGroup);
    const user = userEvent.setup();
    renderBuilder(proposalQuote({ optionGroups: [], lineItems: [] }));

    await user.click(screen.getByRole('button', { name: 'Add the first option' }));
    await waitFor(() => expect(api.addOption).toHaveBeenCalledWith('q-1', { version: 5, groupId: 'g-7', name: 'Option 1' }));
    expect(api.addOptionGroup).toHaveBeenCalledWith('q-1', { version: 4, name: 'Options' });
  });

  it('lists what to fix before sending', () => {
    renderBuilder();
    const checks = screen.getAllByTestId('proposal-check');
    expect(checks[0]).toHaveTextContent('2 options');
    expect(checks[1]).toHaveTextContent('Comfort has no photo');
  });

  it('reads accepted: the chosen option, declined ones, and what became of each add-on', () => {
    const q = proposalQuote({ status: 'ACCEPTED' });
    q.lineItems = q.lineItems.map((l) =>
      l.id === 'l-tstat' ? { ...l, included: true } : l.id === 'l-ducts' ? { ...l, selected: true } : l,
    );
    renderBuilder(q, false);

    const [essential, comfort] = screen.getAllByTestId('proposal-option');
    expect(essential).toHaveTextContent('Declined');
    expect(within(comfort).getByText('Chosen')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add option' })).not.toBeInTheDocument();
    const [ducts, tstat] = screen.getAllByTestId('proposal-addon');
    expect(ducts).toHaveTextContent('Taken');
    expect(tstat).toHaveTextContent('Included');
    expect(screen.queryByText('Before sending')).not.toBeInTheDocument();
  });

  describe('priced by the server', () => {
    beforeEach(() => api.getSelection.mockResolvedValue(pricedSelection()));

    it('shows each card’s savings with their reasons, what the customer saves, and the margin floor', async () => {
      renderBuilder();

      const [, comfort] = screen.getAllByTestId('proposal-option');
      expect(await within(comfort).findByText('You save')).toBeInTheDocument();
      expect(within(comfort).getByText('Promotion')).toBeInTheDocument();
      expect(within(comfort).getAllByText('−$500.00')).toHaveLength(1);
      expect(within(comfort).getByText('$15,060.00')).toBeInTheDocument(); // after rebate, from the server
      expect(within(comfort).getByText('34%')).toHaveClass('text-warning-fg');
      expect(within(comfort).getByText('Below the 35% floor.')).toBeInTheDocument();
      expect(within(comfort).getByText('Some lines have no cost; they count as $0.')).toBeInTheDocument();
      expect(api.getSelection).toHaveBeenCalledWith('q-1');
    });

    it('flags the below-floor option before sending', async () => {
      renderBuilder();
      await screen.findAllByText('You save');
      const checks = screen.getAllByTestId('proposal-check').map((c) => c.textContent);
      expect(checks).toContain('Comfort is below the 35% margin floor');
    });

    it('says what the customer is looking at and who chose it', async () => {
      renderBuilder();
      expect(await screen.findByTestId('proposal-current-selection')).toHaveTextContent('Comfort + Duct sealing');
      expect(screen.getByText(/Chosen by the customer on the link/)).toBeInTheDocument();
      expect(screen.getByText(/saves \$500\.00/)).toBeInTheDocument();
    });
  });

  it('shows the signed copy of a proposal the customer approved on the link', async () => {
    api.getApproval.mockResolvedValue({
      signerName: 'Tanya Reyes', signedAt: '2026-10-13T15:11:00Z', signatureImage: 'data:image/png;base64,SIG', consent: true,
      revision: 2, selection: { optionIds: ['o-2'], addOnLineIds: [] }, lines: [], savings: [],
      totals: { listPrice: 15960, youSave: 0, subtotal: 15960, taxAmount: 0, totalAmount: 15960, rebateAmount: null, afterRebate: null },
      ipAddress: '203.0.113.9', userAgent: 'Safari',
    });
    renderBuilder(proposalQuote({ status: 'ACCEPTED', acceptedByUserId: null, approvedByName: 'Tanya Reyes' }), false);

    const signed = await screen.findByTestId('proposal-signed');
    expect(signed).toHaveTextContent('Tanya Reyes');
    expect(within(signed).getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,SIG');
    expect(api.getApproval).toHaveBeenCalledWith('q-1');
  });

  it('has no signed copy when the office recorded the yes', () => {
    renderBuilder(proposalQuote({ status: 'ACCEPTED', acceptedByUserId: 'u-1' }), false);
    expect(api.getApproval).not.toHaveBeenCalled();
  });

  it('shows a sent proposal’s view count and what the customer did, newest first', async () => {
    api.getActivity.mockResolvedValue({
      content: [
        {
          id: 'e2', kind: 'QUOTE_CHOICE_CHANGED', category: 'FINANCIAL', classification: 'BUSINESS', timestamp: '2026-10-12T19:16:00Z',
          subject: { type: 'QUOTE', id: 'q-1', number: null, label: 'Q-1907' }, actor: { type: 'CUSTOMER', userId: null, userName: '' },
          data: { path: ['Ultimate', 'Comfort'], added: ['Duct sealing'], removed: [], totalAmount: 17700 },
          workOrderId: null, serviceLocationId: null,
        },
        {
          id: 'e1', kind: 'QUOTE_VIEWED', category: 'FINANCIAL', classification: 'BUSINESS', timestamp: '2026-10-12T19:14:00Z',
          subject: { type: 'QUOTE', id: 'q-1', number: null, label: 'Q-1907' }, actor: { type: 'CUSTOMER', userId: null, userName: '' },
          data: { revision: 1 }, workOrderId: null, serviceLocationId: null,
        },
      ],
      nextCursor: null,
      hasMore: false,
    });
    renderBuilder(proposalQuote({ status: 'SENT', firstSentAt: '2026-10-12T16:00:00Z', viewCount: 2 }), false);

    expect(await screen.findByText('Viewed 2×')).toBeInTheDocument();
    const [choice, viewed] = await screen.findAllByTestId('proposal-event');
    expect(choice).toHaveTextContent('Ultimate');
    expect(choice).toHaveTextContent('$17,700.00');
    expect(viewed).toHaveTextContent(/viewed/i);
    expect(api.getActivity).toHaveBeenCalledWith('q-1', { limit: 30 });
  });

  it('has no activity card before the proposal is sent', () => {
    renderBuilder();
    expect(api.getActivity).not.toHaveBeenCalled();
    expect(screen.queryByText('Activity')).not.toBeInTheDocument();
  });

  it('takes a discount off one option only', async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.click(screen.getByRole('button', { name: 'Actions for Comfort' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Discount on this option' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Discount on Comfort')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: '$ off' }));
    await user.type(within(dialog).getByLabelText('Amount'), '500');
    await user.selectOptions(within(dialog).getByLabelText('Reason'), 'DISCRETIONARY');
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));

    await waitFor(() =>
      expect(api.addAdjustment).toHaveBeenCalledWith('q-1', { optionId: 'o-2', kind: 'AMOUNT', value: 500, reasonCode: 'DISCRETIONARY', version: 4 }),
    );
  });
});
