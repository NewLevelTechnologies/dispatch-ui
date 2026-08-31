import { describe, it, expect } from 'vitest';
import { getApiErrorMessage, getApiErrorCode } from './errors';

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

describe('getApiErrorCode', () => {
  it('extracts code from Axios-style error response', () => {
    const error = Object.assign(new Error('Request failed'), {
      response: { data: { code: 'NO_RECIPIENT', message: 'No email on file' } },
    });
    expect(getApiErrorCode(error)).toBe('NO_RECIPIENT');
  });

  it('returns undefined for non-Error values', () => {
    expect(getApiErrorCode('string error')).toBeUndefined();
    expect(getApiErrorCode(null)).toBeUndefined();
    expect(getApiErrorCode(undefined)).toBeUndefined();
  });

  it('returns undefined for Error without response field', () => {
    expect(getApiErrorCode(new Error('plain'))).toBeUndefined();
  });

  it('returns undefined when response.data has no code', () => {
    const error = Object.assign(new Error('Request failed'), {
      response: { data: { message: 'oops' } },
    });
    expect(getApiErrorCode(error)).toBeUndefined();
  });
});
