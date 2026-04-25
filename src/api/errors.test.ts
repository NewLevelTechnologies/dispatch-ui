import { describe, it, expect } from 'vitest';
import { getApiErrorMessage } from './errors';

describe('getApiErrorMessage', () => {
  it('extracts message from Axios-style error response', () => {
    const error = Object.assign(new Error('Request failed'), {
      response: { data: { message: 'Validation failed: name is required' } },
    });
    expect(getApiErrorMessage(error)).toBe('Validation failed: name is required');
  });

  it('returns undefined for non-Error values', () => {
    expect(getApiErrorMessage('string error')).toBeUndefined();
    expect(getApiErrorMessage(null)).toBeUndefined();
    expect(getApiErrorMessage(undefined)).toBeUndefined();
    expect(getApiErrorMessage({ message: 'plain object' })).toBeUndefined();
  });

  it('returns undefined for Error without response field', () => {
    expect(getApiErrorMessage(new Error('plain'))).toBeUndefined();
  });

  it('returns undefined when response.data has no message', () => {
    const error = Object.assign(new Error('Request failed'), {
      response: { data: { error: 'something else' } },
    });
    expect(getApiErrorMessage(error)).toBeUndefined();
  });

  it('returns undefined when response has no data', () => {
    const error = Object.assign(new Error('Request failed'), { response: {} });
    expect(getApiErrorMessage(error)).toBeUndefined();
  });
});
