import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import {
  extractApiError,
  showSuccess,
  showError,
  showInfo,
  showMutation,
} from './toast';

vi.mock('sonner', () => {
  const fn = vi.fn() as unknown as {
    (msg: string, opts?: unknown): void;
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    promise: ReturnType<typeof vi.fn>;
  };
  fn.success = vi.fn();
  fn.error = vi.fn();
  fn.promise = vi.fn();
  return { toast: fn };
});

describe('toast helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractApiError', () => {
    it('returns the server-supplied message from an axios-style error', () => {
      const err = Object.assign(new Error('outer'), {
        response: { data: { message: 'Email already in use' } },
      });
      expect(extractApiError(err)).toBe('Email already in use');
    });

    it('falls back to Error.message when there is no response payload', () => {
      expect(extractApiError(new Error('network down'))).toBe('network down');
    });

    it('returns undefined for non-Error inputs', () => {
      expect(extractApiError('oops')).toBeUndefined();
      expect(extractApiError(null)).toBeUndefined();
    });

    it('returns undefined when an Error has no message and no response', () => {
      expect(extractApiError(new Error(''))).toBeUndefined();
    });
  });

  it('showSuccess forwards to toast.success without a description option', () => {
    showSuccess('Saved');
    expect(toast.success).toHaveBeenCalledWith('Saved', undefined);
  });

  it('showSuccess passes a description when provided', () => {
    showSuccess('Saved', 'All good');
    expect(toast.success).toHaveBeenCalledWith('Saved', { description: 'All good' });
  });

  it('showError forwards to toast.error', () => {
    showError('Boom', 'Try again');
    expect(toast.error).toHaveBeenCalledWith('Boom', { description: 'Try again' });
  });

  it('showInfo forwards to the bare toast() call', () => {
    showInfo('Heads up');
    expect(toast).toHaveBeenCalledWith('Heads up', undefined);
  });

  it('showMutation pipes the promise and messages to toast.promise', () => {
    const p = Promise.resolve('ok');
    showMutation(p, { loading: 'Saving…', success: 'Saved', error: 'Failed' });
    expect(toast.promise).toHaveBeenCalledWith(p, {
      loading: 'Saving…',
      success: 'Saved',
      error: 'Failed',
    });
  });
});
