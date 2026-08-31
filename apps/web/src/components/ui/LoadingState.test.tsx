import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { LoadingState } from './LoadingState';

describe('LoadingState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('hides for the default 250 ms delay', () => {
    render(<LoadingState label="Loading users…" />);
    expect(screen.queryByText('Loading users…')).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByText('Loading users…')).toBeInTheDocument();
  });

  it('renders immediately when delay is 0', () => {
    render(<LoadingState delay={0} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('exposes role="status" for assistive tech', () => {
    render(<LoadingState delay={0} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
