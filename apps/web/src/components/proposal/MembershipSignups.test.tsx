import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../test/utils';
import { MembershipSignupCallout, MembershipSignupsCard } from './MembershipSignups';
import { proposalQuote } from './proposalFixtures';
import type { MembershipSignup } from '../../api/setup';

const api = vi.hoisted(() => ({ list: vi.fn(), setStatus: vi.fn() }));

vi.mock('../../api/setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/setup')>();
  return { ...actual, membershipSignupsApi: { list: api.list, setStatus: api.setStatus } };
});

const signup = (over: Partial<MembershipSignup> = {}): MembershipSignup => ({
  quoteId: 'q-1', quoteNumber: 'Q-1907', customerId: 'c-1', customerName: 'Tanya Reyes', serviceLocationId: 'loc-1',
  planId: 'plan-1', planName: 'Comfort Club', signedAt: '2026-10-13T15:11:00Z', status: 'PENDING',
  handledByUserId: null, handledByName: null, handledAt: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.setStatus.mockResolvedValue(signup({ status: 'DONE' }));
});

describe('membership sign-ups', () => {
  it('flags an accepted quote signed with "join" on, and marks it done once set up', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MembershipSignupCallout quote={proposalQuote({ status: 'ACCEPTED', membershipSignup: signup() })} />);

    expect(screen.getByText('Joined Comfort Club when signing')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark done' }));
    await waitFor(() => expect(api.setStatus).toHaveBeenCalledWith('q-1', 'DONE'));
  });

  it('says who set it up once done', () => {
    renderWithProviders(
      <MembershipSignupCallout quote={proposalQuote({ membershipSignup: signup({ status: 'DONE', handledByName: 'Kim Office' }) })} />,
    );
    expect(screen.getByText(/agreement set up by Kim Office/)).toBeInTheDocument();
  });

  it('lists the sign-ups waiting on the office, and shows nothing when there are none', async () => {
    api.list.mockResolvedValue([signup()]);
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(<MembershipSignupsCard />);

    const [row] = await screen.findAllByTestId('membership-signup');
    expect(row).toHaveTextContent('Comfort Club');
    expect(within(row).getByRole('link', { name: 'Q-1907' })).toHaveAttribute('href', '/quotes/q-1');
    await user.click(within(row).getByRole('button', { name: 'Mark done' }));
    await waitFor(() => expect(api.setStatus).toHaveBeenCalledWith('q-1', 'DONE'));
    unmount();

    api.list.mockClear();
    api.list.mockResolvedValue([]);
    const { container } = renderWithProviders(<MembershipSignupsCard />);
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();
  });
});
