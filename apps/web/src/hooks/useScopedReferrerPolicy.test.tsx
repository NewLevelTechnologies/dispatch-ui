import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { useScopedReferrerPolicy } from './useScopedReferrerPolicy';

function Harness({ policy }: { policy?: string }) {
  useScopedReferrerPolicy(policy);
  return null;
}

const findReferrerMetas = () =>
  Array.from(document.head.querySelectorAll('meta[name="referrer"]'));

describe('useScopedReferrerPolicy', () => {
  it('injects a referrer meta on mount with the default no-referrer policy', () => {
    expect(findReferrerMetas()).toHaveLength(0);
    const { unmount } = render(<Harness />);
    const metas = findReferrerMetas();
    expect(metas).toHaveLength(1);
    expect(metas[0].getAttribute('content')).toBe('no-referrer');
    unmount();
  });

  it('removes the meta on unmount so the auth app is not affected later', () => {
    const { unmount } = render(<Harness />);
    expect(findReferrerMetas()).toHaveLength(1);
    unmount();
    expect(findReferrerMetas()).toHaveLength(0);
  });

  it('honors a caller-provided policy override', () => {
    const { unmount } = render(<Harness policy="strict-origin" />);
    const meta = findReferrerMetas()[0];
    expect(meta.getAttribute('content')).toBe('strict-origin');
    unmount();
  });
});
