import { describe, it, expect, vi, beforeEach } from 'vitest';
import publicApiClient from './publicClient';
import { publicFinancialApi } from './publicFinancialApi';

vi.mock('./publicClient', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));

const headers = { headers: { 'X-Share-Token': 'tok' } };

describe('publicFinancialApi proposals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('saves the customer’s choice with the share token', async () => {
    vi.mocked(publicApiClient.put).mockResolvedValue({ data: {} });
    await publicFinancialApi.saveQuoteSelection('tok', { optionIds: ['o-2'], addOnLineIds: ['l-9'] });
    expect(publicApiClient.put).toHaveBeenCalledWith('/public/quotes/selection', { optionIds: ['o-2'], addOnLineIds: ['l-9'] }, headers);
  });

  it('approves with the signature, the choice and the total the customer saw', async () => {
    vi.mocked(publicApiClient.post).mockResolvedValue({ data: {} });
    const body = {
      revision: 2,
      signerName: 'Tanya Reyes',
      signature: 'data:image/png;base64,AAA',
      consent: true as const,
      selection: { optionIds: ['o-2'], addOnLineIds: [] },
      totalAmount: 16170,
    };
    await publicFinancialApi.approveProposal('tok', body);
    expect(publicApiClient.post).toHaveBeenCalledWith('/public/quotes/approve', body, headers);
  });
});
